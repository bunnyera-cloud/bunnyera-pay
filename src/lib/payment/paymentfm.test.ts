import assert from "node:assert/strict";
import test from "node:test";
import type { PaymentConfig } from "@prisma/client";
import { resolveProvider } from "./resolver";
import {
  assessPaymentFmHealth,
  formatPaymentFmAmount,
  listPaymentFmWalletAllowlist,
  normalizePaymentFmWalletSelection,
  paymentFmWalletPatchExtra,
  maskPaymentFmMerchantNum,
  md5HexLower,
  normalizeWalletType,
  resolvePaymentFmConfig,
  resolvePaymentFmPayType,
  safeEqualHex,
  signPaymentFmCreateOrder,
  signPaymentFmNotify,
} from "./paymentfm-config";
import { PaymentFmProvider, parsePaymentFmAttach } from "./paymentfm";

test("PaymentFM MD5 matches official lowercase 32-char example", () => {
  assert.equal(md5HexLower("abc123456"), "0659c7992e268962384eb17fafe88364");
});

test("PaymentFM create-order and notify signatures use documented concat order", () => {
  const createSign = signPaymentFmCreateOrder({
    merchantNum: "m1",
    orderNo: "BEP1",
    amount: "10.01",
    notifyUrl: "https://pay.example/api/pay/paymentfm/notify",
    merchantKey: "secret",
  });
  assert.equal(
    createSign,
    md5HexLower("m1BEP110.01https://pay.example/api/pay/paymentfm/notifysecret"),
  );

  const notifySign = signPaymentFmNotify({
    state: "1",
    merchantNum: "m1",
    orderNo: "BEP1",
    amount: "10.01",
    merchantKey: "secret",
  });
  assert.equal(notifySign, md5HexLower("1m1BEP110.01secret"));
  assert.equal(safeEqualHex(notifySign, notifySign), true);
  assert.equal(safeEqualHex(notifySign, "0".repeat(32)), false);
});

test("PaymentFM amount formatter keeps documented 2-decimal rule", () => {
  assert.equal(formatPaymentFmAmount(10), "10");
  assert.equal(formatPaymentFmAmount("10.01"), "10.01");
  assert.equal(formatPaymentFmAmount("10.1"), "10.10");
  assert.throws(() => formatPaymentFmAmount("10.001"));
  assert.throws(() => formatPaymentFmAmount(-1));
});

test("PaymentFM wallet allowlist is explicit and fail-closed when empty", () => {
  assert.deepEqual(listPaymentFmWalletAllowlist({ payTypes: ["aloop"] }), ["ALIPAY"]);
  assert.deepEqual(listPaymentFmWalletAllowlist({ payTypes: [] }), []);
  assert.deepEqual(listPaymentFmWalletAllowlist({ enabledWallets: [] }), []);
  assert.deepEqual(listPaymentFmWalletAllowlist(undefined), ["ALIPAY", "WECHAT", "UNIONPAY"]);
});

test("PaymentFM enabledWallets and payTypes use intersection not union", () => {
  assert.deepEqual(
    listPaymentFmWalletAllowlist({
      enabledWallets: ["WECHAT", "ALIPAY"],
      payTypes: ["tloop"],
    }),
    ["WECHAT"],
  );
  assert.deepEqual(
    listPaymentFmWalletAllowlist({
      enabledWallets: ["WECHAT"],
      payTypes: ["aloop"],
    }),
    [],
  );
  assert.deepEqual(
    listPaymentFmWalletAllowlist({
      enabledWallets: ["WECHAT"],
      payTypes: ["tloop"],
    }),
    ["WECHAT"],
  );
});

test("PaymentFM wallet selection persists empty arrays as fail-closed", () => {
  assert.deepEqual(normalizePaymentFmWalletSelection({ enabledWallets: [], payTypes: [] }), {
    enabledWallets: [],
    payTypes: [],
  });
  assert.deepEqual(
    normalizePaymentFmWalletSelection({ enabledWallets: ["WECHAT"] }),
    { enabledWallets: ["WECHAT"], payTypes: ["tloop"] },
  );
  assert.deepEqual(
    normalizePaymentFmWalletSelection({ enabledWallets: [], payTypes: ["tloop"] }),
    { enabledWallets: [], payTypes: ["tloop"] },
  );
  assert.deepEqual(
    paymentFmWalletPatchExtra({ enabledWallets: ["WECHAT"] }),
    { enabledWallets: ["WECHAT"] },
  );
  assert.deepEqual(
    paymentFmWalletPatchExtra({ enabledWallets: ["WECHAT"], payTypes: [] }),
    { enabledWallets: ["WECHAT"], payTypes: [] },
  );
});

