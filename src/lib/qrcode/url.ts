const PRODUCTION_PAY_ORIGIN = "https://pay.bunnyera.com";

const FORBIDDEN_URL_FRAGMENTS = [
  "secret",
  "merchantkey",
  "merchant_key",
  "privatekey",
  "apikey",
  "api_key",
];

export function normalizePayOrigin(baseUrl: string): string {
  const trimmed = (baseUrl || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed) && trimmed !== "null" && trimmed !== "undefined") {
    return trimmed;
  }
  return PRODUCTION_PAY_ORIGIN;
}

/**
 * Aggregate QR payload. Production default is https://pay.bunnyera.com/pay/{code}.
 * Dev may pass APP_BASE_URL via resolveBaseUrl. Never embed credentials.
 */
export function buildAggregatePayUrl(baseUrl: string, code: string): string {
  const origin = normalizePayOrigin(baseUrl);
  const token = (code || "").trim();
  if (!token) {
    throw new Error("QR code is required");
  }
  if (token.includes("/") || token.includes("?") || token.includes("#")) {
    throw new Error("QR code must not contain URL reserved characters");
  }
  const url = `${origin}/pay/${token}`;
  assertPayUrlHasNoSecrets(url);
  return url;
}

export function assertPayUrlHasNoSecrets(url: string): void {
  const lower = url.toLowerCase();
  for (const fragment of FORBIDDEN_URL_FRAGMENTS) {
    if (lower.includes(fragment)) {
      throw new Error("QR payload must not contain payment credentials");
    }
  }
  if (/[?&#]/.test(new URL(url).search + new URL(url).hash)) {
    throw new Error("QR payload must be a path-only pay URL");
  }
}
