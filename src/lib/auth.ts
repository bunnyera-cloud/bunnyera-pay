import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, randomInt } from 'node:crypto';

function jwtSecret(): Uint8Array {
  const configured = (process.env.JWT_SECRET || '').trim();
  if (configured.length >= 32) return new TextEncoder().encode(configured);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  return new TextEncoder().encode('development-only-secret-change-me');
}

export interface JwtPayload {
  sub: string; // user/member ID
  type: 'platform' | 'merchant';
  merchantId?: string;
  role: string;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN || '24h')
    .sign(jwtSecret());
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export function generateOrderNo(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const rand = secureCode(10);
  return `BEP${date}${time}${rand}`;
}

export function generateMerchantNo(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = secureCode(10);
  return `MEP${date}${rand}`;
}

export function generateRefundNo(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = secureCode(10);
  return `REF${date}${rand}`;
}

export function generateApiAppId(): string {
  return `app_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
}

export function generateApiAppSecret(): string {
  return randomBytes(36).toString('base64url');
}

function secureCode(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += alphabet[randomInt(0, alphabet.length)];
  }
  return value;
}
