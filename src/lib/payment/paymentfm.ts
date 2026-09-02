import { PaymentChannel } from "@prisma/client";
import type {
  PaymentProvider,
  CreatePaymentParams,
  CreatePaymentResult,
  QueryOrderParams,
  OrderQueryResult,
  CloseOrderParams,
  RefundParams,
  RefundResult,
  QueryRefundParams,
  RefundQueryResult,
  CallbackData,
  WebhookPayload,
  WebhookResult,
} from "./provider";
import { amountToFen } from "./config";
import {
  PAYMENTFM_NOTIFY_OK,
  PAYMENTFM_QUERY_ORDER_PATH,
  PAYMENTFM_QUERY_OUT_ORDER_PATH,
  PAYMENTFM_START_ORDER_PATH,
  formatPaymentFmAmount,
  isPaymentFmWalletType,
  mapPaymentFmPayTypeToWallet,
  normalizeWalletType,
  resolvePaymentFmPayType,
  safeEqualHex,
  signPaymentFmCreateOrder,
  signPaymentFmNotify,
  signPaymentFmQueryById,
  signPaymentFmQueryByOrderNo,
  type ResolvedPaymentFmConfig,
} from "./paymentfm-config";

export type PaymentFmTransport = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

interface PaymentFmJsonResponse {
  success?: boolean;
  code?: number;
  msg?: string;
  data?: {
    id?: string;
    payUrl?: string;
    orderId?: string;
    orderNo?: string;
    merchantNum?: string;
    amount?: string;
    payType?: string;
    orderState?: string;
    orderStateDesc?: string;
    payTime?: string;
    tradeMoney?: string;
  } | null;
}

/**
 * PaymentFM aggregate adapter. Credentials empty ⇒ usable=false at resolve time.
 * createPayment / queryOrder never invent success. Notify must verify MD5.
 */
export class PaymentFmProvider implements PaymentProvider {
  readonly channel: PaymentChannel = "PAYMENTFM_AGGREGATE";

  constructor(
    private readonly cfg: ResolvedPaymentFmConfig,
    private readonly transport: PaymentFmTransport = fetch,
  ) {}

  async createOrder(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    return this.createPayment(params);
  }

  sign(input: {
    orderNo: string;
    amount: string;
    notifyUrl: string;
  }): string {
    return signPaymentFmCreateOrder({
      merchantNum: this.cfg.merchantNum,
      orderNo: input.orderNo,
      amount: input.amount,
      notifyUrl: input.notifyUrl,
      merchantKey: this.cfg.merchantKey,
    });
  }

  verifySign(expected: string, actual: string): boolean {
    return safeEqualHex(expected, actual);
  }

  verifyNotify(body: unknown, headers: Record<string, string> = {}): boolean {
    return this.verifyCallback(body, headers);
  }

  async handleNotify(payload: WebhookPayload): Promise<WebhookResult> {
    return this.handleWebhook(payload);
  }

  normalizeStatus(orderState: string | undefined): OrderQueryResult["status"] {
    return mapDocumentedOrderState(orderState);
  }

  normalizeWalletType(payType: string | undefined) {
    return normalizeWalletType(payType);
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const payTypeResolved = resolvePaymentFmPayType({
      payType: params.extraParams?.payType,
      walletType: params.extraParams?.walletType,
    });
    if ("error" in payTypeResolved) {
      return { success: false, error: payTypeResolved.error };
    }

    let amount: string;
    try {
      amount = formatPaymentFmAmount(params.amount);
    } catch {
      return { success: false, error: "PAYMENTFM_AMOUNT_INVALID" };
    }

    const sign = signPaymentFmCreateOrder({
      merchantNum: this.cfg.merchantNum,
      orderNo: params.orderNo,
      amount,
      notifyUrl: params.notifyUrl,
      merchantKey: this.cfg.merchantKey,
    });

    const query = new URLSearchParams({
      merchantNum: this.cfg.merchantNum,
      orderNo: params.orderNo,
      amount,
      notifyUrl: params.notifyUrl,
      payType: payTypeResolved.payType,
      sign,
      returnType: "json",
      // Official optional: POST form callbacks instead of default GET.
      apiMode: "post_form",
    });
    if (params.returnUrl) query.set("returnUrl", params.returnUrl);
    if (params.subject) query.set("subject", params.subject.slice(0, 100));
    // Official payDuration: minutes, default 5, max 15.
    query.set("payDuration", "15");
    const attch = params.extraParams?.attch?.trim();
    if (attch) query.set("attch", attch);

    const parsed = await this.postForm(PAYMENTFM_START_ORDER_PATH, query);
    if (!parsed) {
      return { success: false, error: "PAYMENTFM_CREATE_UNAVAILABLE" };
    }
    if (
      parsed.success === true &&
      parsed.code === 200 &&
      parsed.data?.payUrl
    ) {
      return {
        success: true,
        payData: parsed.data.payUrl,
        tradeNo: parsed.data.id || undefined,
      };
    }
    return {
      success: false,
      error: parsed.msg || "PAYMENTFM_CREATE_REJECTED",
    };
  }

