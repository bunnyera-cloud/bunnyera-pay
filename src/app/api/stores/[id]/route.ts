import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { withAuth, successResponse, errorResponse } from "@/lib/api-utils";
import { canWriteAtStore, resolveStoreAccess } from "@/lib/store-access";

const patchSchema = z.object({
  isActive: z.boolean(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withAuth(
    request,
    async (req, ctx) => {
      const merchantId = ctx.user.merchantId!;
      const validation = patchSchema.safeParse(await req.json());
      if (!validation.success) return errorResponse("数据验证失败", 400);
      const scope = await resolveStoreAccess(ctx.user);
      if (!canWriteAtStore(scope, id)) {
        return errorResponse("无权操作该分店", 403);
      }
      const store = await prisma.store.findFirst({
        where: { id, brand: { merchantId } },
        select: { id: true, isActive: true },
      });
      if (!store) return errorResponse("门店不存在", 404);
      const updated = await prisma.store.update({
        where: { id: store.id },
        data: { isActive: validation.data.isActive },
        select: { id: true, name: true, isActive: true },
      });
      return successResponse(updated, validation.data.isActive ? "门店已启用" : "门店已停用");
    },
    ["MERCHANT_OWNER", "MERCHANT_ADMIN"],
  );
}
