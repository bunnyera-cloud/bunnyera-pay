import type { Prisma, UserRole } from "@prisma/client";
import type { JwtPayload } from "@/lib/auth";
import prisma from "@/lib/db";

const MERCHANT_WIDE_ROLES = new Set<UserRole>([
  "MERCHANT_OWNER",
  "MERCHANT_ADMIN",
  "FINANCE",
]);

export interface StoreAccessScope {
  unrestricted: boolean;
  storeIds: string[];
}

export function hasMerchantWideStoreAccess(role: string): boolean {
  return MERCHANT_WIDE_ROLES.has(role as UserRole);
}

/**
 * Platform tokens never inherit merchant-wide store access.
 * Headquarters merchant roles are unrestricted within their own merchantId
 * filter at the query layer. Branch roles require an explicit grant lookup.
 */
export function resolveImmediateStoreAccess(
  user: Pick<JwtPayload, "type" | "role" | "merchantId">,
): StoreAccessScope | null {
  if (user.type === "platform") {
    return { unrestricted: false, storeIds: [] };
  }
  if (hasMerchantWideStoreAccess(user.role)) {
    return { unrestricted: true, storeIds: [] };
  }
  if (!user.merchantId) {
    return { unrestricted: false, storeIds: [] };
  }
  return null;
}

/**
 * Headquarters roles can access every store in their merchant. Branch roles
 * are fail-closed and can only access stores explicitly assigned to them.
 * No grant means no stores — never default to the whole merchant.
 */
export async function resolveStoreAccess(
  user: JwtPayload,
): Promise<StoreAccessScope> {
  const immediate = resolveImmediateStoreAccess(user);
  if (immediate) return immediate;

  const accesses = await prisma.merchantMemberStore.findMany({
    where: {
      memberId: user.sub,
      member: { merchantId: user.merchantId, isActive: true },
      store: { brand: { merchantId: user.merchantId } },
    },
    select: { storeId: true },
  });

  return {
    unrestricted: false,
    storeIds: accesses.map((access) => access.storeId),
  };
}

export function canAccessStore(
  scope: StoreAccessScope,
  storeId: string | null | undefined,
): boolean {
  if (scope.unrestricted) return true;
  return Boolean(storeId && scope.storeIds.includes(storeId));
}

/**
 * Cross-merchant fence for any store-scoped action. Headquarters
 * unrestricted scopes still cannot see another merchant's store.
 */
export function canAccessStoreInMerchant(
  scope: StoreAccessScope,
  storeId: string | null | undefined,
  storeMerchantId: string | null | undefined,
  actorMerchantId: string | null | undefined,
): boolean {
  if (!actorMerchantId || !storeMerchantId || actorMerchantId !== storeMerchantId) {
    return false;
  }
  return canAccessStore(scope, storeId);
}

/** Branch roles must name an assigned store; HQ may omit storeId. */
export function canWriteAtStore(
  scope: StoreAccessScope,
  storeId?: string | null,
): boolean {
  if (scope.unrestricted) return true;
  return Boolean(storeId && scope.storeIds.includes(storeId));
}

export function storeIdWhere(scope: StoreAccessScope): Prisma.StringFilter | undefined {
  if (scope.unrestricted) return undefined;
  return { in: scope.storeIds };
}

export function applyStoreScopeToOrderWhere(
  scope: StoreAccessScope,
  where: Prisma.OrderWhereInput,
  requestedStoreId?: string | null,
): Prisma.OrderWhereInput {
  if (requestedStoreId) {
    if (!canAccessStore(scope, requestedStoreId)) {
      where.storeId = { in: [] };
      return where;
    }
    where.storeId = requestedStoreId;
    return where;
  }
  const scoped = storeIdWhere(scope);
  if (scoped) where.storeId = scoped;
  return where;
}

export type MerchantStoreGrantInput = {
  actorMerchantId: string | null | undefined;
  memberMerchantId: string | null | undefined;
  storeMerchantId: string | null | undefined;
  memberRole?: string | null;
};

/**
 * MerchantMemberStore has no DB-level same-merchant constraint.
 * Callers must fail-closed here before create/upsert.
 */
export function assertMerchantMemberStoreGrant(
  input: MerchantStoreGrantInput,
): { ok: true } | { ok: false; error: string } {
  const actor = input.actorMerchantId;
  const memberMerchantId = input.memberMerchantId;
  const storeMerchantId = input.storeMerchantId;
  if (!actor || !memberMerchantId || !storeMerchantId) {
    return { ok: false, error: "跨商户门店授权被拒绝" };
  }
  if (actor !== memberMerchantId || actor !== storeMerchantId) {
    return { ok: false, error: "不能将成员授权到其他商户的门店" };
  }
  if (input.memberRole && hasMerchantWideStoreAccess(input.memberRole)) {
    return { ok: false, error: "总部角色默认可访问全部分店，无需单独授权" };
  }
  return { ok: true };
}

export function assertRequestedStoresOwnedByMerchant(
  requestedStoreIds: string[],
  ownedStoreIds: string[],
): { ok: true } | { ok: false; error: string } {
  const requested = [...new Set(requestedStoreIds)];
  const owned = new Set(ownedStoreIds);
  if (requested.some((id) => !owned.has(id))) {
    return { ok: false, error: "包含无效、停用或不属于当前商户的分店" };
  }
  return { ok: true };
}
