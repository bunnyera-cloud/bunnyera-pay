import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { withRateLimitedAuth } from "@/lib/security/api-guard";
import { resolveBaseUrl } from "@/lib/payment/config";
import {
  loadOwnedQrCode,
  loadQrBindings,
  presentQrCode,
  QR_READ_ROLES,
  QR_WRITE_ROLES,
} from "@/lib/qrcode/owned";

const patchSchema = z
  .object({
    isActive: z.boolean().optional(),
    name: z.string().min(1).max(100).optional(),
  })
  .refine((data) => data.isActive !== undefined || data.name !== undefined, {
    message: "没有可更新的字段",
  });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRateLimitedAuth(
    request,
    async (req, ctx) => {
      const loaded = await loadOwnedQrCode(id, ctx.user, "read");
      if (!loaded.qr) return errorResponse(loaded.error, loaded.status);
      const bindings = await loadQrBindings(loaded.qr);
      return successResponse(
        presentQrCode(loaded.qr, resolveBaseUrl(req.headers), bindings),
      );
    },
    [...QR_READ_ROLES],
    "qr",
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRateLimitedAuth(
    request,
    async (req, ctx) => {
      const loaded = await loadOwnedQrCode(id, ctx.user, "write");
      if (!loaded.qr) return errorResponse(loaded.error, loaded.status);
      const validation = patchSchema.safeParse(await req.json());
      if (!validation.success) {
        return errorResponse("数据验证失败", 400);
      }
      const updated = await prisma.qRCode.update({
        where: { id: loaded.qr.id },
        data: validation.data,
        include: {
          merchant: { select: { companyName: true, merchantNo: true } },
          store: {
            select: {
              id: true,
              name: true,
              isActive: true,
              brand: { select: { name: true } },
            },
          },
        },
      });
      const bindings = await loadQrBindings(updated);
      return successResponse(
        presentQrCode(updated, resolveBaseUrl(req.headers), bindings),
        validation.data.isActive === false ? "收款码已停用" : "收款码已更新",
      );
    },
    [...QR_WRITE_ROLES],
    "qr",
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRateLimitedAuth(
    request,
    async (req, ctx) => {
      const loaded = await loadOwnedQrCode(id, ctx.user, "write");
      if (!loaded.qr) return errorResponse(loaded.error, loaded.status);
      const updated = await prisma.qRCode.update({
        where: { id: loaded.qr.id },
        data: { isActive: false },
        include: {
          merchant: { select: { companyName: true, merchantNo: true } },
          store: {
            select: {
              id: true,
              name: true,
              isActive: true,
              brand: { select: { name: true } },
            },
          },
        },
      });
      const bindings = await loadQrBindings(updated);
      return successResponse(
        presentQrCode(updated, resolveBaseUrl(req.headers), bindings),
        "收款码已停用",
      );
    },
    [...QR_WRITE_ROLES],
    "qr",
  );
}
