import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { JSON_BODY_LIMIT_BYTES, isWebhookPath } from "@/lib/security/paths";
import { robotsTagForPathname } from "@/lib/security/robots-policy";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!isWebhookPath(pathname)) {
    const lengthHeader = request.headers.get("content-length");
    const length = lengthHeader ? Number(lengthHeader) : 0;
    if (Number.isFinite(length) && length > JSON_BODY_LIMIT_BYTES) {
      return NextResponse.json(
        { success: false, error: "请求体过大" },
        { status: 413 },
      );
    }
  }

  const response = NextResponse.next();
  const robots = robotsTagForPathname(pathname);
  if (robots) response.headers.set("X-Robots-Tag", robots);
  return response;
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/admin",
    "/admin/:path*",
    "/pay",
    "/pay/:path*",
    "/preview",
    "/preview/:path*",
    "/api/:path*",
  ],
};
