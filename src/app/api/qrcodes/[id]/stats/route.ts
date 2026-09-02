import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { withRateLimitedAuth } from "@/lib/security/api-guard";
import { loadOwnedQrCode, QR_READ_ROLES } from "@/lib/qrcode/owned";
import { startOfLocalDay, summarizeQrCodeStats } from "@/lib/qrcode/stats";
import { isMissingOrderWalletType } from "@/lib/payment/schema-compat";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRateLimitedAuth(
    request,
    async (_req, ctx) => {
      const loaded = await loadOwnedQrCode(id, ctx.user, "read");
      if (!loaded.qr) return errorResponse(loaded.error, loaded.status);
      const today = startOfLocalDay();
      const where = {
        merchantId: loaded.qr.merchantId,
        qrcodeId: loaded.qr.id,
        OR: [
          { createdAt: { gte: today } },
          { status: "PAID" as const },
        ],
      };
      let rows: Array<{
        status: string;
        amount: { toString(): string };
        walletType?: string | null;
        createdAt: Date;
        paidAt: Date | null;
      }>;
      try {
        rows = await prisma.order.findMany({
          where,
          select: {
            status: true,
            amount: true,
            walletType: true,
            createdAt: true,
            paidAt: true,
          },
        });
      } catch (error) {
        if (!isMissingOrderWalletType(error)) throw error;
        rows = await prisma.order.findMany({
          where,
          select: {
            status: true,
            amount: true,
            createdAt: true,
            paidAt: true,
          },
        });
      }
      return successResponse(
        summarizeQrCodeStats(
          rows.map((row) => ({
            status: row.status,
            amount: row.amount.toString(),
            walletType: row.walletType ?? null,
            createdAt: row.createdAt,
            paidAt: row.paidAt,
          })),
        ),
      );
    },
    [...QR_READ_ROLES],
    "qr",
  );
}
