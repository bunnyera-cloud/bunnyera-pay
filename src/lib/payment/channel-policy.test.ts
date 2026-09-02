import assert from "node:assert/strict";
import test from "node:test";
import {
  CASHIER_ROUTABLE_CHANNELS,
  canAuthorizeNewPayments,
  canEnableMerchantChannel,
  canStartNewProviderPayment,
  isAuthorizationBadgeReady,
  isCancelledChannel,
  isKybApproved,
  isManualConfirmationChannel,
  isPendingCredentialsChannel,
  providerProductionStatus,
  resolveChannelNotifyPath,
} from "./channel-policy";

test("KYB approval is independent from merchant operational status", () => {
  assert.equal(isKybApproved("APPROVED"), true);
  assert.equal(isKybApproved("NOT_SUBMITTED"), false);
  assert.equal(isKybApproved("PENDING"), false);
  assert.equal(isKybApproved("REJECTED"), false);
});

test("WECHAT_NATIVE stays PENDING_CREDENTIALS even if a row is marked enabled", () => {
  assert.equal(providerProductionStatus("WECHAT_NATIVE", true), "PENDING_CREDENTIALS");
  assert.equal(providerProductionStatus("WECHAT_NATIVE", false), "PENDING_CREDENTIALS");
  assert.equal(isPendingCredentialsChannel("WECHAT_H5"), true);
  assert.equal(isPendingCredentialsChannel("WECHAT_JSAPI"), true);
  assert.equal(isPendingCredentialsChannel("WECHAT_MINI"), true);
  assert.equal(providerProductionStatus("ALIPAY_BAR", false), "DISABLED");
  assert.equal(providerProductionStatus("ALIPAY_BAR", true), "READY");
});

test("authorization badge READY is not the same as a usable Provider", () => {
  assert.equal(isAuthorizationBadgeReady("ALIPAY_BAR", true), true);
  assert.equal(isAuthorizationBadgeReady("WECHAT_NATIVE", true), false);
  const blocked = canStartNewProviderPayment("ALIPAY_BAR", "NOT_SUBMITTED");
  assert.equal(blocked.ok, false);
  assert.equal(isAuthorizationBadgeReady("ALIPAY_BAR", true) && !blocked.ok, true);
});

test("unapproved KYB cannot enable real collection channels", () => {
  const blocked = canAuthorizeNewPayments("ALIPAY_BAR", "NOT_SUBMITTED");
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.error, /KYB 未批准/);
  const pending = canStartNewProviderPayment("UNIONPAY_QR", "PENDING");
  assert.equal(pending.ok, false);
});

test("channel enable requires ACTIVE merchant and approved KYB", () => {
  const suspended = canEnableMerchantChannel("ALIPAY_BAR", "APPROVED", "SUSPENDED");
  assert.equal(suspended.ok, false);
  if (!suspended.ok) assert.match(suspended.error, /不可运营/);
  assert.deepEqual(
    canEnableMerchantChannel("ALIPAY_BAR", "APPROVED", "ACTIVE"),
    { ok: true },
  );
  const kyb = canEnableMerchantChannel("UNIONPAY_QR", "PENDING", "ACTIVE");
  assert.equal(kyb.ok, false);
});

test("WeChat Native cannot be authorized without production credentials", () => {
  const blocked = canAuthorizeNewPayments("WECHAT_NATIVE", "APPROVED");
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.error, /PENDING_CREDENTIALS/);
  assert.equal(canStartNewProviderPayment("WECHAT_NATIVE", "APPROVED").ok, false);
  assert.equal(canEnableMerchantChannel("WECHAT_NATIVE", "APPROVED", "ACTIVE").ok, false);
});

test("approved KYB can authorize a real, credentialed channel", () => {
  assert.deepEqual(canAuthorizeNewPayments("ALIPAY_BAR", "APPROVED"), { ok: true });
  assert.deepEqual(canStartNewProviderPayment("UNIONPAY_QR", "APPROVED"), { ok: true });
});

test("cancelled ABA PayWay is not routable or authorizable", () => {
  assert.equal(isCancelledChannel("ABA_PAYWAY"), true);
  assert.equal(
    (CASHIER_ROUTABLE_CHANNELS as readonly string[]).includes("ABA_PAYWAY"),
    false,
  );
  const blocked = canAuthorizeNewPayments("ABA_PAYWAY", "APPROVED");
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.error, /CHANNEL_CANCELLED/);
  assert.equal(canEnableMerchantChannel("ABA_PAYWAY", "APPROVED", "ACTIVE").ok, false);
  assert.equal(canStartNewProviderPayment("ABA_PAYWAY", "APPROVED").ok, false);
  assert.equal(providerProductionStatus("ABA_PAYWAY", true), "DISABLED");
  assert.equal(resolveChannelNotifyPath("ABA_PAYWAY", "https://pay.example"), "");
});

test("WeChat external QR is manual confirmation and never a WeChat Pay API", () => {
  assert.equal(isManualConfirmationChannel("WECHAT_EXTERNAL_QR"), true);
  assert.equal(isManualConfirmationChannel("WECHAT_NATIVE"), false);
  assert.deepEqual(canAuthorizeNewPayments("WECHAT_EXTERNAL_QR", "NOT_SUBMITTED"), { ok: true });
  assert.equal(providerProductionStatus("WECHAT_EXTERNAL_QR", true), "READY");
  const providerStart = canStartNewProviderPayment("WECHAT_EXTERNAL_QR", "APPROVED");
  assert.equal(providerStart.ok, false);
  if (!providerStart.ok) assert.match(providerStart.error, /官方支付 API/);
  assert.equal(resolveChannelNotifyPath("WECHAT_EXTERNAL_QR", "https://pay.example"), "");
  assert.equal(
    resolveChannelNotifyPath("WECHAT_NATIVE", "https://pay.example"),
    "https://pay.example/api/pay/wechat/notify",
  );
});

test("PaymentFM aggregate uses its own notify path and stays cashier-routable", () => {
  assert.equal(
    (CASHIER_ROUTABLE_CHANNELS as readonly string[]).includes("PAYMENTFM_AGGREGATE"),
    true,
  );
  assert.equal(
    resolveChannelNotifyPath("PAYMENTFM_AGGREGATE", "https://pay.example"),
    "https://pay.example/api/pay/paymentfm/notify",
  );
  assert.deepEqual(canAuthorizeNewPayments("PAYMENTFM_AGGREGATE", "APPROVED"), {
    ok: true,
  });
  const blocked = canAuthorizeNewPayments("PAYMENTFM_AGGREGATE", "NOT_SUBMITTED");
  assert.equal(blocked.ok, false);
});