  async queryOrder(params: QueryOrderParams): Promise<OrderQueryResult> {
    /**
     * Official query APIs require VIP application.
     * TODO(PAYMENTFM_CONTRACT): query JSON has no sign field. verified=true
     * only after merchantNum / orderNo / amount / orderState all match docs.
     */
    const parsed = params.tradeNo
      ? await this.queryByPlatformId(params.tradeNo)
      : await this.queryByMerchantOrderNo(params.orderNo);
    if (!parsed?.data || parsed.success !== true || parsed.code !== 200) {
      return { status: "UNKNOWN" };
    }
    const data = parsed.data;
    if (!data.orderNo || data.orderNo !== params.orderNo) {
      return { status: "UNKNOWN" };
    }
    if (!data.merchantNum || data.merchantNum !== this.cfg.merchantNum) {
      return { status: "UNKNOWN" };
    }

    const status = mapDocumentedOrderState(data.orderState);
    let amount: number | undefined;
    try {
      if (data.amount) amount = amountToFen(data.amount);
    } catch {
      return { status: "UNKNOWN" };
    }

    const fieldsComplete =
      Boolean(data.amount) &&
      Number.isSafeInteger(amount) &&
      Boolean(data.orderState);

    return {
      status,
      verified: fieldsComplete,
      amount,
      tradeNo: data.orderId || params.tradeNo,
      ...(data.payTime ? { paidAt: parsePayTime(data.payTime) } : {}),
    };
  }

  async closeOrder(_params: CloseOrderParams): Promise<boolean> {
    // TODO: official API list has no close-order interface.
    return false;
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    return {
      success: false,
      error: "REFUND_NOT_SUPPORTED_OR_NOT_CONFIGURED",
    };
  }

  async queryRefund(_params: QueryRefundParams): Promise<RefundQueryResult> {
    return { status: "UNKNOWN" };
  }

  verifyCallback(body: unknown, _headers: Record<string, string>): boolean {
    const fields = asStringRecord(body);
    if (!fields.state || !fields.merchantNum || !fields.orderNo || !fields.amount || !fields.sign) {
      return false;
    }
    if (fields.merchantNum !== this.cfg.merchantNum) return false;
    const expected = signPaymentFmNotify({
      state: fields.state,
      merchantNum: fields.merchantNum,
      orderNo: fields.orderNo,
      amount: fields.amount,
      merchantKey: this.cfg.merchantKey,
    });
    return safeEqualHex(expected, fields.sign);
  }

  parseCallback(body: unknown): CallbackData {
    const fields = asStringRecord(body);
    return {
      orderNo: fields.orderNo,
      tradeNo: fields.platformOrderNo || fields.channelOrderNo || "",
      amount: amountToFen(fields.amount),
      currency: "CNY",
      status: fields.state === "1" ? "SUCCESS" : "FAILED",
      paidAt: parsePayTime(fields.payTime),
      raw: body,
    };
  }

  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    const fields = asStringRecord(payload.body);
    if (!this.verifyCallback(fields, payload.headers)) {
      return { verified: false, error: "PAYMENTFM_NOTIFY_SIGN_INVALID" };
    }
    if (fields.state !== "1") {
      return { verified: false, error: "PAYMENTFM_NOTIFY_NOT_PAID" };
    }
    try {
      return { verified: true, data: this.parseCallback(fields) };
    } catch {
      return { verified: false, error: "PAYMENTFM_NOTIFY_AMOUNT_INVALID" };
    }
  }

  private async queryByPlatformId(orderId: string): Promise<PaymentFmJsonResponse | null> {
    const sign = signPaymentFmQueryById({
      merchantNum: this.cfg.merchantNum,
      orderId,
      merchantKey: this.cfg.merchantKey,
    });
    const query = new URLSearchParams({
      merchantNum: this.cfg.merchantNum,
      orderId,
      sign,
    });
    return this.postForm(PAYMENTFM_QUERY_ORDER_PATH, query);
  }

  private async queryByMerchantOrderNo(
    orderNo: string,
  ): Promise<PaymentFmJsonResponse | null> {
    const sign = signPaymentFmQueryByOrderNo({
      merchantNum: this.cfg.merchantNum,
      orderNo,
      merchantKey: this.cfg.merchantKey,
    });
    const query = new URLSearchParams({
      merchantNum: this.cfg.merchantNum,
      orderNo,
      sign,
    });
    return this.postForm(PAYMENTFM_QUERY_OUT_ORDER_PATH, query);
  }

  private async postForm(
    path: string,
    params: URLSearchParams,
  ): Promise<PaymentFmJsonResponse | null> {
    const url = `${this.cfg.apiUrl}${path}?${params.toString()}`;
    try {
      const response = await this.transport(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body: params.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      if (!text.startsWith("{")) return null;
      return JSON.parse(text) as PaymentFmJsonResponse;
    } catch {
      return null;
    }
  }
}

export function buildPaymentFmAttach(input: {
  storeId?: string | null;
  qrcodeId?: string | null;
  operatorId?: string | null;
}): string {
  const parts = [
    input.storeId ? `s=${input.storeId}` : "",
    input.qrcodeId ? `q=${input.qrcodeId}` : "",
    input.operatorId ? `o=${input.operatorId}` : "",
  ].filter(Boolean);
  return parts.join("&");
}

export function parsePaymentFmAttach(
  attch: string | undefined,
): { storeId?: string; qrcodeId?: string; operatorId?: string } {
  if (!attch) return {};
  const out: { storeId?: string; qrcodeId?: string; operatorId?: string } = {};
  for (const part of attch.split("&")) {
    const [key, value] = part.split("=");
    if (!key || !value) continue;
    if (key === "s") out.storeId = value;
    if (key === "q") out.qrcodeId = value;
    if (key === "o") out.operatorId = value;
  }
  return out;
}

export { isPaymentFmWalletType, mapPaymentFmPayTypeToWallet };

function mapDocumentedOrderState(
  orderState: string | undefined,
): OrderQueryResult["status"] {
  // Official: 2 待支付, 4 已支付, 7 关闭
  if (orderState === "2") return "UNPAID";
  if (orderState === "4") return "PAID";
  if (orderState === "7") return "CLOSED";
  return "UNKNOWN";
}

function parsePayTime(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      child === undefined || child === null
        ? []
        : [[key, String(child)] as [string, string]],
    ),
  );
}
