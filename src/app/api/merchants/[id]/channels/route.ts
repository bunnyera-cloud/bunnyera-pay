import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { withAuth, successResponse, errorResponse } from "@/lib/api-utils";
import { withRateLimitedAuth } from "@/lib/security/api-guard";
import { recordAuditLog } from "@/lib/audit";
import type { PaymentConfig } from "@prisma/client";
import { encryptPaymentSecret } from "@/lib/payment/secret-storage";
import { mergePaymentExtraConfig } from "@/lib/payment/extra-config";
import {
  isDocumentedPaymentFmPayType,
  paymentFmWalletPatchExtra,
  readStoredPaymentFmWalletFields,
} from "@/lib/payment/paymentfm-config";
import {
  canEnableMerchantChannel,
  providerProductionStatus,
} from "@/lib/payment/channel-policy";
import { z } from "zod";

const manageableChannelSchema = z.enum([
  "ALIPAY_BAR",
  "ALIPAY_PC",
  "ALIPAY_WAP",
  "WECHAT_NATIVE",
  "WECHAT_H5",
  "WECHAT_JSAPI",
  "WECHAT_MINI",
  "UNIONPAY_GATEWAY",
  "UNIONPAY_WAP",
  "UNIONPAY_QR",
  "PAYMENTFM_AGGREGATE",
]);

const channelAuthorizationSchema = z.object({
  channel: manageableChannelSchema,
  isEnabled: z.boolean().optional(),
  enabledWallets: z.array(z.enum(["WECHAT", "ALIPAY", "UNIONPAY"])).optional(),
  payTypes: z.array(z.string()).optional(),
}).refine(
  (data) =>
    data.isEnabled !== undefined ||
    data.enabledWallets !== undefined ||
    data.payTypes !== undefined,
  { message: "没有可更新的字段" },
);

// 为商户创建/更新渠道配置
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRateLimitedAuth(
    request,
    async (req) => {
      const body = await req.json();
      const {
        channel,
        isSandbox,
        appId,
        mchId,
        privateKey,
        publicKey,
        apiKey,
        serialNo,
        certPath,
        keyPath,
        gateway,
        notifyUrl,
        unionpayMchId,
        unionpayCert,
        unionpayCertPassword,
        unionpayVerifyCertificate,
        unionpayVerifyCertPath,
        unionpayTermId,
        unionpayFrontTransUrl,
        unionpayBackTransUrl,
        unionpayQueryTransUrl,
        platformSerialNo,
        platformCertPath,
        sellerId,
        appCertSn,
        alipayRootCertSn,
        payTypes,
        enabledWallets,
      } = body;

      if (!channel) {
        return errorResponse("渠道不能为空", 400);
      }

      // 验证商户存在
      const merchant = await prisma.merchant.findUnique({ where: { id } });
      if (!merchant) {
        return errorResponse("商户不存在", 404);
      }

      // 检查是否已有该渠道配置
      const existing = await prisma.paymentConfig.findFirst({
        where: { merchantId: id, channel },
      });

      if (existing) {
        // 更新现有配置
        const updated = await prisma.paymentConfig.update({
          where: { id: existing.id },
          data: {
            appId: appId || existing.appId,
            mchId: mchId || existing.mchId,
            privateKey: encryptIfProvided(privateKey, existing.privateKey),
            publicKey:
              unionpayVerifyCertificate || publicKey || existing.publicKey,
            apiKey: encryptIfProvided(
              apiKey || unionpayCertPassword,
              existing.apiKey,
            ),
            serialNo: serialNo || existing.serialNo,
            certPath: certPath || existing.certPath,
            gateway: gateway || existing.gateway,
            notifyUrl: notifyUrl || existing.notifyUrl,
            unionpayMchId: unionpayMchId || existing.unionpayMchId,
            unionpayCert: unionpayCert || existing.unionpayCert,
            keyPath: keyPath || existing.keyPath,
            extraConfig: mergePaymentExtraConfig(existing.extraConfig, {
              platformSerialNo,
              platformCertPath,
              sellerId,
              appCertSn,
              alipayRootCertSn,
              verifyCertPath: unionpayVerifyCertPath,
              termId: unionpayTermId,
              frontTransUrl: unionpayFrontTransUrl,
              backTransUrl: unionpayBackTransUrl,
              queryTransUrl: unionpayQueryTransUrl,
              ...paymentFmWalletExtra(channel, { payTypes, enabledWallets }),
            }),
            isSandbox: isSandbox ?? existing.isSandbox,
            isActive: true,
          },
        });

        await recordAuditLog({
          action: "CHANNEL_CONFIG_UPDATE",
          resource: "payment_config",
          resourceId: updated.id,
          request,
          afterData: { merchantId: id, channel, isSandbox },
          result: "SUCCESS",
        });

        return successResponse(toSafePaymentConfig(updated), "渠道配置已更新");
      }

      // 创建新配置
      const created = await prisma.paymentConfig.create({
        data: {
          merchantId: id,
          channel,
          appId: appId || "",
          mchId: mchId || "",
          privateKey: encryptIfProvided(privateKey, ""),
          publicKey: unionpayVerifyCertificate || publicKey || "",
          apiKey: encryptIfProvided(apiKey || unionpayCertPassword, ""),
          serialNo: serialNo || "",
          certPath: certPath || "",
          keyPath: keyPath || "",
          gateway: gateway || "",
          notifyUrl: notifyUrl || "",
          unionpayMchId: unionpayMchId || "",
          unionpayCert: unionpayCert || "",
          extraConfig: mergePaymentExtraConfig(null, {
            platformSerialNo,
            platformCertPath,
            sellerId,
            appCertSn,
            alipayRootCertSn,
            verifyCertPath: unionpayVerifyCertPath,
            termId: unionpayTermId,
            frontTransUrl: unionpayFrontTransUrl,
            backTransUrl: unionpayBackTransUrl,
            queryTransUrl: unionpayQueryTransUrl,
            ...paymentFmWalletExtra(channel, { payTypes, enabledWallets }),
          }),
          isSandbox: isSandbox || false,
          isActive: true,
        },
      });

      await recordAuditLog({
        action: "CHANNEL_CONFIG_CREATE",
        resource: "payment_config",
        resourceId: created.id,
        request,
        afterData: { merchantId: id, channel, isSandbox },
        result: "SUCCESS",
      });

      return successResponse(toSafePaymentConfig(created), "渠道配置已创建");
    },
    ["PLATFORM_SUPER_ADMIN"],
    "channel-write",
    id,
  );
}

