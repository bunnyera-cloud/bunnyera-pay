import { SignJWT, jwtVerify } from "jose";
import { randomBytes, randomInt } from "node:crypto";

function jwtSecret(): Uint8Array {
  const configured = (process.env.JWT_SECRET || "").trim();
  if (configured.length >= 32) return new TextEncoder().encode(configured);
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET must be configured with at least 32 characters",
    );
  }
  return new TextEncoder().encode("development-only-secret-change-me");
}

export interface JwtPayload {
  sub: string; // user/member ID
  type: "platform" | "merchant";
  merchantId?: string;
  role: string;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN || "24h")
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
  const timestamp = chinaStandardTimestamp();
  const rand = secureCode(10);
  return `BEP${timestamp}${rand}`;
}

export function generateMerchantNo(): string {
  const date = chinaStandardTimestamp().slice(0, 8);
  const rand = secureCode(10);
  return `MEP${date}${rand}`;
}

export function generateRefundNo(): string {
  // 银联退款查单必须使用原退款交易的 txnTime，因此将北京时间精确到秒写入退款单号。
  const timestamp = chinaStandardTimestamp();
  const rand = secureCode(10);
  return `REF${timestamp}${rand}`;
}

export function generateApiAppId(): string {
  return `app_${Date.now().toString(36)}_${randomBytes(8).toString("hex")}`;
}

export function generateApiAppSecret(): string {
  return randomBytes(36).toString("base64url");
}

function secureCode(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += alphabet[randomInt(0, alphabet.length)];
  }
  return value;
}

function chinaStandardTimestamp(now = new Date()): string {
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return [
    chinaTime.getUTCFullYear(),
    String(chinaTime.getUTCMonth() + 1).padStart(2, "0"),
    String(chinaTime.getUTCDate()).padStart(2, "0"),
    String(chinaTime.getUTCHours()).padStart(2, "0"),
    String(chinaTime.getUTCMinutes()).padStart(2, "0"),
    String(chinaTime.getUTCSeconds()).padStart(2, "0"),
  ].join("");
}
