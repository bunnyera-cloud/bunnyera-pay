import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { randomInt } from 'node:crypto';
import { resolveBaseUrl } from '@/lib/payment/config';

const createQRSchema = z.object({
  type: z.enum(['FIXED', 'DYNAMIC']),
  name: z.string().min(1).max(100),
  // 聚合收款码必须绑定分店，保证分店独立归属
  storeId: z.string().min(1, '请选择分店'),
  departmentId: z.string().optional(),
  counterId: z.string().optional(),
  amount: z.number().positive().max(1000000).refine(
    value => new Decimal(value).decimalPlaces() <= 2,
    '金额最多保留两位小数'
  ).optional(), // 动态码固定金额
}).superRefine((data, ctx) => {
  if (data.type === 'FIXED' && data.amount !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['amount'], message: '固定入口码由顾客输入金额' });
  }
  if (data.type === 'DYNAMIC' && data.amount === undefined) {
    ctx.addIssue({ code: 'custom', path: ['amount'], message: '动态订单码必须指定金额' });
  }
});

// 生成二维码编号
// 随机段使用无歧义字符集（去除 I/O/0/1），避免人工抄录或扫码识别时 O/0、I/1 混淆导致访问错误 code
function generateQRCode(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 10; i++) {
    rand += alphabet[randomInt(0, alphabet.length)];
  }
  return `QR${date}${rand}`;
}

// 创建收款码
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const body = await req.json();
    const validation = createQRSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: '数据验证失败', details: validation.error.issues }, { status: 400 });
    }

    const data = validation.data;
    const merchantId = ctx.user.merchantId!;

    // 验证门店归属（必须属于当前商户，不能串店）
    const store = await prisma.store.findFirst({
      where: { id: data.storeId, brand: { merchantId } },
    });
    if (!store) {
      return errorResponse('门店不存在或不属于当前商户', 400);
    }
    if (!store.isActive) {
      return errorResponse('该门店已停用，请选择其他分店', 400);
    }

    if (data.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: data.departmentId, storeId: store.id, isActive: true },
      });
      if (!department) return errorResponse('部门不存在、不属于该门店或已停用', 400);
    }
    if (data.counterId) {
      const counter = await prisma.counter.findFirst({
        where: {
          id: data.counterId,
          isActive: true,
          department: {
            storeId: store.id,
            ...(data.departmentId ? { id: data.departmentId } : {}),
          },
        },
      });
      if (!counter) return errorResponse('收银台不存在、不属于该门店或已停用', 400);
    }

    // 数据库唯一约束是最终保证；极低概率碰撞时重新生成，避免返回无意义的 500。
    let qrCode = null;
    for (let attempt = 0; attempt < 5 && !qrCode; attempt += 1) {
      try {
        qrCode = await prisma.qRCode.create({
          data: {
            merchantId,
            code: generateQRCode(),
            type: data.type,
            name: data.name,
            storeId: data.storeId,
            departmentId: data.departmentId,
            counterId: data.counterId,
            amount: data.type === 'DYNAMIC' ? data.amount : null,
            expiredAt: data.type === 'DYNAMIC' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }
      }
    }
    if (!qrCode) return errorResponse('收款码编号生成失败，请重试', 503);

    const payUrl = `${resolveBaseUrl(req.headers)}/pay/${qrCode.code}`;

    return successResponse({
      ...qrCode,
      payUrl,
    }, '收款码创建成功');
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'STORE_MANAGER', 'CASHIER']);
}

// 查询收款码列表
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const merchantId = ctx.user.merchantId!;
    const url = new URL(req.url);
    const storeId = url.searchParams.get('storeId');
    const type = url.searchParams.get('type');

    const where: Record<string, unknown> = { merchantId };
    if (storeId) where.storeId = storeId;
    if (type) where.type = type;

    const qrCodes = await prisma.qRCode.findMany({
      where,
      include: {
        merchant: { select: { companyName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 批量获取门店信息
    const storeIds = qrCodes.filter(q => q.storeId).map(q => q.storeId!);
    const storeMap = new Map<string, { name: string; brand: { name: string } }>();
    if (storeIds.length > 0) {
      const stores = await prisma.store.findMany({
        where: { id: { in: storeIds } },
        include: { brand: { select: { name: true } } },
      });
      stores.forEach(s => storeMap.set(s.id, { name: s.name, brand: { name: s.brand.name } }));
    }

    const baseUrl = resolveBaseUrl(req.headers);

    return successResponse(
      qrCodes.map(qr => ({
        ...qr,
        store: qr.storeId ? storeMap.get(qr.storeId) || null : null,
        payUrl: `${baseUrl}/pay/${qr.code}`,
      }))
    );
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'STORE_MANAGER', 'CASHIER']);
}
