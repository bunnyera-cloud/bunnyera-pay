import type { PaymentConfig } from '@prisma/client';

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
  if (configured && configured !== 'null' && configured !== 'undefined') {
    return configured.replace(/\/+$/, '');
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
  if (fromConfig && /^https?:\/\//i.test(fromConfig) && !fromConfig.includes('null')) {
    return fromConfig;
  }
  return `${resolveBaseUrl(headers)}/api/pay/alipay/notify`;
}

export interface ResolvedAlipayConfig {
  appId: string;
  privateKey: string;
  publicKey: string;
  gateway: string;
  env: PaymentEnv;
  /** 是否具备真实调用支付宝 API 的完整配置 */
  usable: boolean;
  missing: string[];
}

/** 合并商户渠道配置与服务端环境变量（私钥只在服务端出现） */
export function resolveAlipayConfig(paymentConfig?: PaymentConfig | null): ResolvedAlipayConfig {
  const env = resolvePaymentEnv();
  const appId = (paymentConfig?.appId || process.env.ALIPAY_APP_ID || '').trim();
  const privateKey = normalizeKey(paymentConfig?.privateKey || process.env.ALIPAY_PRIVATE_KEY || '');
  const publicKey = normalizeKey(
    paymentConfig?.publicKey || process.env.ALIPAY_PLATFORM_PUBLIC_KEY || process.env.ALIPAY_PUBLIC_KEY || ''
  );
  const gateway =
    (paymentConfig?.gateway || process.env.ALIPAY_GATEWAY || '').trim() ||
    (env === 'PRODUCTION' ? ALIPAY_GATEWAY_PRODUCTION : ALIPAY_GATEWAY_SANDBOX);

  const missing: string[] = [];
  if (!appId) missing.push('ALIPAY_APP_ID');
  if (!privateKey) missing.push('ALIPAY_PRIVATE_KEY');
  if (!publicKey) missing.push('ALIPAY_PLATFORM_PUBLIC_KEY');

  // 生产环境禁止使用沙箱网关
  const gatewayOk = env !== 'PRODUCTION' || !gateway.includes('alipaydev.com');
  if (!gatewayOk) missing.push('ALIPAY_GATEWAY(生产环境不得使用沙箱网关)');

  return {
    appId,
    privateKey,
    publicKey,
    gateway,
    env,
    usable: missing.length === 0,
    missing,
  };
}

/** PEM 规范化：支持环境变量中使用 \n 或裸 base64 */
function normalizeKey(raw: string): string {
  const key = (raw || '').trim();
  if (!key) return '';
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}