test("PaymentFM payType only accepts documented values or wallet loops", () => {
  assert.deepEqual(resolvePaymentFmPayType({ walletType: "ALIPAY" }), {
    payType: "aloop",
  });
  assert.deepEqual(resolvePaymentFmPayType({ walletType: "WECHAT" }), {
    payType: "tloop",
  });
  assert.deepEqual(resolvePaymentFmPayType({ walletType: "UNIONPAY" }), {
    payType: "bloop",
  });
  assert.deepEqual(resolvePaymentFmPayType({ payType: "wxpaynative" }), {
    payType: "wxpaynative",
  });
  assert.deepEqual(resolvePaymentFmPayType({ payType: "not-a-real-type" }), {
    error: "PAYMENTFM_PAY_TYPE_NOT_DOCUMENTED",
  });
  assert.deepEqual(resolvePaymentFmPayType({}), {
    error: "PAYMENTFM_PAY_TYPE_REQUIRED",
  });
});

test("PaymentFM stays fail-closed without official credentials", () => {
  const previous = {
    url: process.env.PAYMENTFM_API_URL,
    num: process.env.PAYMENTFM_MERCHANT_NUM,
    key: process.env.PAYMENTFM_MERCHANT_KEY,
    notify: process.env.PAYMENTFM_NOTIFY_URL,
  };
  delete process.env.PAYMENTFM_API_URL;
  delete process.env.PAYMENTFM_MERCHANT_NUM;
  delete process.env.PAYMENTFM_MERCHANT_KEY;
  delete process.env.PAYMENTFM_NOTIFY_URL;
  try {
    const resolved = resolveProvider(
      "PAYMENTFM_AGGREGATE",
      { isActive: true, isSandbox: false } as PaymentConfig,
      { merchantChannel: { isEnabled: true } },
    );
    assert.equal(resolved.usable, false);
    assert.equal(resolved.provider, null);
    assert.ok(resolved.missing.includes("PAYMENTFM_API_URL"));
    assert.ok(resolved.missing.includes("PAYMENTFM_MERCHANT_NUM"));
    assert.ok(resolved.missing.includes("PAYMENTFM_MERCHANT_KEY"));

    const cfg = resolvePaymentFmConfig({
      isActive: true,
      isSandbox: false,
    } as PaymentConfig);
    assert.equal(cfg.usable, false);
  } finally {
    restoreEnv("PAYMENTFM_API_URL", previous.url);
    restoreEnv("PAYMENTFM_MERCHANT_NUM", previous.num);
    restoreEnv("PAYMENTFM_MERCHANT_KEY", previous.key);
    restoreEnv("PAYMENTFM_NOTIFY_URL", previous.notify);
  }
});

test("PaymentFM webhook rejects unsigned or mismatched merchant payloads", async () => {
  const provider = new PaymentFmProvider({
    apiUrl: "https://example.invalid",
    merchantNum: "m1",
    merchantKey: "secret",
    notifyUrl: "https://pay.example/api/pay/paymentfm/notify",
    usable: true,
    missing: [],
  });

  const unsigned = await provider.handleWebhook({
    body: {
      state: "1",
      merchantNum: "m1",
      orderNo: "BEP1",
      amount: "10.01",
      platformOrderNo: "pf1",
      sign: "deadbeef",
    },
    headers: {},
  });
  assert.equal(unsigned.verified, false);

  const otherMerchant = await provider.handleWebhook({
    body: {
      state: "1",
      merchantNum: "other",
      orderNo: "BEP1",
      amount: "10.01",
      platformOrderNo: "pf1",
      sign: signPaymentFmNotify({
        state: "1",
        merchantNum: "other",
        orderNo: "BEP1",
        amount: "10.01",
        merchantKey: "secret",
      }),
    },
    headers: {},
  });
  assert.equal(otherMerchant.verified, false);

  const ok = await provider.handleWebhook({
    body: {
      state: "1",
      merchantNum: "m1",
      orderNo: "BEP1",
      amount: "10.01",
      platformOrderNo: "pf1",
      payTime: "2026-09-02 01:00:00",
      sign: signPaymentFmNotify({
        state: "1",
        merchantNum: "m1",
        orderNo: "BEP1",
        amount: "10.01",
        merchantKey: "secret",
      }),
    },
    headers: {},
  });
  assert.equal(ok.verified, true);
  assert.equal(ok.data?.orderNo, "BEP1");
  assert.equal(ok.data?.amount, 1001);
  assert.equal(ok.data?.status, "SUCCESS");
});

