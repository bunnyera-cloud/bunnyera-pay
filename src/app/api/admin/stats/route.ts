import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse } from '@/lib/api-utils';

// 平台总览统计
export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalMerchants,
      activeMerchants,
      pendingMerchants,
      todayOrders,
      todayAmount,
      reconciliationIssues,
    ] = await Promise.all([
      prisma.merchant.count(),
      prisma.merchant.count({ where: { status: 'ACTIVE' } }),
      prisma.merchant.count({ where: { status: { in: ['SUBMITTED', 'REVIEWING', 'SUPPLEMENTARY'] } } }),
      prisma.order.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      prisma.order.aggregate({
        where: { status: 'PAID', paidAt: { gte: today, lt: tomorrow } },
        _sum: { amount: true },
      }),
      prisma.order.count({ where: { reconciliationStatus: { in: ['MISMATCH_AMOUNT', 'MISSING_IN_CHANNEL', 'MISSING_IN_SYSTEM', 'DUPLICATE', 'REFUND_MISMATCH'] } } }),
    ]);

    return successResponse({
      totalMerchants,
      activeMerchants,
      pendingMerchants,
      todayOrders,
      todayAmount: (todayAmount._sum.amount || 0).toString(),
      reconciliationIssues,
    });
  }, ['PLATFORM_SUPER_ADMIN', 'PLATFORM_REVIEWER']);
}
