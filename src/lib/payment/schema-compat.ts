const CHANNEL_ENUM_MISSING = /invalid input value for enum ["']?PaymentChannel["']?/i;
const WALLET_TYPE_MISSING = /column [`']?orders\.walletType[`']? does not exist/i;

export function isMissingPaymentChannelEnum(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return CHANNEL_ENUM_MISSING.test(text) || text.includes("PAYMENTFM_AGGREGATE") && text.includes("22P02");
}

export function isMissingOrderWalletType(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return WALLET_TYPE_MISSING.test(text) || (text.includes("walletType") && text.includes("does not exist"));
}
