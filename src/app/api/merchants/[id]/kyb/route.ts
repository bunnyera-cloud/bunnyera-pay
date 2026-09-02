import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/db";
import { withAuth, errorResponse, successResponse } from "@/lib/api-utils";
import { recordAuditLog } from "@/lib/audit";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit") }),
  z.object({ action: z.literal("approve") }),
  z.object({
    action: z.literal("reject"),
    reason: z.string().trim().min(1).max(500),
  }),
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withAuth(
    request,
    async (_req, ctx) => {
      if (ctx.user.type !== "platform" && ctx.user.merchantId !== id) {
        return errorResponse("无权查看其他商户的 KYB", 403);
      }
      const merchant = await prisma.merchant.findUnique({
        where: { id },
        select: {
          id: true,
          merchantNo: true,
          status: true,
          kybStatus: true,
          kybSubmittedAt: true,
          kybReviewedAt: true,
          kybRejectReason: true,
        },
      });
      if (!merchant) return errorResponse("商户不存在", 404);
      return successResponse(merchant);
    },
    [
      "MERCHANT_OWNER",
      "MERCHANT_ADMIN",
      "PLATFORM_SUPER_ADMIN",
      "PLATFORM_REVIEWER",
    ],
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
      const validation = actionSchema.safeParse(await req.json());
      if (!validation.success) {
        return errorResponse("KYB 操作参数无效", 400);
      }

      const { action } = validation.data;
      const isPlatform = ctx.user.type === "platform";
      if (!isPlatform && ctx.user.merchantId !== id) {
        return errorResponse("无权操作其他商户的 KYB", 403);
      }
      if (!isPlatform && action !== "submit") {
        return errorResponse("商户账号只能提交 KYB", 403);
      }
      if (isPlatform && action === "submit") {
        return errorResponse("平台账号不能代商户提交 KYB", 403);
      }

      const merchant = await prisma.merchant.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          kybStatus: true,
          kybRejectReason: true,
        },
      });
      if (!merchant) return errorResponse("商户不存在", 404);
      if (merchant.status !== "ACTIVE") {
        return errorResponse("商户当前不可运营，不能更新 KYB", 409);
      }

      const allowedFrom =
        action === "submit" ? ["NOT_SUBMITTED", "REJECTED"] : ["PENDING"];
      if (!allowedFrom.includes(merchant.kybStatus)) {
        return errorResponse(
          `KYB 当前状态 ${merchant.kybStatus} 不能执行 ${action}`,
          409,
        );
      }

      const nextStatus =
        action === "submit"
          ? "PENDING"
          : action === "approve"
            ? "APPROVED"
            : "REJECTED";
      const now = new Date();

      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.merchant.update({
          where: { id },
          data: {
            kybStatus: nextStatus,
            kybSubmittedAt: action === "submit" ? now : undefined,
            kybReviewedAt: action === "submit" ? null : now,
            kybRejectReason:
              action === "reject" ? validation.data.reason : null,
          },
          select: {
            id: true,
            merchantNo: true,
            status: true,
            kybStatus: true,
            kybSubmittedAt: true,
            kybReviewedAt: true,
            kybRejectReason: true,
          },
        });

        if (nextStatus !== "APPROVED") {
          await tx.merchantChannel.updateMany({
            where: { merchantId: id, isEnabled: true },
            data: { isEnabled: false },
          });
        }
        return result;
      });

      await recordAuditLog({
        platformUserId: isPlatform ? ctx.user.sub : undefined,
        merchantMemberId: isPlatform ? undefined : ctx.user.sub,
        action: `KYB_${action.toUpperCase()}`,
        resource: "merchant",
        resourceId: id,
        request: req,
        beforeData: {
          kybStatus: merchant.kybStatus,
          kybRejectReason: merchant.kybRejectReason,
        } as Prisma.InputJsonValue,
        afterData: {
          kybStatus: updated.kybStatus,
          kybRejectReason: updated.kybRejectReason,
        } as Prisma.InputJsonValue,
        result: "SUCCESS",
      });

      return successResponse(updated, `KYB 状态已更新为 ${nextStatus}`);
    },
    [
      "MERCHANT_OWNER",
      "MERCHANT_ADMIN",
      "PLATFORM_SUPER_ADMIN",
      "PLATFORM_REVIEWER",
    ],
  );
}
