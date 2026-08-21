import prisma from '@/lib/db';
import Decimal from 'decimal.js';

export interface OrderContextInput {
  brandId?: string;
  storeId?: string;
  departmentId?: string;
  counterId?: string;
  qrcodeId?: string;
  amount: number;
}

/** 验证客户端提交的组织与二维码 ID 均属于当前商户且层级一致。 */
export async function validateOrderContext(
  merchantId: string,
  input: OrderContextInput
): Promise<string | null> {
  if (input.brandId) {
    const brand = await prisma.brand.findFirst({
      where: { id: input.brandId, merchantId, isActive: true },
      select: { id: true },
    });
    if (!brand) return '品牌不存在、不属于当前商户或已停用';
  }

  if (input.storeId) {
    const store = await prisma.store.findFirst({
      where: {
        id: input.storeId,
        isActive: true,
        brand: {
          merchantId,
          ...(input.brandId ? { id: input.brandId } : {}),
        },
      },
      select: { id: true },
    });
    if (!store) return '门店不存在、不属于当前商户或已停用';
  }

  if (input.departmentId) {
    if (!input.storeId) return '指定部门时必须同时指定门店';
    const department = await prisma.department.findFirst({
      where: { id: input.departmentId, storeId: input.storeId, isActive: true },
      select: { id: true },
    });
    if (!department) return '部门不存在、不属于指定门店或已停用';
  }

  if (input.counterId) {
    if (!input.departmentId) return '指定收银台时必须同时指定部门';
    const counter = await prisma.counter.findFirst({
      where: {
        id: input.counterId,
        departmentId: input.departmentId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!counter) return '收银台不存在、不属于指定部门或已停用';
  }

  if (input.qrcodeId) {
    const qrCode = await prisma.qRCode.findFirst({
      where: { id: input.qrcodeId, merchantId, isActive: true },
    });
    if (!qrCode) return '收款码不存在、不属于当前商户或已停用';
    if (qrCode.expiredAt && qrCode.expiredAt.getTime() < Date.now()) return '收款码已过期';
    if (
      qrCode.storeId !== (input.storeId || null) ||
      qrCode.departmentId !== (input.departmentId || null) ||
      qrCode.counterId !== (input.counterId || null)
    ) {
      return '收款码与门店层级不一致';
    }
    if (qrCode.type === 'DYNAMIC') {
      if (qrCode.orderId) return '动态收款码已使用';
      if (!qrCode.amount || !new Decimal(qrCode.amount.toString()).equals(input.amount)) {
        return '订单金额与动态收款码不一致';
      }
    }
  }

  return null;
}
