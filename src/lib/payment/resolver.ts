import type {
  MerchantChannel,
  PaymentChannel,
  PaymentConfig,
} from "@prisma/client";
import type { PaymentProvider } from "./provider";
import { AlipayProvider } from "./alipay";
import { WechatPayProvider } from "./wechat";
import { UnionPayProvider } from "./unionpay";
import { PaymentFmProvider } from "./paymentfm";
import {
  resolveAlipayConfig,
  resolveUnionPayConfig,
  resolveWechatConfig,
} from "./config";
import { resolvePaymentFmConfig } from "./paymentfm-config";
import {
  CHANNELS_PENDING_CREDENTIALS,
  isCancelledChannel,
  isManualConfirmationChannel,
} from "./channel-policy";

// Provider 解析结果：provider 为空或 usable=false 时，业务层必须 fail-closed 拒绝
export interface ResolvedProvider {
  provider: PaymentProvider | null;
  usable: boolean;
  missing: string[];
}

export interface ResolveProviderOptions {
  /**
   * New payments must be explicitly enabled by the platform. Existing orders
   * still need callbacks/refunds after an administrator disables new traffic.
   */
  purpose?: "NEW_PAYMENT" | "EXISTING_ORDER";
  merchantChannel?: Pick<MerchantChannel, "isEnabled"> | null;
}

/**
 * Provider 实例化唯一入口。
 * 业务层（cashier / unified / orders / close / sync / refunds / notify）
 * 一律通过本函数获取 Provider，禁止直接 new 具体 Provider 类。
 * 未来 ANTOM / ChinaUMS Adapter 在此统一插入。
 */
export function resolveProvider(
  channel: PaymentChannel | string,
  paymentConfig?: PaymentConfig | null,
  options: ResolveProviderOptions = {},
): ResolvedProvider {
  const ch = channel as PaymentChannel;
  if (isCancelledChannel(channel)) {
    return {
      provider: null,
      usable: false,
      missing: ["CHANNEL_CANCELLED"],
    };
  }
  if (isManualConfirmationChannel(channel)) {
    return {
      provider: null,
      usable: false,
      missing: ["MANUAL_CONFIRMATION_REQUIRED"],
    };
  }
  if (!paymentConfig?.isActive) {
    return {
      provider: null,
      usable: false,
      missing: ["PAYMENT_CONFIG_INACTIVE"],
    };
  }
  const purpose = options.purpose || "NEW_PAYMENT";
  if (purpose === "NEW_PAYMENT" && options.merchantChannel?.isEnabled !== true) {
    return {
      provider: null,
      usable: false,
      missing: ["MERCHANT_CHANNEL_DISABLED"],
    };
  }
  if (purpose === "NEW_PAYMENT" && CHANNELS_PENDING_CREDENTIALS.has(channel)) {
    return {
      provider: null,
      usable: false,
      missing: ["PENDING_CREDENTIALS"],
    };
  }

  // 支付宝系：当面付 / PC / WAP（配置与环境变量合并逻辑集中在 resolveAlipayConfig）
  if (channel.startsWith("ALIPAY")) {
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
  if (channel.startsWith("WECHAT")) {
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
  if (channel.startsWith("UNIONPAY")) {
    const cfg = resolveUnionPayConfig(paymentConfig, channel);
    if (!cfg.usable) {
      return { provider: null, usable: false, missing: cfg.missing };
    }
    try {
      return {
        provider: new UnionPayProvider({
          merId: cfg.merId,
          signCertPath: cfg.signCertPath,
          signCertPassword: cfg.signCertPassword,
          verifyCertificate: cfg.verifyCertificate,
          verifyCertPath: cfg.verifyCertPath,
          frontTransUrl: cfg.frontTransUrl,
          backTransUrl: cfg.backTransUrl,
          queryTransUrl: cfg.queryTransUrl,
          termId: cfg.termId,
          channel: ch,
        }),
        usable: true,
        missing: [],
      };
    } catch {
      return {
        provider: null,
        usable: false,
        missing: ["UNIONPAY_CERTIFICATE_INVALID_OR_UNREADABLE"],
      };
    }
  }

  if (channel === "PAYMENTFM_AGGREGATE") {
    const cfg = resolvePaymentFmConfig(paymentConfig);
    if (!cfg.usable) {
      return { provider: null, usable: false, missing: cfg.missing };
    }
    return {
      provider: new PaymentFmProvider(cfg),
      usable: true,
      missing: [],
    };
  }

  // Oceanpayment / ANTOM / ChinaUMS / Lakala / 杉德 等 Adapter
  // 在进件结果、正式文档和生产凭证确定后在此插入。未接入渠道保持 fail-closed。
  return {
    provider: null,
    usable: false,
    missing: [`渠道 ${channel} 暂无对应 Provider Adapter`],
  };
}
