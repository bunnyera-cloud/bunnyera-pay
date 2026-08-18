import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma, RefundStatus } from '@prisma/client';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { generateRefundNo } from '@/lib/auth';
import { recordAuditLog } from '@/lib/audit';
import { z } from 'zod';

const refundSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive(),
  reason: z.string().optional(),
});

// 申请退款
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const body = await req.json();
    const validation = refundSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: '数据验证失败', details: validation.error.issues }, { status: 400 });
    }

    const { orderId, amount, reason } = validation.data;
    const merchantId = ctx.user.merchantId!;
    const order = await prisma.order.findFirst({
      where: { id: orderId, merchantId },
    });

    if (!order) return errorResponse('订单不存在', 404);
    if (order.status !== 'PAID' && order.status !== 'PARTIALLY_REFUNDED') {
      return errorResponse('当前订单状态不支持退款', 400);
    }

    // 检查退款金额
    const maxRefundable = Number(order.amount) - Number(order.refundAmount);
    if (amount > maxRefundable) {
      return errorResponse(`退款金额超过可退金额 ${maxRefundable.toFixed(2)}`, 400);
    }

    const refundNo = generateRefundNo();
    const isFullRefund = amount >= maxRefundable;

    // 大额退款需要管理员审核（超过1000元）
    const requiresApproval = amount > 1000 && ctx.user.role === 'CASHIER';

    const refund = await prisma.refund.create({
      data: {
        refundNo,
        orderId,
        merchantId,
        amount,
        reason: reason || '商户退款',
        status: requiresApproval ? 'PENDING' : 'APPROVED',
        requestedBy: ctx.user.sub,
      },
    });

    // 如果不需要审核，直接处理退款
    if (!requiresApproval) {
      // 更新订单状态
      await prisma.order.update({
        where: { id: orderId },
        data: {
          refundAmount: { increment: amount },
          status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });

      // TODO: 调用支付渠道退款接口
      await prisma.refund.update({
        where: { id: refund.id },
        data: { status: 'PROCESSING', processedAt: new Date() },
      });
    }

    await recordAuditLog({
      merchantMemberId: ctx.user.sub,
      action: 'REFUND_CREATE',
      resource: 'refund',
      resourceId: refund.id,
      request: req,
      afterData: { refundNo, amount, orderId, requiresApproval },
      result: 'SUCCESS',
    });

    return successResponse(refund, requiresApproval ? '退款申请已提交，等待管理员审核' : '退款已提交处理');
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'CASHIER', 'CUSTOMER_SERVICE']);
}

// 查询退款列表
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    const status = url.searchParams.get('status');

    const where = { merchantId: ctx.user.merchantId } as Prisma.RefundWhereInput;
    if (status) where.status = status as RefundStatus;

    const [refunds, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { orderNo: true, subject: true, amount: true } },
        },
      }),
      prisma.refund.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: refunds,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'CUSTOMER_SERVICE']);
}
