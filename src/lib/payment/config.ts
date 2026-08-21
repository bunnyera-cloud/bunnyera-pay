import type { PaymentConfig } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { decryptPaymentSecret } from './secret-storage';

// BunnyEra Pay 支付环境
export type PaymentEnv = 'PRODUCTION' | 'SANDBOX' | 'PREVIEW';

export const ALIPAY_GATEWAY_PRODUCTION = 'https://openapi.alipay.com/gateway.do';
export const ALIPAY_GATEWAY_SANDBOX = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do';

export const PAYMENT_ENV_LABEL: Record<PaymentEnv, string> = {
  PRODUCTION: '正式生产环境',
  SANDBOX: '支付宝沙箱 / SANDBOX',
  PREVIEW: '演示预览 / PREVIEW（非真实收款）',
};

/** 解析当前支付运行环境，仅由服务端环境变量决定 */
export function resolvePaymentEnv(): PaymentEnv {
  const raw = (process.env.PAYMENT_ENV || '').trim().toUpperCase();
  if (raw === 'PRODUCTION' || raw === 'PROD' || raw === 'LIVE') return 'PRODUCTION';
  if (raw === 'SANDBOX') return 'SANDBOX';
  return 'PREVIEW';
}

/**
 * 站点 Base URL。修复历史问题 notify_url=null/api/pay/notify/alipay：
 * 优先 APP_BASE_URL，其次请求头推导，最后正式域名兜底，绝不返回 "null"。
 */
export function resolveBaseUrl(headers?: Headers): string {
  const configured = (process.env.APP_BASE_URL || '').trim();
  if (/^https?:\/\//i.test(configured) && configured !== 'null' && configured !== 'undefined') {
    return configured.replace(/\/+$/, '');
  }
  // 生产环境不信任可被客户端伪造的 Host / X-Forwarded-Host。
  if (resolvePaymentEnv() === 'PRODUCTION') {
    return 'https://pay.bunnyera.com';
  }
  if (headers) {
    const host = headers.get('x-forwarded-host') || headers.get('host');
    const proto = headers.get('x-forwarded-proto') || 'https';
    if (host && host !== 'null') return `${proto}://${host}`.replace(/\/+$/, '');
  }
  return 'https://pay.bunnyera.com';
}

/** 支付宝异步通知地址，必须为 HTTPS 绝对地址 */
export function resolveAlipayNotifyUrl(headers?: Headers, configured?: string | null): string {
  const fromConfig = (configured || process.env.ALIPAY_NOTIFY_URL || '').trim();
  const allowedProtocol = resolvePaymentEnv() === 'PRODUCTION' ? /^https:\/\//i : /^https?:\/\//i;
  if (fromConfig && allowedProtocol.test(fromConfig) && !fromConfig.includes('null')) {
    return fromConfig;
  }
  return `${resolveBaseUrl(headers)}/api/pay/alipay/notify`;
}

export interface ResolvedAlipayConfig {
  appId: string;
  privateKey: string;
  publicKey: string;
  gateway: string;
  sellerId: string;
  appCertSn: string;
  alipayRootCertSn: string;
  env: PaymentEnv;
  /** 是否具备真实调用支付宝 API 的完整配置 */
  usable: boolean;
  missing: string[];
}

/** 合并商户渠道配置与服务端环境变量（私钥只在服务端出现） */
export function resolveAlipayConfig(paymentConfig?: PaymentConfig | null): ResolvedAlipayConfig {
  const env = resolvePaymentEnv();
  const extra = asStringRecord(paymentConfig?.extraConfig);
  const appId = (paymentConfig?.appId || process.env.ALIPAY_APP_ID || '').trim();
  const privateKey = normalizePrivateKey(
    decryptPaymentSecret(paymentConfig?.privateKey) || process.env.ALIPAY_PRIVATE_KEY || ''
  );
  const publicKey = normalizePublicKey(
    paymentConfig?.publicKey ||
      extra.platformCertificate ||
      process.env.ALIPAY_PLATFORM_CERTIFICATE ||
      process.env.ALIPAY_PLATFORM_PUBLIC_KEY ||
      process.env.ALIPAY_PUBLIC_KEY ||
      ''
  );
  const gateway =
    (paymentConfig?.gateway || process.env.ALIPAY_GATEWAY || '').trim() ||
    (env === 'PRODUCTION' ? ALIPAY_GATEWAY_PRODUCTION : ALIPAY_GATEWAY_SANDBOX);

  // sellerId 优先从 extraConfig 读取，其次环境变量
  const sellerId = (
    extra.sellerId ||
    process.env.ALIPAY_SELLER_ID ||
    ''
  ).trim();
  const appCertSn = (extra.appCertSn || process.env.ALIPAY_APP_CERT_SN || '').trim();
  const alipayRootCertSn = (
    extra.alipayRootCertSn ||
    process.env.ALIPAY_ROOT_CERT_SN ||
    ''
  ).trim();

  const missing: string[] = [];
  if (!appId) missing.push('ALIPAY_APP_ID');
  if (!privateKey) missing.push('ALIPAY_PRIVATE_KEY');
  if (!publicKey) missing.push('ALIPAY_PLATFORM_PUBLIC_KEY');
  if (env === 'PRODUCTION' && paymentConfig?.isSandbox) {
    missing.push('PAYMENT_CONFIG_IS_SANDBOX');
  }

  // 生产环境禁止使用沙箱网关
  const gatewayOk = env !== 'PRODUCTION' || !gateway.includes('alipaydev.com');
  if (!gatewayOk) missing.push('ALIPAY_GATEWAY(生产环境不得使用沙箱网关)');

  return {
    appId,
    privateKey,
    publicKey,
    gateway,
    sellerId,
    appCertSn,
    alipayRootCertSn,
    env,
    usable: missing.length === 0,
    missing,
  };
}

