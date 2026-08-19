import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import { resolveAlipayConfig, resolvePaymentEnv, PAYMENT_ENV_LABEL } from '@/lib/payment/config';
import PayPageClient from './PayPageClient';

interface PayPageProps {
  params: Promise<{ code: string }>;
}

export const dynamic = 'force-dynamic';

// 收银台渠道定义（聚合码扫码场景）
const CHANNEL_META: Record<string, { name: string }> = {
  ALIPAY_BAR: { name: '支付宝' },
  WECHAT_NATIVE: { name: '微信支付' },
  UNIONPAY_QR: { name: '云闪付' },
};

export default async function PayPage({ params }: PayPageProps) {
  const { code } = await params;

  // 查找收款码
  const qrCode = await prisma.qRCode.findUnique({
    where: { code },
    include: {
      merchant: {
        select: {
          id: true,
          companyName: true,
          merchantNo: true,
          status: true,
        },
      },
    },
  });

  if (!qrCode || !qrCode.isActive) {
    notFound();
  }
  // 服务端组件 force-dynamic，每次请求重新计算过期状态
  // eslint-disable-next-line react-hooks/purity
  if (qrCode.expiredAt && qrCode.expiredAt.getTime() < Date.now()) {
    notFound();
  }
  // 商户被拒绝/终止/暂停时不允许收款
  const merchantStatus = qrCode.merchant.status;
  if (merchantStatus === 'REJECTED' || merchantStatus === 'TERMINATED' || merchantStatus === 'SUSPENDED') {
    notFound();
  }

  // 获取门店信息（聚合码必须绑定分店）
  let storeInfo: { name: string; brandName: string } | null = null;
  if (qrCode.storeId) {
    const store = await prisma.store.findUnique({
      where: { id: qrCode.storeId },
      include: { brand: { select: { name: true } } },
    });
    if (store && store.isActive) {
      storeInfo = { name: store.name, brandName: store.brand.name };
    }
  }
  if (!storeInfo) {
    // 未绑定分店或分店已停用的收款码不允许收款
    notFound();
  }

  // 计算该商户真实可用的收银渠道（已启用 + 配置完整）
  const paymentEnv = resolvePaymentEnv();
  const configs = await prisma.paymentConfig.findMany({
    where: {
      merchantId: qrCode.merchantId,
      isActive: true,
      channel: { in: ['ALIPAY_BAR', 'WECHAT_NATIVE', 'UNIONPAY_QR'] },
    },
  });

  const channels = configs
    .filter(c => {
      if (c.channel === 'ALIPAY_BAR') return resolveAlipayConfig(c).usable;
      if (c.channel === 'WECHAT_NATIVE') {
        return !!(c.appId && c.mchId && c.apiKey && c.serialNo && c.privateKey);
      }
      if (c.channel === 'UNIONPAY_QR') return !!(c.unionpayMchId && c.unionpayCert);
      return false;
    })
    .map(c => ({
      channel: c.channel,
      name: CHANNEL_META[c.channel]?.name || c.channel,
      isSandbox: c.isSandbox,
    }));

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
