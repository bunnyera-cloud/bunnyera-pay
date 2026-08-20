import type { PaymentChannel, PaymentConfig } from '@prisma/client';
import type { PaymentProvider } from './provider';
import { AlipayProvider } from './alipay';
import { WechatPayProvider } from './wechat';
import { UnionPayProvider } from './unionpay';
import { resolveAlipayConfig } from './config';

// Provider 解析结果：provider 为空或 usable=false 时，业务层必须 fail-closed 拒绝
export interface ResolvedProvider {
  provider: PaymentProvider | null;
  usable: boolean;
  missing: string[];
}

/**
 * Provider 实例化唯一入口。
 * 业务层（cashier / unified / orders / close / sync / refunds / notify）
 * 一律通过本函数获取 Provider，禁止直接 new 具体 Provider 类。
 * 未来 ANTOM / ChinaUMS Adapter 在此统一插入。
 */
export function resolveProvider(
  channel: PaymentChannel | string,
  paymentConfig?: PaymentConfig | null
): ResolvedProvider {
  const ch = channel as PaymentChannel;

  // 支付宝系：当面付 / PC / WAP（配置与环境变量合并逻辑集中在 resolveAlipayConfig）
  if (channel.startsWith('ALIPAY')) {
    const cfg = resolveAlipayConfig(paymentConfig);
    if (!cfg.usable) {
      return { provider: null, usable: false, missing: cfg.missing };
    }
    return {
      provider: new AlipayProvider({
        appId: cfg.appId,
        privateKey: cfg.privateKey,
        publicKey: cfg.publicKey,
        gateway: cfg.gateway,
        sellerId: cfg.sellerId,
        channel: ch,
      }),
      usable: true,
      missing: [],
    };
  }

  // 微信支付系：Native / H5 / JSAPI / 小程序
  if (channel.startsWith('WECHAT')) {
    const missing: string[] = [];
    if (!paymentConfig?.appId) missing.push('WECHAT_APP_ID');
    if (!paymentConfig?.mchId) missing.push('WECHAT_MCH_ID');
    if (!paymentConfig?.apiKey) missing.push('WECHAT_API_KEY');
    if (!paymentConfig?.serialNo) missing.push('WECHAT_SERIAL_NO');
    if (!paymentConfig?.privateKey) missing.push('WECHAT_PRIVATE_KEY');
    if (missing.length > 0 || !paymentConfig) {
      return { provider: null, usable: false, missing };
    }
    return {
      provider: new WechatPayProvider({
        appId: paymentConfig.appId || '',
        mchId: paymentConfig.mchId || '',
        apiKey: paymentConfig.apiKey || '',
        serialNo: paymentConfig.serialNo || '',
        privateKey: paymentConfig.privateKey || '',
        channel: ch,
      }),
      usable: true,
      missing: [],
    };
  }

  // 银联系：网关 / WAP / 二维码
  if (channel.startsWith('UNIONPAY')) {
    const missing: string[] = [];
    if (!paymentConfig?.unionpayMchId) missing.push('UNIONPAY_MCH_ID');
    if (!paymentConfig?.unionpayCert) missing.push('UNIONPAY_CERT');
    if (missing.length > 0 || !paymentConfig) {
      return { provider: null, usable: false, missing };
    }
    return {
      provider: new UnionPayProvider({
        merId: paymentConfig.unionpayMchId || '',
        certPath: paymentConfig.unionpayCert || '',
        certPass: process.env.UNIONPAY_CERT_PASSWORD || '',
        gateway: paymentConfig.gateway || process.env.UNIONPAY_GATEWAY || 'https://gateway.95516.com',
        channel: ch,
      }),
      usable: true,
      missing: [],
    };
  }

  // 未来 ANTOM_* / CHINAUMS_* / LAKALA_* Adapter 在此统一插入
  return {
    provider: null,
    usable: false,
    missing: [`渠道 ${channel} 暂无对应 Provider Adapter`],
  };
}
