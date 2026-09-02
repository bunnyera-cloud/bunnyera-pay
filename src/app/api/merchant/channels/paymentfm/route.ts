import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { withAuth, successResponse, errorResponse } from "@/lib/api-utils";
import { withRateLimitedAuth } from "@/lib/security/api-guard";
import {
  assessPaymentFmHealth,
  listPaymentFmWalletAllowlist,
  maskPaymentFmMerchantNum,
  paymentFmWalletPatchExtra,
  paymentFmApiHost,
  readStoredPaymentFmWalletFields,
  resolvePaymentFmConfig,
  resolvePaymentFmNotifyUrl,
} from "@/lib/payment/paymentfm-config";
import { mergePaymentExtraConfig } from "@/lib/payment/extra-config";
import { listAvailablePaymentFmWallets } from "@/lib/qrcode/wallets";
import { canStartNewProviderPayment } from "@/lib/payment/channel-policy";
import {
  PAYMENTFM_WALLET_READ_ROLES,
  PAYMENTFM_WALLET_WRITE_ROLES,
} from "@/lib/payment/paymentfm-wallet-access";
import { isMissingPaymentChannelEnum } from "@/lib/payment/schema-compat";
import { z } from "zod";

const walletPatchSchema = z.object({
  enabledWallets: z.array(z.enum(["WECHAT", "ALIPAY", "UNIONPAY"])).optional(),
  payTypes: z.array(z.string()).optional(),
}).refine(
  (data) => data.enabledWallets !== undefined || data.payTypes !== undefined,
  { message: "请选择钱包或 payType" },
);

async function emptyPaymentFmSnapshot() {
  return {
    channel: "PAYMENTFM_AGGREGATE",
    status: "NOT_CONFIGURED" as const,
    merchantNumMasked: "",
    apiHost: "",
    notifyUrl: "",
    isEnabled: false,
    missing: ["merchantNum", "merchantKey", "apiUrl"],
    enabledWallets: null,
    payTypes: null,
    supportedWalletTypes: [] as string[],
    cashierWalletTypes: [] as string[],
    healthCheckedAt: new Date().toISOString(),
  };
}

async function paymentFmSnapshot(merchantId: string, headers: Headers) {
  const [paymentConfig, merchantChannel, merchant] = await Promise.all([
    prisma.paymentConfig.findFirst({
      where: { merchantId, channel: "PAYMENTFM_AGGREGATE" },
    }),
    prisma.merchantChannel.findUnique({
      where: {
        merchantId_channel: { merchantId, channel: "PAYMENTFM_AGGREGATE" },
      },
      select: { isEnabled: true },
    }),
    prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { kybStatus: true },
    }),
  ]);

  const resolved = resolvePaymentFmConfig(paymentConfig);
  const hasAnyCredential = Boolean(
    resolved.apiUrl || resolved.merchantNum || resolved.merchantKey || paymentConfig,
  );
  let notifyUrl = "";
  try {
    notifyUrl = resolvePaymentFmNotifyUrl(headers, paymentConfig?.notifyUrl);
  } catch {
    notifyUrl = "";
  }
  const stored = readStoredPaymentFmWalletFields(paymentConfig?.extraConfig);
  const status = assessPaymentFmHealth({
    usable: resolved.usable,
    missing: resolved.missing,
    isEnabled: merchantChannel?.isEnabled === true,
    hasAnyCredential,
  });
  const cashierWallets = listAvailablePaymentFmWallets({
    paymentFmUsable: resolved.usable,
    merchantChannelEnabled: merchantChannel?.isEnabled === true,
    policyAllows: canStartNewProviderPayment(
      "PAYMENTFM_AGGREGATE",
      merchant?.kybStatus,
    ).ok,
    extraConfig: paymentConfig?.extraConfig,
  });

  return {
    channel: "PAYMENTFM_AGGREGATE",
    status,
    merchantNumMasked: maskPaymentFmMerchantNum(resolved.merchantNum),
    apiHost: paymentFmApiHost(resolved.apiUrl),
    notifyUrl,
    isEnabled: merchantChannel?.isEnabled === true,
    missing: resolved.missing,
    enabledWallets: stored.enabledWallets,
    payTypes: stored.payTypes,
    supportedWalletTypes: listPaymentFmWalletAllowlist(paymentConfig?.extraConfig),
    cashierWalletTypes: cashierWallets,
    healthCheckedAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async (req, ctx) => {
      const merchantId = ctx.user.merchantId;
      if (!merchantId) return errorResponse("商户 ID 缺失", 400);
      try {
        return successResponse(await paymentFmSnapshot(merchantId, req.headers));
      } catch (error) {
        if (!isMissingPaymentChannelEnum(error)) throw error;
        return successResponse(await emptyPaymentFmSnapshot());
      }
    },
    [...PAYMENTFM_WALLET_READ_ROLES],
  );
}

export async function PATCH(request: NextRequest) {
  return withRateLimitedAuth(
    request,
    async (req, ctx) => {
      const merchantId = ctx.user.merchantId;
      if (!merchantId) return errorResponse("商户 ID 缺失", 400);
      const validation = walletPatchSchema.safeParse(await req.json());
      if (!validation.success) return errorResponse("钱包配置无效", 400);

      const walletPatch = paymentFmWalletPatchExtra(validation.data);
      try {
        const existing = await prisma.paymentConfig.findFirst({
          where: { merchantId, channel: "PAYMENTFM_AGGREGATE" },
        });
        const extraConfig = mergePaymentExtraConfig(existing?.extraConfig, walletPatch);
        if (existing) {
          await prisma.paymentConfig.update({
            where: { id: existing.id },
            data: { extraConfig },
          });
        } else {
          await prisma.paymentConfig.create({
            data: {
              merchantId,
              channel: "PAYMENTFM_AGGREGATE",
              extraConfig,
              isActive: false,
              isSandbox: true,
            },
          });
        }

        return successResponse(
          await paymentFmSnapshot(merchantId, req.headers),
          "聚合钱包配置已保存",
        );
      } catch (error) {
        if (!isMissingPaymentChannelEnum(error)) throw error;
        return errorResponse("PaymentFM 渠道尚未在当前数据库开通，钱包配置无法保存", 409);
      }
    },
    [...PAYMENTFM_WALLET_WRITE_ROLES],
    "channel-write",
  );
}
