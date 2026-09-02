const SENSITIVE_RESPONSE_KEYS = new Set([
  "merchantkey",
  "merchant_key",
  "paymentfm_merchant_key",
  "privatekey",
  "apikey",
  "apiv3key",
  "password",
  "passwordhash",
  "unionpaycert",
  "unionpaycertpassword",
  "jwt_secret",
  "database_url",
  "payment_config_encryption_key",
]);

export function isSensitiveResponseKey(key: string): boolean {
  return SENSITIVE_RESPONSE_KEYS.has(key.toLowerCase());
}

export function stripSensitiveApiFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripSensitiveApiFields(item)) as T;
  }
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    if (isSensitiveResponseKey(key)) return [];
    return [[key, stripSensitiveApiFields(child)]];
  });
  return Object.fromEntries(entries) as T;
}

export function containsSensitiveApiFields(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveApiFields);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => isSensitiveResponseKey(key) || containsSensitiveApiFields(child),
  );
}
