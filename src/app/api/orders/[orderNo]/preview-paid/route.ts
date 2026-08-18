import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { resolvePaymentEnv } from '@/lib/payment/config';
import { recordAuditLog } from '@/lib/audit';

/**
 * 仅演示预览模式可用：把 PREVIEW 订单标记为已支付，用于验证前端流程。
 * PAYMENT_ENV=SANDBOX / PRODUCTION 时一律拒绝，绝不会伪造真实支付成功。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> }
): Promise<NextResponse> {
  const { orderNo } = await params;
  return withAuth(request, async (_req, ctx) => {
    if (resolvePaymentEnv() !== 'PREVIEW') {
      return errorResponse('当前支付环境不允许模拟支付', 403);
    }
    const order = await prisma.order.findUnique({ where: { orderNo } });
    if (!order || order.merchantId !== ctx.user.merchantId) return errorResponse('订单不存在', 404);
    if (order.paymentEnv !== 'PREVIEW') return errorResponse('该订单非预览订单', 403);
    if (order.status === 'PAID') return successResponse({ status: 'PAID' });

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date(), channelTradeNo: `PREVIEW-${order.orderNo}` },
    });
    await recordAuditLog({
      action: 'PREVIEW_PAYMENT',
      resource: 'order',
      resourceId: order.id,
      result: 'SUCCESS',
      detail: `演示预览模拟支付 ${orderNo}（非真实资金）`,
    });
    return successResponse({ status: 'PAID', preview: true });
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'CASHIER']);
}
