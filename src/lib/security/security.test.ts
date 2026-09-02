import assert from "node:assert/strict";
import test from "node:test";
import { qrVisibleToActor } from "@/lib/qrcode/access";
import { sanitizePaymentPayload } from "@/lib/payment/sanitize";
import { buildSecurityHeaders, isProductionHttps } from "./headers";
import {
  ROBOTS_DISALLOW,
  isPublicMarketingPath,
  robotsTagForPathname,
} from "./robots-policy";
import { isWebhookPath, rateLimitKindForPath } from "./paths";
import { sanitizePublicErrorMessage } from "./public-error";
import { containsSensitiveApiFields, stripSensitiveApiFields } from "./secrets";
import {
  consumeRateLimit,
  resetRateLimitStoreForTests,
  useMemoryRateLimitForTests,
} from "./rate-limit";
import { limitCashierPost, limitQrApi } from "./cashier-guard";

useMemoryRateLimitForTests();

test("robots and noindex cover dashboard admin api and pay but not the marketing home", () => {
  assert.deepEqual([...ROBOTS_DISALLOW], [
    "/dashboard/",
    "/admin/",
    "/api/",
    "/pay/",
    "/preview/",
  ]);
  assert.equal(robotsTagForPathname("/"), null);
  assert.equal(isPublicMarketingPath("/"), true);
  assert.equal(robotsTagForPathname("/dashboard"), "noindex, nofollow");
  assert.equal(robotsTagForPathname("/dashboard/qrcodes"), "noindex, nofollow");
  assert.equal(robotsTagForPathname("/admin/merchants"), "noindex, nofollow");
  assert.equal(robotsTagForPathname("/api/qrcodes"), "noindex, nofollow");
  assert.equal(robotsTagForPathname("/pay/ABC"), "noindex, nofollow, noarchive");
  assert.equal(robotsTagForPathname("/login"), null);
});

test("production security headers include CSP HSTS and framing protections", () => {
  const prod = buildSecurityHeaders({ production: true, https: true });
  const keys = Object.fromEntries(prod.map((item) => [item.key, item.value]));
  assert.match(keys["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.equal(keys["X-Content-Type-Options"], "nosniff");
  assert.equal(keys["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(keys["Permissions-Policy"], /camera=\(\)/);
  assert.equal(keys["X-Frame-Options"], "DENY");
  assert.match(keys["Strict-Transport-Security"], /max-age=31536000/);
  const local = buildSecurityHeaders({ production: false, https: false });
  assert.equal(local.some((item) => item.key === "Strict-Transport-Security"), false);
  assert.equal(isProductionHttps("production", "https://pay.example.com"), true);
  assert.equal(isProductionHttps("production", "http://localhost:3000"), false);
});

test("rate limit blocks after the window quota", async () => {
  await resetRateLimitStoreForTests();
  assert.equal((await consumeRateLimit("t:quota", 2, 60_000)).allowed, true);
  assert.equal((await consumeRateLimit("t:quota", 2, 60_000)).allowed, true);
  assert.equal((await consumeRateLimit("t:quota", 2, 60_000)).allowed, false);
});

test("rate limit tenant isolation does not share merchant buckets", async () => {
  await resetRateLimitStoreForTests();
  assert.equal(await limitQrApi({ ip: "1.1.1.1", merchantId: "m-a", includeIp: false }), null);
  for (let index = 0; index < 180; index += 1) {
    await limitQrApi({ ip: "1.1.1.1", merchantId: "m-a", includeIp: false });
  }
  const merchantA = await limitQrApi({ ip: "1.1.1.1", merchantId: "m-a", includeIp: false });
  const merchantB = await limitQrApi({ ip: "2.2.2.2", merchantId: "m-b", includeIp: false });
  assert.equal(merchantA?.allowed, false);
  assert.equal(merchantB, null);
});

test("cashier high-frequency same IP and QR is blocked", async () => {
  await resetRateLimitStoreForTests();
  for (let index = 0; index < 30; index += 1) {
    const hit = await limitCashierPost({ ip: "8.8.8.8", code: "QRCODE1" });
    assert.equal(hit, null);
  }
  const blocked = await limitCashierPost({ ip: "8.8.8.8", code: "QRCODE1" });
  assert.equal(blocked?.allowed, false);
  const otherQr = await limitCashierPost({ ip: "8.8.8.8", code: "QRCODE2" });
  assert.equal(otherQr, null);
});

test("QR IDOR stays fail-closed across merchants", () => {
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
    qrVisibleToActor({
      qrMerchantId: "m1",
      actorMerchantId: "m1",
      storeId: "s1",
      scope,
    }),
    true,
  );
});

test("API JSON strips provider credentials and PaymentFM keys", () => {
  const leaked = {
    channel: "PAYMENTFM_AGGREGATE",
    merchantKey: "super-secret",
    PAYMENTFM_MERCHANT_KEY: "env-secret",
    privateKey: "pk",
    apiKey: "ak",
    enabledWallets: ["WECHAT"],
  };
  assert.equal(containsSensitiveApiFields(leaked), true);
  assert.deepEqual(stripSensitiveApiFields(leaked), {
    channel: "PAYMENTFM_AGGREGATE",
    enabledWallets: ["WECHAT"],
  });
  assert.deepEqual(
    sanitizePaymentPayload({ merchantKey: "x", amount: "1.00" }),
    { merchantKey: "[REDACTED]", amount: "1.00" },
  );
});

test("production error sanitization hides stack SQL and secrets", () => {
  assert.equal(
    sanitizePublicErrorMessage("prisma: query engine ECONNREFUSED postgresql://user:pass@localhost/db", 500),
    "服务器内部错误",
  );
  assert.equal(
    sanitizePublicErrorMessage("merchantKey=abc PAYMENTFM_MERCHANT_KEY=def", 400),
    "请求无法处理",
  );
  assert.equal(
    sanitizePublicErrorMessage("    at Object.handler (src/app/api/pay/cashier/route.ts:12:3)", 500),
    "服务器内部错误",
  );
  assert.equal(sanitizePublicErrorMessage("收款码不存在", 404), "收款码不存在");
});

test("PaymentFM and other notify webhooks are not rate limited", () => {
  assert.equal(isWebhookPath("/api/pay/paymentfm/notify"), true);
  assert.equal(rateLimitKindForPath("POST", "/api/pay/paymentfm/notify"), null);
  assert.equal(rateLimitKindForPath("GET", "/api/pay/alipay/notify"), null);
  assert.equal(rateLimitKindForPath("POST", "/api/pay/wechat/notify"), null);
  assert.equal(rateLimitKindForPath("POST", "/api/pay/unionpay/notify"), null);
  assert.equal(rateLimitKindForPath("POST", "/api/pay/cashier"), "cashier-post");
  assert.equal(rateLimitKindForPath("GET", "/api/pay/cashier"), "cashier-get");
  assert.equal(rateLimitKindForPath("POST", "/api/auth/merchant/login"), "auth-write");
  assert.equal(rateLimitKindForPath("PATCH", "/api/merchant/channels/paymentfm"), "channel-write");
  assert.equal(rateLimitKindForPath("GET", "/api/merchant/channels/paymentfm"), null);
});
