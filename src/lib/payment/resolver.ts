import type { PaymentChannel, PaymentConfig } from '@prisma/client';
import type { PaymentProvider } from './provider';
import { AlipayProvider } from './alipay';
import { WechatPayProvider } from './wechat';
import { resolveAlipayConfig, resolveWechatConfig } from './config';

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
        appCertSn: cfg.appCertSn,
        alipayRootCertSn: cfg.alipayRootCertSn,
        channel: ch,
      }),
      usable: true,
      missing: [],
    };
  }

  // 微信支付系：Native / H5 / JSAPI / 小程序
  if (channel.startsWith('WECHAT')) {
    const cfg = resolveWechatConfig(paymentConfig);
    if (!cfg.usable) {
      return { provider: null, usable: false, missing: cfg.missing };
    }
    return {
      provider: new WechatPayProvider({
        appId: cfg.appId,
        mchId: cfg.mchId,
        apiV3Key: cfg.apiV3Key,
        merchantSerialNo: cfg.merchantSerialNo,
        merchantPrivateKey: cfg.merchantPrivateKey,
        platformPublicKey: cfg.platformPublicKey,
        platformSerialNo: cfg.platformSerialNo,
        channel: ch,
      }),
      usable: true,
      missing: [],
    };
  }

  // 银联系：网关 / WAP / 二维码
  if (channel.startsWith('UNIONPAY')) {
    // 当前 UnionPayProvider 仍是未签名的草稿实现，绝不能暴露为真实可用渠道。
    return { provider: null, usable: false, missing: ['UNIONPAY_PROVIDER_NOT_IMPLEMENTED'] };
  }

  // 未来 ANTOM_* / CHINAUMS_* / LAKALA_* Adapter 在此统一插入
  return {
    provider: null,
    usable: false,
    missing: [`渠道 ${channel} 暂无对应 Provider Adapter`],
  };
}
