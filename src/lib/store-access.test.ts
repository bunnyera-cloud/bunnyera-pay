import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStoreScopeToOrderWhere,
  assertMerchantMemberStoreGrant,
  assertRequestedStoresOwnedByMerchant,
  canAccessStore,
  canAccessStoreInMerchant,
  canWriteAtStore,
  hasMerchantWideStoreAccess,
  resolveImmediateStoreAccess,
  storeIdWhere,
} from "./store-access";

test("headquarters roles have merchant-wide store access", () => {
  assert.equal(hasMerchantWideStoreAccess("MERCHANT_OWNER"), true);
  assert.equal(hasMerchantWideStoreAccess("MERCHANT_ADMIN"), true);
  assert.equal(hasMerchantWideStoreAccess("FINANCE"), true);
  assert.equal(hasMerchantWideStoreAccess("STORE_MANAGER"), false);
  assert.equal(hasMerchantWideStoreAccess("CASHIER"), false);
  assert.equal(hasMerchantWideStoreAccess("CUSTOMER_SERVICE"), false);
  assert.equal(hasMerchantWideStoreAccess("AUDITOR"), false);
  assert.equal(hasMerchantWideStoreAccess("PLATFORM_SUPER_ADMIN"), false);
});

test("platform tokens never become merchant-unrestricted", () => {
  const scope = resolveImmediateStoreAccess({
    type: "platform",
    role: "PLATFORM_SUPER_ADMIN",
    merchantId: undefined,
  });
  assert.deepEqual(scope, { unrestricted: false, storeIds: [] });
  assert.equal(canAccessStore(scope!, "store-a"), false);
  assert.equal(canWriteAtStore(scope!), false);
});

test("HQ merchant roles resolve immediately as unrestricted", () => {
  const owner = resolveImmediateStoreAccess({
    type: "merchant",
    role: "MERCHANT_OWNER",
    merchantId: "merchant-a",
  });
  assert.deepEqual(owner, { unrestricted: true, storeIds: [] });
  assert.equal(
    resolveImmediateStoreAccess({
      type: "merchant",
      role: "STORE_MANAGER",
      merchantId: "merchant-a",
    }),
    null,
  );
});

test("branch store scope is fail-closed", () => {
  const scope = { unrestricted: false, storeIds: ["store-a"] };
  assert.equal(canAccessStore(scope, "store-a"), true);
  assert.equal(canAccessStore(scope, "store-b"), false);
  assert.equal(canAccessStore(scope, null), false);
  assert.equal(canWriteAtStore(scope, "store-a"), true);
  assert.equal(canWriteAtStore(scope, undefined), false);
});

test("empty store grants never default to all stores", () => {
  const scope = { unrestricted: false, storeIds: [] as string[] };
  assert.equal(canAccessStore(scope, "store-a"), false);
  assert.equal(canWriteAtStore(scope, "store-a"), false);
  assert.deepEqual(storeIdWhere(scope), { in: [] });
  assert.deepEqual(
    applyStoreScopeToOrderWhere(scope, { merchantId: "merchant-a" }),
    { merchantId: "merchant-a", storeId: { in: [] } },
  );
});

test("Merchant A branch cannot access Merchant B store ids", () => {
  const merchantACashier = { unrestricted: false, storeIds: ["store-a"] };
  assert.equal(canAccessStore(merchantACashier, "store-merchant-b"), false);
  assert.equal(
    canAccessStoreInMerchant(
      merchantACashier,
      "store-a",
      "merchant-a",
      "merchant-a",
    ),
    true,
  );
  assert.equal(
    canAccessStoreInMerchant(
      merchantACashier,
      "store-merchant-b",
      "merchant-b",
      "merchant-a",
    ),
    false,
  );
});

test("HQ unrestricted still cannot cross merchant ids", () => {
  const hq = { unrestricted: true, storeIds: [] as string[] };
  assert.equal(canAccessStore(hq, "store-merchant-b"), true);
  assert.equal(
    canAccessStoreInMerchant(hq, "store-merchant-b", "merchant-b", "merchant-a"),
    false,
  );
  assert.equal(
    canAccessStoreInMerchant(hq, "store-a", "merchant-a", "merchant-a"),
    true,
  );
});

test("requested store outside grant is fail-closed on order where", () => {
  const where = applyStoreScopeToOrderWhere(
    { unrestricted: false, storeIds: ["store-a"] },
    { merchantId: "merchant-a" },
    "store-merchant-b",
  );
  assert.deepEqual(where, {
    merchantId: "merchant-a",
    storeId: { in: [] },
  });
});

test("cross-merchant MerchantMemberStore grants fail-closed", () => {
  const attack = assertMerchantMemberStoreGrant({
    actorMerchantId: "merchant-a",
    memberMerchantId: "merchant-a",
    storeMerchantId: "merchant-b",
    memberRole: "CASHIER",
  });
  assert.equal(attack.ok, false);
  if (!attack.ok) assert.match(attack.error, /其他商户/);

  const foreignMember = assertMerchantMemberStoreGrant({
    actorMerchantId: "merchant-a",
    memberMerchantId: "merchant-b",
    storeMerchantId: "merchant-a",
    memberRole: "STORE_MANAGER",
  });
  assert.equal(foreignMember.ok, false);

  const sameMerchant = assertMerchantMemberStoreGrant({
    actorMerchantId: "merchant-a",
    memberMerchantId: "merchant-a",
    storeMerchantId: "merchant-a",
    memberRole: "CASHIER",
  });
  assert.deepEqual(sameMerchant, { ok: true });
});

test("HQ roles cannot be bound onto MerchantMemberStore", () => {
  const blocked = assertMerchantMemberStoreGrant({
    actorMerchantId: "merchant-a",
    memberMerchantId: "merchant-a",
    storeMerchantId: "merchant-a",
    memberRole: "FINANCE",
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.error, /总部角色/);
});

test("requested store id lists reject foreign stores", () => {
  const blocked = assertRequestedStoresOwnedByMerchant(
    ["store-a", "store-b"],
    ["store-a"],
  );
  assert.equal(blocked.ok, false);
  assert.deepEqual(
    assertRequestedStoresOwnedByMerchant(["store-a"], ["store-a", "store-c"]),
    { ok: true },
  );
});
