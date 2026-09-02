import Decimal from "decimal.js";

export const QR_MAX_AMOUNT = 1_000_000;
export const QR_AMOUNT_SCALE = 2;

export type AmountResult =
  | { ok: true; amount: Decimal }
  | { ok: false; error: string };

function decimalFromUnknown(raw: unknown): AmountResult {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, error: "请输入支付金额" };
  }
  let text: string;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, error: "支付金额格式错误" };
    text = new Decimal(raw).toFixed();
  } else if (typeof raw === "string") {
    text = raw.trim();
  } else if (Decimal.isDecimal(raw)) {
    text = raw.toFixed();
  } else if (typeof raw === "object" && raw !== null && "toString" in raw) {
    text = String((raw as { toString(): string }).toString()).trim();
  } else {
    return { ok: false, error: "支付金额格式错误" };
  }
  if (!/^\d+(\.\d+)?$/.test(text)) {
    return { ok: false, error: "支付金额格式错误" };
  }
  let amount: Decimal;
  try {
    amount = new Decimal(text);
  } catch {
    return { ok: false, error: "支付金额格式错误" };
  }
  if (!amount.isFinite() || amount.lte(0)) {
    return { ok: false, error: "金额必须大于 0" };
  }
  if (amount.decimalPlaces() > QR_AMOUNT_SCALE) {
    return { ok: false, error: "金额最多保留两位小数" };
  }
  if (amount.gt(QR_MAX_AMOUNT)) {
    return { ok: false, error: "金额超过上限" };
  }
  return { ok: true, amount };
}

export function parsePayAmount(raw: unknown): AmountResult {
  return decimalFromUnknown(raw);
}

/**
 * FIXED: server amount from the QR row; a different client amount is rejected.
 * DYNAMIC: client amount, never trusted as a formatted string beyond Decimal rules.
 */
export function resolveQrPayAmount(input: {
  type: "FIXED" | "DYNAMIC";
  qrAmount: unknown;
  clientAmount?: unknown;
}): AmountResult {
  if (input.type === "FIXED") {
    const fixed = decimalFromUnknown(input.qrAmount);
    if (!fixed.ok) {
      return { ok: false, error: "固定收款码未配置金额" };
    }
    if (input.clientAmount !== undefined && input.clientAmount !== null && input.clientAmount !== "") {
      const client = decimalFromUnknown(input.clientAmount);
      if (!client.ok || !client.amount.equals(fixed.amount)) {
        return { ok: false, error: "支付金额与固定收款码不一致" };
      }
    }
    return fixed;
  }

  return decimalFromUnknown(input.clientAmount);
}

export function amountsEqual(left: unknown, right: unknown): boolean {
  const a = decimalFromUnknown(left);
  const b = decimalFromUnknown(right);
  return a.ok && b.ok && a.amount.equals(b.amount);
}
