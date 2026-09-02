export function logSuspiciousTraffic(event: {
  type: string;
  ip?: string;
  merchantId?: string;
  userId?: string;
  qrCode?: string;
  detail?: string;
}): void {
  console.warn(
    "[security.suspicious]",
    JSON.stringify({
      at: new Date().toISOString(),
      type: event.type,
      ip: event.ip || "unknown",
      merchantId: event.merchantId || null,
      userId: event.userId || null,
      qrCode: event.qrCode ? `${event.qrCode.slice(0, 8)}…` : null,
      detail: event.detail || null,
    }),
  );
}
