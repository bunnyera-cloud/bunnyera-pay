const SENSITIVE_KEYS = new Set([
  'authorization',
  'sign',
  'signature',
  'buyer_id',
  'buyer_logon_id',
  'openid',
  'payer',
  'ciphertext',
]);

/** 生成可持久化的支付审计副本，避免密钥、签名、账号标识和密文进入业务日志。 */
export function sanitizePaymentPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizePaymentPayload);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : sanitizePaymentPayload(child),
    ])
  );
}
