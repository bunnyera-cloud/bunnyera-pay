import { isPlatformRole, type PlatformRole } from "./roles";

export type PlatformUserRecord = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { sessions: number };
  passwordHash?: string;
  mfaSecret?: string | null;
  mfaEnabled?: boolean;
};

export type SafePlatformUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sessionCount: number;
};

const SENSITIVE_USER_KEYS = [
  "passwordHash",
  "mfaSecret",
  "sessions",
  "token",
] as const;

export function toSafePlatformUser(user: PlatformUserRecord): SafePlatformUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    sessionCount: user._count?.sessions ?? 0,
  };
}

export function containsPlatformSecrets(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsPlatformSecrets);
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    if ((SENSITIVE_USER_KEYS as readonly string[]).includes(key)) return true;
    return containsPlatformSecrets(child);
  });
}

export function parsePlatformUserRole(role: unknown): PlatformRole | null {
  return typeof role === "string" && isPlatformRole(role) ? role : null;
}

export function canMutateLastSuperAdmin(input: {
  targetRole: string;
  targetIsActive: boolean;
  nextRole?: string;
  nextActive?: boolean;
  activeSuperAdminCount: number;
}): { ok: true } | { ok: false; error: string } {
  const willBeActiveSuper =
    (input.nextRole ?? input.targetRole) === "PLATFORM_SUPER_ADMIN" &&
    (input.nextActive ?? input.targetIsActive);
  if (willBeActiveSuper) return { ok: true };
  if (
    input.activeSuperAdminCount <= 1 &&
    input.targetRole === "PLATFORM_SUPER_ADMIN" &&
    input.targetIsActive
  ) {
    return { ok: false, error: "不能停用或降级唯一的 Super Admin" };
  }
  return { ok: true };
}
