import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { withAuth, errorResponse, successResponse } from "@/lib/api-utils";
import { recordAuditLog } from "@/lib/audit";
import { canAccessStore, resolveStoreAccess } from "@/lib/store-access";
import { settleVerifiedPayment } from "@/lib/payment/transitions";
import {
  MANUAL_CONFIRMATION_REQUIRED,
  isManualConfirmationChannel,
} from "@/lib/payment/channel-policy";

const confirmSchema = z.object({
  note: z.string().trim().min(1).max(200),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> },
) {
  const { orderNo } = await params;
  return withAuth(
    request,
    async (req, ctx) => {
      const validation = confirmSchema.safeParse(await req.json().catch(() => ({})));
      if (!validation.success) {
        return errorResponse("请填写人工确认备注", 400);
      }

      const order = await prisma.order.findUnique({ where: { orderNo } });
      if (!order) return errorResponse("订单不存在", 404);
      if (ctx.user.type !== "platform" && order.merchantId !== ctx.user.merchantId) {
        return errorResponse("订单不存在", 404);
      }
      if (ctx.user.type !== "platform") {
        const scope = await resolveStoreAccess(ctx.user);
        if (!canAccessStore(scope, order.storeId)) {
          return errorResponse("无权确认该分店订单", 403);
        }
      }

      if (
        order.confirmationMode !== MANUAL_CONFIRMATION_REQUIRED ||
        !isManualConfirmationChannel(order.channel)
      ) {
        return errorResponse("该订单不是人工确认收款单，不能手工入账", 409);
      }
      if (order.status === "PAID") {
        return errorResponse("订单已支付", 409);
      }
      if (order.status !== "CREATED" && order.status !== "PAYING") {
        return errorResponse("当前订单状态不允许人工确认", 409);
      }

      const tradeNo = `MANUAL-${order.orderNo}`;
      const claimed = await prisma.$transaction(async (tx) => {
        return settleVerifiedPayment(tx, {
          orderId: order.id,
          amount: order.amount,
          channel: order.channel,
          tradeNo,
          paidAt: new Date(),
          rawData: {
            confirmationMode: MANUAL_CONFIRMATION_REQUIRED,
            confirmedBy: ctx.user.sub,
            note: validation.data.note,
          },
        });
      });

      if (!claimed) {
        return errorResponse("订单已处理或状态已变化", 409);
      }

      await recordAuditLog({
        platformUserId: ctx.user.type === "platform" ? ctx.user.sub : undefined,
        merchantMemberId: ctx.user.type === "merchant" ? ctx.user.sub : undefined,
        action: "MANUAL_PAYMENT_CONFIRM",
        resource: "order",
        resourceId: order.id,
        request: req,
        afterData: {
          orderNo: order.orderNo,
          channel: order.channel,
          storeId: order.storeId,
          qrcodeId: order.qrcodeId,
          note: validation.data.note,
          tradeNo,
        },
        result: "SUCCESS",
        detail: "外部静态收款码人工确认入账，未调用微信/支付宝支付 API",
      });

      return successResponse(
        { orderNo: order.orderNo, status: "PAID", confirmationMode: MANUAL_CONFIRMATION_REQUIRED },
        "已人工确认收款",
      );
    },
    [
      "MERCHANT_OWNER",
      "MERCHANT_ADMIN",
      "FINANCE",
      "STORE_MANAGER",
      "PLATFORM_SUPER_ADMIN",
    ],
  );
}
