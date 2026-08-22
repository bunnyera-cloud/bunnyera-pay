import type { PaymentChannel, Prisma } from "@prisma/client";
import type { OrderQueryResult, RefundQueryResult } from "./provider";

export interface PaidQueryContext {
  expectedAmountFen: number;
  existingTradeNo?: string | null;
}

/**
 * A PAID query result is trusted only after the provider explicitly confirms
 * response verification and returns the exact amount and channel trade number.
 */
export function validatePaidQueryTransition(
  result: OrderQueryResult,
  context: PaidQueryContext,
): string | null {
  if (result.status !== "PAID") return "渠道未确认支付成功";
  if (result.verified !== true) return "渠道查单结果未通过响应验签";
  if (!Number.isSafeInteger(result.amount)) return "渠道查单结果缺少有效金额";
  if (result.amount !== context.expectedAmountFen) return "渠道查单金额不一致";
  if (!result.tradeNo?.trim()) return "渠道查单结果缺少交易号";
  if (
    context.existingTradeNo &&
    result.tradeNo !== context.existingTradeNo
  ) {
    return "渠道查单交易号与订单不一致";
  }
  return null;
}

export function validateRefundSuccessAmount(
  result: RefundQueryResult,
  expectedAmountFen: number,
): string | null {
  if (result.status !== "SUCCESS") return "渠道未确认退款成功";
  if (!Number.isSafeInteger(result.refundAmount)) {
    return "渠道退款查单结果缺少有效金额";
  }
  if (result.refundAmount !== expectedAmountFen) return "渠道退款金额不一致";
  return null;
}

export interface PaymentSettlementStore {
  order: {
    updateMany(args: Prisma.OrderUpdateManyArgs): Promise<{ count: number }>;
  };
  paymentRecord: {
    create(args: Prisma.PaymentRecordCreateArgs): Promise<unknown>;
  };
}

export interface SettleVerifiedPaymentInput {
  orderId: string;
  amount: string | number | Prisma.Decimal;
  channel: PaymentChannel;
  tradeNo: string;
  paidAt: Date;
  rawData?: Prisma.InputJsonValue;
}

/**
 * The conditional order transition is the idempotency claim. Only its winner
 * may insert PaymentRecord, so duplicate callbacks cannot create duplicates.
 */
export async function settleVerifiedPayment(
  tx: PaymentSettlementStore,
  input: SettleVerifiedPaymentInput,
): Promise<boolean> {
  const orderData: Prisma.OrderUpdateManyMutationInput = {
    status: "PAID",
    channelTradeNo: input.tradeNo,
    paidAt: input.paidAt,
  };
  if (input.rawData !== undefined) {
    orderData.callbackRaw = input.rawData;
    orderData.callbackCount = { increment: 1 };
  }

  const claimed = await tx.order.updateMany({
    where: { id: input.orderId, status: { in: ["CREATED", "PAYING"] } },
    data: orderData,
  });
  if (claimed.count === 0) return false;

  await tx.paymentRecord.create({
    data: {
      orderId: input.orderId,
      amount: input.amount,
      channel: input.channel,
      channelTradeNo: input.tradeNo,
      status: "SUCCESS",
      ...(input.rawData !== undefined ? { rawData: input.rawData } : {}),
    },
  });
  return true;
}
