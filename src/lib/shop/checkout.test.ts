import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShopCashierUrl,
  formatShopAmount,
  isReusableShopWallet,
  resolveShopCheckoutReplay,
} from "./checkout";
import {
  signShopNotify,
  shopNotifyCanonicalString,
  verifyShopNotifySignature,
  isSafeShopNotifyUrl,
} from "./notify";

test("shop checkout replay is idempotent for the same amount", () => {
  assert.deepEqual(
    resolveShopCheckoutReplay({
      existingAmount: "10.00",
      requestedAmount: "10.00",
      status: "CREATED",
    }),
    { action: "REUSE" },
  );
  assert.deepEqual(
    resolveShopCheckoutReplay({
      existingAmount: "10.00",
      requestedAmount: "10.00",
      status: "PAYING",
    }),
    { action: "REUSE" },
  );
  assert.deepEqual(
    resolveShopCheckoutReplay({
      existingAmount: "10.00",
      requestedAmount: "10.00",
      status: "PAID",
    }),
    { action: "ALREADY_PAID" },
  );
});

test("shop checkout replay rejects amount mismatch and closed orders", () => {
  assert.deepEqual(
    resolveShopCheckoutReplay({
      existingAmount: "10.00",
      requestedAmount: "12.00",
      status: "CREATED",
    }),
    { action: "REJECT", error: "SHOP_ORDER_AMOUNT_MISMATCH" },
  );
  assert.deepEqual(
    resolveShopCheckoutReplay({
      existingAmount: "10.00",
      requestedAmount: "10.00",
      status: "CLOSED",
    }),
    { action: "REJECT", error: "SHOP_ORDER_NOT_REUSABLE" },
  );
});

test("shop amount stays two decimals owned by Pay", () => {
  assert.equal(formatShopAmount(10), "10.00");
  assert.equal(formatShopAmount(10.1), "10.10");
});

test("shop cashier URL uses BunnyEra Pay order page and status token", () => {
  assert.equal(
    buildShopCashierUrl("https://pay.bunnyera.com", "BEP1", "order-id-1"),
    "https://pay.bunnyera.com/pay/order/BEP1?token=order-id-1",
  );
});

test("shop pay start reuses existing PaymentFM session and locks wallet", () => {
  assert.deepEqual(
    isReusableShopWallet({
      status: "PAYING",
      existingWalletType: "ALIPAY",
      requestedWalletType: "ALIPAY",
      hasPayData: true,
    }),
    { action: "REUSE" },
  );
  assert.deepEqual(
    isReusableShopWallet({
      status: "PAYING",
      existingWalletType: "ALIPAY",
      requestedWalletType: "WECHAT",
      hasPayData: true,
    }),
    { action: "REJECT", error: "SHOP_ORDER_WALLET_LOCKED" },
  );
  assert.deepEqual(
    isReusableShopWallet({
      status: "CREATED",
      existingWalletType: null,
      requestedWalletType: "WECHAT",
      hasPayData: false,
    }),
    { action: "START" },
  );
});

test("shop notify signature is HMAC-SHA256 of the reserved canonical string", () => {
  const canonical = shopNotifyCanonicalString({
    timestamp: "1710000000000",
    event: "ORDER_PAID",
    shopOrderNo: "SHOP1",
    orderNo: "BEP1",
    amount: "10.00",
    status: "PAID",
  });
  assert.equal(canonical, "1710000000000.ORDER_PAID.SHOP1.BEP1.10.00.PAID");
  const signature = signShopNotify(canonical, "shop-secret");
  assert.equal(verifyShopNotifySignature({ canonical, signature, appSecret: "shop-secret" }), true);
  assert.equal(
    verifyShopNotifySignature({ canonical, signature, appSecret: "other-secret" }),
    false,
  );
});

test("shop notify URL rejects credentials and non-https in production", () => {
  assert.equal(isSafeShopNotifyUrl("https://shop.bunnyera.com/pay/notify", true), true);
  assert.equal(isSafeShopNotifyUrl("http://shop.bunnyera.com/pay/notify", true), false);
  assert.equal(isSafeShopNotifyUrl("https://user:pass@shop.bunnyera.com/pay/notify", false), false);
  assert.equal(isSafeShopNotifyUrl("javascript:alert(1)", false), false);
});
