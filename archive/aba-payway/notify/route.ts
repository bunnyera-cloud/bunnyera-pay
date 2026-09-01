import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import { resolveProvider } from "@/lib/payment/resolver";
import { sanitizePaymentPayload } from "@/lib/payment/sanitize";
import { settleVerifiedPayment } from "@/lib/payment/transitions";
import {
  sanitizeAbaCallbackData,
  truncateSignature,
  isAbaRetryableError,
  resolveAbaPaywayConfig,
  assertAbaSettlementMatch,
  isAbaTranId,
} from "@/lib/payment/aba-payway-config";
import { enqueueAbaRetry } from "@/lib/payment/aba-retry-queue";

/**
 * ABA PayWay Webhook.
 * Callback is a trigger only. PAID requires Check Transaction + field match.
 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, string> = {};
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = (await request.json()) as Record<string, string>;
    } else {
      const formData = await request.formData();
      formData.forEach((value, key) => {
        body[key] = value as string;
      });
    }

    const rawTranId = body.tran_id || body.orderNo || "";
    const tranId = isAbaTranId(rawTranId) ? rawTranId.trim().toUpperCase() : rawTranId.trim();
    if (!tranId) {
      return NextResponse.json(
        { status: "error", message: "Missing transaction ID" },
        { status: 400 },
      );
    }

    const sanitizedBody = sanitizeAbaCallbackData(body);
    const safeRaw = sanitizePaymentPayload(sanitizedBody) as Prisma.InputJsonValue;
    const sigDigest = truncateSignature(body.hash);

    const matches = await prisma.order.findMany({
      where: {
        channel: "ABA_PAYWAY",
        OR: [{ channelTradeNo: tranId }, { orderNo: tranId }],
      },
      include: { merchant: { include: { paymentConfigs: true } } },
      take: 2,
    });

    if (matches.length !== 1) {
      return NextResponse.json(
        { status: "error", message: "Order not found" },
        { status: 404 },
      );
    }
    const order = matches[0];

    const callbackLog = await prisma.callbackLog.create({
      data: {
        orderId: order.id,
        channel: order.channel,
        rawData: safeRaw,
        signature: sigDigest,
        verified: false,
        processed: false,
      },
    });

    if (order.paymentEnv === "PREVIEW") {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { processed: true, error: "演示预览订单拒绝外部回调" },
      });
      return NextResponse.json({ status: "ok", message: "Preview order ignored" });
    }

    if (order.status !== "CREATED" && order.status !== "PAYING") {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { processed: true, error: `订单状态(${order.status})已终态，幂等返回` },
      });
      return NextResponse.json({ status: "ok", message: "Already processed" });
    }

    const paymentConfig = order.merchant.paymentConfigs.find(
      (c) => c.channel === order.channel,
    );
    const resolved = resolveProvider(order.channel, paymentConfig, {
      purpose: "EXISTING_ORDER",
    });

    if (!resolved.provider || !resolved.usable) {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { processed: true, error: "支付渠道不可用" },
      });
      return NextResponse.json(
        { status: "error", message: "Payment channel unavailable" },
        { status: 503 },
      );
    }

    const webhook = await resolved.provider.handleWebhook({
      body,
      headers: Object.fromEntries(request.headers.entries()),
    });

    await prisma.callbackLog.update({
      where: { id: callbackLog.id },
      data: { verified: false },
    });

    const abaCfg = resolveAbaPaywayConfig(paymentConfig);
    let checkStatus: "PAID" | "UNPAID" | "CLOSED" | "REFUNDED" | "UNKNOWN" = "UNKNOWN";
    if (webhook.verified && webhook.data?.status === "SUCCESS") {
      checkStatus = "PAID";
    } else if (webhook.error?.includes("PENDING")) {
      checkStatus = "UNPAID";
    } else if (webhook.error?.includes("非 PAID")) {
      checkStatus = "CLOSED";
    }

    const settlement = assertAbaSettlementMatch({
      orderAmountMajor: order.amount.toString(),
      orderCurrency: order.currency,
      checkStatus,
      checkVerified: webhook.verified === true && webhook.data?.status === "SUCCESS",
      checkAmountMinor: webhook.data?.amount,
      checkCurrency: webhook.data?.currency,
      configuredMerchantId: abaCfg.merchantId,
      callbackMerchantId: body.merchant_id,
    });

    if (settlement.ok && webhook.data) {
      const settled = await settleVerifiedPayment(prisma, {
        orderId: order.id,
        amount: order.amount,
        channel: order.channel,
        tradeNo: webhook.data.tradeNo || order.channelTradeNo || order.orderNo,
        paidAt: webhook.data.paidAt || new Date(),
        rawData: safeRaw,
      });

      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { processed: true, verified: true },
      });

      if (!settled) {
        await recordAuditLog({
          action: "PAYMENT_CALLBACK_RACE",
          resource: "order",
          resourceId: order.id,
          result: "FAILED",
          detail: `ABA 并发回调 - 订单 ${order.orderNo}`,
        });
        return NextResponse.json({
          status: "ok",
          message: "Already settled by another request",
        });
      }

      await recordAuditLog({
        action: "PAYMENT_CALLBACK",
        resource: "order",
        resourceId: order.id,
        result: "SUCCESS",
        detail: `ABA Check Transaction 确认 - 订单 ${order.orderNo}`,
      });
      return NextResponse.json({ status: "ok", message: "Payment settled" });
    }

    const retryable =
      !settlement.ok &&
      (settlement.retryable || (webhook.error ? isAbaRetryableError(webhook.error) : false));
    let enqueued = false;

    if (retryable) {
      enqueued = await enqueueAbaRetry(order.orderNo, 1, callbackLog.id);
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: {
          processed: true,
          error: enqueued
            ? `[QUEUED] ${settlement.ok ? webhook.error : settlement.error}`
            : `[RETRYABLE-NO_QUEUE] ${settlement.ok ? webhook.error : settlement.error}`,
        },
      });
      await recordAuditLog({
        action: enqueued ? "PAYMENT_CALLBACK_QUEUED" : "PAYMENT_CALLBACK_RETRYABLE",
        resource: "order",
        resourceId: order.id,
        result: "FAILED",
        detail: `ABA 重试${enqueued ? "已入队" : "（无队列）"} - 订单 ${order.orderNo}`,
      });
    } else {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: {
          processed: true,
          error: !settlement.ok ? settlement.error : webhook.error || "验证未通过",
        },
      });
      await recordAuditLog({
        action: "PAYMENT_CALLBACK_UNVERIFIED",
        resource: "order",
        resourceId: order.id,
        result: "FAILED",
        detail: `ABA 未入账 - 订单 ${order.orderNo} - ${!settlement.ok ? settlement.error : webhook.error || "未知"}`,
      });
    }

    return NextResponse.json({
      status: "received",
      message: retryable
        ? enqueued
          ? "Callback received, Check Transaction queued for retry"
          : "Callback received, retry unavailable (queue degraded)"
        : "Callback received but not verified",
    });
  } catch (error) {
    console.error("ABA PayWay callback error:", error);
    return NextResponse.json(
      { status: "error", message: "Internal error" },
      { status: 500 },
    );
  }
}