function paymentFmWalletExtra(
  channel: unknown,
  input: { payTypes?: unknown; enabledWallets?: unknown },
): Record<string, unknown> {
  if (channel !== "PAYMENTFM_AGGREGATE") return {};
  if (input.payTypes === undefined && input.enabledWallets === undefined) return {};
  const payTypes = Array.isArray(input.payTypes)
    ? input.payTypes.filter((item) => isDocumentedPaymentFmPayType(String(item)))
    : undefined;
  return paymentFmWalletPatchExtra({
    enabledWallets: input.enabledWallets,
    payTypes,
  });
}

function toSafePaymentConfig(config: PaymentConfig) {
  const wallets = readStoredPaymentFmWalletFields(config.extraConfig);
  return {
    id: config.id,
    merchantId: config.merchantId,
    channel: config.channel,
    appId: config.appId,
    mchId: config.mchId,
    serialNo: config.serialNo,
    gateway: config.gateway,
    notifyUrl: config.notifyUrl,
    isActive: config.isActive,
    isSandbox: config.isSandbox,
    hasPrivateKey: !!config.privateKey || !!config.keyPath,
    hasPublicKey: !!config.publicKey,
    hasApiV3Key: !!config.apiKey,
    hasUnionpayCertificate: !!config.unionpayCert,
    enabledWallets: wallets.enabledWallets,
    payTypes: wallets.payTypes,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

function encryptIfProvided(value: unknown, fallback: string | null): string {
  if (typeof value !== "string" || !value.trim()) return fallback || "";
  return encryptPaymentSecret(value);
}

// 平台管理员启用/停用商户支付通道；仅写授权状态，不接收或返回任何密钥。
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRateLimitedAuth(
    request,
    async (req, ctx) => {
      const validation = channelAuthorizationSchema.safeParse(await req.json());
      if (!validation.success) {
        return errorResponse("渠道授权参数无效", 400);
      }
      const merchant = await prisma.merchant.findUnique({
        where: { id },
        select: { id: true, kybStatus: true, status: true },
      });
      if (!merchant) return errorResponse("商户不存在", 404);

      const { channel, isEnabled, enabledWallets, payTypes } = validation.data;
      if (isEnabled === true) {
        const authorizationGate = canEnableMerchantChannel(
          channel,
          merchant.kybStatus,
          merchant.status,
        );
        if (!authorizationGate.ok) {
          return errorResponse(authorizationGate.error, 409);
        }
      }

      let authorization = null;
      if (isEnabled !== undefined) {
        const existing = await prisma.merchantChannel.findUnique({
          where: { merchantId_channel: { merchantId: id, channel } },
        });
        authorization = await prisma.merchantChannel.upsert({
          where: { merchantId_channel: { merchantId: id, channel } },
          create: { merchantId: id, channel, isEnabled },
          update: { isEnabled },
          select: {
            id: true,
            merchantId: true,
            channel: true,
            isEnabled: true,
            updatedAt: true,
          },
        });
        await recordAuditLog({
          platformUserId: ctx.user.sub,
          action: isEnabled ? "MERCHANT_CHANNEL_ENABLE" : "MERCHANT_CHANNEL_DISABLE",
          resource: "merchant_channel",
          resourceId: authorization.id,
          request,
          beforeData: existing
            ? {
                merchantId: existing.merchantId,
                channel: existing.channel,
                isEnabled: existing.isEnabled,
              }
            : undefined,
          afterData: {
            merchantId: authorization.merchantId,
            channel: authorization.channel,
            isEnabled: authorization.isEnabled,
          },
          result: "SUCCESS",
        });
      }

      let walletConfig: { enabledWallets: string[]; payTypes: string[] } | null = null;
      if (channel === "PAYMENTFM_AGGREGATE" && (enabledWallets !== undefined || payTypes !== undefined)) {
        const wallets = paymentFmWalletPatchExtra({ enabledWallets, payTypes });
        const existingConfig = await prisma.paymentConfig.findFirst({
          where: { merchantId: id, channel: "PAYMENTFM_AGGREGATE" },
        });
        const extraConfig = mergePaymentExtraConfig(existingConfig?.extraConfig, wallets);
        if (existingConfig) {
          await prisma.paymentConfig.update({
            where: { id: existingConfig.id },
            data: { extraConfig },
          });
        } else {
          await prisma.paymentConfig.create({
            data: {
              merchantId: id,
              channel: "PAYMENTFM_AGGREGATE",
              extraConfig,
              isActive: false,
              isSandbox: true,
            },
          });
        }
        walletConfig = {
          enabledWallets: Array.isArray(extraConfig.enabledWallets)
            ? extraConfig.enabledWallets as string[]
            : [],
          payTypes: Array.isArray(extraConfig.payTypes)
            ? extraConfig.payTypes as string[]
            : [],
        };
      }

      return successResponse(
        {
          ...(authorization || { merchantId: id, channel }),
          ...(walletConfig || {}),
        },
        isEnabled === undefined
          ? "钱包配置已更新"
          : isEnabled
            ? "渠道已启用"
            : "渠道已停用",
      );
    },
    ["PLATFORM_SUPER_ADMIN"],
    "channel-write",
    id,
  );
}

// 获取商户渠道配置列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withAuth(request, async () => {
    const [configs, authorizations] = await Promise.all([
      prisma.paymentConfig.findMany({
        where: { merchantId: id },
        select: {
          id: true,
          channel: true,
          appId: true,
          mchId: true,
          isActive: true,
          isSandbox: true,
          gateway: true,
          notifyUrl: true,
          extraConfig: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.merchantChannel.findMany({
        where: { merchantId: id },
        select: { channel: true, isEnabled: true },
      }),
    ]);
    const authorizationByChannel = new Map(
      authorizations.map((item) => [item.channel, item.isEnabled]),
    );

    return successResponse(
      configs.map((config) => {
        const isEnabled = authorizationByChannel.get(config.channel) === true;
        const wallets = readStoredPaymentFmWalletFields(config.extraConfig);
        return {
          id: config.id,
          channel: config.channel,
          appId: config.appId,
          mchId: config.mchId,
          isActive: config.isActive,
          isSandbox: config.isSandbox,
          gateway: config.gateway,
          notifyUrl: config.notifyUrl,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
          isEnabled,
          productionStatus: providerProductionStatus(config.channel, isEnabled),
          enabledWallets: wallets.enabledWallets,
          payTypes: wallets.payTypes,
        };
      }),
    );
  }, ["PLATFORM_SUPER_ADMIN", "PLATFORM_REVIEWER"]);
}
