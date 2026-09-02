import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import { resolveProvider } from "@/lib/payment/resolver";
import { amountToFen } from "@/lib/payment/config";
import { sanitizePaymentPayload } from "@/lib/payment/sanitize";
import { settleVerifiedPayment } from "@/lib/payment/transitions";
import { PAYMENTFM_NOTIFY_OK } from "@/lib/payment/paymentfm-config";
import {
  mapPaymentFmPayTypeToWallet,
  parsePaymentFmAttach,
} from "@/lib/payment/paymentfm";
import { scheduleShopPaidNotification } from "@/lib/shop/notify";

/**
 * PaymentFM notify. Official default is GET query; startOrder sends apiMode=post_form.
 * Success body must be the exact string `success`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleNotify(Object.fromEntries(request.nextUrl.searchParams.entries()));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentType = request.headers.get("content-type") || "";
  let body: Record<string, string> = {};
  try {
    if (contentType.includes("application/json")) {
      const json = (await request.json()) as Record<string, unknown>;
      body = Object.fromEntries(
        Object.entries(json).map(([key, value]) => [key, String(value ?? "")]),
      );
    } else {
      const formData = await request.formData();
      formData.forEach((value, key) => {
        if (typeof value === "string") body[key] = value;
      });
    }
  } catch {
    return new NextResponse("fail", { status: 200 });
  }
  if (!body.orderNo) {
    body = {
      ...body,
      ...Object.fromEntries(request.nextUrl.searchParams.entries()),
    };
  }
  return handleNotify(body);
}

async function handleNotify(body: Record<string, string>): Promise<NextResponse> {
  try {
    const orderNo = body.orderNo;
    if (!orderNo) return new NextResponse("fail", { status: 200 });

    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: {
        merchant: { include: { paymentConfigs: true } },
      },
    });
    if (!order || order.channel !== "PAYMENTFM_AGGREGATE") {
      return new NextResponse("fail", { status: 200 });
    }

    const sanitizedBody = sanitizePaymentPayload(body) as Prisma.InputJsonValue;
    const callbackLog = await prisma.callbackLog.create({
      data: {
        orderId: order.id,
        channel: order.channel,
        rawData: sanitizedBody,
        signature: body.sign ? "[PRESENT]" : null,
        verified: false,
        processed: false,
      },
    });

    if (order.paymentEnv === "PREVIEW") {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: "演示预览订单拒绝外部回调" },
      });
      return new NextResponse("fail", { status: 200 });
    }

    const paymentConfig = order.merchant.paymentConfigs.find(
      (config) => config.channel === order.channel,
    );
    const resolved = resolveProvider(order.channel, paymentConfig, {
      purpose: "EXISTING_ORDER",
    });
    if (!resolved.provider || !resolved.usable) {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: "支付渠道不可用，无法验证回调" },
      });
      return new NextResponse("fail", { status: 200 });
    }

    const webhook = await resolved.provider.handleWebhook({ body, headers: {} });
    await prisma.callbackLog.update({
      where: { id: callbackLog.id },
      data: { verified: webhook.verified },
    });
    if (!webhook.verified || !webhook.data) {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: webhook.error || "签名验证失败" },
      });
      return new NextResponse("fail", { status: 200 });
    }

    if (order.status !== "CREATED" && order.status !== "PAYING") {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { processed: true, error: `订单状态(${order.status})已终态，幂等返回` },
      });
      return new NextResponse(PAYMENTFM_NOTIFY_OK, { status: 200 });
    }

    const callbackData = webhook.data;
    const orderAmountFen = amountToFen(order.amount.toString());
    if (orderAmountFen !== callbackData.amount) {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: {
          error: `金额不一致: 订单${order.amount}元(${orderAmountFen}分)`,
        },
      });
      return new NextResponse("fail", { status: 200 });
    }

    const attach = parsePaymentFmAttach(body.attch);
    if (attach.storeId && order.storeId && attach.storeId !== order.storeId) {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: "回调门店归属与订单不一致" },
      });
      return new NextResponse("fail", { status: 200 });
    }
    if (attach.qrcodeId && order.qrcodeId && attach.qrcodeId !== order.qrcodeId) {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: "回调收款码归属与订单不一致" },
      });
      return new NextResponse("fail", { status: 200 });
    }

    if (callbackData.status !== "SUCCESS") {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { processed: true, error: `非支付成功状态: ${body.state}` },
      });
      return new NextResponse(PAYMENTFM_NOTIFY_OK, { status: 200 });
    }

    const notifiedWallet = mapPaymentFmPayTypeToWallet(body.type);
    await prisma.$transaction(async (tx) => {
      await settleVerifiedPayment(tx, {
        orderId: order.id,
        amount: (callbackData.amount / 100).toFixed(2),
        channel: order.channel,
        tradeNo: callbackData.tradeNo,
        paidAt: callbackData.paidAt || new Date(),
        rawData: sanitizedBody,
      });
      if (notifiedWallet && order.walletType !== notifiedWallet) {
        await tx.order.updateMany({
          where: { id: order.id },
          data: { walletType: notifiedWallet },
        });
      }
    });

    await prisma.callbackLog.update({
      where: { id: callbackLog.id },
      data: { processed: true },
    });
    await recordAuditLog({
      action: "PAYMENT_CALLBACK",
      resource: "order",
      resourceId: order.id,
      result: "SUCCESS",
      detail: `PaymentFM 回调 - 订单 ${orderNo}`,
    });
    scheduleShopPaidNotification(order.id);
    return new NextResponse(PAYMENTFM_NOTIFY_OK, { status: 200 });
  } catch (error) {
    console.error("PaymentFM callback error:", (error as Error).message);
    return new NextResponse("fail", { status: 200 });
  }
}
