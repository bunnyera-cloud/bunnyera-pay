import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { resolvePaymentEnv } from "@/lib/payment/config";
import { resolvePaymentFmNotifyUrl } from "@/lib/payment/paymentfm-config";
import { buildPaymentFmAttach, isPaymentFmWalletType } from "@/lib/payment/paymentfm";
import { resolveProvider } from "@/lib/payment/resolver";
import { SHOP_ORDER_SOURCE, isReusableShopWallet } from "@/lib/shop/checkout";
import { assertShopPaymentFmReady } from "@/lib/shop/paymentfm-gate";

const paySchema = z.object({
  orderNo: z.string().min(1).max(64),
  token: z.string().min(1).max(64),
  walletType: z.enum(["WECHAT", "ALIPAY", "UNIONPAY"]),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("请求体格式错误", 400);
  }
  const validation = paySchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "数据验证失败", details: validation.error.issues },
      { status: 400 },
    );
  }

  const data = validation.data;
  if (!isPaymentFmWalletType(data.walletType)) {
    return errorResponse("聚合支付必须指定 walletType：WECHAT / ALIPAY / UNIONPAY", 400);
  }

  const order = await prisma.order.findUnique({
    where: { orderNo: data.orderNo },
    include: {
      merchant: { select: { id: true, status: true, kybStatus: true } },
    },
  });
  if (!order || order.id !== data.token || order.source !== SHOP_ORDER_SOURCE) {
    return errorResponse("订单不存在", 404);
  }
  if (order.merchant.status !== "ACTIVE") {
    return errorResponse("商户不可用", 403);
  }
  if (order.expiredAt && order.expiredAt.getTime() < Date.now() && order.status !== "PAID") {
    return errorResponse("订单已过期", 400);
  }

  const walletDecision = isReusableShopWallet({
    status: order.status,
    existingWalletType: order.walletType,
    requestedWalletType: data.walletType,
    hasPayData: Boolean(order.payData),
  });
  if (walletDecision.action === "REJECT") {
    return errorResponse(
      walletDecision.error === "SHOP_ORDER_ALREADY_PAID"
        ? "订单已支付"
        : walletDecision.error === "SHOP_ORDER_WALLET_LOCKED"
          ? "该订单已发起支付，请使用原支付方式或新的商城订单号"
          : "该订单当前不可支付",
      409,
    );
  }
  if (walletDecision.action === "REUSE") {
    return successResponse({
      orderNo: order.orderNo,
      status: order.status,
      amount: Number(order.amount).toFixed(2),
      payData: order.payData,
      walletType: order.walletType,
      paymentEnv: order.paymentEnv || resolvePaymentEnv(),
      statusToken: order.id,
    });
  }

  const gate = await assertShopPaymentFmReady({
    merchantId: order.merchantId,
    kybStatus: order.merchant.kybStatus,
  });
  if (!gate.ok) return errorResponse(gate.error, gate.status);

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
  const resolved = resolveProvider("PAYMENTFM_AGGREGATE", paymentConfig, {
    merchantChannel,
  });
  if (!paymentConfig || !resolved.provider || !resolved.usable) {
    return errorResponse("PaymentFM 尚未配置", 400);
  }

  try {
    const notifyUrl = resolvePaymentFmNotifyUrl(request.headers, paymentConfig.notifyUrl);
    const payResult = await resolved.provider.createPayment({
      orderNo: order.orderNo,
      amount: Number(order.amount),
      subject: order.subject,
      currency: "CNY",
      notifyUrl,
      extraParams: {
        walletType: data.walletType,
        attch: buildPaymentFmAttach({
          storeId: order.storeId,
        }),
      },
    });
    if (!payResult.success || !payResult.payData) {
      return errorResponse(`支付创建失败: ${payResult.error || "支付渠道未返回支付内容"}`, 502);
    }

    const paymentEnv = resolvePaymentEnv();
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "PAYING",
        channelTradeNo: payResult.tradeNo,
        payData: payResult.payData,
        walletType: data.walletType,
        paymentEnv,
      },
    });
    return successResponse({
      orderNo: order.orderNo,
      status: "PAYING",
      amount: Number(order.amount).toFixed(2),
      payData: payResult.payData,
      tradeNo: payResult.tradeNo,
      walletType: data.walletType,
      paymentEnv,
      statusToken: order.id,
    });
  } catch (error) {
    console.error("Shop checkout pay error:", (error as Error).message);
    return errorResponse("支付渠道调用失败", 502);
  }
}
