import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { recordAuditLog } from '@/lib/audit';

// 获取商户详情（平台管理员）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withAuth(request, async () => {
    const merchant = await prisma.merchant.findUnique({
      where: { id },
      include: {
        members: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        brands: { include: { stores: { include: { departments: true } } } },
        channels: true,
        paymentConfigs: { select: { id: true, channel: true, isActive: true, isSandbox: true } },
        _count: {
          select: {
            orders: true,
            refunds: true,
            settlements: true,
          },
        },
      },
    });

    if (!merchant) {
      return errorResponse('商户不存在', 404);
    }

    // ===== 分店结构：分店数量/名称、收款码数量、交易汇总 =====
    const allStores = merchant.brands.flatMap(b => b.stores.map(s => ({ ...s, brandName: b.name })));
    const storeIds = allStores.map(s => s.id);

    const [qrCounts, orderTotals] = storeIds.length > 0
      ? await Promise.all([
          prisma.qRCode.groupBy({
            by: ['storeId'],
            where: { merchantId: id, storeId: { in: storeIds } },
            _count: true,
          }),
          prisma.order.groupBy({
            by: ['storeId'],
            where: { merchantId: id, status: 'PAID', storeId: { in: storeIds } },
            _sum: { amount: true },
            _count: true,
          }),
        ])
      : [[], []];

    const qrCountMap = new Map(qrCounts.map(g => [g.storeId, g._count]));
    const orderMap = new Map(orderTotals.map(g => [g.storeId, g]));

    const storeStructure = {
      storeCount: allStores.length,
      maxStores: 10,
      stores: allStores.map(s => ({
        storeId: s.id,
        storeName: s.name,
        storeCode: s.code,
        brandName: s.brandName,
        isActive: s.isActive,
        qrcodeCount: qrCountMap.get(s.id) || 0,
        paidOrderCount: orderMap.get(s.id)?._count || 0,
        paidAmount: Number(orderMap.get(s.id)?._sum.amount || 0),
      })),
    };

    return successResponse({ ...merchant, storeStructure });
  }, ['PLATFORM_SUPER_ADMIN', 'PLATFORM_REVIEWER']);
}

// 更新商户信息
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withAuth(request, async (req) => {
    const body = await req.json();
    
    const allowedFields = [
      'businessAddress', 'website', 'settlementBank',
      'settlementAccountTail', 'businessCategory',
    ];

    const updateData = Object.fromEntries(
      allowedFields.filter(f => body[f] !== undefined).map(f => [f, body[f]])
    ) as Prisma.MerchantUpdateInput;

    const merchant = await prisma.merchant.update({
      where: { id },
      data: updateData,
    });

    await recordAuditLog({
      platformUserId: (await prisma.platformSession.findFirst({
        where: { token: req.headers.get('authorization')?.slice(7) },
      }))?.userId,
      action: 'MERCHANT_UPDATE',
      resource: 'merchant',
      resourceId: id,
      request: req,
      afterData: updateData as unknown as Prisma.InputJsonValue,
      result: 'SUCCESS',
    });

    return successResponse(merchant);
  }, ['PLATFORM_SUPER_ADMIN']);
}
