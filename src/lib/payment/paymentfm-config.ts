import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentConfig } from "@prisma/client";
import { decryptPaymentSecret } from "./secret-storage";
import { resolveBaseUrl, resolvePaymentEnv } from "./config";

/**
 * PaymentFM (支付FM) contract from official docs:
 * https://docs.zhifux.com/read/zhifufm/startorder
 * https://docs.zhifux.com/read/zhifufm/notify
 * https://docs.zhifux.com/read/zhifufm/querybyid
 * https://docs.zhifux.com/read/zhifufm/querybyoutno
 *
 * Fields not listed there stay TODO and are never guessed.
 */

export const PAYMENTFM_START_ORDER_PATH = "/startOrder";
export const PAYMENTFM_QUERY_ORDER_PATH = "/queryOrder";
export const PAYMENTFM_QUERY_OUT_ORDER_PATH = "/queryOutOrder";

/** Official notify success body. */
export const PAYMENTFM_NOTIFY_OK = "success";

/**
 * Official startOrder payType table (轮循池 + 定向).
 * Do not invent values outside this list.
 */
export const PAYMENTFM_DOCUMENTED_PAY_TYPES = [
  "aloop",
  "tloop",
  "bloop",
  "wechat",
  "alipay",
  "unipay",
  "qujie.qrcode",
  "jsnx.qrcode",
  "bankapp",
  "alipaysign",
  "alipay.direct.pc",
  "alipay.direct.wap",
  "alipay-facetoface",
  "wxpayh5",
  "wxpaynative",
  "wxpayjsapi",
  "fuyou-aliqr",
  "fuyou-wxqr",
  "fuyou-bankqr",
  "fuyou-pcqr",
  "sandpayh5",
  "sandhm-bankqr",
  "sand-alipay",
  "sand-wxpay",
  "huifu-qkpay",
] as const;

export type PaymentFmPayType = (typeof PAYMENTFM_DOCUMENTED_PAY_TYPES)[number];

export const PAYMENTFM_WALLET_TYPES = [
  "WECHAT",
  "ALIPAY",
  "UNIONPAY",
  "UNKNOWN",
] as const;
export type PaymentFmWalletType = (typeof PAYMENTFM_WALLET_TYPES)[number];
export type PaymentFmKnownWalletType = Exclude<PaymentFmWalletType, "UNKNOWN">;

/**
 * Documented loop payTypes used when the cashier only sends walletType.
 * Official docs recommend aloop / tloop / bloop for 支付宝 / 微信 / 网银系.
 */
export const PAYMENTFM_WALLET_LOOP_PAY_TYPE: Record<
  PaymentFmKnownWalletType,
  PaymentFmPayType
> = {
  ALIPAY: "aloop",
  WECHAT: "tloop",
  UNIONPAY: "bloop",
};

const PAY_TYPE_WALLET: Partial<Record<string, PaymentFmWalletType>> = {
  aloop: "ALIPAY",
  alipay: "ALIPAY",
  alipaysign: "ALIPAY",
  "alipay.direct.pc": "ALIPAY",
  "alipay.direct.wap": "ALIPAY",
  "alipay-facetoface": "ALIPAY",
  "fuyou-aliqr": "ALIPAY",
  "sand-alipay": "ALIPAY",
  tloop: "WECHAT",
  wechat: "WECHAT",
  wxpayh5: "WECHAT",
  wxpaynative: "WECHAT",
  wxpayjsapi: "WECHAT",
  "fuyou-wxqr": "WECHAT",
  "sand-wxpay": "WECHAT",
  bloop: "UNIONPAY",
  unipay: "UNIONPAY",
  "fuyou-bankqr": "UNIONPAY",
  "sandhm-bankqr": "UNIONPAY",
  // TODO: qujie.qrcode / jsnx.qrcode / bankapp / fuyou-pcqr / sandpayh5 /
  // huifu-qkpay are documented payTypes but official docs do not map them
  // to a single WECHAT | ALIPAY | UNIONPAY wallet.
};

export interface ResolvedPaymentFmConfig {
  apiUrl: string;
  merchantNum: string;
  merchantKey: string;
  notifyUrl: string;
  usable: boolean;
  missing: string[];
}

export function isDocumentedPaymentFmPayType(
  value: string,
): value is PaymentFmPayType {
  return (PAYMENTFM_DOCUMENTED_PAY_TYPES as readonly string[]).includes(value);
}

export function isPaymentFmWalletType(
  value: string,
): value is PaymentFmKnownWalletType {
  return value === "WECHAT" || value === "ALIPAY" || value === "UNIONPAY";
}

