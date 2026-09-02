import type { NextRequest } from "next/server";

export function getClientIp(request: Pick<NextRequest, "headers">): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return "unknown";
}

export function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}
