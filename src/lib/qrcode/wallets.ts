import {
  isPaymentFmWalletType,
  listPaymentFmWalletAllowlist,
  type PaymentFmKnownWalletType,
} from "@/lib/payment/paymentfm-config";
import { providerProductionStatus } from "@/lib/payment/channel-policy";

export function listAvailablePaymentFmWallets(input: {
  paymentFmUsable: boolean;
  merchantChannelEnabled: boolean;
  policyAllows: boolean;
  extraConfig?: unknown;
  envPayTypes?: string;
}): PaymentFmKnownWalletType[] {
  if (!input.paymentFmUsable) return [];
  if (!input.merchantChannelEnabled) return [];
  if (!input.policyAllows) return [];
  if (providerProductionStatus("PAYMENTFM_AGGREGATE", input.merchantChannelEnabled) !== "READY") {
    return [];
  }
  return listPaymentFmWalletAllowlist(input.extraConfig, input.envPayTypes).filter(
    isPaymentFmWalletType,
  );
}

export function orderAttributionFromQr(qr: {
  merchantId: string;
  storeId: string | null;
  id: string;
  counterId?: string | null;
  operatorId?: string | null;
  departmentId?: string | null;
}): {
  merchantId: string;
  storeId: string | null;
  qrcodeId: string;
  counterId: string | null;
  operatorId: string | null;
  departmentId: string | null;
} {
  return {
    merchantId: qr.merchantId,
    storeId: qr.storeId,
    qrcodeId: qr.id,
    counterId: qr.counterId ?? null,
    operatorId: qr.operatorId ?? null,
    departmentId: qr.departmentId ?? null,
  };
}
