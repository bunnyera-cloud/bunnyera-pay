import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import type { PaymentConfig } from "@prisma/client";
import {
  amountToFen,
  canCallPaymentProvider,
  normalizePrivateKey,
  normalizePublicKey,
  resolveBaseUrl,
} from "./config";
import { decryptPaymentSecret, encryptPaymentSecret } from "./secret-storage";
import { sanitizePaymentPayload } from "./sanitize";
import { resolveProvider } from "./resolver";

test("amountToFen uses exact decimal conversion", () => {
  assert.equal(amountToFen("10"), 1000);
  assert.equal(amountToFen("10.01"), 1001);
  assert.equal(amountToFen("0.10"), 10);
  assert.throws(() => amountToFen("0.001"));
  assert.throws(() => amountToFen("not-an-amount"));
});

test("PEM normalization supports escaped newlines and bare base64", () => {
  assert.match(normalizePrivateKey("YWJj"), /BEGIN PRIVATE KEY/);
  assert.match(normalizePublicKey("YWJj"), /BEGIN PUBLIC KEY/);
  assert.equal(
    normalizePrivateKey(
      "-----BEGIN PRIVATE KEY-----\\nYWJj\\n-----END PRIVATE KEY-----",
    ),
    "-----BEGIN PRIVATE KEY-----\nYWJj\n-----END PRIVATE KEY-----",
  );
});

test("payment config secrets encrypt and decrypt without plaintext persistence", () => {
  const previous = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY;
  process.env.PAYMENT_CONFIG_ENCRYPTION_KEY =
    randomBytes(32).toString("base64");
  try {
    const encrypted = encryptPaymentSecret("payment-secret-value");
    assert.match(encrypted, /^enc:v1:/);
    assert.equal(encrypted.includes("payment-secret-value"), false);
    assert.equal(decryptPaymentSecret(encrypted), "payment-secret-value");
  } finally {
    if (previous === undefined)
      delete process.env.PAYMENT_CONFIG_ENCRYPTION_KEY;
    else process.env.PAYMENT_CONFIG_ENCRYPTION_KEY = previous;
  }
});

test("payment payload sanitizer redacts signatures and payer identifiers", () => {
  assert.deepEqual(
    sanitizePaymentPayload({
      sign: "signature",
      nested: { buyer_id: "buyer", amount: 100 },
    }),
    {
      sign: "[REDACTED]",
      nested: { buyer_id: "[REDACTED]", amount: 100 },
    },
  );
});

test("UnionPay adapter remains fail-closed without official credentials", () => {
  const result = resolveProvider(
    "UNIONPAY_QR",
    { isActive: true, isSandbox: false } as PaymentConfig,
    { merchantChannel: { isEnabled: true } },
  );
  assert.equal(result.usable, false);
  assert.equal(result.provider, null);
  assert.ok(result.missing.includes("UNIONPAY_MER_ID"));
  assert.ok(result.missing.includes("UNIONPAY_SIGN_CERT_PATH"));
  assert.ok(result.missing.includes("UNIONPAY_SIGN_CERT_PASSWORD"));
  assert.ok(result.missing.includes("UNIONPAY_VERIFY_CERTIFICATE_OR_PATH"));
});

test("cancelled ABA PayWay is not loaded as a Provider", () => {
  const result = resolveProvider(
    "ABA_PAYWAY",
    { isActive: true, isSandbox: false } as PaymentConfig,
    { merchantChannel: { isEnabled: true } },
  );
  assert.equal(result.usable, false);
  assert.equal(result.provider, null);
  assert.deepEqual(result.missing, ["CHANNEL_CANCELLED"]);
});

test("unwired channels such as Oceanpayment stay fail-closed", () => {
  const result = resolveProvider(
    "OCEANPAYMENT",
    { isActive: true, isSandbox: false } as PaymentConfig,
    { merchantChannel: { isEnabled: true } },
  );
  assert.equal(result.usable, false);
  assert.equal(result.provider, null);
  assert.match(result.missing.join(" "), /暂无对应 Provider Adapter/);
});

test("disabled MerchantChannel is rejected before provider creation", () => {
  const result = resolveProvider(
    "WECHAT_NATIVE",
    { isActive: true, isSandbox: false } as PaymentConfig,
    { merchantChannel: { isEnabled: false } },
  );
  assert.equal(result.usable, false);
  assert.equal(result.provider, null);
  assert.deepEqual(result.missing, ["MERCHANT_CHANNEL_DISABLED"]);
});

test("PREVIEW environment never permits provider calls", () => {
  assert.equal(canCallPaymentProvider("PREVIEW"), false);
  assert.equal(canCallPaymentProvider("SANDBOX"), true);
  assert.equal(canCallPaymentProvider("PRODUCTION"), true);
});

test("WeChat Native new payments stay fail-closed even when enabled", () => {
  const result = resolveProvider(
    "WECHAT_NATIVE",
    { isActive: true, isSandbox: false } as PaymentConfig,
    { purpose: "NEW_PAYMENT", merchantChannel: { isEnabled: true } },
  );
  assert.equal(result.usable, false);
  assert.equal(result.provider, null);
  assert.deepEqual(result.missing, ["PENDING_CREDENTIALS"]);
});

test("existing WeChat orders are not blocked by PENDING_CREDENTIALS at resolve", () => {
  const result = resolveProvider(
    "WECHAT_NATIVE",
    { isActive: true, isSandbox: false } as PaymentConfig,
    { purpose: "EXISTING_ORDER", merchantChannel: { isEnabled: true } },
  );
  assert.equal(result.usable, false);
  assert.equal(result.provider, null);
  assert.equal(result.missing.includes("PENDING_CREDENTIALS"), false);
  assert.ok(result.missing.some((item) => item.startsWith("WECHAT_")));
});

test("WeChat external QR is never a WeChat API provider", () => {
  const result = resolveProvider(
    "WECHAT_EXTERNAL_QR",
    { isActive: true, isSandbox: false } as PaymentConfig,
    { merchantChannel: { isEnabled: true } },
  );
  assert.equal(result.usable, false);
  assert.equal(result.provider, null);
  assert.deepEqual(result.missing, ["MANUAL_CONFIRMATION_REQUIRED"]);
});

test("production rejects an HTTP APP_BASE_URL", () => {
  const previousEnv = process.env.PAYMENT_ENV;
  const previousBaseUrl = process.env.APP_BASE_URL;
  process.env.PAYMENT_ENV = "PRODUCTION";
  process.env.APP_BASE_URL = "http://pay.example.com";
  try {
    assert.throws(
      () => resolveBaseUrl(),
      /APP_BASE_URL 必须是有效的 HTTPS URL/,
    );
  } finally {
    if (previousEnv === undefined) delete process.env.PAYMENT_ENV;
    else process.env.PAYMENT_ENV = previousEnv;
    if (previousBaseUrl === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = previousBaseUrl;
  }
});
