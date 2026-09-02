export const SHOP_ORDER_SOURCE = "SHOP";

export function formatShopAmount(amount: number | string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    throw new Error("SHOP_AMOUNT_INVALID");
  }
  return value.toFixed(2);
}

export function buildShopCashierUrl(
  baseUrl: string,
  orderNo: string,
  statusToken: string,
): string {
  return `${baseUrl.replace(/\/+$/, "")}/pay/order/${orderNo}?token=${statusToken}`;
}

export function resolveShopCheckoutReplay(input: {
  existingAmount: string;
  requestedAmount: string;
  status: string;
}):
  | { action: "REUSE" }
  | { action: "ALREADY_PAID" }
  | { action: "REJECT"; error: "SHOP_ORDER_AMOUNT_MISMATCH" | "SHOP_ORDER_NOT_REUSABLE" } {
  if (input.existingAmount !== input.requestedAmount) {
    return { action: "REJECT", error: "SHOP_ORDER_AMOUNT_MISMATCH" };
  }
  if (input.status === "PAID") return { action: "ALREADY_PAID" };
  if (input.status === "CREATED" || input.status === "PAYING") {
    return { action: "REUSE" };
  }
  return { action: "REJECT", error: "SHOP_ORDER_NOT_REUSABLE" };
}

export function isReusableShopWallet(input: {
  status: string;
  existingWalletType: string | null;
  requestedWalletType: string;
  hasPayData: boolean;
}):
  | { action: "REUSE" }
  | { action: "START" }
  | {
      action: "REJECT";
      error:
        | "SHOP_ORDER_ALREADY_PAID"
        | "SHOP_ORDER_WALLET_LOCKED"
        | "SHOP_ORDER_NOT_PAYABLE";
    } {
  if (input.status === "PAID") {
    return { action: "REJECT", error: "SHOP_ORDER_ALREADY_PAID" };
  }
  if (input.status === "PAYING" && input.hasPayData) {
    if (
      input.existingWalletType &&
      input.existingWalletType !== input.requestedWalletType
    ) {
      return { action: "REJECT", error: "SHOP_ORDER_WALLET_LOCKED" };
    }
    return { action: "REUSE" };
  }
  if (input.status === "CREATED" || input.status === "PAYING") {
    return { action: "START" };
  }
  return { action: "REJECT", error: "SHOP_ORDER_NOT_PAYABLE" };
}
