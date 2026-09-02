import Decimal from "decimal.js";

export const QR_PAID_STATUSES = ["PAID"] as const;

export interface QrOrderStatRow {
  status: string;
  amount: string | number;
  walletType?: string | null;
  createdAt: Date | string;
  paidAt?: Date | string | null;
}

export interface QrCodeStats {
  today: {
    createdOrders: number;
    paidOrders: number;
    paidAmount: number;
  };
  lifetime: {
    paidOrders: number;
    paidAmount: number;
    wechatAmount: number;
    alipayAmount: number;
    unionpayAmount: number;
  };
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfLocalDay(now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addAmount(left: number, raw: string | number): number {
  return new Decimal(left).plus(new Decimal(raw)).toNumber();
}

function isPaid(status: string): boolean {
  return status === "PAID";
}

export function summarizeQrCodeStats(
  rows: QrOrderStatRow[],
  now = new Date(),
): QrCodeStats {
  const todayStart = startOfLocalDay(now).getTime();
  const tomorrow = todayStart + 24 * 60 * 60 * 1000;
  const stats: QrCodeStats = {
    today: { createdOrders: 0, paidOrders: 0, paidAmount: 0 },
    lifetime: {
      paidOrders: 0,
      paidAmount: 0,
      wechatAmount: 0,
      alipayAmount: 0,
      unionpayAmount: 0,
    },
  };

  for (const row of rows) {
    const created = asDate(row.createdAt);
    if (created && created.getTime() >= todayStart && created.getTime() < tomorrow) {
      stats.today.createdOrders += 1;
    }
    if (!isPaid(row.status)) continue;
    const paidAt = asDate(row.paidAt) || created;
    stats.lifetime.paidOrders += 1;
    stats.lifetime.paidAmount = addAmount(stats.lifetime.paidAmount, row.amount);
    const wallet = (row.walletType || "").toUpperCase();
    if (wallet === "WECHAT") {
      stats.lifetime.wechatAmount = addAmount(stats.lifetime.wechatAmount, row.amount);
    } else if (wallet === "ALIPAY") {
      stats.lifetime.alipayAmount = addAmount(stats.lifetime.alipayAmount, row.amount);
    } else if (wallet === "UNIONPAY") {
      stats.lifetime.unionpayAmount = addAmount(stats.lifetime.unionpayAmount, row.amount);
    }
    if (paidAt && paidAt.getTime() >= todayStart && paidAt.getTime() < tomorrow) {
      stats.today.paidOrders += 1;
      stats.today.paidAmount = addAmount(stats.today.paidAmount, row.amount);
    }
  }

  return stats;
}
