import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';

const ROLES = ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'STORE_MANAGER', 'CASHIER', 'CUSTOMER_SERVICE'];

// 查询单笔订单（收款码页面轮询使用）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> }
): Promise<NextResponse> {
  const { orderNo } = await params;
  return withAuth(request, async (_req, ctx) => {
    const order = await prisma.order.findUnique({
      where: { orderNo },
      select: {
        id: true, orderNo: true, subject: true, amount: true, currency: true,
        channel: true, scene: true, status: true, channelTradeNo: true,
        payData: true, paymentEnv: true, merchantId: true, storeId: true,
        createdAt: true, expiredAt: true, paidAt: true, closedAt: true,
        merchant: { select: { companyName: true } },
      },
    });

    if (!order || order.merchantId !== ctx.user.merchantId) {
      return errorResponse('订单不存在', 404);
    }

    const store = order.storeId
      ? await prisma.store.findUnique({
          where: { id: order.storeId },
          select: { name: true, brand: { select: { name: true } } },
        })
      : null;

    return successResponse({
      ...order,
      amount: Number(order.amount),
      merchantName: order.merchant.companyName,
      storeName: store?.name ?? null,
      brandName: store?.brand?.name ?? null,
    });
  }, ROLES);
}
