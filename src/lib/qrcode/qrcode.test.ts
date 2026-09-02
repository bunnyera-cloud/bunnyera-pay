import assert from "node:assert/strict";
import test from "node:test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { generateQrCodeValue, isHighEntropyQrCode, qrCodeEntropyBits } from "./code";
import { buildAggregatePayUrl } from "./url";
import { parsePayAmount, resolveQrPayAmount } from "./amount";
import {
  PLAIN_QR_PNG_SIZE,
  assertPlainQrSvg,
  qrDownloadFilename,
  renderPlainQrPng,
  renderPlainQrSvg,
} from "./image";
import { evaluateAggregateQrScan } from "./scan";
import {
  counterBelongsToStore,
  operatorAllowedForStore,
  qrVisibleToActor,
  qrWritableByActor,
} from "./access";
import { summarizeQrCodeStats } from "./stats";
import { cashierDuplicateInFlight, isReusableCashierOrder } from "./idempotency";
import { listAvailablePaymentFmWallets, orderAttributionFromQr } from "./wallets";
import { AGGREGATE_QR_TEMPLATE } from "./templates";

const SCAN_BASE = {
  qr: {
    isActive: true,
    type: "DYNAMIC" as const,
    amount: null,
    merchantId: "m1",
    storeId: "s1",
    expiredAt: null,
  },
  merchant: { status: "ACTIVE" },
  store: { isActive: true, merchantId: "m1" },
};

test("aggregate QR codes are high-entropy CSPRNG tokens", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const code = generateQrCodeValue();
    assert.equal(isHighEntropyQrCode(code), true);
    assert.equal(seen.has(code), false);
    seen.add(code);
  }
  assert.ok(qrCodeEntropyBits() >= 100);
});

test("aggregate QR payload is APP_BASE_URL/pay/{code} with no secrets", () => {
  const code = generateQrCodeValue();
  const url = buildAggregatePayUrl("https://pay.bunnyera.com", code);
  assert.equal(url, `https://pay.bunnyera.com/pay/${code}`);
  assert.equal(url.includes("secret"), false);
  assert.equal(url.includes("merchantKey"), false);
  assert.equal(url.includes("PaymentFM"), false);
  assert.throws(() => buildAggregatePayUrl("https://pay.bunnyera.com", "abc/../x"));
});

test("plain PNG QR decodes to the exact pay URL", async () => {
  const code = generateQrCodeValue();
  const payUrl = buildAggregatePayUrl("https://pay.bunnyera.com", code);
  const png = await renderPlainQrPng(payUrl);
  const image = PNG.sync.read(png);
  assert.equal(image.width, PLAIN_QR_PNG_SIZE);
  assert.equal(image.height, PLAIN_QR_PNG_SIZE);
  const decoded = jsQR(
    new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    image.width,
    image.height,
  );
  assert.ok(decoded, "generated QR PNG must decode");
  assert.equal(decoded!.data, payUrl);
  assert.equal(decoded!.data, `https://pay.bunnyera.com/pay/${code}`);
});

test("plain SVG QR is logo-free and download name keeps BunnyEra Pay", async () => {
  const code = generateQrCodeValue();
  const payUrl = buildAggregatePayUrl("http://localhost:3000", code);
  const svg = await renderPlainQrSvg(payUrl);
  assertPlainQrSvg(svg);
  assert.equal(qrDownloadFilename(code, "png"), `bunnyera-pay-${code}.png`);
  assert.equal(qrDownloadFilename(code, "svg"), `bunnyera-pay-${code}.svg`);
  assert.equal(AGGREGATE_QR_TEMPLATE, "PLAIN");
});

test("FIXED amount is server-owned and rejects client tampering", () => {
  const ok = resolveQrPayAmount({ type: "FIXED", qrAmount: "12.50" });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.amount.toFixed(2), "12.50");
  const tamper = resolveQrPayAmount({
    type: "FIXED",
    qrAmount: "12.50",
    clientAmount: "1.00",
  });
  assert.equal(tamper.ok, false);
});

