import Decimal from "decimal.js";

export const CASHIER_REUSABLE_STATUSES = ["CREATED", "PAYING"] as const;

export interface CashierReuseCandidate {
  status: string;
  amount: string | number | { toString(): string };
  channel: string;
  walletType?: string | null;
  qrcodeId?: string | null;
  expiredAt?: Date | string | null;
  payData?: string | null;
}

export function isReusableCashierOrder(
  order: CashierReuseCandidate,
  input: {
    qrcodeId: string;
    amount: string;
    channel: string;
    walletType?: string | null;
    now?: Date;
  },
): boolean {
  if (order.qrcodeId !== input.qrcodeId) return false;
  if (order.channel !== input.channel) return false;
  if ((order.walletType || null) !== (input.walletType || null)) return false;
  try {
    if (!new Decimal(String(order.amount)).equals(new Decimal(input.amount))) {
      return false;
    }
  } catch {
    return false;
  }
  if (!CASHIER_REUSABLE_STATUSES.includes(order.status as (typeof CASHIER_REUSABLE_STATUSES)[number])) {
    return false;
  }
  const expiredAt = order.expiredAt
    ? order.expiredAt instanceof Date
      ? order.expiredAt.getTime()
      : new Date(order.expiredAt).getTime()
    : null;
  const now = (input.now || new Date()).getTime();
  if (expiredAt !== null && expiredAt <= now) return false;
  return true;
}

export function cashierDuplicateInFlight(order: CashierReuseCandidate): boolean {
  return order.status === "CREATED" && !order.payData;
}
