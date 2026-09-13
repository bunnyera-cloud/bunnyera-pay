import { timingSafeEqual } from "node:crypto";

export const ADMIN_BOOTSTRAP_SECRET_ENV = "ADMIN_BOOTSTRAP_SECRET";

export type BootstrapDecision =
  | { ok: true }
  | { ok: false; status: 403 | 410; error: string };

export function configuredBootstrapSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const secret = (env[ADMIN_BOOTSTRAP_SECRET_ENV] || "").trim();
  if (secret.length < 32) return null;
  return secret;
}

export function secretsMatch(
  expected: string,
  provided: string | null | undefined,
): boolean {
  if (!provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function decideBootstrap(input: {
  userCount: number;
  configuredSecret: string | null;
  providedSecret: string | null | undefined;
}): BootstrapDecision {
  if (input.userCount > 0) {
    return { ok: false, status: 410, error: "Gone" };
  }
  if (!input.configuredSecret) {
    return { ok: false, status: 403, error: "禁止初始化" };
  }
  if (!secretsMatch(input.configuredSecret, input.providedSecret)) {
    return { ok: false, status: 403, error: "禁止初始化" };
  }
  return { ok: true };
}

export function isValidBootstrapPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 12 && password.length <= 128;
}

export function isValidBootstrapEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
