import { consumeFirstExceeded, hashIdentity, type RateLimitHit } from "./rate-limit";
import { logSuspiciousTraffic } from "./suspicious";

const MINUTE = 60_000;

export async function limitCashierPost(input: {
  ip: string;
  code?: string;
}): Promise<RateLimitHit | null> {
  const checks = [
    { key: `cashier:ip:${input.ip}`, limit: 60, windowMs: MINUTE },
  ];
  if (input.code) {
    checks.push({ key: `cashier:qr:${hashIdentity(input.code)}`, limit: 120, windowMs: MINUTE });
    checks.push({
      key: `cashier:ip-qr:${input.ip}:${hashIdentity(input.code)}`,
      limit: 30,
      windowMs: MINUTE,
    });
  }
  const exceeded = await consumeFirstExceeded(checks);
  if (exceeded && input.code) {
    logSuspiciousTraffic({
      type: "CASHIER_HIGH_FREQUENCY",
      ip: input.ip,
      qrCode: input.code,
      detail: `count=${exceeded.count} limit=${exceeded.limit}`,
    });
  }
  return exceeded;
}

export async function limitCashierMerchant(merchantId: string): Promise<RateLimitHit | null> {
  return consumeFirstExceeded([
    { key: `cashier:merchant:${merchantId}`, limit: 180, windowMs: MINUTE },
  ]);
}

export async function limitCashierGet(input: {
  ip: string;
  orderNo?: string;
}): Promise<RateLimitHit | null> {
  const checks = [{ key: `cashier-get:ip:${input.ip}`, limit: 180, windowMs: MINUTE }];
  if (input.orderNo) {
    checks.push({
      key: `cashier-get:order:${hashIdentity(input.orderNo)}`,
      limit: 120,
      windowMs: MINUTE,
    });
  }
  return consumeFirstExceeded(checks);
}

export async function limitIllegalCashierAmount(input: {
  ip: string;
  code?: string;
}): Promise<RateLimitHit | null> {
  const key = input.code
    ? `cashier:bad-amount:${input.ip}:${hashIdentity(input.code)}`
    : `cashier:bad-amount:${input.ip}`;
  const exceeded = await consumeFirstExceeded([{ key, limit: 10, windowMs: MINUTE }]);
  if (exceeded) {
    logSuspiciousTraffic({
      type: "CASHIER_ILLEGAL_AMOUNT",
      ip: input.ip,
      qrCode: input.code,
      detail: `count=${exceeded.count}`,
    });
  }
  return exceeded;
}

export async function limitQrEnumeration(input: { ip: string; code?: string }): Promise<RateLimitHit | null> {
  const exceeded = await consumeFirstExceeded([
    { key: `cashier:enum:${input.ip}`, limit: 15, windowMs: MINUTE },
  ]);
  logSuspiciousTraffic({
    type: "QR_ENUMERATION",
    ip: input.ip,
    qrCode: input.code,
    detail: exceeded ? `blocked count=${exceeded.count}` : "miss",
  });
  return exceeded;
}

export async function limitAuthWrite(input: {
  ip: string;
  identity?: string;
  includeIp?: boolean;
}): Promise<RateLimitHit | null> {
  const checks: Array<{ key: string; limit: number; windowMs: number }> = [];
  if (input.includeIp !== false) {
    checks.push({ key: `auth:ip:${input.ip}`, limit: 20, windowMs: MINUTE });
  }
  if (input.identity) {
    checks.push({
      key: `auth:id:${hashIdentity(input.identity)}`,
      limit: 10,
      windowMs: MINUTE,
    });
  }
  if (checks.length === 0) return null;
  return consumeFirstExceeded(checks);
}

export async function limitQrApi(input: {
  ip: string;
  userId?: string;
  merchantId?: string;
  includeIp?: boolean;
}): Promise<RateLimitHit | null> {
  const checks: Array<{ key: string; limit: number; windowMs: number }> = [];
  if (input.includeIp !== false) {
    checks.push({ key: `qr:ip:${input.ip}`, limit: 90, windowMs: MINUTE });
  }
  if (input.userId) {
    checks.push({ key: `qr:user:${input.userId}`, limit: 90, windowMs: MINUTE });
  }
  if (input.merchantId) {
    checks.push({ key: `qr:merchant:${input.merchantId}`, limit: 180, windowMs: MINUTE });
  }
  if (checks.length === 0) return null;
  return consumeFirstExceeded(checks);
}

export async function limitChannelWrite(input: {
  ip: string;
  userId?: string;
  merchantId?: string;
  includeIp?: boolean;
}): Promise<RateLimitHit | null> {
  const checks: Array<{ key: string; limit: number; windowMs: number }> = [];
  if (input.includeIp !== false) {
    checks.push({ key: `channel:ip:${input.ip}`, limit: 30, windowMs: MINUTE });
  }
  if (input.userId) {
    checks.push({ key: `channel:user:${input.userId}`, limit: 30, windowMs: MINUTE });
  }
  if (input.merchantId) {
    checks.push({ key: `channel:merchant:${input.merchantId}`, limit: 30, windowMs: MINUTE });
  }
  if (checks.length === 0) return null;
  return consumeFirstExceeded(checks);
}
