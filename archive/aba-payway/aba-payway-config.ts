import type { PaymentConfig } from "@prisma/client";
import crypto from "crypto";
import { decryptPaymentSecret } from "./secret-storage";
import { amountToFen, resolvePaymentEnv, type PaymentEnv } from "./config";

// ABA PayWay 官方 API 端点（来源：developer.payway.com.kh/api-endpoints-984508m0.md）
export const ABA_PAYWAY_SANDBOX_BASE = "https://checkout-sandbox.payway.com.kh";
export const ABA_PAYWAY_PRODUCTION_BASE = "https://checkout.payway.com.kh";

// API 路径常量
//
// Payment Link 成功判定（来源：developer.payway.com.kh/create-payment-link-14530837e0）：
// - 必须 status.code 为有效成功码（非 PTL02/PTL05/PTL99/PTL132）
// - 必须 data.payment_link 存在且非空
// - 未知状态一律 fail-closed
export const ABA_PATHS = {
  PURCHASE: "/api/payment-gateway/v1/payments/purchase",
  CHECK_TRANSACTION: "/api/payment-gateway/v1/payments/check-transaction-2",
  CLOSE_TRANSACTION: "/api/payment-gateway/v1/payments/close-transaction",
  REFUND: "/api/merchant-portal/merchant-access/online-transaction/refund",
  GET_TRANSACTION_DETAILS: "/api/merchant-portal/merchant-access/online-transaction/get-transaction-details",
  CREATE_PAYMENT_LINK: "/api/merchant-portal/merchant-access/payment-link/create",
  GENERATE_QR: "/api/payment-gateway/v1/payments/generate-qr",
} as const;

// ABA PayWay 支付状态码 → BunnyEra 统一状态映射
// 来源：developer.payway.com.kh/check-transaction-14530826e0.md
export const ABA_PAYMENT_STATUS_CODE: Record<number, string> = {
  0: "APPROVED",
  2: "PENDING",
  3: "DECLINED",
  4: "REFUNDED",
  7: "CANCELLED",
};

/**
 * 将 ABA payment_status 字符串映射到 BunnyEra OrderQueryResult.status。
 * 未识别状态一律 UNKNOWN（fail-closed）。
 */
export function mapAbaPaymentStatus(
  paymentStatus: string | undefined,
  paymentStatusCode: number | undefined,
): "PAID" | "UNPAID" | "CLOSED" | "REFUNDED" | "UNKNOWN" {
  if (paymentStatus) {
    const upper = paymentStatus.toUpperCase().trim();
    if (upper === "APPROVED") return "PAID";
    if (upper === "PRE-AUTH") return "PAID";
    if (upper === "REFUNDED") return "REFUNDED";
    if (upper === "PENDING") return "UNPAID";
    if (upper === "DECLINED") return "CLOSED";
    if (upper === "CANCELLED") return "CLOSED";
  }
  // 回退到 status_code
  if (paymentStatusCode !== undefined) {
    if (paymentStatusCode === 0) return "PAID";
    if (paymentStatusCode === 2) return "UNPAID";
    if (paymentStatusCode === 3) return "CLOSED";
    if (paymentStatusCode === 4) return "REFUNDED";
    if (paymentStatusCode === 7) return "CLOSED";
  }
  return "UNKNOWN";
}

export interface ResolvedAbaPaywayConfig {
  merchantId: string;
  apiKey: string;
  rsaPublicKey: string;
  baseUrl: string;
  notifyUrl: string;
  return_url: string;
  cancelUrl: string;
  env: PaymentEnv;
  usable: boolean;
  missing: string[];
}

/**
 * 合并 ABA PayWay 渠道配置与服务端环境变量。
 * 集中读取凭证，默认 fail-closed，凭证缺失时禁止发起请求。
 * 禁止把密钥写入源码、日志、文档或 Git。
 */
