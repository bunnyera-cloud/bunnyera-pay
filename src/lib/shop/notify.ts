import { createHmac, timingSafeEqual } from "node:crypto";
import prisma from "@/lib/db";
import { decryptPaymentSecret } from "@/lib/payment/secret-storage";
import { SHOP_ORDER_SOURCE } from "./checkout";

export const SHOP_NOTIFY_EVENT_PAID = "ORDER_PAID";

export type ShopNotifyStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

export interface ShopPaidNotifyPayload {
  event: typeof SHOP_NOTIFY_EVENT_PAID;
  orderNo: string;
  shopOrderNo: string;
  amount: string;
  currency: string;
  status: "PAID";
  paidAt: string;
  channel: string;
  walletType: string | null;
}

export function shopNotifyCanonicalString(input: {
  timestamp: string;
  event: string;
  shopOrderNo: string;
  orderNo: string;
  amount: string;
  status: string;
}): string {
  return [
    input.timestamp,
    input.event,
    input.shopOrderNo,
    input.orderNo,
    input.amount,
    input.status,
  ].join(".");
}

export function signShopNotify(canonical: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(canonical).digest("hex");
}

export function verifyShopNotifySignature(input: {
  canonical: string;
  signature: string;
  appSecret: string;
}): boolean {
  const expected = signShopNotify(input.canonical, input.appSecret);
  const left = input.signature.trim().toLowerCase();
  const right = expected.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function isSafeShopNotifyUrl(value: string, production: boolean): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (production) return url.protocol === "https:";
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Reserved Shop webhook after a verified PAID transition.
 * Fail-soft: never throws to the PaymentFM ACK path. Unsigned payloads are not sent.
 */
export async function notifyShopOrderPaid(
  orderId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ShopNotifyStatus> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      source: true,
      status: true,
      orderNo: true,
      externalOrderNo: true,
      amount: true,
      currency: true,
      channel: true,
      walletType: true,
      paidAt: true,
      shopNotifyUrl: true,
      shopNotifyStatus: true,
      apiAppId: true,
    },
  });
  if (!order || order.source !== SHOP_ORDER_SOURCE) return "SKIPPED";
  if (order.status !== "PAID") return "SKIPPED";
  if (order.shopNotifyStatus === "SENT") return "SENT";

  const notifyUrl = (order.shopNotifyUrl || "").trim();
  if (!notifyUrl) {
    await prisma.order.update({
      where: { id: order.id },
      data: { shopNotifyStatus: "SKIPPED" },
    });
    return "SKIPPED";
  }

  const app = order.apiAppId
    ? await prisma.apiApp.findUnique({
        where: { id: order.apiAppId },
        select: { appId: true, appSecret: true, isActive: true },
      })
    : null;
  const appSecret = decryptPaymentSecret(app?.appSecret).trim();
  if (!app?.isActive || !appSecret) {
    await prisma.order.update({
      where: { id: order.id },
      data: { shopNotifyStatus: "FAILED" },
    });
    return "FAILED";
  }

  const payload: ShopPaidNotifyPayload = {
    event: SHOP_NOTIFY_EVENT_PAID,
    orderNo: order.orderNo,
    shopOrderNo: order.externalOrderNo || "",
    amount: Number(order.amount).toFixed(2),
    currency: order.currency || "CNY",
    status: "PAID",
    paidAt: (order.paidAt || new Date()).toISOString(),
    channel: order.channel,
    walletType: order.walletType,
  };
  const timestamp = String(Date.now());
  const canonical = shopNotifyCanonicalString({
    timestamp,
    event: payload.event,
    shopOrderNo: payload.shopOrderNo,
    orderNo: payload.orderNo,
    amount: payload.amount,
    status: payload.status,
  });
  const signature = signShopNotify(canonical, appSecret);

  try {
    const response = await fetchImpl(notifyUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-id": app.appId,
        "x-bunnyera-timestamp": timestamp,
        "x-bunnyera-signature": signature,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      await prisma.order.update({
        where: { id: order.id },
        data: { shopNotifyStatus: "FAILED" },
      });
      return "FAILED";
    }
    await prisma.order.update({
      where: { id: order.id },
      data: { shopNotifyStatus: "SENT" },
    });
    return "SENT";
  } catch {
    await prisma.order.update({
      where: { id: order.id },
      data: { shopNotifyStatus: "FAILED" },
    });
    return "FAILED";
  }
}

export function scheduleShopPaidNotification(orderId: string): void {
  void notifyShopOrderPaid(orderId).catch((error) => {
    console.error("Shop paid notify failed:", (error as Error).message);
  });
}
