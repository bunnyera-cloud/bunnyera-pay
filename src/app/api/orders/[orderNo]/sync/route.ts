import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { withAuth, successResponse, errorResponse } from "@/lib/api-utils";
import { resolveProvider } from "@/lib/payment/resolver";
import { amountToFen } from "@/lib/payment/config";
import { recordAuditLog } from "@/lib/audit";
import {
  settleVerifiedPayment,
  validatePaidQueryTransition,
} from "@/lib/payment/transitions";

// 主动向官方渠道查单补偿（不依赖回调）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const { orderNo } = await params;
  return withAuth(
    request,
    async (_req, ctx) => {
      const order = await prisma.order.findUnique({ where: { orderNo } });
      if (!order || order.merchantId !== ctx.user.merchantId) {
        return errorResponse("订单不存在", 404);
      }

      const isExpired =
        (order.status === "CREATED" || order.status === "PAYING") &&
        !!order.expiredAt &&
        order.expiredAt.getTime() < Date.now();

      if (
        order.paymentEnv === "PREVIEW" ||
        (!order.channel.startsWith("ALIPAY") &&
          !order.channel.startsWith("WECHAT") &&
          !order.channel.startsWith("UNIONPAY"))
      ) {
        if (order.paymentEnv === "PREVIEW" && isExpired) {
          await prisma.order.updateMany({
            where: { id: order.id, status: { in: ["CREATED", "PAYING"] } },
            data: { status: "CLOSED", closedAt: new Date() },
          });
          return successResponse({
            status: "CLOSED",
            source: "PREVIEW_EXPIRED",
          });
        }
        return successResponse({ status: order.status, source: "LOCAL" });
      }

      const paymentConfig = await prisma.paymentConfig.findFirst({
        where: {
          merchantId: order.merchantId,
          channel: order.channel,
          isActive: true,
        },
      });
      const resolved = resolveProvider(order.channel, paymentConfig, {
        purpose: "EXISTING_ORDER",
      });
      if (!resolved.provider || !resolved.usable) {
        return errorResponse("支付渠道配置不完整，无法执行官方查单", 503);
      }

      const result = await resolved.provider.queryOrder({
        orderNo,
        ...(order.channelTradeNo ? { tradeNo: order.channelTradeNo } : {}),
      });

      if (
        result.status === "PAID" &&
        (order.status === "CREATED" || order.status === "PAYING")
      ) {
        const transitionError = validatePaidQueryTransition(result, {
          expectedAmountFen: amountToFen(order.amount.toString()),
          existingTradeNo: order.channelTradeNo,
        });
        if (transitionError) {
          return errorResponse(`${transitionError}，已拒绝更新`, 409);
        }
        await prisma.$transaction(async (tx) => {
          await settleVerifiedPayment(tx, {
            orderId: order.id,
            amount: order.amount,
            channel: order.channel,
            tradeNo: result.tradeNo!,
            paidAt: result.paidAt || new Date(),
          });
        });
        await recordAuditLog({
          action: "PAYMENT_SYNC",
          resource: "order",
          resourceId: order.id,
          result: "SUCCESS",
          detail: `主动查单确认支付成功 - ${orderNo}`,
        });
        return successResponse({
          status: "PAID",
          source: `${order.channel}_QUERY`,
        });
      }

      if (isExpired && result.status === "UNPAID") {
        const closed = await resolved.provider.closeOrder({ orderNo });
        if (!closed)
          return errorResponse("订单已过期，但官方渠道未确认关闭", 502);
        await prisma.order.updateMany({
          where: { id: order.id, status: { in: ["CREATED", "PAYING"] } },
          data: { status: "CLOSED", closedAt: new Date() },
        });
        return successResponse({
          status: "CLOSED",
          source: `${order.channel}_EXPIRED_CLOSE`,
        });
      }

      if (result.status === "CLOSED" && order.status !== "PAID") {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "CLOSED", closedAt: new Date() },
        });
        return successResponse({
          status: "CLOSED",
          source: `${order.channel}_QUERY`,
        });
      }

      return successResponse({
        status: order.status,
        source: `${order.channel}_QUERY`,
      });
    },
    ["MERCHANT_OWNER", "MERCHANT_ADMIN", "FINANCE", "STORE_MANAGER", "CASHIER"],
  );
}
