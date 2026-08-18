import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { AlipayProvider } from '@/lib/payment/alipay';
import { resolveAlipayConfig } from '@/lib/payment/config';
import { recordAuditLog } from '@/lib/audit';

// 主动向支付宝查单补偿（不依赖回调）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> }
): Promise<NextResponse> {
  const { orderNo } = await params;
  return withAuth(request, async (_req, ctx) => {
    const order = await prisma.order.findUnique({ where: { orderNo } });
    if (!order || order.merchantId !== ctx.user.merchantId) {
      return errorResponse('订单不存在', 404);
    }

    // 过期扫描：仍未支付且已过期
    if (
      (order.status === 'CREATED' || order.status === 'PAYING') &&
      order.expiredAt &&
      order.expiredAt.getTime() < Date.now()
    ) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      return successResponse({ status: 'CLOSED', source: 'EXPIRED' });
    }

    if (order.paymentEnv === 'PREVIEW' || !order.channel.startsWith('ALIPAY')) {
      return successResponse({ status: order.status, source: 'LOCAL' });
    }

    const paymentConfig = await prisma.paymentConfig.findFirst({
      where: { merchantId: order.merchantId, channel: order.channel, isActive: true },
    });
    const cfg = resolveAlipayConfig(paymentConfig);
    if (!cfg.usable) return successResponse({ status: order.status, source: 'LOCAL' });

    const provider = new AlipayProvider({ ...cfg, channel: order.channel });
    const result = await provider.queryOrder({
      orderNo,
      ...(order.channelTradeNo ? { tradeNo: order.channelTradeNo } : {}),
    });

    if (result.status === 'PAID' && (order.status === 'CREATED' || order.status === 'PAYING')) {
      // 金额一致性校验后才可置为支付成功
      if (result.amount !== undefined && Math.abs(result.amount - Number(order.amount)) > 0.01) {
        return errorResponse('查询结果金额与订单不一致，已拒绝更新', 409);
      }
      await prisma.$transaction(async (tx) => {
        const current = await tx.order.findUnique({ where: { id: order.id }, select: { status: true } });
        if (current?.status !== 'CREATED' && current?.status !== 'PAYING') return;
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'PAID', paidAt: new Date(), channelTradeNo: result.tradeNo ?? order.channelTradeNo },
        });
        await tx.paymentRecord.create({
          data: {
            orderId: order.id,
            amount: order.amount,
            channel: order.channel,
            channelTradeNo: result.tradeNo ?? null,
            status: 'SUCCESS',
          },
        });
      });
      await recordAuditLog({
        action: 'PAYMENT_SYNC',
        resource: 'order',
        resourceId: order.id,
        result: 'SUCCESS',
        detail: `主动查单确认支付成功 - ${orderNo}`,
      });
      return successResponse({ status: 'PAID', source: 'ALIPAY_QUERY' });
    }

    if (result.status === 'CLOSED' && order.status !== 'PAID') {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      return successResponse({ status: 'CLOSED', source: 'ALIPAY_QUERY' });
    }

    return successResponse({ status: order.status, source: 'ALIPAY_QUERY' });
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'STORE_MANAGER', 'CASHIER']);
}
