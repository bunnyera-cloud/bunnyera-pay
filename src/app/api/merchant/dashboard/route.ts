import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse } from '@/lib/api-utils';

// 与门店 API 保持一致的分店上限
const MAX_STORES_PER_MERCHANT = 10;

// 商户工作台仪表盘（含分店统计与总店汇总）
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const merchantId = ctx.user.merchantId!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 并行查询今日数据
    const [
      totalOrders,
      todayStats,
      pendingRefunds,
      pendingReconcile,
      channelStatus,
      recentOrders,
    ] = await Promise.all([
      // 累计订单数
      prisma.order.count({
        where: { merchantId },
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

    // 累计交易金额（已支付）
    const totalPaid = await prisma.order.aggregate({
      where: { merchantId, status: 'PAID' },
      _sum: { amount: true },
    });

    // ===== 分店统计（基于 Order.storeId，无数据也返回 0）=====
    const stores = await prisma.store.findMany({
      where: { brand: { merchantId } },
      include: { brand: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const [totalByStore, todayByStore] = await Promise.all([
      prisma.order.groupBy({
        by: ['storeId'],
        where: { merchantId, status: 'PAID', storeId: { not: null } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.order.groupBy({
        by: ['storeId'],
        where: {
          merchantId,
          status: 'PAID',
          storeId: { not: null },
          paidAt: { gte: today, lt: tomorrow },
        },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const totalMap = new Map(totalByStore.map(g => [g.storeId, g]));
    const todayMap = new Map(todayByStore.map(g => [g.storeId, g]));

    const storeStats = stores.map(s => {
      const t = totalMap.get(s.id);
      const d = todayMap.get(s.id);
      return {
        storeId: s.id,
        storeName: s.name,
        brandName: s.brand.name,
        isActive: s.isActive,
        totalOrders: t?._count || 0,
        totalAmount: Number(t?._sum.amount || 0),
        todayOrders: d?._count || 0,
        todayAmount: Number(d?._sum.amount || 0),
      };
    });

    return successResponse({
      storeCount: stores.length,
      maxStores: MAX_STORES_PER_MERCHANT,
      totalOrders,
      totalPaidAmount: Number(totalPaid._sum.amount || 0),
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
      storeStats,
    });
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'STORE_MANAGER']);
}