test("DYNAMIC amount rejects zero, invalid precision, and over-limit", () => {
  assert.equal(parsePayAmount(0).ok, false);
  assert.equal(parsePayAmount(-1).ok, false);
  assert.equal(parsePayAmount("0.001").ok, false);
  assert.equal(parsePayAmount("1000000.01").ok, false);
  assert.equal(parsePayAmount("1e2").ok, false);
  const ok = resolveQrPayAmount({
    type: "DYNAMIC",
    qrAmount: null,
    clientAmount: "10.01",
  });
  assert.equal(ok.ok, true);
  const ignoresQrAmount = resolveQrPayAmount({
    type: "DYNAMIC",
    qrAmount: "99.00",
    clientAmount: "3.50",
  });
  assert.equal(ignoresQrAmount.ok, true);
  if (ignoresQrAmount.ok) assert.equal(ignoresQrAmount.amount.toFixed(2), "3.50");
});

test("scan gate rejects missing, disabled QR, disabled store, and wrong merchant", () => {
  const missing = evaluateAggregateQrScan({ ...SCAN_BASE, qr: null });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 404);
  assert.equal(
    evaluateAggregateQrScan({
      ...SCAN_BASE,
      qr: { ...SCAN_BASE.qr, isActive: false },
    }).ok,
    false,
  );
  const disabledStore = evaluateAggregateQrScan({
    ...SCAN_BASE,
    store: { isActive: false, merchantId: "m1" },
  });
  assert.equal(disabledStore.ok, false);
  if (!disabledStore.ok) assert.equal(disabledStore.status, 403);
  const suspended = evaluateAggregateQrScan({
    ...SCAN_BASE,
    merchant: { status: "SUSPENDED" },
  });
  assert.equal(suspended.ok, false);
  if (!suspended.ok) assert.equal(suspended.status, 403);
  assert.equal(
    evaluateAggregateQrScan({
      ...SCAN_BASE,
      store: { isActive: true, merchantId: "other" },
    }).ok,
    false,
  );
  assert.equal(
    evaluateAggregateQrScan({
      ...SCAN_BASE,
      qr: { ...SCAN_BASE.qr, type: "FIXED", amount: null },
    }).ok,
    false,
  );
});

test("QR ownership and counter/operator attribution stay merchant-scoped", () => {
  const scope = { unrestricted: false, storeIds: ["s1"] };
  assert.equal(
    qrVisibleToActor({
      qrMerchantId: "m1",
      actorMerchantId: "m2",
      storeId: "s1",
      scope,
    }),
    false,
  );
  assert.equal(
    qrWritableByActor({
      qrMerchantId: "m1",
      actorMerchantId: "m1",
      storeId: "s2",
      scope,
    }),
    false,
  );
  assert.equal(
    counterBelongsToStore({ counterStoreId: "s1", storeId: "s1", counterActive: true }),
    true,
  );
  assert.equal(
    counterBelongsToStore({ counterStoreId: "s2", storeId: "s1", counterActive: true }),
    false,
  );
  assert.equal(
    operatorAllowedForStore({
      operatorMerchantId: "m1",
      qrMerchantId: "m1",
      storeId: "s1",
      operatorActive: true,
      operatorRole: "CASHIER",
      operatorStoreIds: ["s1"],
    }),
    true,
  );
  assert.equal(
    operatorAllowedForStore({
      operatorMerchantId: "m2",
      qrMerchantId: "m1",
      storeId: "s1",
      operatorActive: true,
      operatorRole: "CASHIER",
      operatorStoreIds: ["s1"],
    }),
    false,
  );
  assert.deepEqual(
    orderAttributionFromQr({
      merchantId: "m1",
      storeId: "s1",
      id: "qr1",
      counterId: "c1",
      operatorId: "op1",
    }),
    {
      merchantId: "m1",
      storeId: "s1",
      qrcodeId: "qr1",
      counterId: "c1",
      operatorId: "op1",
      departmentId: null,
    },
  );
});

