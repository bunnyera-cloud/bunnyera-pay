import type { JwtPayload } from "@/lib/auth";
import prisma from "@/lib/db";
import { canAccessStore, canWriteAtStore, resolveStoreAccess } from "@/lib/store-access";
import { buildAggregatePayUrl } from "./url";
import { AGGREGATE_QR_TEMPLATE } from "./templates";

export const QR_READ_ROLES = [
  "MERCHANT_OWNER",
  "MERCHANT_ADMIN",
  "FINANCE",
  "STORE_MANAGER",
  "CASHIER",
] as const;

export const QR_WRITE_ROLES = [
  "MERCHANT_OWNER",
  "MERCHANT_ADMIN",
  "STORE_MANAGER",
  "CASHIER",
] as const;

const QR_DETAIL_INCLUDE = {
  merchant: { select: { id: true, companyName: true, merchantNo: true, status: true } },
  store: {
    select: {
      id: true,
      name: true,
      isActive: true,
      brand: { select: { name: true, merchantId: true } },
    },
  },
} as const;

export async function loadOwnedQrCode(
  id: string,
  user: JwtPayload,
  mode: "read" | "write" = "read",
) {
  const merchantId = user.merchantId;
  if (!merchantId) {
    return { error: "未授权，请先登录" as const, status: 401 as const, qr: null };
  }
  const qr = await prisma.qRCode.findFirst({
    where: { id, merchantId },
    include: QR_DETAIL_INCLUDE,
  });
  if (!qr) {
    return { error: "收款码不存在" as const, status: 404 as const, qr: null };
  }
  const scope = await resolveStoreAccess(user);
  const allowed =
    mode === "write"
      ? canWriteAtStore(scope, qr.storeId)
      : canAccessStore(scope, qr.storeId);
  if (!allowed) {
    return { error: "收款码不存在" as const, status: 404 as const, qr: null };
  }
  return { qr, scope, error: null, status: 200 as const };
}

export async function loadQrBindings(input: {
  counterId?: string | null;
  operatorId?: string | null;
}) {
  const [counter, operator] = await Promise.all([
    input.counterId
      ? prisma.counter.findUnique({
          where: { id: input.counterId },
          select: { id: true, name: true, code: true, isActive: true },
        })
      : Promise.resolve(null),
    input.operatorId
      ? prisma.merchantMember.findUnique({
          where: { id: input.operatorId },
          select: { id: true, name: true, email: true, role: true, isActive: true },
        })
      : Promise.resolve(null),
  ]);
  return { counter, operator };
}

export function presentQrCode(
  qr: {
    id: string;
    code: string;
    type: string;
    name: string | null;
    amount: unknown;
    isActive: boolean;
    storeId: string;
    departmentId: string | null;
    counterId: string | null;
    operatorId: string | null;
    createdAt: Date;
    merchantId: string;
    merchant?: { companyName?: string; merchantNo?: string } | null;
    store?: {
      id: string;
      name: string;
      isActive?: boolean;
      brand?: { name: string };
    } | null;
  },
  baseUrl: string,
  extras?: {
    counter?: { id: string; name: string; code?: string } | null;
    operator?: { id: string; name: string; email?: string; role?: string } | null;
    paidOrderCount?: number;
    paidAmount?: number;
  },
) {
  return {
    id: qr.id,
    code: qr.code,
    type: qr.type,
    name: qr.name,
    amount: qr.amount,
    isActive: qr.isActive,
    storeId: qr.storeId,
    departmentId: qr.departmentId,
    counterId: qr.counterId,
    operatorId: qr.operatorId,
    merchantId: qr.merchantId,
    createdAt: qr.createdAt,
    template: AGGREGATE_QR_TEMPLATE,
    payUrl: buildAggregatePayUrl(baseUrl, qr.code),
    merchant: qr.merchant
      ? { companyName: qr.merchant.companyName, merchantNo: qr.merchant.merchantNo }
      : null,
    store: qr.store
      ? { id: qr.store.id, name: qr.store.name, isActive: qr.store.isActive, brand: qr.store.brand }
      : null,
    counter: extras?.counter ?? null,
    operator: extras?.operator ?? null,
    paidOrderCount: extras?.paidOrderCount ?? 0,
    paidAmount: extras?.paidAmount ?? 0,
  };
}
