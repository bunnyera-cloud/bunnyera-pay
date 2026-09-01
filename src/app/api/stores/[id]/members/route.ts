import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/db";
import { withAuth, errorResponse, successResponse } from "@/lib/api-utils";
import { recordAuditLog } from "@/lib/audit";
import { assertMerchantMemberStoreGrant } from "@/lib/store-access";

const assignmentSchema = z.object({
  memberId: z.string().uuid(),
  assigned: z.boolean(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withAuth(
    request,
    async (_req, ctx) => {
      const store = await prisma.store.findFirst({
        where: { id, brand: { merchantId: ctx.user.merchantId } },
        select: { id: true },
      });
      if (!store) return errorResponse("门店不存在", 404);

      const assignments = await prisma.merchantMemberStore.findMany({
        where: { storeId: id, member: { merchantId: ctx.user.merchantId } },
        select: {
          createdAt: true,
          member: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
      return successResponse(assignments);
    },
    ["MERCHANT_OWNER", "MERCHANT_ADMIN"],
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withAuth(
    request,
    async (req, ctx) => {
      const validation = assignmentSchema.safeParse(await req.json());
      if (!validation.success) {
        return errorResponse("门店成员授权参数无效", 400);
      }

      const merchantId = ctx.user.merchantId!;
      const { memberId, assigned } = validation.data;
      const [store, member] = await Promise.all([
        prisma.store.findFirst({
          where: { id },
          select: { id: true, brand: { select: { merchantId: true } } },
        }),
        prisma.merchantMember.findFirst({
          where: { id: memberId, isActive: true },
          select: { id: true, role: true, merchantId: true },
        }),
      ]);
      if (!store) return errorResponse("门店不存在", 404);
      if (!member) return errorResponse("商户成员不存在或已停用", 404);
      const grant = assertMerchantMemberStoreGrant({
        actorMerchantId: merchantId,
        memberMerchantId: member.merchantId,
        storeMerchantId: store.brand.merchantId,
        memberRole: member.role,
      });
      if (!grant.ok) {
        if (store.brand.merchantId !== merchantId) {
          return errorResponse("门店不存在", 404);
        }
        if (member.merchantId !== merchantId) {
          return errorResponse("商户成员不存在或已停用", 404);
        }
        return errorResponse(grant.error, 409);
      }

      if (assigned) {
        await prisma.merchantMemberStore.upsert({
          where: { memberId_storeId: { memberId, storeId: id } },
          create: { memberId, storeId: id },
          update: {},
        });
      } else {
        await prisma.merchantMemberStore.deleteMany({
          where: { memberId, storeId: id },
        });
      }

      await recordAuditLog({
        merchantMemberId: ctx.user.sub,
        action: assigned ? "STORE_MEMBER_ASSIGN" : "STORE_MEMBER_UNASSIGN",
        resource: "store",
        resourceId: id,
        request: req,
        afterData: { memberId, assigned } as Prisma.InputJsonValue,
        result: "SUCCESS",
      });

      return successResponse(
        { storeId: id, memberId, assigned },
        assigned ? "分店权限已授予" : "分店权限已撤销",
      );
    },
    ["MERCHANT_OWNER", "MERCHANT_ADMIN"],
  );
}