export function normalizeWalletType(
  payType: string | undefined,
): PaymentFmWalletType {
  if (!payType) return "UNKNOWN";
  return PAY_TYPE_WALLET[payType] ?? "UNKNOWN";
}

export function mapPaymentFmPayTypeToWallet(
  payType: string | undefined,
): PaymentFmKnownWalletType | null {
  const wallet = normalizeWalletType(payType);
  return wallet === "UNKNOWN" ? null : wallet;
}

function splitPayTypeTokens(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const KNOWN_CASHIER_WALLETS: PaymentFmKnownWalletType[] = [
  "ALIPAY",
  "WECHAT",
  "UNIONPAY",
];

function walletsFromAllowlistTokens(raw: unknown): PaymentFmKnownWalletType[] {
  const tokens = Array.isArray(raw)
    ? raw.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const wallets = new Set<PaymentFmKnownWalletType>();
  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (isPaymentFmWalletType(upper)) {
      wallets.add(upper);
      continue;
    }
    const fromPayType = mapPaymentFmPayTypeToWallet(token);
    if (fromPayType) wallets.add(fromPayType);
  }
  return KNOWN_CASHIER_WALLETS.filter((wallet) => wallets.has(wallet));
}

/**
 * Explicit cashier allowlist. Missing config ⇒ documented wallet loops.
 * An explicit empty list is fail-closed and yields no wallets.
 * When both enabledWallets and payTypes are arrays, the cashier shows the
 * intersection: a wallet must be allowed by both lists.
 */
export function listPaymentFmWalletAllowlist(
  extraConfig?: unknown,
  envPayTypes?: string,
): PaymentFmKnownWalletType[] {
  if (extraConfig && typeof extraConfig === "object" && !Array.isArray(extraConfig)) {
    const rec = extraConfig as Record<string, unknown>;
    const hasWallets = Array.isArray(rec.enabledWallets);
    const hasTypes = Array.isArray(rec.payTypes);
    if (hasWallets || hasTypes) {
      if (hasWallets && hasTypes) {
        const wallets = walletsFromAllowlistTokens(rec.enabledWallets);
        const fromTypes = walletsFromAllowlistTokens(rec.payTypes);
        return wallets.filter((wallet) => fromTypes.includes(wallet));
      }
      return walletsFromAllowlistTokens(hasWallets ? rec.enabledWallets : rec.payTypes);
    }
  }
  const tokens = readPayTypeAllowlistTokens(extraConfig, envPayTypes);
  if (tokens === null) {
    return [...KNOWN_CASHIER_WALLETS];
  }
  return walletsFromAllowlistTokens(tokens);
}

export function normalizePaymentFmWalletSelection(input: {
  enabledWallets?: unknown;
  payTypes?: unknown;
}): {
  enabledWallets: PaymentFmKnownWalletType[];
  payTypes: PaymentFmPayType[];
} {
  const hasWallets = Array.isArray(input.enabledWallets);
  const hasTypes = Array.isArray(input.payTypes);
  const wallets = new Set<PaymentFmKnownWalletType>();
  const types = new Set<PaymentFmPayType>();
  const walletInput = hasWallets ? (input.enabledWallets as unknown[]) : [];
  const typeInput = hasTypes ? (input.payTypes as unknown[]) : [];

  for (const item of walletInput) {
    const token = String(item || "").trim().toUpperCase();
    if (isPaymentFmWalletType(token)) wallets.add(token);
  }
  for (const item of typeInput) {
    const token = String(item || "").trim();
    if (isDocumentedPaymentFmPayType(token)) types.add(token);
  }

  // Backfill the omitted side only. An explicit empty array stays empty.
  if (!hasTypes && hasWallets) {
    for (const wallet of wallets) {
      types.add(PAYMENTFM_WALLET_LOOP_PAY_TYPE[wallet]);
    }
  }
  if (!hasWallets && hasTypes) {
    for (const payType of types) {
      const wallet = mapPaymentFmPayTypeToWallet(payType);
      if (wallet) wallets.add(wallet);
    }
  }

  return {
    enabledWallets: (["ALIPAY", "WECHAT", "UNIONPAY"] as const).filter((wallet) =>
      wallets.has(wallet),
    ),
    payTypes: [...types],
  };
}