export interface ResolvedWechatConfig {
  appId: string;
  mchId: string;
  apiV3Key: string;
  merchantSerialNo: string;
  merchantPrivateKey: string;
  platformPublicKey: string;
  platformSerialNo: string;
  usable: boolean;
  missing: string[];
}

/**
 * 合并微信支付商户配置与服务端环境变量。支持 PEM 内容或只读证书文件路径；
 * 文件读取失败只表现为配置缺失，不回显路径或密钥内容。
 */
export function resolveWechatConfig(paymentConfig?: PaymentConfig | null): ResolvedWechatConfig {
  const extra = asStringRecord(paymentConfig?.extraConfig);
  const appId = (paymentConfig?.appId || process.env.WECHAT_APP_ID || '').trim();
  const mchId = (paymentConfig?.mchId || process.env.WECHAT_MCH_ID || '').trim();
  const apiV3Key = (
    decryptPaymentSecret(paymentConfig?.apiKey) ||
    process.env.WECHAT_API_V3_KEY ||
    process.env.WECHAT_API_KEY ||
    ''
  ).trim();
  const merchantSerialNo = (paymentConfig?.serialNo || process.env.WECHAT_SERIAL_NO || '').trim();
  const merchantPrivateKey = normalizePrivateKey(
    decryptPaymentSecret(paymentConfig?.privateKey) ||
      readSecretFile(paymentConfig?.keyPath) ||
      process.env.WECHAT_PRIVATE_KEY ||
      readSecretFile(process.env.WECHAT_KEY_PATH)
  );
  const platformPublicKey = normalizePublicKey(
    extra.platformPublicKey ||
      paymentConfig?.publicKey ||
      readSecretFile(extra.platformCertPath) ||
      process.env.WECHAT_PLATFORM_PUBLIC_KEY ||
      readSecretFile(process.env.WECHAT_PLATFORM_CERT_PATH)
  );
  const platformSerialNo = (
    extra.platformSerialNo ||
    process.env.WECHAT_PLATFORM_SERIAL_NO ||
    ''
  ).trim();

  const missing: string[] = [];
  if (!appId) missing.push('WECHAT_APP_ID');
  if (!mchId) missing.push('WECHAT_MCH_ID');
  if (!apiV3Key) {
    missing.push('WECHAT_API_V3_KEY');
  } else if (Buffer.byteLength(apiV3Key, 'utf8') !== 32) {
    missing.push('WECHAT_API_V3_KEY(必须为32字节)');
  }
  if (!merchantSerialNo) missing.push('WECHAT_MERCHANT_SERIAL_NO');
  if (!merchantPrivateKey) missing.push('WECHAT_MERCHANT_PRIVATE_KEY');
  if (!platformPublicKey) missing.push('WECHAT_PLATFORM_PUBLIC_KEY_OR_CERT');
  if (!platformSerialNo) missing.push('WECHAT_PLATFORM_SERIAL_NO');
  if (resolvePaymentEnv() === 'PRODUCTION' && paymentConfig?.isSandbox) {
    missing.push('PAYMENT_CONFIG_IS_SANDBOX');
  }

  return {
    appId,
    mchId,
    apiV3Key,
    merchantSerialNo,
    merchantPrivateKey,
    platformPublicKey,
    platformSerialNo,
    usable: missing.length === 0,
    missing,
  };
}

/**
 * 将十进制金额字符串安全转换为整数"分"，不经过 Number / parseFloat 浮点运算。
 * "10"    -> 1000
 * "10.0"  -> 1000
 * "10.01" -> 1001
 * "0.01"  -> 1
 */
export function amountToFen(decimalStr: string): number {
  const s = decimalStr.trim();
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Invalid amount format: ${decimalStr}`);
  }

  const negative = s.startsWith('-');
  const abs = negative ? s.slice(1) : s;

  const dotIndex = abs.indexOf('.');
  const intPart = dotIndex === -1 ? abs : abs.slice(0, dotIndex);
  const fracRaw = dotIndex === -1 ? '' : abs.slice(dotIndex + 1);

  const fracTrimmed = fracRaw.replace(/0+$/, '');
  if (fracTrimmed.length > 2) {
    throw new Error(`Amount has more than 2 decimal places: ${decimalStr}`);
  }
  const fracPadded = (fracTrimmed + '00').slice(0, 2);

  const fen = parseInt(intPart + fracPadded, 10);
  if (!Number.isSafeInteger(fen)) {
    throw new Error(`Amount exceeds safe integer range: ${decimalStr}`);
  }
  return negative ? -fen : fen;
}

/** PEM 规范化：支持环境变量中使用 \n 或裸 base64 */
export function normalizePrivateKey(raw: string): string {
  const key = (raw || '').trim();
  if (!key) return '';
  const normalized = key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
  if (normalized.includes('-----BEGIN ')) return normalized;
  return wrapPem('PRIVATE KEY', normalized);
}

export function normalizePublicKey(raw: string): string {
  const key = (raw || '').trim();
  if (!key) return '';
  const normalized = key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
  if (normalized.includes('-----BEGIN ')) return normalized;
  return wrapPem('PUBLIC KEY', normalized);
}

function wrapPem(label: string, value: string): string {
  const compact = value.replace(/\s+/g, '');
  const lines = compact.match(/.{1,64}/g)?.join('\n') || compact;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function readSecretFile(filePath?: string | null): string {
  const value = (filePath || '').trim();
  if (!value) return '';
  try {
    return readFileSync(value, 'utf8');
  } catch {
    return '';
  }
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}
