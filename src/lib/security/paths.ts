export const WEBHOOK_PATHS = [
  "/api/pay/paymentfm/notify",
  "/api/pay/alipay/notify",
  "/api/pay/wechat/notify",
  "/api/pay/unionpay/notify",
] as const;

export function normalizeApiPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function isWebhookPath(pathname: string): boolean {
  const path = normalizeApiPath(pathname);
  return WEBHOOK_PATHS.some((item) => path === item || path.startsWith(`${item}/`));
}

export type RateLimitedKind =
  | "auth-write"
  | "qr"
  | "channel-write"
  | "cashier-post"
  | "cashier-get";

export function rateLimitKindForPath(
  method: string,
  pathname: string,
): RateLimitedKind | null {
  const path = normalizeApiPath(pathname);
  const verb = method.toUpperCase();
  if (isWebhookPath(path)) return null;
  if (path === "/api/pay/cashier") {
    return verb === "GET" ? "cashier-get" : verb === "POST" ? "cashier-post" : null;
  }
  if (
    path === "/api/auth/merchant" ||
    path === "/api/auth/merchant/login" ||
    path === "/api/auth/platform" ||
    path === "/api/auth/platform/login" ||
    path === "/api/merchants/register"
  ) {
    return verb === "POST" ? "auth-write" : null;
  }
  if (path === "/api/qrcodes" || path.startsWith("/api/qrcodes/")) {
    return "qr";
  }
  if (
    (path === "/api/merchant/channels/paymentfm" && (verb === "PATCH" || verb === "PUT" || verb === "POST")) ||
    (/^\/api\/merchants\/[^/]+\/channels$/.test(path) && (verb === "POST" || verb === "PATCH" || verb === "PUT"))
  ) {
    return "channel-write";
  }
  return null;
}

export const JSON_BODY_LIMIT_BYTES = 1_048_576;
