import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { recordAuditLog } from "@/lib/audit";
import { getClientIp } from "@/lib/security/client-ip";
import { limitAuthWrite } from "@/lib/security/cashier-guard";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { runFirstSuperAdminBootstrap } from "@/lib/platform/bootstrap-run";

function providedBootstrapSecret(request: NextRequest): string | null {
  const header =
    request.headers.get("x-admin-bootstrap-secret") ||
    request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim() || null;
  return header?.trim() || null;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limited = await limitAuthWrite({ ip });
  if (limited) return rateLimitResponse(limited);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求无效" }, { status: 400 });
  }

  const result = await runFirstSuperAdminBootstrap(prisma, {
    email: typeof body.email === "string" ? body.email : "",
    name: typeof body.name === "string" ? body.name : "",
    password: typeof body.password === "string" ? body.password : "",
    providedSecret: providedBootstrapSecret(request),
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status },
    );
  }

  await recordAuditLog({
    platformUserId: result.user.id,
    action: "PLATFORM_BOOTSTRAP",
    resource: "platform_user",
    resourceId: result.user.id,
    request,
    afterData: { email: result.user.email, role: result.user.role },
    result: "SUCCESS",
  });

  return NextResponse.json({
    success: true,
    data: result.user,
    message: "首个 Super Admin 已创建",
  });
}

export async function GET() {
  const userCount = await prisma.platformUser.count();
  return NextResponse.json(
    { success: false, error: userCount > 0 ? "Gone" : "禁止初始化" },
    { status: userCount > 0 ? 410 : 403 },
  );
}
