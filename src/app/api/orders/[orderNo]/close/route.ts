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

    if (order.paymentEnv !== 'PREVIEW' && order.channel.startsWith('ALIPAY')) {
      const paymentConfig = await prisma.paymentConfig.findFirst({
        where: { merchantId: order.merchantId, channel: order.channel, isActive: true },
      });
      const resolved = resolveProvider(order.channel, paymentConfig);
      if (resolved.provider && resolved.usable) {
        await resolved.provider.closeOrder({ orderNo });
      }
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
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
