import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { withAuth, errorResponse, successResponse } from "@/lib/api-utils";
import { recordAuditLog } from "@/lib/audit";
import { canAccessStore, resolveStoreAccess } from "@/lib/store-access";
import { MANUAL_CONFIRMATION_CHANNELS } from "@/lib/payment/channel-policy";

const createSchema = z.object({
  channel: z.enum(["WECHAT_EXTERNAL_QR"]),
  displayName: z.string().trim().min(1).max(80),
  qrImageUrl: z.string().trim().min(1).max(4000).optional(),
  targetUrl: z.string().trim().min(1).max(4000).optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Boolean(data.qrImageUrl || data.targetUrl), {
  message: "请提供微信收款码图片或跳转链接",
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withAuth(
    request,
    async (_req, ctx) => {
      const scope = await resolveStoreAccess(ctx.user);
      if (!canAccessStore(scope, id)) {
        return errorResponse("无权查看该分店", 403);
      }
      const store = await prisma.store.findFirst({
        where: { id, brand: { merchantId: ctx.user.merchantId } },
        select: { id: true },
      });
      if (!store) return errorResponse("门店不存在", 404);

      const targets = await prisma.externalPaymentTarget.findMany({
        where: { storeId: id, merchantId: ctx.user.merchantId },
        orderBy: { createdAt: "desc" },
      });
      return successResponse(targets);
    },
    ["MERCHANT_OWNER", "MERCHANT_ADMIN", "FINANCE", "STORE_MANAGER", "CASHIER"],
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withAuth(
    request,
    async (req, ctx) => {
      const validation = createSchema.safeParse(await req.json());
      if (!validation.success) {
        return errorResponse("外部收款码参数无效", 400);
      }
      const scope = await resolveStoreAccess(ctx.user);
      if (!canAccessStore(scope, id)) {
        return errorResponse("无权配置该分店", 403);
      }
      const store = await prisma.store.findFirst({
        where: { id, isActive: true, brand: { merchantId: ctx.user.merchantId } },
        select: { id: true },
      });
      if (!store) return errorResponse("门店不存在或已停用", 404);

      const data = validation.data;
      if (!MANUAL_CONFIRMATION_CHANNELS.has(data.channel)) {
        return errorResponse("该渠道不是外部静态收款码", 400);
      }

      const created = await prisma.externalPaymentTarget.create({
        data: {
          merchantId: ctx.user.merchantId!,
          storeId: id,
          channel: data.channel,
          displayName: data.displayName,
          qrImageUrl: data.qrImageUrl,
          targetUrl: data.targetUrl,
          isActive: data.isActive ?? true,
        },
      });

      await recordAuditLog({
        merchantMemberId: ctx.user.sub,
        action: "EXTERNAL_PAYMENT_TARGET_CREATE",
        resource: "external_payment_target",
        resourceId: created.id,
        request: req,
        afterData: {
          storeId: id,
          channel: created.channel,
          displayName: created.displayName,
          isActive: created.isActive,
        },
        result: "SUCCESS",
      });

      return successResponse(created, "外部收款码已保存（仅展示/跳转，需人工确认）");
    },
    ["MERCHANT_OWNER", "MERCHANT_ADMIN"],
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withAuth(
    request,
    async (req, ctx) => {
      const body = z.object({
        targetId: z.string().uuid(),
        isActive: z.boolean(),
      }).safeParse(await req.json());
      if (!body.success) return errorResponse("参数无效", 400);

      const scope = await resolveStoreAccess(ctx.user);
      if (!canAccessStore(scope, id)) {
        return errorResponse("无权配置该分店", 403);
      }

      const updated = await prisma.externalPaymentTarget.updateMany({
        where: {
          id: body.data.targetId,
          storeId: id,
          merchantId: ctx.user.merchantId,
        },
        data: { isActive: body.data.isActive },
      });
      if (updated.count === 0) return errorResponse("外部收款码不存在", 404);

      await recordAuditLog({
        merchantMemberId: ctx.user.sub,
        action: body.data.isActive
          ? "EXTERNAL_PAYMENT_TARGET_ENABLE"
          : "EXTERNAL_PAYMENT_TARGET_DISABLE",
        resource: "external_payment_target",
        resourceId: body.data.targetId,
        request: req,
        afterData: { storeId: id, isActive: body.data.isActive },
        result: "SUCCESS",
      });
      return successResponse({ id: body.data.targetId, isActive: body.data.isActive });
    },
    ["MERCHANT_OWNER", "MERCHANT_ADMIN"],
  );
}
