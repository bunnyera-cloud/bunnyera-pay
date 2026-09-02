import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse } from '@/lib/api-utils';
import { resolveStoreAccess, storeIdWhere } from '@/lib/store-access';
import { isCancelledChannel, providerProductionStatus } from '@/lib/payment/channel-policy';

const MAX_STORES_PER_MERCHANT = 10;

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, ctx) => {
    const merchantId = ctx.user.merchantId!;
    const scope = await resolveStoreAccess(ctx.user);
    const storeFilter = storeIdWhere(scope);
    const orderScope = storeFilter ? { storeId: storeFilter } : {};
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { kybStatus: true, kybRejectReason: true },
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalOrders,
      todayStats,
      pendingRefunds,
      pendingReconcile,
      channelStatus,
      recentOrders,
    ] = await Promise.all([
      prisma.order.count({
        where: { merchantId, ...orderScope },
      }),
      prisma.order.aggregate({
        where: {
          merchantId,
          status: 'PAID',
          paidAt: { gte: today, lt: tomorrow },
          ...orderScope,
        },
        _sum: { amount: true, refundAmount: true },
        _count: true,
      }),
      prisma.refund.count({
        where: {
          merchantId,
          status: 'PENDING',
          ...(storeFilter ? { order: { storeId: storeFilter } } : {}),
        },
      }),
      prisma.order.count({
        where: { merchantId, reconciliationStatus: 'PENDING', ...orderScope },
      }),
      prisma.merchantChannel.findMany({
        where: { merchantId },
        select: { channel: true, isEnabled: true },
      }),
      prisma.order.findMany({
        where: { merchantId, ...orderScope },
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

    const channelStats = await prisma.order.groupBy({
      by: ['channel'],
      where: {
        merchantId,
        status: 'PAID',
        paidAt: { gte: today, lt: tomorrow },
        ...orderScope,
      },
      _sum: { amount: true },
      _count: true,
    });

    const settlingAmount = await prisma.settlement.aggregate({
      where: { merchantId, status: 'SETTLING' },
      _sum: { netAmount: true },
    });

    const totalPaid = await prisma.order.aggregate({
      where: { merchantId, status: 'PAID', ...orderScope },
      _sum: { amount: true },
    });

    const stores = await prisma.store.findMany({
      where: {
        brand: { merchantId },
        ...(storeFilter ? { id: storeFilter } : {}),
      },
      include: { brand: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const [totalByStore, todayByStore] = await Promise.all([
      prisma.order.groupBy({
        by: ['storeId'],
        where: { merchantId, status: 'PAID', storeId: { not: null }, ...orderScope },
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
          ...orderScope,
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
      kybStatus: merchant?.kybStatus ?? 'NOT_SUBMITTED',
      kybRejectReason: merchant?.kybRejectReason ?? null,
      storeAccess: {
        unrestricted: scope.unrestricted,
        storeIds: scope.storeIds,
      },
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
      channelStatus: channelStatus
        .filter((c) => !isCancelledChannel(c.channel))
        .map((c) => ({
          ...c,
          productionStatus: providerProductionStatus(c.channel, c.isEnabled),
        })),
      recentOrders,
      storeStats,
    });
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'STORE_MANAGER']);
}
