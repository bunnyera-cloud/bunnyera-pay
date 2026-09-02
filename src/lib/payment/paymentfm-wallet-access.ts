export const PAYMENTFM_WALLET_READ_ROLES = [
  "MERCHANT_OWNER",
  "MERCHANT_ADMIN",
  "FINANCE",
] as const;

export const PAYMENTFM_WALLET_WRITE_ROLES = [
  "MERCHANT_OWNER",
  "MERCHANT_ADMIN",
] as const;

export function canReadPaymentFmWallets(role: string | null | undefined): boolean {
  return Boolean(role && (PAYMENTFM_WALLET_READ_ROLES as readonly string[]).includes(role));
}

export function canWritePaymentFmWallets(role: string | null | undefined): boolean {
  return Boolean(role && (PAYMENTFM_WALLET_WRITE_ROLES as readonly string[]).includes(role));
}
