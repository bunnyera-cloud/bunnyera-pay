import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { amountToFen } from "@/lib/payment/config";
import { resolveProvider } from "@/lib/payment/resolver";
import { sanitizePaymentPayload } from "@/lib/payment/sanitize";
import { syncChannelRefund } from "@/lib/payment/refund-service";
import { recordAuditLog } from "@/lib/audit";

// 银联全渠道后台通知：表单原文取值后先验签，再做金额、商户和订单归属校验。
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const body: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === "string") body[key] = value;
    });
    if (!body.orderId || !body.txnType) return unionPayResponse("fail", 400);

    if (body.txnType === "04") return handleRefund(body);
    if (body.txnType !== "01") return unionPayResponse("fail", 400);
    return handlePayment(body);
  } catch (error) {
    console.error("UnionPay callback error:", (error as Error).message);
    return unionPayResponse("fail", 500);
  }
}

async function handlePayment(
  body: Record<string, string>,
): Promise<NextResponse> {
  const order = await prisma.order.findUnique({
    where: { orderNo: body.orderId },
  });
  if (!order || !order.channel.startsWith("UNIONPAY")) {
    return unionPayResponse("fail", 404);
  }

  const sanitizedBody = sanitizePaymentPayload(body) as Prisma.InputJsonValue;
  const callbackLog = await prisma.callbackLog.create({
    data: {
      orderId: order.id,
      channel: order.channel,
      rawData: sanitizedBody,
      signature: body.signature ? "[PRESENT]" : null,
      verified: false,
      processed: false,
    },
  });

  if (order.paymentEnv === "PREVIEW") {
    await markCallbackError(callbackLog.id, "演示预览订单拒绝外部回调");
    return unionPayResponse("fail", 400);
  }

  const paymentConfig = await prisma.paymentConfig.findFirst({
    where: {
      merchantId: order.merchantId,
      channel: order.channel,
      isActive: true,
    },
  });
  const resolved = resolveProvider(order.channel, paymentConfig);
  if (!resolved.provider || !resolved.usable) {
    await markCallbackError(callbackLog.id, "银联支付渠道配置不完整，无法验签");
    return unionPayResponse("fail", 503);
  }

  const webhook = await resolved.provider.handleWebhook({ body, headers: {} });
  if (!webhook.verified || !webhook.data) {
    await markCallbackError(
      callbackLog.id,
      webhook.error || "银联回调验签失败",
    );
    return unionPayResponse("fail", 400);
  }
  await prisma.callbackLog.update({
    where: { id: callbackLog.id },
    data: { verified: true },
  });

  const callback = webhook.data;
  if (
    callback.orderNo !== order.orderNo ||
    callback.currency !== "CNY" ||
    callback.amount !== amountToFen(order.amount.toString())
  ) {
    await markCallbackError(callbackLog.id, "银联回调订单、币种或金额不一致");
    return unionPayResponse("fail", 409);
  }

  if (order.status !== "CREATED" && order.status !== "PAYING") {
    await prisma.callbackLog.update({
      where: { id: callbackLog.id },
      data: {
        processed: true,
        error: `订单状态(${order.status})已终态，幂等返回`,
      },
    });
    return unionPayResponse("ok");
  }
  if (callback.status !== "SUCCESS") {
    await prisma.callbackLog.update({
      where: { id: callbackLog.id },
      data: {
        processed: true,
        error: `银联非成功应答: ${body.respCode || "UNKNOWN"}`,
      },
    });
    return unionPayResponse("ok");
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["CREATED", "PAYING"] } },
      data: {
        status: "PAID",
        channelTradeNo: callback.tradeNo,
        paidAt: callback.paidAt || new Date(),
        callbackRaw: sanitizedBody,
        callbackCount: { increment: 1 },
      },
    });
    if (claimed.count === 0) return;
    await tx.paymentRecord.create({
      data: {
        orderId: order.id,
        amount: (callback.amount / 100).toFixed(2),
        channel: order.channel,
        channelTradeNo: callback.tradeNo,
        status: "SUCCESS",
        rawData: sanitizedBody,
      },
    });
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
    detail: `银联支付回调 - 订单 ${order.orderNo}，金额 ${(callback.amount / 100).toFixed(2)}`,
  });
  return unionPayResponse("ok");
}

async function handleRefund(
  body: Record<string, string>,
): Promise<NextResponse> {
  const refund = await prisma.refund.findUnique({
    where: { refundNo: body.orderId },
    include: { order: true },
  });
  if (!refund || !refund.order.channel.startsWith("UNIONPAY")) {
    return unionPayResponse("fail", 404);
  }

  const sanitizedBody = sanitizePaymentPayload(body) as Prisma.InputJsonValue;
  const callbackLog = await prisma.callbackLog.create({
    data: {
      orderId: refund.orderId,
      channel: refund.order.channel,
      rawData: sanitizedBody,
      signature: body.signature ? "[PRESENT]" : null,
      verified: false,
      processed: false,
    },
  });
  if (refund.order.paymentEnv === "PREVIEW") {
    await markCallbackError(callbackLog.id, "演示预览订单拒绝外部退款回调");
    return unionPayResponse("fail", 400);
  }

  const paymentConfig = await prisma.paymentConfig.findFirst({
    where: {
      merchantId: refund.merchantId,
      channel: refund.order.channel,
      isActive: true,
    },
  });
  const resolved = resolveProvider(refund.order.channel, paymentConfig);
  if (!resolved.provider?.handleRefundWebhook || !resolved.usable) {
    await markCallbackError(callbackLog.id, "银联支付渠道配置不完整，无法验签");
    return unionPayResponse("fail", 503);
  }

  const webhook = await resolved.provider.handleRefundWebhook({
    body,
    headers: {},
  });
  if (!webhook.verified || !webhook.data) {
    await markCallbackError(
      callbackLog.id,
      webhook.error || "银联退款回调验签失败",
    );
    return unionPayResponse("fail", 400);
  }
  await prisma.callbackLog.update({
    where: { id: callbackLog.id },
    data: { verified: true },
  });
  const callback = webhook.data;
  if (
    callback.refundNo !== refund.refundNo ||
    (callback.orderNo && callback.orderNo !== refund.order.orderNo) ||
    callback.refundAmount !== amountToFen(refund.amount.toString())
  ) {
    await markCallbackError(callbackLog.id, "银联退款回调订单或金额不一致");
    return unionPayResponse("fail", 409);
  }

  if (refund.status === "SUCCESS" || refund.status === "FAILED") {
    await prisma.callbackLog.update({
      where: { id: callbackLog.id },
      data: {
        processed: true,
        error: `退款状态(${refund.status})已终态，幂等返回`,
      },
    });
    return unionPayResponse("ok");
  }
  if (callback.status === "FAILED") {
    await prisma.refund.updateMany({
      where: { id: refund.id, status: "PROCESSING" },
      data: {
        status: "FAILED",
        channelRefundNo: callback.channelRefundNo || refund.channelRefundNo,
        processedAt: new Date(),
      },
    });
  } else {
    const sync = await syncChannelRefund(refund.id);
    if (!sync.ok) {
      await markCallbackError(
        callbackLog.id,
        sync.error || "银联退款查单未确认成功",
      );
      return unionPayResponse("fail", 502);
    }
  }
  await prisma.callbackLog.update({
    where: { id: callbackLog.id },
    data: { processed: true },
  });
  return unionPayResponse("ok");
}

async function markCallbackError(id: string, error: string): Promise<void> {
  await prisma.callbackLog.update({
    where: { id },
    data: { error },
  });
}

function unionPayResponse(body: "ok" | "fail", status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
