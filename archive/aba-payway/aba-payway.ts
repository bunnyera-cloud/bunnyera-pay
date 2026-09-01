import {
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
import { PaymentChannel } from "@prisma/client";
import { canCallPaymentProvider } from "./config";
import {
  resolveAbaPaywayConfig,
  generateAbaHash,
  abaReqTime,
  mapAbaPaymentStatus,
  ABA_PATHS,
  resolveAbaCurrency,
  extraConfigCurrency,
  formatAbaApiAmount,
  abaMajorToMinor,
  resolveAbaTranId,
  toAbaTranId,
  isAbaTranId,
  type ResolvedAbaPaywayConfig,
} from "./aba-payway-config";
import type { PaymentConfig } from "@prisma/client";

/**
 * ABA PayWay Provider — 实现 PaymentProvider 接口。
 *
 * 签名算法：HMAC-SHA512 + API Key（官方文档已确认）
 * 退款/付款链接 merchant_auth：RSA 公钥分块加密（官方文档已确认）
 * 入账唯一依据：Check Transaction + merchant/tran_id/amount/currency 一致。
 * 退款：ABA REFUND NOT READY，禁止假成功。
 *
 * 来源：
 * - developer.payway.com.kh/purchase-14530820e0.md
 * - developer.payway.com.kh/check-transaction-14530826e0.md
 * - developer.payway.com.kh/refund-api-14530821e0.md
 * - developer.payway.com.kh/close-transaction-14530822e0.md
 * - developer.payway.com.kh/create-payment-link-14530837e0.md
 * - developer.payway.com.kh/qr-api-14530840e0.md
 */
export class AbaPaywayProvider implements PaymentProvider {
  channel: PaymentChannel;
  private cfg: ResolvedAbaPaywayConfig;
  private extraCurrency?: string;

  constructor(config: {
    paymentConfig?: PaymentConfig | null;
    channel: PaymentChannel;
  }) {
    this.channel = config.channel;
    this.cfg = resolveAbaPaywayConfig(config.paymentConfig);
    this.extraCurrency = extraConfigCurrency(config.paymentConfig?.extraConfig);
  }

  // ─────────────────────── createPayment ───────────────────────

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    if (!canCallPaymentProvider(this.cfg.env)) {
      return { success: false, error: "PREVIEW 环境禁止调用 ABA PayWay" };
    }
    if (!this.cfg.usable) {
      return { success: false, error: `ABA PayWay 配置缺失: ${this.cfg.missing.join(", ")}` };
    }

    const currencyResolved = resolveAbaCurrency(
      params.currency,
      params.extraParams?.currency,
      this.extraCurrency,
    );
    if (!currencyResolved.ok) {
      return { success: false, error: currencyResolved.error };
    }
    const currency = currencyResolved.currency;

    let amountStr: string;
    try {
      amountStr = formatAbaApiAmount(params.amount.toString(), currency);
    } catch (error) {
      return { success: false, error: `ABA 金额无效: ${(error as Error).message}` };
    }

    try {
      const reqTime = abaReqTime();
      const tranId = toAbaTranId(params.orderNo);
      const itemsB64 = Buffer.from(
        JSON.stringify([{ name: params.subject || "Payment", quantity: 1, price: amountStr }]),
      ).toString("base64");
      const return_url = params.notifyUrl
        ? Buffer.from(params.notifyUrl).toString("base64")
        : this.cfg.notifyUrl
          ? Buffer.from(this.cfg.notifyUrl).toString("base64")
          : "";
      const type = "purchase";
      const paymentOption = "abapay_khqr_deeplink";
      const continueSuccessUrl = params.returnUrl || "";

      const hashInput =
        reqTime +
        this.cfg.merchantId +
        tranId +
        amountStr +
        itemsB64 +
        "" +
        "" +
        "" +
        "" +
        "" +
        type +
        paymentOption +
        return_url +
        "" +
        continueSuccessUrl +
        "" +
        currency +
        "" +
        "" +
        "" +
        "" +
        "" +
        "";

      const hash = generateAbaHash(hashInput, this.cfg.apiKey);

      const formData = new FormData();
      formData.append("req_time", reqTime);
      formData.append("merchant_id", this.cfg.merchantId);
      formData.append("tran_id", tranId);
      formData.append("amount", amountStr);
      formData.append("items", itemsB64);
      formData.append("currency", currency);
      if (return_url) formData.append("return_url", return_url);
      if (continueSuccessUrl) {
        formData.append("continue_success_url", continueSuccessUrl);
      }
      formData.append("hash", hash);
      formData.append("payment_option", paymentOption);
      formData.append("type", type);

      const response = await fetch(
        `${this.cfg.baseUrl}${ABA_PATHS.PURCHASE}`,
        {
          method: "POST",
          body: formData,
        },
      );

      const raw = await response.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return { success: false, error: "ABA PayWay 响应格式错误" };
      }

      const status = json.status as Record<string, string> | undefined;
      if (status?.code === "00") {
        const payData =
          (json.checkout_qr_url as string) ||
          (json.qr_string as string) ||
          (json.abapay_deeplink as string) ||
          "";
        if (!payData) {
          return { success: false, error: "ABA PayWay 未返回支付内容" };
        }
        return {
          success: true,
          payData,
          tradeNo: tranId,
        };
      }

      return {
        success: false,
        error: `ABA PayWay 创建支付失败: [${status?.code}] ${status?.message || "未知错误"}`,
      };
    } catch (error) {
      return { success: false, error: `ABA PayWay 请求异常: ${(error as Error).message}` };
    }
  }

  // ─────────────────────── queryOrder ───────────────────────

  async queryOrder(params: QueryOrderParams): Promise<OrderQueryResult> {
    if (!canCallPaymentProvider(this.cfg.env)) return { status: "UNKNOWN" };
    if (!this.cfg.usable) return { status: "UNKNOWN" };

    try {
      const reqTime = abaReqTime();
      const tranId = resolveAbaTranId(params.orderNo, params.tradeNo);

      const hashInput = reqTime + this.cfg.merchantId + tranId;
      const hash = generateAbaHash(hashInput, this.cfg.apiKey);

      const response = await fetch(
        `${this.cfg.baseUrl}${ABA_PATHS.CHECK_TRANSACTION}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            req_time: reqTime,
            merchant_id: this.cfg.merchantId,
            tran_id: tranId,
            hash,
          }),
        },
      );

      const json = (await response.json()) as Record<string, unknown>;
      const data = json.data as Record<string, unknown> | undefined;
      const statusObj = json.status as Record<string, unknown> | undefined;

      if (statusObj?.code !== "00" || !data) {
        return { status: "UNKNOWN" };
      }

      const paymentStatus = data.payment_status as string | undefined;
      const paymentStatusCode = data.payment_status_code as number | undefined;
      const totalAmount = data.total_amount ?? data.payment_amount;
      const paymentCurrency = String(data.payment_currency || "").toUpperCase();
      const mappedStatus = mapAbaPaymentStatus(paymentStatus, paymentStatusCode);

      let amountMinor: number | undefined;
      const currencyResolved = resolveAbaCurrency(paymentCurrency);
      if (currencyResolved.ok && totalAmount !== undefined) {
        try {
          amountMinor = abaMajorToMinor(totalAmount as number | string, currencyResolved.currency);
        } catch {
          return { status: "UNKNOWN" };
        }
      }

      return {
        status: mappedStatus,
        verified: true,
        amount: amountMinor,
        currency: paymentCurrency || undefined,
        tradeNo: tranId,
        paidAt: data.transaction_date ? new Date(data.transaction_date as string) : undefined,
      };
    } catch {
      return { status: "UNKNOWN" };
    }
  }

  // ─────────────────────── closeOrder ───────────────────────

  async closeOrder(params: CloseOrderParams): Promise<boolean> {
    if (!canCallPaymentProvider(this.cfg.env)) return false;
    if (!this.cfg.usable) return false;

    try {
      const reqTime = abaReqTime();
      const tranId = resolveAbaTranId(params.orderNo);

      const hashInput = reqTime + this.cfg.merchantId + tranId;
      const hash = generateAbaHash(hashInput, this.cfg.apiKey);

      const response = await fetch(
        `${this.cfg.baseUrl}${ABA_PATHS.CLOSE_TRANSACTION}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            req_time: reqTime,
            merchant_id: this.cfg.merchantId,
            tran_id: tranId,
            hash,
          }),
        },
      );

      const json = (await response.json()) as Record<string, unknown>;
      const statusObj = json.status as Record<string, string> | undefined;
      return statusObj?.code === "00";
    } catch {
      return false;
    }
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    return {
      success: false,
      error: "ABA REFUND: NOT READY",
    };
  }

  async queryRefund(_params: QueryRefundParams): Promise<RefundQueryResult> {
    return { status: "UNKNOWN" };
  }

  // ─────────────────────── verifyCallback ───────────────────────

  /**
   * 回调签名校验。
   *
   * ABA 官方文档未定义回调 hash 拼接规范（无 X-PayWay-HMAC-SHA512 规范）。
   * 本方法始终返回 false——不依赖推断的签名顺序。
   * 入账唯一依据是 handleWebhook 中的 Check Transaction API 查询。
   */
  verifyCallback(
    _body: unknown,
    _headers: Record<string, string>,
  ): boolean {
    // 无官方回调签名规范，不信任推断的 hash 拼接顺序
    return false;
  }

  // ─────────────────────── parseCallback ───────────────────────

  parseCallback(body: unknown): CallbackData {
    const params = body as Record<string, string>;
    const tranId = params.tran_id || params.orderNo || "";
    return {
      orderNo: tranId,
      tradeNo: tranId,
      amount: 0,
      currency: params.currency || "",
      status: "FAILED",
      raw: body,
    };
  }

  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    if (!canCallPaymentProvider(this.cfg.env)) {
      return { verified: false, error: "PREVIEW 环境禁止调用 ABA PayWay" };
    }
    if (typeof payload.body !== "object" || payload.body === null) {
      return { verified: false, error: "回调体格式非法" };
    }

    try {
      const params = payload.body as Record<string, string>;
      const rawTranId = params.tran_id || params.orderNo || "";
      const tranId = isAbaTranId(rawTranId) ? rawTranId.trim().toUpperCase() : rawTranId.trim();

      if (!tranId) {
        return { verified: false, error: "回调缺少 tran_id" };
      }

      const checkResult = await this.queryOrder({ orderNo: tranId, tradeNo: tranId });

      if (checkResult.status === "UNKNOWN") {
        return {
          verified: false,
          data: {
            orderNo: tranId,
            tradeNo: "",
            amount: 0,
            currency: "",
            status: "FAILED",
            raw: payload.body,
          },
          error: "ABA Check Transaction 返回未知状态，等待重试",
        };
      }

      if (checkResult.status === "UNPAID") {
        return {
          verified: false,
          data: {
            orderNo: tranId,
            tradeNo: checkResult.tradeNo || tranId,
            amount: 0,
            currency: checkResult.currency || "",
            status: "FAILED",
            raw: payload.body,
          },
          error: "ABA Check Transaction 仍为 PENDING，等待重试",
        };
      }

      if (checkResult.status !== "PAID" || checkResult.verified !== true) {
        return {
          verified: false,
          data: {
            orderNo: tranId,
            tradeNo: checkResult.tradeNo || "",
            amount: 0,
            currency: checkResult.currency || "",
            status: "FAILED",
            raw: payload.body,
          },
          error:
            checkResult.verified !== true
              ? "ABA 查单响应未通过验签"
              : `ABA 查单状态非 PAID: ${checkResult.status}`,
        };
      }

      return {
        verified: true,
        data: {
          orderNo: tranId,
          tradeNo: checkResult.tradeNo || tranId,
          amount: checkResult.amount ?? 0,
          currency: checkResult.currency || "",
          status: "SUCCESS",
          paidAt: checkResult.paidAt,
          raw: payload.body,
        },
      };
    } catch (error) {
      return {
        verified: false,
        error: `回调处理异常: ${(error as Error).message}`,
      };
    }
  }
}
