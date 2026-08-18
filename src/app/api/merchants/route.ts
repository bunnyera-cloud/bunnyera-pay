import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { Prisma, MerchantStatus } from '@prisma/client';
import { withAuth, paginatedResponse } from '@/lib/api-utils';

// 平台管理员获取商户列表
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    const where = {} as Prisma.MerchantWhereInput;
    if (status) where.status = status as MerchantStatus;
    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { merchantNo: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { registrationNo: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [merchants, total] = await Promise.all([
      prisma.merchant.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          merchantNo: true,
          companyName: true,
          registrationNo: true,
          legalPerson: true,
          email: true,
          phone: true,
          phoneCode: true,
          country: true,
          businessCategory: true,
          status: true,
          rejectReason: true,
          approvedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { orders: true } },
        },
      }),
      prisma.merchant.count({ where }),
    ]);

    return paginatedResponse(merchants, total, page, pageSize);
  }, ['PLATFORM_SUPER_ADMIN', 'PLATFORM_REVIEWER']);
}