export function resolveAbaPaywayConfig(
  paymentConfig?: PaymentConfig | null,
): ResolvedAbaPaywayConfig {
  const env = resolvePaymentEnv();
  const extra = asStringRecord(paymentConfig?.extraConfig);

  const merchantId = (
    paymentConfig?.appId ||
    process.env.ABA_PAYWAY_MERCHANT_ID ||
    ""
  ).trim();

  const apiKey = (
    decryptPaymentSecret(paymentConfig?.privateKey) ||
    process.env.ABA_PAYWAY_API_KEY ||
    ""
  ).trim();

  const rsaPublicKey = (
    paymentConfig?.publicKey ||
    extra.rsaPublicKey ||
    process.env.ABA_PAYWAY_RSA_PUBLIC_KEY ||
    ""
  ).trim();

  const defaultBase =
    env === "PRODUCTION" ? ABA_PAYWAY_PRODUCTION_BASE : ABA_PAYWAY_SANDBOX_BASE;
  const baseUrl = (
    paymentConfig?.gateway ||
    process.env.ABA_PAYWAY_BASE_URL ||
    defaultBase
  ).trim();

  const notifyUrl = (
    paymentConfig?.notifyUrl ||
    process.env.ABA_PAYWAY_NOTIFY_URL ||
    ""
  ).trim();

  const return_url = (extra.returnUrl || process.env.ABA_PAYWAY_RETURN_URL || "").trim();
  const cancelUrl = (extra.cancelUrl || process.env.ABA_PAYWAY_CANCEL_URL || "").trim();

  const missing: string[] = [];
  if (!merchantId) missing.push("ABA_PAYWAY_MERCHANT_ID");
  if (!apiKey) missing.push("ABA_PAYWAY_API_KEY");
  if (!rsaPublicKey) missing.push("ABA_PAYWAY_RSA_PUBLIC_KEY");

  // 生产环境禁止使用沙箱网关；SANDBOX 禁止打到生产网关（不得自动 fallback）。
  if (env === "PRODUCTION" && baseUrl.includes("checkout-sandbox")) {
    missing.push("ABA_PAYWAY_BASE_URL(生产环境不得使用沙箱网关)");
  }
  if (
    env === "SANDBOX" &&
    /checkout\.payway\.com\.kh/i.test(baseUrl) &&
    !baseUrl.includes("checkout-sandbox")
  ) {
    missing.push("ABA_PAYWAY_BASE_URL(SANDBOX 不得使用生产网关)");
  }
  if (env === "PRODUCTION" && paymentConfig?.isSandbox) {
    missing.push("PAYMENT_CONFIG_IS_SANDBOX");
  }

  return {
    merchantId,
    apiKey,
    rsaPublicKey,
    baseUrl,
    notifyUrl,
    return_url,
    cancelUrl,
    env,
    usable: missing.length === 0,
    missing,
  };
}

/**
 * 生成 ABA PayWay HMAC-SHA512 请求哈希。
 * 来源：developer.payway.com.kh 官方 PHP 示例
 * hash = base64(hash_hmac('sha512', concatenated_values, api_key, true))
 */
export function generateAbaHash(
  concatenatedValues: string,
  apiKey: string,
): string {
  return crypto
    .createHmac("sha512", apiKey)
    .update(concatenatedValues, "utf8")
    .digest("base64");
}

/**
 * 校验 ABA 回调签名（timing-safe comparison）。
 * 回调 hash 拼接顺序按官方 Purchase hash 字段子集推断：
 *   tran_id + merchant_id + amount + payment_status + currency
 *
 * 注意：ABA 官方文档未明确定义回调 hash 拼接顺序。
 * 若验签失败但回调仍携带 hash，返回 false 但不阻止后续 Check Transaction 流程。
 */
