import type { KybStatus, PaymentChannel } from "@prisma/client";

export type ProviderProductionStatus =
  | "READY"
  | "DISABLED"
  | "PENDING_CREDENTIALS";

/**
 * WeChat Native remains a first-class Provider, but production credentials
 * are not available. New payments stay fail-closed until official MchID /
 * APIv3 key / merchant certs are provisioned.
 */
export const CHANNELS_PENDING_CREDENTIALS = new Set<string>([
  "WECHAT_NATIVE",
  "WECHAT_H5",
  "WECHAT_JSAPI",
  "WECHAT_MINI",
]);

export const CASHIER_ROUTABLE_CHANNELS = [
  "ALIPAY_BAR",
  "WECHAT_NATIVE",
  "UNIONPAY_QR",
] as const satisfies readonly PaymentChannel[];

/** Cancelled products stay in the Prisma enum but must not be offered or loaded. */
export const CANCELLED_CHANNELS = new Set<string>(["ABA_PAYWAY"]);

export const MANUAL_CONFIRMATION_CHANNELS = new Set<string>([
  "WECHAT_EXTERNAL_QR",
]);

export const MANUAL_CONFIRMATION_REQUIRED = "MANUAL_CONFIRMATION_REQUIRED";

export function isManualConfirmationChannel(channel: string): boolean {
  return MANUAL_CONFIRMATION_CHANNELS.has(channel);
}

export function isPendingCredentialsChannel(channel: string): boolean {
  return CHANNELS_PENDING_CREDENTIALS.has(channel);
}

export function isCancelledChannel(channel: string): boolean {
  return CANCELLED_CHANNELS.has(channel);
}

export function isKybApproved(status: KybStatus | string | null | undefined): boolean {
  return status === "APPROVED";
}

/**
 * Platform authorization badge derived from MerchantChannel.isEnabled.
 * READY does NOT mean resolveProvider().usable, KYB APPROVED, PaymentConfig
 * present, or a non-PREVIEW environment. Dashboard "已开通" uses this badge.
 */
export function providerProductionStatus(
  channel: string,
  isEnabled: boolean,
): ProviderProductionStatus {
  if (CANCELLED_CHANNELS.has(channel)) return "DISABLED";
  if (CHANNELS_PENDING_CREDENTIALS.has(channel)) return "PENDING_CREDENTIALS";
  return isEnabled ? "READY" : "DISABLED";
}

export function isAuthorizationBadgeReady(
  channel: string,
  isEnabled: boolean,
): boolean {
  return providerProductionStatus(channel, isEnabled) === "READY";
}

export function canAuthorizeNewPayments(
  channel: string,
  kybStatus: KybStatus | string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (CANCELLED_CHANNELS.has(channel)) {
    return {
      ok: false,
      error: "该渠道已取消（CHANNEL_CANCELLED），不能启用新支付",
    };
  }
  if (CHANNELS_PENDING_CREDENTIALS.has(channel)) {
    return {
      ok: false,
      error: "该渠道生产凭证尚未开通（PENDING_CREDENTIALS），不能启用新支付",
    };
  }
  if (isManualConfirmationChannel(channel)) {
    return { ok: true };
  }
  if (!isKybApproved(kybStatus)) {
    return {
      ok: false,
      error: "KYB 未批准，不能启用真实收款渠道",
    };
  }
  return { ok: true };
}

/** Enable a MerchantChannel: merchant must be ACTIVE and pass canAuthorizeNewPayments. */
export function canEnableMerchantChannel(
  channel: string,
  kybStatus: KybStatus | string | null | undefined,
  merchantStatus: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (merchantStatus !== "ACTIVE") {
    return {
      ok: false,
      error: "商户当前不可运营，不能启用真实收款渠道",
    };
  }
  return canAuthorizeNewPayments(channel, kybStatus);
}

/**
 * Start a real Provider payment. Manual external QR is not a WeChat Pay API.
 * PENDING_CREDENTIALS and unapproved KYB stay fail-closed even if isEnabled.
 */
export function canStartNewProviderPayment(
  channel: string,
  kybStatus: KybStatus | string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (isManualConfirmationChannel(channel)) {
    return {
      ok: false,
      error: "外部静态收款码不能走官方支付 API",
    };
  }
  return canAuthorizeNewPayments(channel, kybStatus);
}

export function resolveChannelNotifyPath(channel: string, baseUrl: string): string {
  if (isManualConfirmationChannel(channel) || isCancelledChannel(channel)) return "";
  if (channel.startsWith("WECHAT")) return `${baseUrl}/api/pay/wechat/notify`;
  if (channel.startsWith("UNIONPAY")) return `${baseUrl}/api/pay/unionpay/notify`;
  return `${baseUrl}/api/pay/alipay/notify`;
}
