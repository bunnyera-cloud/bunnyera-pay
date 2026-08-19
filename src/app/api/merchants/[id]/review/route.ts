import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { Prisma, MerchantStatus } from '@prisma/client';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { recordAuditLog } from '@/lib/audit';

// 商户审核操作（通过/拒绝/补充资料）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withAuth(request, async (req) => {
    const { action, rejectReason } = await req.json();

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) {
      return errorResponse('商户不存在', 404);
    }

    const statusTransitions: Record<string, { from: string[]; to: string }> = {
      review: { from: ['SUBMITTED'], to: 'REVIEWING' },
      approve: { from: ['REVIEWING', 'SUBMITTED'], to: 'APPROVED' },
      supplement: { from: ['SUBMITTED', 'REVIEWING'], to: 'SUPPLEMENTARY' },
      reject: { from: ['SUBMITTED', 'REVIEWING', 'SUPPLEMENTARY'], to: 'REJECTED' },
      activate: { from: ['APPROVED', 'CHANNEL_PROVISION'], to: 'ACTIVE' },
      suspend: { from: ['ACTIVE'], to: 'SUSPENDED' },
      resume: { from: ['SUSPENDED'], to: 'ACTIVE' },
      terminate: { from: ['SUSPENDED', 'ACTIVE'], to: 'TERMINATED' },
    };

    const transition = statusTransitions[action];
    if (!transition) {
      return errorResponse('无效的操作', 400);
    }

    if (!transition.from.includes(merchant.status)) {
      return errorResponse(`当前状态 ${merchant.status} 不能执行 ${action} 操作`, 400);
    }

    const updateData: Prisma.MerchantUpdateInput = { status: transition.to as MerchantStatus };
    if (action === 'reject' && rejectReason) {
      updateData.rejectReason = rejectReason;
    }
    if (action === 'approve') {
      updateData.approvedAt = new Date();
      updateData.rejectReason = null;
    }

    const updated = await prisma.merchant.update({
      where: { id },
      data: updateData,
    });

    await recordAuditLog({
      platformUserId: (await prisma.platformSession.findFirst({
        where: { token: req.headers.get('authorization')?.slice(7) },
      }))?.userId,
      action: `MERCHANT_${action.toUpperCase()}`,
      resource: 'merchant',
      resourceId: id,
      request: req,
      beforeData: { status: merchant.status } as Prisma.InputJsonValue,
      afterData: { status: transition.to, rejectReason } as Prisma.InputJsonValue,
      result: 'SUCCESS',
      detail: rejectReason ? `原因: ${rejectReason}` : undefined,
    });

    return successResponse(updated, `商户${action === 'approve' ? '审核通过' : action === 'reject' ? '已拒绝' : '状态已更新'}`);
  }, ['PLATFORM_SUPER_ADMIN', 'PLATFORM_REVIEWER']);
}
