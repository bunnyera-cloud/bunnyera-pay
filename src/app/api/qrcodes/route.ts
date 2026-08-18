import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { z } from 'zod';

const createQRSchema = z.object({
  type: z.enum(['FIXED', 'DYNAMIC']),
  name: z.string().min(1).max(100),
  storeId: z.string().optional(),
  departmentId: z.string().optional(),
  counterId: z.string().optional(),
  amount: z.number().positive().optional(), // 动态码固定金额
});

// 生成二维码编号
function generateQRCode(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
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

    // 验证门店归属
    if (data.storeId) {
      const store = await prisma.store.findFirst({
        where: { id: data.storeId, brand: { merchantId } },
      });
      if (!store) {
        return errorResponse('门店不存在或不属于当前商户', 400);
      }
    }

    const code = generateQRCode();
    const qrCode = await prisma.qRCode.create({
      data: {
        merchantId,
        code,
        type: data.type,
        name: data.name,
        storeId: data.storeId,
        departmentId: data.departmentId,
        counterId: data.counterId,
        amount: data.amount,
        expiredAt: data.type === 'DYNAMIC' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
      },
    });

    // 生成二维码图片 URL（指向收银台页面）
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const payUrl = `${baseUrl}/pay/${code}`;

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

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    return successResponse(
      qrCodes.map(qr => ({
        ...qr,
        store: qr.storeId ? storeMap.get(qr.storeId) || null : null,
        payUrl: `${baseUrl}/pay/${qr.code}`,
      }))
    );
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'STORE_MANAGER', 'CASHIER']);
}
