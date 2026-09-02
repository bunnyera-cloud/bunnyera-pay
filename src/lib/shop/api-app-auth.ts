import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { decryptPaymentSecret } from "@/lib/payment/secret-storage";

export interface AuthenticatedApiApp {
  id: string;
  appId: string;
  merchantId: string;
  webhookUrl: string | null;
  merchant: {
    id: string;
    companyName: string;
    status: string;
    kybStatus: string;
  };
}

function safeEqualSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length === 0 || a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function authenticateApiApp(
  request: NextRequest,
): Promise<
  | { ok: true; app: AuthenticatedApiApp }
  | { ok: false; status: number; error: string }
> {
  const appId = (request.headers.get("x-app-id") || "").trim();
  const appSecret = (request.headers.get("x-app-secret") || "").trim();
  if (!appId || !appSecret) {
    return { ok: false, status: 401, error: "缺少应用凭证" };
  }

  const app = await prisma.apiApp.findUnique({
    where: { appId },
    select: {
      id: true,
      appId: true,
      appSecret: true,
      merchantId: true,
      webhookUrl: true,
      isActive: true,
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
  if (!app || !app.isActive) {
    return { ok: false, status: 401, error: "应用凭证无效" };
  }

  const storedSecret = decryptPaymentSecret(app.appSecret).trim();
  if (!storedSecret || !safeEqualSecret(storedSecret, appSecret)) {
    return { ok: false, status: 401, error: "应用凭证无效" };
  }
  if (app.merchant.status !== "ACTIVE") {
    return { ok: false, status: 403, error: "商户不可用" };
  }

  return {
    ok: true,
    app: {
      id: app.id,
      appId: app.appId,
      merchantId: app.merchantId,
      webhookUrl: app.webhookUrl,
      merchant: app.merchant,
    },
  };
}
