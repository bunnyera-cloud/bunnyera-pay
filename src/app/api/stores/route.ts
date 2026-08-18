import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse } from '@/lib/api-utils';
import { z } from 'zod';

const storeSchema = z.object({
  brandName: z.string().min(1),
  brandCode: z.string().min(1),
  storeName: z.string().min(1),
  storeCode: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  departments: z.array(z.object({
    name: z.string().min(1),
    code: z.string().min(1),
  })).optional(),
});

// 创建品牌 + 门店
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const body = await req.json();
    const validation = storeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: '数据验证失败', details: validation.error.issues }, { status: 400 });
    }

    const merchantId = ctx.user.merchantId!;
    const data = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      // 创建或获取品牌
      let brand = await tx.brand.findFirst({
        where: { merchantId, code: data.brandCode },
      });
      if (!brand) {
        brand = await tx.brand.create({
          data: { merchantId, name: data.brandName, code: data.brandCode },
        });
      }

      // 创建门店
      const store = await tx.store.create({
        data: {
          brandId: brand.id,
          name: data.storeName,
          code: data.storeCode,
          address: data.address,
          phone: data.phone,
        },
      });

      // 创建部门
      if (data.departments?.length) {
        await tx.department.createMany({
          data: data.departments.map(d => ({
            storeId: store.id,
            name: d.name,
            code: d.code,
          })),
        });
      }

      return store;
    });

    return successResponse(result, '门店创建成功');
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN']);
}

// 查询门店列表
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const merchantId = ctx.user.merchantId!;

    const brands = await prisma.brand.findMany({
      where: { merchantId },
      include: {
        stores: {
          include: {
            departments: { include: { counters: true } },
          },
        },
      },
    });

    return successResponse(brands);
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'STORE_MANAGER']);
}
