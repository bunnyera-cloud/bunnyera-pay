export const PLATFORM_ROLES = [
  "PLATFORM_SUPER_ADMIN",
  "PLATFORM_REVIEWER",
] as const;

export const MERCHANT_MEMBER_ROLES = [
  "MERCHANT_OWNER",
  "MERCHANT_ADMIN",
  "FINANCE",
  "STORE_MANAGER",
  "CASHIER",
  "CUSTOMER_SERVICE",
  "AUDITOR",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type MerchantMemberRole = (typeof MERCHANT_MEMBER_ROLES)[number];

export function isPlatformRole(role: string | null | undefined): role is PlatformRole {
  return Boolean(role && (PLATFORM_ROLES as readonly string[]).includes(role));
}

export function isMerchantMemberRole(
  role: string | null | undefined,
): role is MerchantMemberRole {
  return Boolean(role && (MERCHANT_MEMBER_ROLES as readonly string[]).includes(role));
}

export function assertMerchantMemberRole(
  role: string | null | undefined,
): asserts role is MerchantMemberRole {
  if (!isMerchantMemberRole(role)) {
    throw new Error("MerchantMember cannot use a platform role");
  }
}

export function platformRoleLabel(role: string): string {
  if (role === "PLATFORM_SUPER_ADMIN") return "Super Admin";
  if (role === "PLATFORM_REVIEWER") return "Reviewer";
  return role;
}
