export type AggregateQrScanFailure = {
  ok: false;
  status: number;
  error: string;
};

export type AggregateQrScanSuccess = { ok: true };

export type AggregateQrScanResult = AggregateQrScanSuccess | AggregateQrScanFailure;

export interface AggregateQrScanInput {
  qr: {
    isActive: boolean;
    type: "FIXED" | "DYNAMIC";
    amount: unknown;
    expiredAt?: Date | string | null;
    merchantId: string;
    storeId: string | null;
  } | null;
  merchant: { status: string } | null;
  store: { isActive: boolean; merchantId: string } | null;
  now?: Date;
}

function asTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function evaluateAggregateQrScan(input: AggregateQrScanInput): AggregateQrScanResult {
  if (!input.qr) {
    return { ok: false, status: 404, error: "收款码不存在" };
  }
  if (!input.qr.isActive) {
    return { ok: false, status: 403, error: "收款码已停用" };
  }
  const expiredAt = asTime(input.qr.expiredAt);
  const now = (input.now || new Date()).getTime();
  if (expiredAt !== null && expiredAt < now) {
    return { ok: false, status: 400, error: "收款码已过期" };
  }
  if (!input.merchant || input.merchant.status !== "ACTIVE") {
    return { ok: false, status: 403, error: "商户不可用" };
  }
  if (!input.qr.storeId || !input.store) {
    return { ok: false, status: 400, error: "该收款码未绑定分店，无法收款" };
  }
  if (!input.store.isActive) {
    return { ok: false, status: 403, error: "该分店已停用，无法收款" };
  }
  if (input.store.merchantId !== input.qr.merchantId) {
    return { ok: false, status: 400, error: "收款码与分店归属不一致" };
  }
  if (input.qr.type === "FIXED") {
    const amount = input.qr.amount;
    if (amount === null || amount === undefined || amount === "") {
      return { ok: false, status: 400, error: "固定收款码未配置金额" };
    }
  }
  return { ok: true };
}
