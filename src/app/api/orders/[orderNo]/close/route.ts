import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { resolveProvider } from '@/lib/payment/resolver';
import { recordAuditLog } from '@/lib/audit';

// 关闭订单
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
    if (order.status === 'PAID') return errorResponse('订单已支付，不能关闭', 409);
    if (order.status === 'CLOSED') return successResponse({ status: 'CLOSED' });
    if (order.status !== 'CREATED' && order.status !== 'PAYING') {
      return errorResponse(`订单状态（${order.status}）不可关闭`, 409);
    }

    if (order.paymentEnv !== 'PREVIEW') {
      const paymentConfig = await prisma.paymentConfig.findFirst({
        where: { merchantId: order.merchantId, channel: order.channel, isActive: true },
      });
      const resolved = resolveProvider(order.channel, paymentConfig);
      if (!resolved.provider || !resolved.usable) {
        return errorResponse('支付渠道配置不完整，无法安全关闭官方订单', 503);
      }
      const closed = await resolved.provider.closeOrder({ orderNo });
      if (!closed) {
        return errorResponse('官方渠道未确认订单关闭，本地状态保持不变', 502);
      }
    }

    const updated = await prisma.order.updateMany({
      where: { id: order.id, status: { in: ['CREATED', 'PAYING'] } },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    if (updated.count === 0) {
      return errorResponse('订单状态已发生变化，请刷新后重试', 409);
    }
    await recordAuditLog({
      action: 'ORDER_CLOSE',
      resource: 'order',
      resourceId: order.id,
      result: 'SUCCESS',
      detail: `关闭订单 ${orderNo}`,
    });
    return successResponse({ status: 'CLOSED' });
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'STORE_MANAGER', 'CASHIER']);
}