/** Merge payload for PATCH: only persist fields the caller actually sent. */
export function paymentFmWalletPatchExtra(input: {
  enabledWallets?: unknown;
  payTypes?: unknown;
}): Record<string, unknown> {
  const hasWallets = Array.isArray(input.enabledWallets);
  const hasTypes = Array.isArray(input.payTypes);
  if (!hasWallets && !hasTypes) return {};
  const normalized = normalizePaymentFmWalletSelection(input);
  const extra: Record<string, unknown> = {};
  if (hasWallets) extra.enabledWallets = normalized.enabledWallets;
  if (hasTypes) extra.payTypes = normalized.payTypes;
  return extra;
}

export function readStoredPaymentFmWalletFields(extraConfig: unknown): {
  enabledWallets: PaymentFmKnownWalletType[] | null;
  payTypes: PaymentFmPayType[] | null;
} {
  if (!extraConfig || typeof extraConfig !== "object" || Array.isArray(extraConfig)) {
    return { enabledWallets: null, payTypes: null };
  }
  const rec = extraConfig as Record<string, unknown>;
  const hasWallets = Array.isArray(rec.enabledWallets);
  const hasTypes = Array.isArray(rec.payTypes);
  if (!hasWallets && !hasTypes) {
    return { enabledWallets: null, payTypes: null };
  }
  const normalized = normalizePaymentFmWalletSelection({
    enabledWallets: hasWallets ? rec.enabledWallets : undefined,
    payTypes: hasTypes ? rec.payTypes : undefined,
  });
  return {
    enabledWallets: hasWallets ? normalized.enabledWallets : null,
    payTypes: hasTypes ? normalized.payTypes : null,
  };
}

function readPayTypeAllowlistTokens(
  extraConfig: unknown,
  envPayTypes?: string,
): string[] | null {
  if (extraConfig && typeof extraConfig === "object" && !Array.isArray(extraConfig)) {
    const rec = extraConfig as Record<string, unknown>;
    if (Array.isArray(rec.payTypes) || Array.isArray(rec.enabledWallets)) {
      const items = [
        ...(Array.isArray(rec.payTypes) ? rec.payTypes : []),
        ...(Array.isArray(rec.enabledWallets) ? rec.enabledWallets : []),
      ];
      return items.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof rec.payTypes === "string" || typeof rec.enabledWallets === "string") {
      return splitPayTypeTokens(
        `${rec.payTypes || ""} ${rec.enabledWallets || ""}`,
      );
    }
  }
  const env = (envPayTypes ?? process.env.PAYMENTFM_PAY_TYPES ?? "").trim();
  if (env) return splitPayTypeTokens(env);
  return null;
}

export type PaymentFmHealthStatus =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "ACTIVE"
  | "ERROR";

export function assessPaymentFmHealth(input: {
  usable: boolean;
  missing: string[];
  isEnabled: boolean;
  hasAnyCredential: boolean;
}): PaymentFmHealthStatus {
  if (input.usable && input.isEnabled) return "ACTIVE";
  if (input.usable) return "CONFIGURED";
  if (input.hasAnyCredential || input.missing.length > 0) {
    return input.hasAnyCredential ? "ERROR" : "NOT_CONFIGURED";
  }
  return "NOT_CONFIGURED";
}

export function maskPaymentFmMerchantNum(value: string): string {
  const merchantNum = value.trim();
  if (!merchantNum) return "";
  if (merchantNum.length <= 4) return `${merchantNum.slice(0, 1)}***`;
  return `${merchantNum.slice(0, 2)}***${merchantNum.slice(-2)}`;
}

export function paymentFmApiHost(apiUrl: string): string {
  try {
    return apiUrl ? new URL(apiUrl).host : "";
  } catch {
    return "";
  }
}

export function resolvePaymentFmPayType(input: {
  payType?: string;
  walletType?: string;
}): { payType: PaymentFmPayType } | { error: string } {
  const explicit = (input.payType || "").trim();
  if (explicit) {
    if (!isDocumentedPaymentFmPayType(explicit)) {
      return { error: "PAYMENTFM_PAY_TYPE_NOT_DOCUMENTED" };
    }
    return { payType: explicit };
  }
  const wallet = (input.walletType || "").trim();
  if (isPaymentFmWalletType(wallet)) {
    return { payType: PAYMENTFM_WALLET_LOOP_PAY_TYPE[wallet] };
  }
  return { error: "PAYMENTFM_PAY_TYPE_REQUIRED" };
}

/**
 * Official amount rule: 单位元，最多小数点后 2 位.
 * TODO: docs mix examples "100" and "10.01"; canonical 10 vs 10.00 is unconfirmed.
 * Sign and request always use this same string.
 */
