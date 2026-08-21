import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma, RefundStatus } from '@prisma/client';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { generateRefundNo } from '@/lib/auth';
import { recordAuditLog } from '@/lib/audit';
import { executeChannelRefund, syncChannelRefund } from '@/lib/payment/refund-service';
import { z } from 'zod';
import Decimal from 'decimal.js';

const refundSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive().refine(
    value => new Decimal(value).decimalPlaces() <= 2,
    '退款金额最多保留两位小数'
  ),
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

    // 检查退款金额，并扣除尚未到终态的在途退款，避免重复申请透支可退金额。
    const reserved = await prisma.refund.aggregate({
      where: {
        orderId: order.id,
        status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] },
      },
      _sum: { amount: true },
    });
    const maxRefundable =
      Number(order.amount) -
      Number(order.refundAmount) -
      Number(reserved._sum.amount || 0);
    if (amount > maxRefundable) {
      return errorResponse(`退款金额超过可退金额 ${maxRefundable.toFixed(2)}`, 400);
    }

    const refundNo = generateRefundNo();

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

    await recordAuditLog({
      merchantMemberId: ctx.user.sub,
      action: 'REFUND_CREATE',
      resource: 'refund',
      resourceId: refund.id,
      request: req,
      afterData: { refundNo, amount, orderId, requiresApproval },
      result: 'SUCCESS',
    });

    // 无需审核：立即执行真实渠道退款。
    // fail-closed：渠道退款未确认成功前，绝不把订单标记为退款成功。
    if (!requiresApproval) {
      const execution = await executeChannelRefund(refund.id);
      if (!execution.ok) {
        return errorResponse(`退款处理失败: ${execution.error || '渠道退款未完成'}`, 502);
      }
      const updated = await prisma.refund.findUnique({ where: { id: refund.id } });
      return successResponse(
        updated ?? refund,
        execution.refundStatus === 'SUCCESS' ? '退款成功' : '渠道已受理退款，终态确认中'
      );
    }

    return successResponse(refund, '退款申请已提交，等待管理员审核');
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

// 主动向官方渠道查询 PROCESSING 退款并修复终态
export async function PATCH(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const validation = z.object({ refundNo: z.string().min(1).max(64) }).safeParse(await req.json());
    if (!validation.success) return errorResponse('退款单号格式错误', 400);

    const refund = await prisma.refund.findFirst({
      where: {
        refundNo: validation.data.refundNo,
        merchantId: ctx.user.merchantId,
      },
    });
    if (!refund) return errorResponse('退款记录不存在', 404);

    const execution = await syncChannelRefund(refund.id);
    if (!execution.ok && execution.refundStatus !== 'FAILED') {
      return errorResponse(execution.error || '退款查单未完成', 502);
    }
    const latest = await prisma.refund.findUnique({ where: { id: refund.id } });
    return successResponse(latest, execution.refundStatus === 'SUCCESS' ? '退款已确认成功' : '退款状态已同步');
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'CUSTOMER_SERVICE']);
}
