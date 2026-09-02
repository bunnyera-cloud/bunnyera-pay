import prisma from "@/lib/db";
import { canCallPaymentProvider, resolvePaymentEnv } from "@/lib/payment/config";
import { canStartNewProviderPayment } from "@/lib/payment/channel-policy";
import { resolveProvider } from "@/lib/payment/resolver";

export async function assertShopPaymentFmReady(input: {
  merchantId: string;
  kybStatus: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const paymentEnv = resolvePaymentEnv();
  if (!canCallPaymentProvider(paymentEnv)) {
    return { ok: false, error: "PREVIEW 环境禁止发起真实支付", status: 409 };
  }
  const paymentGate = canStartNewProviderPayment("PAYMENTFM_AGGREGATE", input.kybStatus);
  if (!paymentGate.ok) {
    return { ok: false, error: paymentGate.error, status: 400 };
  }

  const [paymentConfig, merchantChannel] = await Promise.all([
    prisma.paymentConfig.findFirst({
      where: {
        merchantId: input.merchantId,
        channel: "PAYMENTFM_AGGREGATE",
        isActive: true,
      },
    }),
    prisma.merchantChannel.findUnique({
      where: {
        merchantId_channel: {
          merchantId: input.merchantId,
          channel: "PAYMENTFM_AGGREGATE",
        },
      },
      select: { isEnabled: true },
    }),
  ]);
  const resolved = resolveProvider("PAYMENTFM_AGGREGATE", paymentConfig, {
    merchantChannel,
  });
  if (!paymentConfig || !resolved.provider || !resolved.usable) {
    return {
      ok: false,
      error: `支付渠道不可用: ${resolved.missing.join(", ") || "PaymentFM 尚未配置"}`,
      status: 400,
    };
  }
  return { ok: true };
}
