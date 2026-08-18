import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse } from '@/lib/api-utils';

// 商户工作台仪表盘
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const merchantId = ctx.user.merchantId!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 并行查询今日数据
    const [
      ,
      todayStats,
      pendingRefunds,
      pendingReconcile,
      channelStatus,
      recentOrders,
    ] = await Promise.all([
      // 今日订单数
      prisma.order.count({
        where: { merchantId, createdAt: { gte: today, lt: tomorrow } },
      }),
      // 今日交易统计
      prisma.order.aggregate({
        where: {
          merchantId,
          status: 'PAID',
          paidAt: { gte: today, lt: tomorrow },
        },
        _sum: { amount: true, refundAmount: true },
        _count: true,
      }),
      // 待处理退款
      prisma.refund.count({
        where: { merchantId, status: 'PENDING' },
      }),
      // 待对账订单
      prisma.order.count({
        where: { merchantId, reconciliationStatus: 'PENDING' },
      }),
      // 渠道状态
      prisma.merchantChannel.findMany({
        where: { merchantId },
        select: { channel: true, isEnabled: true },
      }),
      // 最近订单
      prisma.order.findMany({
        where: { merchantId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNo: true,
          subject: true,
          amount: true,
          channel: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    // 渠道占比统计
    const channelStats = await prisma.order.groupBy({
      by: ['channel'],
      where: {
        merchantId,
        status: 'PAID',
        paidAt: { gte: today, lt: tomorrow },
      },
      _sum: { amount: true },
      _count: true,
    });

    // 结算中金额
    const settlingAmount = await prisma.settlement.aggregate({
      where: { merchantId, status: 'SETTLING' },
      _sum: { netAmount: true },
    });

    return successResponse({
      today: {
        transactionAmount: todayStats._sum.amount || 0,
        refundAmount: todayStats._sum.refundAmount || 0,
        orderCount: todayStats._count,
        pendingRefunds,
        pendingReconcile,
        settlingAmount: settlingAmount._sum.netAmount || 0,
      },
      channelBreakdown: channelStats.map(c => ({
        channel: c.channel,
        amount: c._sum.amount || 0,
        count: c._count,
      })),
      channelStatus,
      recentOrders,
    });
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'STORE_MANAGER']);
}
