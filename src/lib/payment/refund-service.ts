import prisma from '@/lib/db';
import { resolveProvider } from './resolver';
import { recordAuditLog } from '@/lib/audit';

// 退款执行结果：ok=false 时订单绝不被标记为退款成功（fail-closed）
export interface RefundExecution {
  ok: boolean;
  refundStatus: 'SUCCESS' | 'PROCESSING' | 'FAILED' | 'SKIPPED';
  channelRefundNo?: string;
  error?: string;
  orderUpdated: boolean;
}

/**
 * 执行真实渠道退款（Payment Core V1.1 退款链路收口）。
 *
 * 安全约束：
 * 1. 必须通过订单对应渠道的 PaymentProvider.refund() 发起真实退款；
 * 2. 渠道拒绝/失败时退款单标记 FAILED，订单状态与退款金额绝不变更；
 * 3. 渠道受理后用 queryRefund 确认终态：仅 SUCCESS 才更新订单退款金额/状态；
 *    PROCESSING/UNKNOWN 保持退款单 PROCESSING，等待回调或查单补偿；
 * 4. 并发保护：以 APPROVED->PROCESSING 的条件更新作为执行权锁；
 * 5. 全程不输出任何密钥，失败信息仅含业务描述。
 */
export async function executeChannelRefund(refundId: string): Promise<RefundExecution> {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { order: true },
  });

  if (!refund) {
    return { ok: false, refundStatus: 'SKIPPED', error: '退款记录不存在', orderUpdated: false };
  }
  if (refund.status !== 'APPROVED') {
    return { ok: false, refundStatus: 'SKIPPED', error: `退款状态（${refund.status}）不可执行`, orderUpdated: false };
  }

  const order = refund.order;
  if (order.status !== 'PAID' && order.status !== 'PARTIALLY_REFUNDED') {
    await prisma.refund.update({
      where: { id: refund.id },
      data: { status: 'FAILED' },
    });
    return { ok: false, refundStatus: 'FAILED', error: `订单状态（${order.status}）不支持退款`, orderUpdated: false };
  }

  // 并发执行权锁：仅 APPROVED 状态可转入 PROCESSING
  const claimed = await prisma.refund.updateMany({
    where: { id: refund.id, status: 'APPROVED' },
    data: { status: 'PROCESSING' },
  });
  if (claimed.count === 0) {
    return { ok: false, refundStatus: 'SKIPPED', error: '退款正在被其他请求处理', orderUpdated: false };
  }

  const amount = Number(refund.amount);
  const totalAmount = Number(order.amount);

  // 解析订单对应渠道的 Provider（未配置/不可用直接 fail-closed）
  const paymentConfig = await prisma.paymentConfig.findFirst({
    where: { merchantId: order.merchantId, channel: order.channel, isActive: true },
  });
  const resolved = resolveProvider(order.channel, paymentConfig);
  if (!resolved.provider || !resolved.usable) {
    await prisma.refund.update({
      where: { id: refund.id },
      data: { status: 'FAILED', processedAt: new Date() },
    });
    const error = `支付渠道不可用，退款未发起: ${resolved.missing.join(', ')}`;
    await recordAuditLog({
      action: 'REFUND_EXECUTE',
      resource: 'refund',
      resourceId: refund.id,
      result: 'FAILED',
      detail: error,
    });
    return { ok: false, refundStatus: 'FAILED', error, orderUpdated: false };
  }

  // 调用真实渠道退款
  let refundResult;
  try {
    refundResult = await resolved.provider.refund({
      refundNo: refund.refundNo,
      orderNo: order.orderNo,
      tradeNo: order.channelTradeNo || undefined,
      refundAmount: amount,
      totalAmount,
      reason: refund.reason || undefined,
    });
  } catch (error) {
    refundResult = { success: false, error: `渠道退款调用异常: ${(error as Error).message}` };
  }

  if (!refundResult.success) {
    // 渠道退款失败：退款单 FAILED，订单绝不被标记为退款成功
    await prisma.refund.update({
      where: { id: refund.id },
      data: { status: 'FAILED', processedAt: new Date() },
    });
    const error = refundResult.error || '渠道退款请求失败';
    await recordAuditLog({
      action: 'REFUND_EXECUTE',
      resource: 'refund',
      resourceId: refund.id,
      result: 'FAILED',
      detail: `渠道退款失败 - ${refund.refundNo}: ${error}`,
    });
    return { ok: false, refundStatus: 'FAILED', error, orderUpdated: false };
  }

  // 渠道受理后查询终态，只有确认 SUCCESS 才更新订单
  let queryStatus: 'SUCCESS' | 'PROCESSING' | 'FAILED' | 'UNKNOWN' = 'UNKNOWN';
  try {
    const query = await resolved.provider.queryRefund({
      refundNo: refund.refundNo,
      orderNo: order.orderNo,
    });
    queryStatus = query.status;
  } catch {
    queryStatus = 'UNKNOWN';
  }

  if (queryStatus === 'SUCCESS') {
    const isFullRefund = amount >= totalAmount - Number(order.refundAmount);
    await prisma.$transaction(async (tx) => {
      await tx.refund.update({
        where: { id: refund.id },
        data: {
          status: 'SUCCESS',
          channelRefundNo: refundResult.channelRefundNo,
          processedAt: new Date(),
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          refundAmount: { increment: amount },
          status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });
    });
    await recordAuditLog({
      action: 'REFUND_EXECUTE',
      resource: 'refund',
      resourceId: refund.id,
      result: 'SUCCESS',
      detail: `渠道退款成功 - ${refund.refundNo}，金额 ${amount.toFixed(2)}`,
    });
    return { ok: true, refundStatus: 'SUCCESS', channelRefundNo: refundResult.channelRefundNo, orderUpdated: true };
  }

  if (queryStatus === 'FAILED') {
    await prisma.refund.update({
      where: { id: refund.id },
      data: { status: 'FAILED', channelRefundNo: refundResult.channelRefundNo, processedAt: new Date() },
    });
    await recordAuditLog({
      action: 'REFUND_EXECUTE',
      resource: 'refund',
      resourceId: refund.id,
      result: 'FAILED',
      detail: `渠道退款处理失败 - ${refund.refundNo}`,
    });
    return { ok: false, refundStatus: 'FAILED', channelRefundNo: refundResult.channelRefundNo, error: '渠道退款处理失败', orderUpdated: false };
  }

  // PROCESSING / UNKNOWN：渠道已受理但终态未确认，保持 PROCESSING，不更新订单
  await prisma.refund.update({
    where: { id: refund.id },
    data: { status: 'PROCESSING', channelRefundNo: refundResult.channelRefundNo, processedAt: new Date() },
  });
  await recordAuditLog({
    action: 'REFUND_EXECUTE',
    resource: 'refund',
    resourceId: refund.id,
    result: 'SUCCESS',
    detail: `渠道已受理退款，终态待确认 - ${refund.refundNo}（查询状态: ${queryStatus}）`,
  });
  return {
    ok: true,
    refundStatus: 'PROCESSING',
    channelRefundNo: refundResult.channelRefundNo,
    orderUpdated: false,
    error: queryStatus === 'UNKNOWN' ? '渠道退款终态未确认，需查单补偿' : undefined,
  };
}
