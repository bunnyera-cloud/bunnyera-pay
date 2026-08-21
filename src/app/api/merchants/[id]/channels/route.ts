import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { withAuth, successResponse, errorResponse } from "@/lib/api-utils";
import { recordAuditLog } from "@/lib/audit";
import type { PaymentConfig, Prisma } from "@prisma/client";
import { encryptPaymentSecret } from "@/lib/payment/secret-storage";

// 为商户创建/更新渠道配置
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withAuth(
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
        platformSerialNo,
        platformCertPath,
        sellerId,
        appCertSn,
        alipayRootCertSn,
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
            publicKey: publicKey || existing.publicKey,
            apiKey: encryptIfProvided(apiKey, existing.apiKey),
            serialNo: serialNo || existing.serialNo,
            certPath: certPath || existing.certPath,
            gateway: gateway || existing.gateway,
            notifyUrl: notifyUrl || existing.notifyUrl,
            unionpayMchId: unionpayMchId || existing.unionpayMchId,
            unionpayCert: unionpayCert || existing.unionpayCert,
            keyPath: keyPath || existing.keyPath,
            extraConfig: mergeExtraConfig(existing.extraConfig, {
              platformSerialNo,
              platformCertPath,
              sellerId,
              appCertSn,
              alipayRootCertSn,
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
          publicKey: publicKey || "",
          apiKey: encryptIfProvided(apiKey, ""),
          serialNo: serialNo || "",
          certPath: certPath || "",
          keyPath: keyPath || "",
          gateway: gateway || "",
          notifyUrl: notifyUrl || "",
          unionpayMchId: unionpayMchId || "",
          unionpayCert: unionpayCert || "",
          extraConfig: mergeExtraConfig(null, {
            platformSerialNo,
            platformCertPath,
            sellerId,
            appCertSn,
            alipayRootCertSn,
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
  );
}

function mergeExtraConfig(
  current: Prisma.JsonValue | null,
  next: Record<string, unknown>,
): Prisma.InputJsonObject {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Prisma.JsonObject)
      : {};
  return Object.fromEntries([
    ...Object.entries(base),
    ...Object.entries(next).filter(
      ([, value]) => typeof value === "string" && value.trim(),
    ),
  ]) as Prisma.InputJsonObject;
}

function toSafePaymentConfig(config: PaymentConfig) {
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
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

function encryptIfProvided(value: unknown, fallback: string | null): string {
  if (typeof value !== "string" || !value.trim()) return fallback || "";
  return encryptPaymentSecret(value);
}

// 获取商户渠道配置列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withAuth(request, async () => {
    const configs = await prisma.paymentConfig.findMany({
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
        createdAt: true,
        updatedAt: true,
      },
    });

    return successResponse(configs);
  }, ["PLATFORM_SUPER_ADMIN", "PLATFORM_REVIEWER"]);
}
