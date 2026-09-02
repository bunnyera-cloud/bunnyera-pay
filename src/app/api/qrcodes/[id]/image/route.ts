import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-utils";
import { withRateLimitedAuth } from "@/lib/security/api-guard";
import { resolveBaseUrl } from "@/lib/payment/config";
import { buildAggregatePayUrl } from "@/lib/qrcode/url";
import { qrDownloadFilename, renderPlainQrPng } from "@/lib/qrcode/image";
import { loadOwnedQrCode, QR_READ_ROLES } from "@/lib/qrcode/owned";

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
      const payUrl = buildAggregatePayUrl(resolveBaseUrl(req.headers), loaded.qr.code);
      const png = await renderPlainQrPng(payUrl);
      return new NextResponse(new Uint8Array(png), {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `attachment; filename="${qrDownloadFilename(loaded.qr.code, "png")}"`,
          "Cache-Control": "private, no-store",
        },
      });
    },
    [...QR_READ_ROLES],
    "qr",
  );
}
