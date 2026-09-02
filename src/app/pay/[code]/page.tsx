import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { resolvePaymentEnv, PAYMENT_ENV_LABEL } from "@/lib/payment/config";
import { resolveProvider } from "@/lib/payment/resolver";
import PayPageClient from "./PayPageClient";
import {
  CASHIER_ROUTABLE_CHANNELS,
  CHANNELS_PENDING_CREDENTIALS,
  MANUAL_CONFIRMATION_REQUIRED,
  canStartNewProviderPayment,
  isKybApproved,
} from "@/lib/payment/channel-policy";
import { evaluateAggregateQrScan } from "@/lib/qrcode/scan";
import { listAvailablePaymentFmWallets } from "@/lib/qrcode/wallets";
import { isMissingPaymentChannelEnum } from "@/lib/payment/schema-compat";

interface PayPageProps {
  params: Promise<{ code: string }>;
}

export const dynamic = "force-dynamic";

const CHANNEL_META: Record<string, { name: string }> = {
  ALIPAY_BAR: { name: "支付宝" },
  WECHAT_NATIVE: { name: "微信支付" },
  WECHAT_EXTERNAL_QR: { name: "微信支付（人工确认）" },
  UNIONPAY_QR: { name: "云闪付" },
  PAYMENTFM_AGGREGATE: { name: "聚合支付" },
};

