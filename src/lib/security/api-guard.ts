import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/api-utils";
import { getClientIp } from "./client-ip";
import { rateLimitResponse } from "./rate-limit";
import { limitChannelWrite, limitQrApi } from "./cashier-guard";

export async function withRateLimitedAuth(
  request: NextRequest,
  handler: (req: NextRequest, ctx: AuthContext) => Promise<NextResponse>,
  requiredRoles: string[] | undefined,
  kind: "qr" | "channel-write",
  targetMerchantId?: string,
): Promise<NextResponse> {
  const ip = getClientIp(request);
  const pre = kind === "qr"
    ? await limitQrApi({ ip })
    : await limitChannelWrite({ ip });
  if (pre) return rateLimitResponse(pre);

  return withAuth(
    request,
    async (req, ctx) => {
      const merchantId = targetMerchantId || ctx.user.merchantId;
      const tenant = kind === "qr"
        ? await limitQrApi({
            ip,
            userId: ctx.user.sub,
            merchantId,
            includeIp: false,
          })
        : await limitChannelWrite({
            ip,
            userId: ctx.user.sub,
            merchantId,
            includeIp: false,
          });
      if (tenant) return rateLimitResponse(tenant);
      return handler(req, ctx);
    },
    requiredRoles,
  );
}