export function formatPaymentFmAmount(amount: number | string): string {
  const raw = String(amount).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("PAYMENTFM_AMOUNT_INVALID");
  }
  const [intPart, frac = ""] = raw.split(".");
  if (!frac || /^0+$/.test(frac)) return String(Number.parseInt(intPart, 10));
  return `${intPart}.${frac.padEnd(2, "0")}`;
}

export function md5HexLower(plain: string): string {
  return createHash("md5").update(plain, "utf8").digest("hex");
}

/** startOrder sign: merchantNum + orderNo + amount + notifyUrl + merchantKey */
export function signPaymentFmCreateOrder(input: {
  merchantNum: string;
  orderNo: string;
  amount: string;
  notifyUrl: string;
  merchantKey: string;
}): string {
  return md5HexLower(
    `${input.merchantNum}${input.orderNo}${input.amount}${input.notifyUrl}${input.merchantKey}`,
  );
}

/** notify sign: state + merchantNum + orderNo + amount + merchantKey */
export function signPaymentFmNotify(input: {
  state: string;
  merchantNum: string;
  orderNo: string;
  amount: string;
  merchantKey: string;
}): string {
  return md5HexLower(
    `${input.state}${input.merchantNum}${input.orderNo}${input.amount}${input.merchantKey}`,
  );
}

/** queryOrder sign: merchantNum + orderId + merchantKey */
export function signPaymentFmQueryById(input: {
  merchantNum: string;
  orderId: string;
  merchantKey: string;
}): string {
  return md5HexLower(`${input.merchantNum}${input.orderId}${input.merchantKey}`);
}

/** queryOutOrder sign: merchantNum + orderNo + merchantKey */
export function signPaymentFmQueryByOrderNo(input: {
  merchantNum: string;
  orderNo: string;
  merchantKey: string;
}): string {
  return md5HexLower(`${input.merchantNum}${input.orderNo}${input.merchantKey}`);
}

export function safeEqualHex(expected: string, actual: string): boolean {
  const left = expected.trim().toLowerCase();
  const right = actual.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(left) || !/^[0-9a-f]{32}$/.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function resolvePaymentFmNotifyUrl(
  headers?: Headers,
  configured?: string | null,
): string {
  const fromConfig = (
    configured ||
    process.env.PAYMENTFM_NOTIFY_URL ||
    ""
  ).trim();
  const env = resolvePaymentEnv();
  if (fromConfig) {
    if (env === "PRODUCTION" && !/^https:\/\//i.test(fromConfig)) {
      throw new Error("生产环境 PAYMENTFM_NOTIFY_URL 必须是有效的 HTTPS URL");
    }
    if (!/^https?:\/\//i.test(fromConfig) || fromConfig.includes("null")) {
      throw new Error("PAYMENTFM_NOTIFY_URL 必须是 http(s) 绝对地址");
    }
    return fromConfig;
  }
  return `${resolveBaseUrl(headers)}/api/pay/paymentfm/notify`;
}

export function resolvePaymentFmConfig(
  paymentConfig?: PaymentConfig | null,
  headers?: Headers,
): ResolvedPaymentFmConfig {
  const extra = asStringRecord(paymentConfig?.extraConfig);
  const apiUrl = normalizeApiRoot(
    paymentConfig?.gateway || extra.apiUrl || process.env.PAYMENTFM_API_URL || "",
  );
  const merchantNum = (
    paymentConfig?.mchId ||
    extra.merchantNum ||
    process.env.PAYMENTFM_MERCHANT_NUM ||
    ""
  ).trim();
  const merchantKey = (
    decryptPaymentSecret(paymentConfig?.apiKey) ||
    process.env.PAYMENTFM_MERCHANT_KEY ||
    ""
  ).trim();

  const missing: string[] = [];
  if (!apiUrl) missing.push("PAYMENTFM_API_URL");
  else if (!/^https?:\/\//i.test(apiUrl)) missing.push("PAYMENTFM_API_URL");
  if (!merchantNum) missing.push("PAYMENTFM_MERCHANT_NUM");
  if (!merchantKey) missing.push("PAYMENTFM_MERCHANT_KEY");

  let notifyUrl = "";
  try {
    notifyUrl = resolvePaymentFmNotifyUrl(headers, paymentConfig?.notifyUrl);
  } catch {
    missing.push("PAYMENTFM_NOTIFY_URL");
  }
  if (resolvePaymentEnv() === "PRODUCTION" && paymentConfig?.isSandbox) {
    missing.push("PAYMENT_CONFIG_IS_SANDBOX");
  }

  return {
    apiUrl,
    merchantNum,
    merchantKey,
    notifyUrl,
    usable: missing.length === 0,
    missing,
  };
}

function normalizeApiRoot(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