test("PaymentFM refund and close stay undocumented fail-closed", async () => {
  const provider = new PaymentFmProvider({
    apiUrl: "https://example.invalid",
    merchantNum: "m1",
    merchantKey: "secret",
    notifyUrl: "https://pay.example/notify",
    usable: true,
    missing: [],
  });
  assert.equal(await provider.closeOrder({ orderNo: "BEP1" }), false);
  const refund = await provider.refund({
    refundNo: "R1",
    orderNo: "BEP1",
    refundAmount: 1,
    totalAmount: 1,
  });
  assert.equal(refund.success, false);
  assert.equal(refund.error, "REFUND_NOT_SUPPORTED_OR_NOT_CONFIGURED");
  const query = await provider.queryRefund({ refundNo: "R1" });
  assert.equal(query.status, "UNKNOWN");
});

test("PaymentFM attach encodes store and qrcode attribution", () => {
  assert.deepEqual(parsePaymentFmAttach("s=store-1&q=qr-2&o=op-3"), {
    storeId: "store-1",
    qrcodeId: "qr-2",
    operatorId: "op-3",
  });
});

test("PaymentFM health and wallet normalization helpers", () => {
  assert.equal(
    assessPaymentFmHealth({
      usable: false,
      missing: ["PAYMENTFM_API_URL"],
      isEnabled: false,
      hasAnyCredential: false,
    }),
    "NOT_CONFIGURED",
  );
  assert.equal(
    assessPaymentFmHealth({
      usable: true,
      missing: [],
      isEnabled: false,
      hasAnyCredential: true,
    }),
    "CONFIGURED",
  );
  assert.equal(
    assessPaymentFmHealth({
      usable: true,
      missing: [],
      isEnabled: true,
      hasAnyCredential: true,
    }),
    "ACTIVE",
  );
  assert.equal(
    assessPaymentFmHealth({
      usable: false,
      missing: ["PAYMENTFM_MERCHANT_KEY"],
      isEnabled: true,
      hasAnyCredential: true,
    }),
    "ERROR",
  );
  assert.equal(maskPaymentFmMerchantNum("88888888"), "88***88");
  assert.equal(normalizeWalletType("aloop"), "ALIPAY");
  assert.equal(normalizeWalletType("huifu-qkpay"), "UNKNOWN");
});

test("PaymentFM create/query use mock transport and never invent PAID", async () => {
  const cfg = {
    apiUrl: "https://example.invalid",
    merchantNum: "m1",
    merchantKey: "secret",
    notifyUrl: "https://pay.example/api/pay/paymentfm/notify",
    usable: true,
    missing: [],
  };
  const createOk = new PaymentFmProvider(cfg, async () =>
    new Response(
      JSON.stringify({
        success: true,
        code: 200,
        msg: "success",
        data: { id: "pf-1", payUrl: "https://example.invalid/pay?orderNo=pf-1" },
      }),
      { status: 200 },
    ),
  );
  const created = await createOk.createOrder({
    orderNo: "BEP1",
    amount: 10.01,
    subject: "test",
    notifyUrl: cfg.notifyUrl,
    extraParams: { walletType: "ALIPAY" },
  });
  assert.equal(created.success, true);
  assert.equal(created.payData?.startsWith("https://"), true);

  const malformed = new PaymentFmProvider(cfg, async () => new Response("not-json", { status: 200 }));
  const badCreate = await malformed.createPayment({
    orderNo: "BEP1",
    amount: 10.01,
    subject: "test",
    notifyUrl: cfg.notifyUrl,
    extraParams: { walletType: "ALIPAY" },
  });
  assert.equal(badCreate.success, false);

  const timedOut = new PaymentFmProvider(cfg, async () => {
    throw new Error("timeout");
  });
  const timeoutResult = await timedOut.createPayment({
    orderNo: "BEP1",
    amount: 10.01,
    subject: "test",
    notifyUrl: cfg.notifyUrl,
    extraParams: { walletType: "WECHAT" },
  });
  assert.equal(timeoutResult.success, false);

  const queryPaid = new PaymentFmProvider(cfg, async () =>
    new Response(
      JSON.stringify({
        success: true,
        code: 200,
        data: {
          merchantNum: "m1",
          orderNo: "BEP1",
          amount: "10.01",
          orderState: "4",
          orderId: "pf-1",
        },
      }),
      { status: 200 },
    ),
  );
  const queried = await queryPaid.queryOrder({ orderNo: "BEP1" });
  assert.equal(queried.status, "PAID");
  assert.equal(queried.verified, true);
  assert.equal(queried.amount, 1001);

  const queryWrongMerchant = new PaymentFmProvider(cfg, async () =>
    new Response(
      JSON.stringify({
        success: true,
        code: 200,
        data: {
          merchantNum: "other",
          orderNo: "BEP1",
          amount: "10.01",
          orderState: "4",
          orderId: "pf-1",
        },
      }),
      { status: 200 },
    ),
  );
  const rejected = await queryWrongMerchant.queryOrder({ orderNo: "BEP1" });
  assert.equal(rejected.status, "UNKNOWN");
  assert.notEqual(rejected.verified, true);
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