export function verifyCallbackSignature(params: {
  tranId: string;
  merchantId: string;
  amount: string;
  paymentStatus: string;
  currency: string;
  hash: string;
  apiKey: string;
}): boolean {
  const { tranId, merchantId, amount, paymentStatus, currency, hash, apiKey } = params;
  if (!hash || !apiKey) return false;

  const hashInput = tranId + merchantId + amount + paymentStatus + currency;
  const expected = generateAbaHash(hashInput, apiKey);

  // timing-safe comparison
  const a = Buffer.from(hash, "base64");
  const b = Buffer.from(expected, "base64");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * 按币种格式化 ABA 金额。
 * KHR 无小数位（官方错误码 46：KHR 不得含小数位）。
 * USD 保留两位小数。
 */
export function formatAbaAmount(amount: number, currency: string): string {
  if (currency.toUpperCase() === "KHR") {
    return String(Math.round(amount));
  }
  return amount.toFixed(2);
}

/**
 * 从 RSA PEM 公钥计算最大加密分块长度。
 * PKCS#1 v1.5 padding 开销 = 11 字节。
 * 官方 PHP 示例硬编码 117（假设 1024 位密钥），
 * 但 ABA 可能提供 2048 位密钥（此时应为 245）。
 */
export function calcRsaMaxChunkBytes(rsaPublicKeyPem: string): number {
  const keyObj = crypto.createPublicKey(rsaPublicKeyPem);
  const modulusLength = keyObj.asymmetricKeyDetails?.modulusLength;
  if (!modulusLength || modulusLength < 1024) {
    throw new Error(
      `RSA key too small: ${modulusLength ?? "unknown"} bits (minimum 1024)`,
    );
  }
  return Math.floor(modulusLength / 8) - 11;
}

/**
 * RSA 公钥分块加密，用于 merchant_auth 字段。
 * 分块大小根据公钥模长动态计算（PKCS#1 v1.5 padding = 11 字节开销）。
 * 来源：developer.payway.com.kh 官方 PHP 示例
 */
export function rsaEncryptChunked(
  data: string,
  rsaPublicKeyPem: string,
): string {
  const maxLength = calcRsaMaxChunkBytes(rsaPublicKeyPem);
  const chunks: Buffer[] = [];
  let offset = 0;

  while (offset < data.length) {
    const chunk = data.slice(offset, offset + maxLength);
    const encrypted = crypto.publicEncrypt(
      {
        key: rsaPublicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(chunk, "utf8"),
    );
    chunks.push(encrypted);
    offset += maxLength;
  }

  // 官方 PHP: 先拼接所有密文块，再整体 base64 编码
  return Buffer.concat(chunks).toString("base64");
}

/**
 * 生成 ABA 请求时间戳（UTC 格式 YYYYMMDDHHmmss）。
 */
export function abaReqTime(date = new Date()): string {
  return date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

/**
 * 将 ABA 金额（decimal 元）转为整数分。
 * ABA 使用元为单位：1.00 USD → 100 分，KHR 无小数位。
 */
export function abaAmountToFen(amount: number | string): number {
  const str = String(amount).trim();
  if (!str || !/^-?\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error(`Invalid ABA amount: ${str}`);
  }
  const parts = str.split(".");
  const intPart = parts[0];
  const fracPart = (parts[1] || "").padEnd(2, "0").slice(0, 2);
  return parseInt(intPart + fracPart, 10);
}

/**
 * 将整数分转为 ABA 金额字符串。
 * 100 → "1.00"，4000 → "40.00"
 */
export function fenToAbaAmount(fen: number): string {
  if (!Number.isSafeInteger(fen) || fen < 0) {
    throw new Error(`Invalid fen amount: ${fen}`);
  }
  const intPart = Math.floor(fen / 100);
  const fracPart = (fen % 100).toString().padStart(2, "0");
  return `${intPart}.${fracPart}`;
}

export const ABA_TRAN_ID_LENGTH = 20;
const ABA_TRAN_ID_PATTERN = /^BE[0-9A-F]{18}$/;

/**
 * Stable 20-char ABA tran_id derived from BunnyEra orderNo.
 * Never slice(orderNo, 0, 20): generateOrderNo is 27 chars and collisions
 * would map two orders onto one ABA transaction.
 */
export function toAbaTranId(orderNo: string): string {
  const source = (orderNo || "").trim();
  if (!source) {
    throw new Error("ABA tran_id requires a non-empty orderNo");
  }
  const digest = crypto.createHash("sha256").update(source, "utf8").digest("hex");
  return `BE${digest.slice(0, 18).toUpperCase()}`;
}

export function isAbaTranId(value: string | null | undefined): boolean {
  return ABA_TRAN_ID_PATTERN.test((value || "").trim().toUpperCase());
}

export function resolveAbaTranId(orderNo: string, tradeNo?: string | null): string {
  const trade = (tradeNo || "").trim();
  if (trade && isAbaTranId(trade)) return trade.toUpperCase();
  const order = (orderNo || "").trim();
  if (isAbaTranId(order)) return order.toUpperCase();
  return toAbaTranId(orderNo);
}

export type AbaCurrency = "USD" | "KHR";

/**
 * ABA only accepts USD or KHR. CNY and empty values are ignored so a later
 * explicit source can win. Never silently default to USD.
 */
export function resolveAbaCurrency(
  ...sources: Array<string | null | undefined>
): { ok: true; currency: AbaCurrency } | { ok: false; error: string } {
  for (const raw of sources) {
    const value = (raw || "").trim().toUpperCase();
    if (!value || value === "CNY") continue;
    if (value === "USD" || value === "KHR") {
      return { ok: true, currency: value };
    }
    return { ok: false, error: `ABA 不支持的币种: ${value}` };
  }
  return { ok: false, error: "ABA 币种未确定，禁止默认 USD" };
}

export function extraConfigCurrency(
  extraConfig: unknown,
): string | undefined {
  const extra = asStringRecord(extraConfig);
  return extra.abaCurrency || extra.currency || undefined;
}

export function resolveAbaOrderCurrency(
  channel: string,
  extraConfig: unknown,
  extraParams?: Record<string, string>,
): { ok: true; currency: string } | { ok: false; error: string } {
  if (channel !== "ABA_PAYWAY") return { ok: true, currency: "CNY" };
  return resolveAbaCurrency(extraParams?.currency, extraConfigCurrency(extraConfig));
}

/**
 * Order.amount is major units (USD dollars / KHR riel / CNY yuan).
 * Provider query/callback amounts are integer minor units (USD cents, KHR riel).
 */
export function orderAmountToAbaMinor(amountMajor: string, currency: AbaCurrency): number {
  if (currency === "USD") {
    return amountToFen(amountMajor);
  }
  const trimmed = amountMajor.trim();
  if (!/^\d+(\.0+)?$/.test(trimmed)) {
    throw new Error("KHR amount must be a whole riel");
  }
  return parseInt(trimmed.split(".")[0], 10);
}

export function abaMajorToMinor(
  amount: number | string,
  currency: AbaCurrency,
): number {
  if (currency === "USD") return abaAmountToFen(amount);
  const numeric = typeof amount === "number" ? amount : Number(String(amount).trim());
  if (!Number.isFinite(numeric) || numeric < 0 || !Number.isInteger(numeric)) {
    throw new Error(`Invalid KHR amount: ${amount}`);
  }
  return numeric;
}

export function formatAbaApiAmount(amountMajor: string, currency: AbaCurrency): string {
  if (currency === "USD") {
    return fenToAbaAmount(amountToFen(amountMajor));
  }
  return String(orderAmountToAbaMinor(amountMajor, "KHR"));
}

export type AbaSettlementCheck = {
  orderAmountMajor: string;
  orderCurrency: string;
  checkStatus: "PAID" | "UNPAID" | "CLOSED" | "REFUNDED" | "UNKNOWN";
  checkVerified: boolean;
  checkAmountMinor: number | undefined;
  checkCurrency: string | undefined;
  configuredMerchantId: string;
  callbackMerchantId?: string | null;
};

export function assertAbaSettlementMatch(
  input: AbaSettlementCheck,
): { ok: true } | { ok: false; error: string; retryable: boolean } {
  if (
    input.callbackMerchantId &&
    input.callbackMerchantId.trim() !== input.configuredMerchantId
  ) {
    return { ok: false, error: "merchant_id 与配置不一致", retryable: false };
  }
  if (input.checkStatus === "UNKNOWN") {
    return {
      ok: false,
      error: "ABA Check Transaction 返回未知状态，等待重试",
      retryable: true,
    };
  }
  if (!input.checkVerified) {
    return { ok: false, error: "ABA 查单响应未通过验签", retryable: false };
  }
  if (input.checkStatus === "UNPAID") {
    return {
      ok: false,
      error: "ABA Check Transaction 仍为 PENDING，等待重试",
      retryable: true,
    };
  }
  if (input.checkStatus !== "PAID") {
    return {
      ok: false,
      error: `ABA 查单状态非 PAID: ${input.checkStatus}`,
      retryable: false,
    };
  }
  const currency = resolveAbaCurrency(input.orderCurrency);
  if (!currency.ok) {
    return { ok: false, error: currency.error, retryable: false };
  }
  if (!input.checkCurrency || input.checkCurrency.toUpperCase() !== currency.currency) {
    return { ok: false, error: "currency 与订单不一致", retryable: false };
  }
  let expectedMinor: number;
  try {
    expectedMinor = orderAmountToAbaMinor(input.orderAmountMajor, currency.currency);
  } catch {
    return { ok: false, error: "订单金额无法转换为 ABA 最小单位", retryable: false };
  }
  if (input.checkAmountMinor !== expectedMinor) {
    return { ok: false, error: "amount 与订单不一致", retryable: false };
  }
  return { ok: true };
}

export type AbaRetryDecision =
  | { action: "SETTLE" }
  | { action: "IDEMPOTENT" }
  | { action: "RETRY" }
  | { action: "STOP"; reason: string };

export function decideAbaRetryAction(input: {
  orderStatus: string;
  settlement: ReturnType<typeof assertAbaSettlementMatch>;
  attempt: number;
  maxAttempts: number;
}): AbaRetryDecision {
  if (input.orderStatus === "PAID") return { action: "IDEMPOTENT" };
  if (input.orderStatus !== "CREATED" && input.orderStatus !== "PAYING") {
    return { action: "STOP", reason: `订单已终态: ${input.orderStatus}` };
  }
  if (input.settlement.ok) return { action: "SETTLE" };
  if (input.settlement.retryable && input.attempt < input.maxAttempts) {
    return { action: "RETRY" };
  }
  return { action: "STOP", reason: input.settlement.error };
}

/**
 * 脱敏 ABA 回调数据。
 * 禁止保存 API Key、RSA 材料、完整卡号、Token 或敏感个人资料。
 * signature 只保存 SHA-256 截断摘要（前 32 hex 字符）。
 */
export function sanitizeAbaCallbackData(body: Record<string, string>): Record<string, string> {
  const SENSITIVE_KEYS = new Set([
    "api_key", "apikey", "private_key", "rsa_key", "rsa_public_key",
    "merchant_auth", "card_number", "card_no", "pan", "cvv", "cvc",
    "token", "access_token", "refresh_token", "secret",
  ]);
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    const lk = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lk)) {
      sanitized[key] = "[REDACTED]";
    } else if (value.length > 500) {
      sanitized[key] = value.slice(0, 200) + "...[TRUNCATED]";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * 计算回调签名的 SHA-256 截断摘要（前 32 hex 字符）。
 * 禁止保存原始完整签名到日志或数据库。
 */
export function truncateSignature(hash: string | undefined): string | null {
  if (!hash) return null;
  const digest = crypto.createHash("sha256").update(hash, "utf8").digest("hex");
  return digest.slice(0, 32);
}

/**
 * 判断 ABA Check Transaction 错误是否可重试。
 * 网络超时、5xx、限流等临时错误可重试；
 * 明确业务错误（无效商户、交易不存在等）不重试。
 */
export function isAbaRetryableError(error: string): boolean {
  if (!error) return false;
  const retryable = [
    "未知状态", "超时", "timeout", "ETIMEDOUT", "ECONNRESET",
    "ECONNREFUSED", "ENOTFOUND", "503", "429", "临时",
    "Check Transaction 返回未知", "网络", "PENDING", "等待重试",
  ];
  const lower = error.toLowerCase();
  return retryable.some(r => lower.includes(r.toLowerCase()));
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