export default async function PayPage({ params }: PayPageProps) {
  const { code } = await params;

  const qrCode = await prisma.qRCode.findUnique({
    where: { code },
    include: {
      merchant: {
        select: {
          id: true,
          companyName: true,
          merchantNo: true,
          status: true,
          kybStatus: true,
        },
      },
    },
  });

  if (!qrCode) {
    notFound();
  }

  let storeInfo: { name: string; brandName: string; merchantId: string; isActive: boolean } | null = null;
  if (qrCode.storeId) {
    const store = await prisma.store.findUnique({
      where: { id: qrCode.storeId },
      include: { brand: { select: { name: true, merchantId: true } } },
    });
    if (store) {
      storeInfo = {
        name: store.name,
        brandName: store.brand.name,
        merchantId: store.brand.merchantId,
        isActive: store.isActive,
      };
    }
  }

  const scan = evaluateAggregateQrScan({
    qr: qrCode,
    merchant: qrCode.merchant,
    store: storeInfo
      ? { isActive: storeInfo.isActive, merchantId: storeInfo.merchantId }
      : null,
  });
  if (!scan.ok) {
    if (scan.status === 404) notFound();
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-white text-lg font-medium">{scan.error}</p>
          <p className="text-slate-400 text-sm mt-2">请联系商户确认收款码状态</p>
        </div>
      </div>
    );
  }
  if (!storeInfo) {
    notFound();
  }

  const paymentEnv = resolvePaymentEnv();
  const cashierChannels = [...CASHIER_ROUTABLE_CHANNELS];
  const cashierChannelsWithoutFm = cashierChannels.filter(
    (channel) => channel !== "PAYMENTFM_AGGREGATE",
  );
  const kybReady = isKybApproved(qrCode.merchant.kybStatus);
  const loadCashierRows = (channels: Array<(typeof CASHIER_ROUTABLE_CHANNELS)[number]>) =>
    Promise.all([
      prisma.paymentConfig.findMany({
        where: {
          merchantId: qrCode.merchantId,
          isActive: true,
          channel: { in: channels },
        },
      }),
      prisma.merchantChannel.findMany({
        where: {
          merchantId: qrCode.merchantId,
          isEnabled: true,
          channel: { in: channels },
        },
        select: { channel: true, isEnabled: true },
      }),
      prisma.externalPaymentTarget.findMany({
        where: {
          merchantId: qrCode.merchantId,
          storeId: qrCode.storeId,
          channel: "WECHAT_EXTERNAL_QR",
          isActive: true,
        },
        select: { id: true },
      }),
    ]);
  let configs;
  let merchantChannels;
  let externalTargets;
  try {
    [configs, merchantChannels, externalTargets] = await loadCashierRows(cashierChannels);
  } catch (error) {
    if (!isMissingPaymentChannelEnum(error)) throw error;
    [configs, merchantChannels, externalTargets] = await loadCashierRows(cashierChannelsWithoutFm);
  }
  const enabledChannels = new Map(
    merchantChannels.map((item) => [item.channel, item]),
  );

  const isUsable = (channel: (typeof cashierChannels)[number]) => {
    if (!kybReady || CHANNELS_PENDING_CREDENTIALS.has(channel)) return false;
    const config = configs.find((item) => item.channel === channel);
    if (!config) return false;
    return resolveProvider(channel, config, {
      merchantChannel: enabledChannels.get(channel),
    }).usable;
  };

  const channels: Array<{
    channel: string;
    name: string;
    availability: "READY" | "PENDING" | "MANUAL";
    confirmationMode?: string;
    isSandbox: boolean;
    walletType?: "WECHAT" | "ALIPAY" | "UNIONPAY";
  }> = [
    ...(isUsable("ALIPAY_BAR")
      ? [
          {
            channel: "ALIPAY_BAR",
            name: CHANNEL_META.ALIPAY_BAR.name,
            availability: "READY" as const,
            isSandbox: configs.find((item) => item.channel === "ALIPAY_BAR")?.isSandbox ?? false,
          },
        ]
      : []),
    ...(externalTargets.length > 0
      ? [
          {
            channel: "WECHAT_EXTERNAL_QR",
            name: CHANNEL_META.WECHAT_EXTERNAL_QR.name,
            availability: "MANUAL" as const,
            confirmationMode: MANUAL_CONFIRMATION_REQUIRED,
            isSandbox: false,
          },
        ]
      : []),
    ...cashierChannels
      .filter((channel) =>
        channel !== "ALIPAY_BAR" &&
        channel !== "WECHAT_NATIVE" &&
        channel !== "PAYMENTFM_AGGREGATE"
      )
      .filter((channel) => isUsable(channel))
      .map((channel) => ({
        channel,
        name: CHANNEL_META[channel]?.name || channel,
        availability: "READY" as const,
        isSandbox: configs.find((item) => item.channel === channel)?.isSandbox ?? false,
      })),
    ...(isUsable("PAYMENTFM_AGGREGATE")
      ? listAvailablePaymentFmWallets({
          paymentFmUsable: true,
          merchantChannelEnabled: enabledChannels.get("PAYMENTFM_AGGREGATE")?.isEnabled === true,
          policyAllows: canStartNewProviderPayment(
            "PAYMENTFM_AGGREGATE",
            qrCode.merchant.kybStatus,
          ).ok,
          extraConfig: configs.find((item) => item.channel === "PAYMENTFM_AGGREGATE")
            ?.extraConfig,
        }).map((walletType) => ({
          channel: "PAYMENTFM_AGGREGATE" as const,
          name:
            walletType === "ALIPAY"
              ? "支付宝"
              : walletType === "UNIONPAY"
                ? "云闪付"
                : "微信支付",
          walletType,
          availability: "READY" as const,
          isSandbox:
            configs.find((item) => item.channel === "PAYMENTFM_AGGREGATE")?.isSandbox ?? false,
        }))
      : []),
  ];

  return (
    <PayPageClient
      qrCode={{
        code: qrCode.code,
        type: qrCode.type,
        name: qrCode.name,
        amount: qrCode.amount?.toString() || null,
        expiredAt: qrCode.expiredAt?.toISOString() || null,
        merchantName: qrCode.merchant.companyName,
        storeName: storeInfo.name,
        brandName: storeInfo.brandName,
      }}
      channels={channels}
      paymentEnv={paymentEnv}
      paymentEnvLabel={PAYMENT_ENV_LABEL[paymentEnv]}
    />
  );
}
