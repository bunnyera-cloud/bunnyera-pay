import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { z } from "zod";
import prisma from "@/lib/db";
import { generateOrderNo } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { resolveBaseUrl, resolvePaymentEnv } from "@/lib/payment/config";
import { authenticateApiApp } from "@/lib/shop/api-app-auth";
import {
  SHOP_ORDER_SOURCE,
  buildShopCashierUrl,
  formatShopAmount,
  resolveShopCheckoutReplay,
} from "@/lib/shop/checkout";
import { isSafeShopNotifyUrl } from "@/lib/shop/notify";
import { assertShopPaymentFmReady } from "@/lib/shop/paymentfm-gate";

const checkoutSchema = z.object({
  storeId: z.string().min(1).max(64),
  shopOrderNo: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "商城订单号仅允许字母、数字、下划线和连字符"),
  amount: z
    .number()
    .positive("金额必须大于 0")
    .max(1000000)
    .refine((value) => new Decimal(value).decimalPlaces() <= 2, "金额最多保留两位小数"),
  subject: z.string().min(1).max(200),
  returnUrl: z.string().url().optional(),
  notifyUrl: z.string().url().optional(),
});

function checkoutPayload(input: {
  orderNo: string;
  shopOrderNo: string;
  amount: string;
  status: string;
  cashierUrl: string;
  merchantName: string;
}) {
  return {
    ...input,
    paymentEnv: resolvePaymentEnv(),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateApiApp(request);
  if (!auth.ok) return errorResponse(auth.error, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("请求体格式错误", 400);
  }
  const validation = checkoutSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "数据验证失败", details: validation.error.issues },
      { status: 400 },
    );
  }

  const data = validation.data;
  const merchant = auth.app.merchant;
  const amount = formatShopAmount(data.amount);
  const production = resolvePaymentEnv() === "PRODUCTION";
  const notifyUrl = (data.notifyUrl || auth.app.webhookUrl || "").trim();
  if (notifyUrl && !isSafeShopNotifyUrl(notifyUrl, production)) {
    return errorResponse("回调地址不合法", 400);
  }

  const store = await prisma.store.findUnique({
    where: { id: data.storeId },
    select: {
      id: true,
      isActive: true,
      brandId: true,
      brand: { select: { merchantId: true } },
    },
  });
  if (!store || !store.isActive || store.brand.merchantId !== merchant.id) {
    return errorResponse("门店不存在、不属于当前商户或已停用", 400);
  }

  const gate = await assertShopPaymentFmReady({
    merchantId: merchant.id,
    kybStatus: merchant.kybStatus,
  });
  if (!gate.ok) return errorResponse(gate.error, gate.status);

  const existing = await prisma.order.findFirst({
    where: {
      merchantId: merchant.id,
      externalOrderNo: data.shopOrderNo,
    },
  });
  if (existing) {
    const replay = resolveShopCheckoutReplay({
      existingAmount: Number(existing.amount).toFixed(2),
      requestedAmount: amount,
      status: existing.status,
    });
    if (replay.action === "REJECT") {
      return errorResponse(
        replay.error === "SHOP_ORDER_AMOUNT_MISMATCH"
          ? "商城订单金额与已有支付订单不一致"
          : "该商城订单不可重复发起支付",
        409,
      );
    }
    return successResponse(
      checkoutPayload({
        orderNo: existing.orderNo,
        shopOrderNo: data.shopOrderNo,
        amount: Number(existing.amount).toFixed(2),
        status: existing.status,
        cashierUrl: buildShopCashierUrl(
          resolveBaseUrl(request.headers),
          existing.orderNo,
          existing.id,
        ),
        merchantName: merchant.companyName,
      }),
    );
  }

  const orderNo = generateOrderNo();
  try {
    const order = await prisma.order.create({
      data: {
        orderNo,
        merchantId: merchant.id,
        brandId: store.brandId,
        storeId: store.id,
        subject: data.subject,
        amount,
        currency: "CNY",
        channel: "PAYMENTFM_AGGREGATE",
        scene: "ONLINE",
        status: "CREATED",
        source: SHOP_ORDER_SOURCE,
        externalOrderNo: data.shopOrderNo,
        shopNotifyUrl: notifyUrl || null,
        shopNotifyStatus: notifyUrl ? "PENDING" : "SKIPPED",
        apiAppId: auth.app.id,
        expiredAt: new Date(Date.now() + 30 * 60 * 1000),
        clientIp:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("x-real-ip"),
        userAgent: request.headers.get("user-agent"),
        paymentEnv: resolvePaymentEnv(),
      },
    });

    return successResponse(
      checkoutPayload({
        orderNo: order.orderNo,
        shopOrderNo: data.shopOrderNo,
        amount,
        status: order.status,
        cashierUrl: buildShopCashierUrl(
          resolveBaseUrl(request.headers),
          order.orderNo,
          order.id,
        ),
        merchantName: merchant.companyName,
      }),
    );
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const raced = await prisma.order.findFirst({
      where: {
        merchantId: merchant.id,
        externalOrderNo: data.shopOrderNo,
      },
    });
    if (!raced) return errorResponse("创建支付订单失败", 503);
    const replay = resolveShopCheckoutReplay({
      existingAmount: Number(raced.amount).toFixed(2),
      requestedAmount: amount,
      status: raced.status,
    });
    if (replay.action === "REJECT") {
      return errorResponse("该商城订单不可重复发起支付", 409);
    }
    return successResponse(
      checkoutPayload({
        orderNo: raced.orderNo,
        shopOrderNo: data.shopOrderNo,
        amount: Number(raced.amount).toFixed(2),
        status: raced.status,
        cashierUrl: buildShopCashierUrl(
          resolveBaseUrl(request.headers),
          raced.orderNo,
          raced.id,
        ),
        merchantName: merchant.companyName,
      }),
    );
  }
}
