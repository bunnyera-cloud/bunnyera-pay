import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { PAYMENT_ENV_LABEL, resolvePaymentEnv } from "@/lib/payment/config";
import { resolveProvider } from "@/lib/payment/resolver";
import { isKybApproved } from "@/lib/payment/channel-policy";
import { SHOP_ORDER_SOURCE } from "@/lib/shop/checkout";
import ShopPayClient from "./ShopPayClient";

interface ShopPayPageProps {
  params: Promise<{ orderNo: string }>;
  searchParams: Promise<{ token?: string }>;
}

export const dynamic = "force-dynamic";

export default async function ShopPayPage({ params, searchParams }: ShopPayPageProps) {
  const { orderNo } = await params;
  const { token } = await searchParams;
  if (!token) notFound();

  const order = await prisma.order.findUnique({
    where: { orderNo },
    include: {
      merchant: {
        select: {
          id: true,
          companyName: true,
          status: true,
          kybStatus: true,
        },
      },
    },
  });
  if (!order || order.id !== token || order.source !== SHOP_ORDER_SOURCE) {
    notFound();
  }
  if (order.merchant.status !== "ACTIVE") {
    notFound();
  }

  let storeName: string | null = null;
  if (order.storeId) {
    const store = await prisma.store.findUnique({
      where: { id: order.storeId },
      select: {
        name: true,
        isActive: true,
        brand: { select: { merchantId: true } },
      },
    });
    if (store && store.isActive && store.brand.merchantId === order.merchantId) {
      storeName = store.name;
    }
  }

  const paymentEnv = resolvePaymentEnv();
  const kybReady = isKybApproved(order.merchant.kybStatus);
  const [paymentConfig, merchantChannel] = await Promise.all([
    prisma.paymentConfig.findFirst({
      where: {
        merchantId: order.merchantId,
        channel: "PAYMENTFM_AGGREGATE",
        isActive: true,
      },
    }),
    prisma.merchantChannel.findUnique({
      where: {
        merchantId_channel: {
          merchantId: order.merchantId,
          channel: "PAYMENTFM_AGGREGATE",
        },
      },
      select: { isEnabled: true },
    }),
  ]);
  const paymentFmReady =
    kybReady &&
    resolveProvider("PAYMENTFM_AGGREGATE", paymentConfig, {
      merchantChannel,
    }).usable;

  const channels = paymentFmReady
    ? (["ALIPAY", "WECHAT", "UNIONPAY"] as const).map((walletType) => ({
        walletType,
        name:
          walletType === "ALIPAY"
            ? "支付宝"
            : walletType === "WECHAT"
              ? "微信支付"
              : "云闪付",
        isSandbox: paymentConfig?.isSandbox ?? false,
      }))
    : [];

  return (
    <ShopPayClient
      order={{
        orderNo: order.orderNo,
        shopOrderNo: order.externalOrderNo,
        amount: Number(order.amount).toFixed(2),
        status: order.status,
        merchantName: order.merchant.companyName,
        storeName,
        expired: Boolean(order.expiredAt && order.expiredAt.getTime() < Date.now()),
      }}
      token={order.id}
      channels={channels}
      paymentEnv={paymentEnv}
      paymentEnvLabel={PAYMENT_ENV_LABEL[paymentEnv]}
    />
  );
}
