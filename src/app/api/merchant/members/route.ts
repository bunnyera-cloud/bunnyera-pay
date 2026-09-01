import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/db";
import { withAuth, errorResponse, successResponse } from "@/lib/api-utils";
import { recordAuditLog } from "@/lib/audit";
import {
  assertMerchantMemberStoreGrant,
  assertRequestedStoresOwnedByMerchant,
} from "@/lib/store-access";

const HEADQUARTERS_ROLES = new Set(["MERCHANT_ADMIN", "FINANCE"]);

const createMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(6).max(32).optional(),
  password: z.string().min(12).max(128),
  role: z.enum([
    "MERCHANT_ADMIN",
    "FINANCE",
    "STORE_MANAGER",
    "CASHIER",
    "CUSTOMER_SERVICE",
    "AUDITOR",
  ]),
  storeIds: z.array(z.string().uuid()).max(50).default([]),
});

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req, ctx) => {
      const validation = createMemberSchema.safeParse(await req.json());
      if (!validation.success) {
        return errorResponse("成员资料无效", 400);
      }

      const merchantId = ctx.user.merchantId!;
      const data = validation.data;
      const isHeadquartersRole = HEADQUARTERS_ROLES.has(data.role);
      if (!isHeadquartersRole && data.storeIds.length === 0) {
        return errorResponse("分店账号必须至少授权一个分店", 400);
      }
      if (isHeadquartersRole && data.storeIds.length > 0) {
        return errorResponse("总部角色默认查看全部分店，不能设置分店范围", 400);
      }

      const existing = await prisma.merchantMember.findUnique({
        where: { email: data.email },
        select: { id: true },
      });
      if (existing) return errorResponse("该邮箱已被成员账号使用", 409);

      const uniqueStoreIds = [...new Set(data.storeIds)];
      if (uniqueStoreIds.length > 0) {
        const stores = await prisma.store.findMany({
          where: { id: { in: uniqueStoreIds }, isActive: true },
          select: { id: true, brand: { select: { merchantId: true } } },
        });
        const ownedStoreIds = stores
          .filter((store) => store.brand.merchantId === merchantId)
          .map((store) => store.id);
        const owned = assertRequestedStoresOwnedByMerchant(
          uniqueStoreIds,
          ownedStoreIds,
        );
        if (!owned.ok) return errorResponse(owned.error, 400);
        for (const store of stores) {
          const grant = assertMerchantMemberStoreGrant({
            actorMerchantId: merchantId,
            memberMerchantId: merchantId,
            storeMerchantId: store.brand.merchantId,
            memberRole: data.role,
          });
          if (!grant.ok) return errorResponse(grant.error, 400);
        }
      }

      const passwordHash = await bcrypt.hash(data.password, 12);
      const member = await prisma.$transaction(async (tx) => {
        const created = await tx.merchantMember.create({
          data: {
            merchantId,
            email: data.email,
            name: data.name,
            phone: data.phone,
            passwordHash,
            role: data.role,
            isActive: true,
          },
          select: {
            id: true,
            merchantId: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        });

        if (uniqueStoreIds.length > 0) {
          await tx.merchantMemberStore.createMany({
            data: uniqueStoreIds.map((storeId) => ({
              memberId: created.id,
              storeId,
            })),
          });
        }
        return created;
      });

      await recordAuditLog({
        merchantMemberId: ctx.user.sub,
        action: "MERCHANT_MEMBER_CREATE",
        resource: "merchant_member",
        resourceId: member.id,
        request: req,
        afterData: {
          email: member.email,
          role: member.role,
          storeIds: uniqueStoreIds,
        },
        result: "SUCCESS",
      });

      return successResponse(
        { ...member, storeIds: uniqueStoreIds },
        "成员账号已创建",
      );
    },
    ["MERCHANT_OWNER", "MERCHANT_ADMIN"],
  );
}

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async (_req, ctx) => {
      const members = await prisma.merchantMember.findMany({
        where: { merchantId: ctx.user.merchantId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          storeAccesses: {
            select: {
              store: {
                select: {
                  id: true,
                  name: true,
                  brand: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
      return successResponse(members);
    },
    ["MERCHANT_OWNER", "MERCHANT_ADMIN"],
  );
}