test("duplicate cashier submit reuses an unexpired PAYING order", () => {
  const order = {
    status: "PAYING",
    amount: "12.50",
    channel: "PAYMENTFM_AGGREGATE",
    walletType: "WECHAT",
    qrcodeId: "qr1",
    expiredAt: new Date(Date.now() + 60_000),
    payData: "https://pay.example/x",
  };
  assert.equal(
    isReusableCashierOrder(order, {
      qrcodeId: "qr1",
      amount: "12.50",
      channel: "PAYMENTFM_AGGREGATE",
      walletType: "WECHAT",
    }),
    true,
  );
  assert.equal(
    isReusableCashierOrder(order, {
      qrcodeId: "qr1",
      amount: "1.00",
      channel: "PAYMENTFM_AGGREGATE",
      walletType: "WECHAT",
    }),
    false,
  );
  assert.equal(
    cashierDuplicateInFlight({ ...order, status: "CREATED", payData: null }),
    true,
  );
});

test("PaymentFM wallets are filtered, not hardcoded as all available", () => {
  assert.deepEqual(
    listAvailablePaymentFmWallets({
      paymentFmUsable: false,
      merchantChannelEnabled: true,
      policyAllows: true,
    }),
    [],
  );
  assert.deepEqual(
    listAvailablePaymentFmWallets({
      paymentFmUsable: true,
      merchantChannelEnabled: false,
      policyAllows: true,
    }),
    [],
  );
  assert.deepEqual(
    listAvailablePaymentFmWallets({
      paymentFmUsable: true,
      merchantChannelEnabled: true,
      policyAllows: false,
    }),
    [],
  );
  assert.deepEqual(
    listAvailablePaymentFmWallets({
      paymentFmUsable: true,
      merchantChannelEnabled: true,
      policyAllows: true,
      extraConfig: { payTypes: [] },
    }),
    [],
  );
  assert.deepEqual(
    listAvailablePaymentFmWallets({
      paymentFmUsable: true,
      merchantChannelEnabled: true,
      policyAllows: true,
      extraConfig: { payTypes: ["tloop"] },
    }),
    ["WECHAT"],
  );
  assert.deepEqual(
    listAvailablePaymentFmWallets({
      paymentFmUsable: true,
      merchantChannelEnabled: true,
      policyAllows: true,
      extraConfig: { enabledWallets: ["WECHAT"], payTypes: ["aloop"] },
    }),
    [],
  );
  assert.deepEqual(
    listAvailablePaymentFmWallets({
      paymentFmUsable: true,
      merchantChannelEnabled: true,
      policyAllows: true,
      extraConfig: { enabledWallets: ["WECHAT", "ALIPAY"], payTypes: ["tloop", "aloop"] },
    }),
    ["ALIPAY", "WECHAT"],
  );
});

test("QR stats count only PAID orders and split wallets", () => {
  const now = new Date("2026-09-02T12:00:00");
  const stats = summarizeQrCodeStats(
    [
      {
        status: "CREATED",
        amount: "9.00",
        createdAt: "2026-09-02T01:00:00",
      },
      {
        status: "PAID",
        amount: "10.00",
        walletType: "WECHAT",
        createdAt: "2026-09-02T02:00:00",
        paidAt: "2026-09-02T02:01:00",
      },
      {
        status: "PAID",
        amount: "5.50",
        walletType: "ALIPAY",
        createdAt: "2026-09-01T02:00:00",
        paidAt: "2026-09-01T02:01:00",
      },
      {
        status: "FAILED",
        amount: "100.00",
        walletType: "UNIONPAY",
        createdAt: "2026-09-02T03:00:00",
      },
    ],
    now,
  );
  assert.equal(stats.today.createdOrders, 3);
  assert.equal(stats.today.paidOrders, 1);
  assert.equal(stats.today.paidAmount, 10);
  assert.equal(stats.lifetime.paidOrders, 2);
  assert.equal(stats.lifetime.paidAmount, 15.5);
  assert.equal(stats.lifetime.wechatAmount, 10);
  assert.equal(stats.lifetime.alipayAmount, 5.5);
  assert.equal(stats.lifetime.unionpayAmount, 0);
});
