import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { errorResponse, paginatedResponse } from "@/lib/api-utils";
import { withRateLimitedAuth } from "@/lib/security/api-guard";
import { loadOwnedQrCode, QR_READ_ROLES } from "@/lib/qrcode/owned";
import { isMissingOrderWalletType } from "@/lib/payment/schema-compat";

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
      const url = new URL(req.url);
      const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
      const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") || 20) || 20));
      const where = {
        merchantId: loaded.qr.merchantId,
        qrcodeId: loaded.qr.id,
      };
      const orderSelect = {
        id: true,
        orderNo: true,
        amount: true,
        status: true,
        walletType: true,
        channel: true,
        channelTradeNo: true,
        storeId: true,
        counterId: true,
        operatorId: true,
        qrcodeId: true,
        createdAt: true,
        paidAt: true,
      } as const;
      let total: number;
      let orders: Array<{
        id: string;
        orderNo: string;
        amount: { toString(): string } | number;
        status: string;
        walletType?: string | null;
        channel: string;
        channelTradeNo: string | null;
        storeId: string | null;
        counterId: string | null;
        operatorId: string | null;
        qrcodeId: string | null;
        createdAt: Date;
        paidAt: Date | null;
      }>;
      try {
        [total, orders] = await Promise.all([
          prisma.order.count({ where }),
          prisma.order.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: orderSelect,
          }),
        ]);
      } catch (error) {
        if (!isMissingOrderWalletType(error)) throw error;
        [total, orders] = await Promise.all([
          prisma.order.count({ where }),
          prisma.order.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
              id: true,
              orderNo: true,
              amount: true,
              status: true,
              channel: true,
              channelTradeNo: true,
              storeId: true,
              counterId: true,
              operatorId: true,
              qrcodeId: true,
              createdAt: true,
              paidAt: true,
            },
          }),
        ]);
      }
      return paginatedResponse(
        orders.map((order) => ({
          ...order,
          walletType: order.walletType ?? null,
          amount: Number(order.amount),
          paymentChannel: order.channel,
        })),
        total,
        page,
        pageSize,
      );
    },
    [...QR_READ_ROLES],
    "qr",
  );
}
