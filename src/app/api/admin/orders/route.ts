import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { Prisma, OrderStatus, PaymentChannel } from '@prisma/client';
import { withAuth, paginatedResponse } from '@/lib/api-utils';

// 平台管理员获取全部订单（跨商户）
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    const status = url.searchParams.get('status');
    const channel = url.searchParams.get('channel');
    const orderNo = url.searchParams.get('orderNo');
    const merchantId = url.searchParams.get('merchantId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    const where = {} as Prisma.OrderWhereInput;
    if (status) where.status = status as OrderStatus;
    if (channel) where.channel = channel as PaymentChannel;
    if (orderNo) where.orderNo = { contains: orderNo };
    if (merchantId) where.merchantId = merchantId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNo: true,
          subject: true,
          amount: true,
          refundAmount: true,
          currency: true,
          channel: true,
          scene: true,
          status: true,
          channelTradeNo: true,
          paidAt: true,
          expiredAt: true,
          createdAt: true,
          merchant: { select: { companyName: true, merchantNo: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return paginatedResponse(orders, total, page, pageSize);
  }, ['PLATFORM_SUPER_ADMIN', 'PLATFORM_REVIEWER']);
}
