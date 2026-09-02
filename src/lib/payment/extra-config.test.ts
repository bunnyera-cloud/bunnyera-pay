import assert from "node:assert/strict";
import test from "node:test";
import { mergePaymentExtraConfig } from "./extra-config";

test("mergePaymentExtraConfig keeps wallet arrays including empty fail-closed lists", () => {
  const merged = mergePaymentExtraConfig(
    { sellerId: "keep-me" },
    { enabledWallets: ["WECHAT"], payTypes: ["tloop"] },
  );
  assert.deepEqual(merged.enabledWallets, ["WECHAT"]);
  assert.deepEqual(merged.payTypes, ["tloop"]);
  assert.equal(merged.sellerId, "keep-me");

  const emptied = mergePaymentExtraConfig(merged as { sellerId: string; enabledWallets: string[]; payTypes: string[] }, {
    enabledWallets: [],
    payTypes: [],
  });
  assert.deepEqual(emptied.enabledWallets, []);
  assert.deepEqual(emptied.payTypes, []);
  assert.equal(emptied.sellerId, "keep-me");

  const walletsOnly = mergePaymentExtraConfig(
    { sellerId: "keep-me", payTypes: ["aloop"], notifyUrl: "https://keep.example/notify" },
    { enabledWallets: ["WECHAT"] },
  );
  assert.deepEqual(walletsOnly.enabledWallets, ["WECHAT"]);
  assert.deepEqual(walletsOnly.payTypes, ["aloop"]);
  assert.equal(walletsOnly.sellerId, "keep-me");
  assert.equal(walletsOnly.notifyUrl, "https://keep.example/notify");
});
