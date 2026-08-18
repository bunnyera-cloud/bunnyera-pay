import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { Prisma, RefundStatus } from '@prisma/client';
import { withAuth, successResponse, errorResponse, paginatedResponse } from '@/lib/api-utils';

// 平台管理员获取全部退款（跨商户）
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    const status = url.searchParams.get('status');

    const where = {} as Prisma.RefundWhereInput;
    if (status) where.status = status as RefundStatus;

    const [refunds, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { orderNo: true, subject: true, amount: true } },
          merchant: { select: { companyName: true, merchantNo: true } },
        },
      }),
      prisma.refund.count({ where }),
    ]);

    return paginatedResponse(refunds, total, page, pageSize);
  }, ['PLATFORM_SUPER_ADMIN', 'PLATFORM_REVIEWER']);
}

// 平台管理员审核退款
export async function PATCH(request: NextRequest) {
  return withAuth(request, async (req) => {
    const body = await req.json();
    const { refundId, action } = body;

    if (!refundId || !action) {
      return errorResponse('缺少参数', 400);
    }

    const refund = await prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) return errorResponse('退款记录不存在', 404);
    if (refund.status !== 'PENDING') {
      return errorResponse('该退款不在待审核状态', 400);
    }

    const statusMap: Record<string, RefundStatus> = {
      approve: 'APPROVED',
      reject: 'REJECTED',
    };

    const newStatus = statusMap[action];
    if (!newStatus) return errorResponse('无效操作', 400);

    const updateData: Prisma.RefundUpdateInput = { status: newStatus };
    if (action === 'approve') {
      updateData.approvedAt = new Date();
      updateData.approvedBy = 'platform_admin';
    }

    const updated = await prisma.refund.update({
      where: { id: refundId },
      data: updateData,
    });

    return successResponse(updated, action === 'approve' ? '退款已批准' : '退款已拒绝');
  }, ['PLATFORM_SUPER_ADMIN']);
}
