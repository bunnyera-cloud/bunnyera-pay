import type { StoreAccessScope } from "@/lib/store-access";
import { canAccessStore, canWriteAtStore, hasMerchantWideStoreAccess } from "@/lib/store-access";

export function qrVisibleToActor(input: {
  qrMerchantId: string;
  actorMerchantId: string | null | undefined;
  storeId: string;
  scope: StoreAccessScope;
}): boolean {
  if (!input.actorMerchantId || input.actorMerchantId !== input.qrMerchantId) {
    return false;
  }
  return canAccessStore(input.scope, input.storeId);
}

export function qrWritableByActor(input: {
  qrMerchantId: string;
  actorMerchantId: string | null | undefined;
  storeId: string;
  scope: StoreAccessScope;
}): boolean {
  if (!input.actorMerchantId || input.actorMerchantId !== input.qrMerchantId) {
    return false;
  }
  return canWriteAtStore(input.scope, input.storeId);
}

export function operatorAllowedForStore(input: {
  operatorMerchantId: string;
  qrMerchantId: string;
  storeId: string;
  operatorActive: boolean;
  operatorRole: string;
  operatorStoreIds: string[];
}): boolean {
  if (!input.operatorActive) return false;
  if (input.operatorMerchantId !== input.qrMerchantId) return false;
  if (hasMerchantWideStoreAccess(input.operatorRole)) return true;
  return input.operatorStoreIds.includes(input.storeId);
}

export function counterBelongsToStore(input: {
  counterStoreId: string | null | undefined;
  storeId: string;
  counterActive: boolean;
}): boolean {
  if (!input.counterActive) return false;
  return input.counterStoreId === input.storeId;
}

export function disabledStoreBlocksCreate(storeActive: boolean): boolean {
  return !storeActive;
}
