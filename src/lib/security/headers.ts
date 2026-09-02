export interface SecurityHeaderOptions {
  production?: boolean;
  https?: boolean;
}

export function buildContentSecurityPolicy(isDev: boolean): string {
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function buildSecurityHeaders(options: SecurityHeaderOptions = {}): Array<{
  key: string;
  value: string;
}> {
  const production = options.production === true;
  const https = options.https === true;
  const headers: Array<{ key: string; value: string }> = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(!production),
    },
  ];
  if (production && https) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }
  return headers;
}

export function isProductionHttps(
  nodeEnv = process.env.NODE_ENV,
  appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "",
): boolean {
  return nodeEnv === "production" && appBaseUrl.startsWith("https://");
}
