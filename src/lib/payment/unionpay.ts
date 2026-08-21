import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as rsaSign,
  verify as rsaVerify,
  X509Certificate,
  type KeyObject,
} from "node:crypto";
import { readFileSync } from "node:fs";
import forge from "node-forge";
import {
  PaymentProvider,
  CreatePaymentParams,
  CreatePaymentResult,
  QueryOrderParams,
  OrderQueryResult,
  RefundParams,
  RefundResult,
  QueryRefundParams,
  RefundQueryResult,
  CallbackData,
  WebhookPayload,
  WebhookResult,
  RefundWebhookResult,
} from "./provider";
import { PaymentChannel } from "@prisma/client";
import { amountToFen } from "./config";

type UnionPayParams = Record<string, string>;

interface UnionPayProviderConfig {
  merId: string;
  signCertPath: string;
  signCertPassword: string;
  verifyCertificate?: string;
  verifyCertPath?: string;
  frontTransUrl: string;
  backTransUrl: string;
  queryTransUrl: string;
  termId?: string;
  channel: PaymentChannel;
}

interface LoadedSignCertificate {
  privateKey: KeyObject;
  certId: string;
}

// 银联全渠道 5.1 Provider：网关/WAP 前台交易、云闪付主扫二维码、查单和退货。
export class UnionPayProvider implements PaymentProvider {
  channel: PaymentChannel;
  private readonly merId: string;
  private readonly frontTransUrl: string;
  private readonly backTransUrl: string;
  private readonly queryTransUrl: string;
  private readonly termId: string;
  private readonly privateKey: KeyObject;
  private readonly signCertId: string;
  private readonly verifyCertificate: X509Certificate;
  private readonly verifyCertId: string;
  private readonly version = "5.1.0";
  private readonly encoding = "UTF-8";
  private readonly signMethod = "01";

  constructor(config: UnionPayProviderConfig) {
    this.channel = config.channel;
    this.merId = config.merId;
    this.frontTransUrl = config.frontTransUrl;
    this.backTransUrl = config.backTransUrl;
    this.queryTransUrl = config.queryTransUrl;
    this.termId = config.termId || "";

    const signCertificate = loadPkcs12Certificate(
      config.signCertPath,
      config.signCertPassword,
    );
    this.privateKey = signCertificate.privateKey;
    this.signCertId = signCertificate.certId;

    const verificationSource = config.verifyCertificate
      ? normalizeCertificate(config.verifyCertificate)
      : readFileSync(/* turbopackIgnore: true */ config.verifyCertPath || "");
    this.verifyCertificate = new X509Certificate(verificationSource);
    assertCertificateCurrent(this.verifyCertificate, "银联验签证书");
    this.verifyCertId = certificateSerialToDecimal(
      this.verifyCertificate.serialNumber,
    );
  }

  async createPayment(
    params: CreatePaymentParams,
  ): Promise<CreatePaymentResult> {
    try {
      const amount = amountToFen(params.amount.toString());
      if (amount <= 0)
        return { success: false, error: "银联交易金额必须大于0" };

      const data: UnionPayParams = {
        ...this.baseTransactionParams(
          "01",
          this.channel === "UNIONPAY_QR" ? "07" : "01",
        ),
        orderId: params.orderNo,
        txnTime: extractTransactionTime(params.orderNo, "BEP"),
        txnAmt: String(amount),
        currencyCode: "156",
        backUrl: params.notifyUrl,
        orderDesc: params.subject.slice(0, 200),
      };

      if (this.termId) data.termId = this.termId;

      if (this.channel === "UNIONPAY_QR") {
        data.qrCodeValidTime = "900";
        const response = await this.postSigned(this.backTransUrl, data);
        if (response.respCode !== "00") {
          return { success: false, error: formatUnionPayError(response) };
        }
        if (!response.qrCode) {
          return { success: false, error: "银联申请二维码成功但未返回 qrCode" };
        }
        return {
          success: true,
          payData: response.qrCode,
          tradeNo: response.queryId,
        };
      }

      if (
        this.channel !== "UNIONPAY_GATEWAY" &&
        this.channel !== "UNIONPAY_WAP"
      ) {
        return { success: false, error: `不支持的银联渠道: ${this.channel}` };
      }
      if (!params.returnUrl) {
        return { success: false, error: "银联网关/WAP支付必须提供 returnUrl" };
      }
      data.frontUrl = params.returnUrl;
      data.payTimeout = addMinutesToTransactionTime(data.txnTime, 15);
      const signed = this.sign(data);
      return {
        success: true,
        payData: buildAutoSubmitForm(this.frontTransUrl, signed),
      };
    } catch (error) {
      return {
        success: false,
        error: `银联下单失败: ${(error as Error).message}`,
      };
    }
  }

  async queryOrder(params: QueryOrderParams): Promise<OrderQueryResult> {
    try {
      const response = await this.queryTransaction(
        params.orderNo,
        extractTransactionTime(params.orderNo, "BEP"),
      );
      if (response.respCode !== "00" || response.origRespCode !== "00") {
        return { status: "UNKNOWN" };
      }
      const amount = parseFen(response.txnAmt);
      if (amount === undefined || !response.queryId)
        return { status: "UNKNOWN" };
      return {
        status: "PAID",
        amount,
        tradeNo: response.queryId,
        paidAt: parseUnionPayTime(response.traceTime || response.txnTime),
      };
    } catch {
      return { status: "UNKNOWN" };
    }
  }

  async closeOrder(): Promise<boolean> {
    // 银联全渠道没有与支付宝/微信“关闭未支付订单”等价的通用接口。
    // 未取得确定终态时必须 fail-closed，不能仅关闭本地订单。
    return false;
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    try {
      if (!params.tradeNo) {
        return { success: false, error: "银联退款缺少原消费 queryId" };
      }
      const amount = amountToFen(params.refundAmount.toString());
      const data: UnionPayParams = {
        ...this.baseTransactionParams("04", "00"),
        orderId: params.refundNo,
        txnTime: extractTransactionTime(params.refundNo, "REF"),
        txnAmt: String(amount),
        currencyCode: "156",
        origQryId: params.tradeNo,
        reqReserved: params.orderNo,
        backUrl: params.notifyUrl || "",
      };
      if (!data.backUrl) delete data.backUrl;
      if (this.termId) data.termId = this.termId;

      const response = await this.postSigned(this.backTransUrl, data);
      if (!["00", "03", "04", "05"].includes(response.respCode)) {
        return { success: false, error: formatUnionPayError(response) };
      }
      return {
        success: true,
        channelRefundNo: response.queryId,
      };
    } catch (error) {
      return {
        success: false,
        error: `银联退款失败: ${(error as Error).message}`,
      };
    }
  }

  async queryRefund(params: QueryRefundParams): Promise<RefundQueryResult> {
    try {
      const response = await this.queryTransaction(
        params.refundNo,
        extractTransactionTime(params.refundNo, "REF"),
      );
      if (response.respCode !== "00") return { status: "UNKNOWN" };
      const refundAmount = parseFen(response.txnAmt);
      if (refundAmount === undefined) return { status: "UNKNOWN" };
      if (response.origRespCode === "00") {
        return { status: "SUCCESS", refundAmount };
      }
      if (["03", "04", "05"].includes(response.origRespCode || "")) {
        return { status: "PROCESSING", refundAmount };
      }
      return { status: "FAILED", refundAmount };
    } catch {
      return { status: "UNKNOWN" };
    }
  }

  verifyCallback(body: unknown): boolean {
    const data = toStringRecord(body);
    return this.verify(data);
  }

  parseCallback(body: unknown): CallbackData {
    const data = toStringRecord(body);
    const amount = parseFen(data.txnAmt);
    if (!data.orderId || !data.queryId || amount === undefined) {
      throw new Error("银联回调缺少订单号、queryId或金额");
    }
    return {
      orderNo: data.orderId,
      tradeNo: data.queryId,
      amount,
      currency: data.currencyCode === "156" ? "CNY" : data.currencyCode || "",
      status: data.respCode === "00" ? "SUCCESS" : "FAILED",
      paidAt: parseUnionPayTime(data.traceTime || data.txnTime),
      raw: body,
    };
  }

  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    try {
      const data = toStringRecord(payload.body);
      if (!this.verify(data))
        return { verified: false, error: "银联回调验签失败" };
      if (
        data.version !== this.version ||
        data.merId !== this.merId ||
        data.txnType !== "01" ||
        data.txnSubType !== (this.channel === "UNIONPAY_QR" ? "07" : "01")
      ) {
        return { verified: false, error: "银联回调凭证或交易类型不一致" };
      }
      return { verified: true, data: this.parseCallback(data) };
    } catch (error) {
      return {
        verified: false,
        error: `回调解析失败: ${(error as Error).message}`,
      };
    }
  }

  async handleRefundWebhook(
    payload: WebhookPayload,
  ): Promise<RefundWebhookResult> {
    try {
      const data = toStringRecord(payload.body);
      if (!this.verify(data))
        return { verified: false, error: "银联退款回调验签失败" };
      if (
        data.version !== this.version ||
        data.merId !== this.merId ||
        data.txnType !== "04" ||
        data.txnSubType !== "00"
      ) {
        return { verified: false, error: "银联退款回调凭证或交易类型不一致" };
      }
      const refundAmount = parseFen(data.txnAmt);
      if (!data.orderId || refundAmount === undefined) {
        return { verified: false, error: "银联退款回调缺少退款单号或金额" };
      }
      return {
        verified: true,
        data: {
          refundNo: data.orderId,
          orderNo: data.reqReserved || "",
          channelRefundNo: data.queryId || "",
          refundAmount,
          status: data.respCode === "00" ? "SUCCESS" : "FAILED",
        },
      };
    } catch (error) {
      return {
        verified: false,
        error: `银联退款回调解析失败: ${(error as Error).message}`,
      };
    }
  }

  getConfigStatus(): {
    configured: boolean;
    missing: string[];
    environment: string;
  } {
    return {
      configured: true,
      missing: [],
      environment: this.backTransUrl.includes("gateway.test.95516.com")
        ? "sandbox"
        : "production",
    };
  }

  private baseTransactionParams(
    txnType: string,
    txnSubType: string,
  ): UnionPayParams {
    return {
      version: this.version,
      encoding: this.encoding,
      signMethod: this.signMethod,
      txnType,
      txnSubType,
      bizType: this.channel === "UNIONPAY_QR" ? "000000" : "000201",
      channelType: this.channel === "UNIONPAY_GATEWAY" ? "07" : "08",
      accessType: "0",
      merId: this.merId,
    };
  }

  private sign(params: UnionPayParams): UnionPayParams {
    const data = Object.fromEntries(
      Object.entries({ ...params, certId: this.signCertId }).filter(
        ([, value]) => value !== "",
      ),
    );
    return {
      ...data,
      signature: createUnionPaySignature(data, this.privateKey),
    };
  }

  private verify(params: UnionPayParams): boolean {
    const signature = params.signature;
    if (
      !signature ||
      params.signMethod !== this.signMethod ||
      params.certId !== this.verifyCertId
    ) {
      return false;
    }
    return verifyUnionPaySignature(
      params,
      signature,
      this.verifyCertificate.publicKey,
    );
  }

  private async postSigned(
    url: string,
    params: UnionPayParams,
  ): Promise<UnionPayParams> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams(this.sign(params)).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`银联网关 HTTP ${response.status}`);

    const result = Object.fromEntries(
      new URLSearchParams(await response.text()).entries(),
    );
    if (!Object.keys(result).length) throw new Error("银联网关返回空报文");
    if (!this.verify(result)) throw new Error("银联网关同步应答验签失败");
    if (result.merId && result.merId !== this.merId) {
      throw new Error("银联网关同步应答商户号不一致");
    }
    return result;
  }

  private queryTransaction(
    orderId: string,
    txnTime: string,
  ): Promise<UnionPayParams> {
    return this.postSigned(this.queryTransUrl, {
      ...this.baseTransactionParams("00", "00"),
      orderId,
      txnTime,
    });
  }
}

export function createUnionPaySignature(
  params: UnionPayParams,
  privateKey: KeyObject | string,
): string {
  const digest = createHash("sha256")
    .update(buildSigningString(params), "utf8")
    .digest("hex");
  return rsaSign(
    "RSA-SHA256",
    Buffer.from(digest, "utf8"),
    privateKey,
  ).toString("base64");
}

export function verifyUnionPaySignature(
  params: UnionPayParams,
  signature: string,
  publicKey: KeyObject | string,
): boolean {
  try {
    const digest = createHash("sha256")
      .update(buildSigningString(params), "utf8")
      .digest("hex");
    return rsaVerify(
      "RSA-SHA256",
      Buffer.from(digest, "utf8"),
      publicKey,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

function buildSigningString(params: UnionPayParams): string {
  return Object.entries(params)
    .filter(([key, value]) => key !== "signature" && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function loadPkcs12Certificate(
  filePath: string,
  password: string,
): LoadedSignCertificate {
  const pfx = readFileSync(/* turbopackIgnore: true */ filePath);
  const p12 = forge.pkcs12.pkcs12FromAsn1(
    forge.asn1.fromDer(pfx.toString("binary")),
    false,
    password,
  );
  const shroudedBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] || [];
  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ||
    [];
  const certBags =
    p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ||
    [];
  const privateKey = shroudedBags[0]?.key || keyBags[0]?.key;
  if (!privateKey) {
    throw new Error("银联PKCS#12签名证书缺少私钥或证书");
  }

  const privateKeyObject = createPrivateKey(
    forge.pki.privateKeyToPem(privateKey),
  );
  const expectedPublicKey = createPublicKey(privateKeyObject)
    .export({ format: "der", type: "spki" })
    .toString("base64");
  const x509 = certBags
    .map((bag) => bag.cert)
    .filter(
      (certificate): certificate is forge.pki.Certificate => !!certificate,
    )
    .map(
      (certificate) =>
        new X509Certificate(forge.pki.certificateToPem(certificate)),
    )
    .find(
      (certificate) =>
        certificate.publicKey
          .export({ format: "der", type: "spki" })
          .toString("base64") === expectedPublicKey,
    );
  if (!x509) throw new Error("银联PKCS#12中未找到与私钥匹配的签名证书");
  assertCertificateCurrent(x509, "银联商户签名证书");
  return {
    privateKey: privateKeyObject,
    certId: certificateSerialToDecimal(x509.serialNumber),
  };
}

function assertCertificateCurrent(
  certificate: X509Certificate,
  name: string,
): void {
  const now = Date.now();
  if (
    !Number.isFinite(Date.parse(certificate.validFrom)) ||
    !Number.isFinite(Date.parse(certificate.validTo)) ||
    Date.parse(certificate.validFrom) > now ||
    Date.parse(certificate.validTo) < now
  ) {
    throw new Error(`${name}不在有效期内`);
  }
}

function certificateSerialToDecimal(serial: string): string {
  const compact = serial.replace(/:/g, "");
  if (!/^[0-9a-f]+$/i.test(compact)) throw new Error("银联证书序列号格式无效");
  return BigInt(`0x${compact}`).toString(10);
}

function extractTransactionTime(id: string, prefix: "BEP" | "REF"): string {
  const match = id.match(new RegExp(`^${prefix}(\\d{14})`));
  if (!match) throw new Error(`银联订单号 ${id} 不包含可查询的交易时间`);
  return match[1];
}

function parseFen(value?: string): number | undefined {
  if (!value || !/^\d{1,12}$/.test(value)) return undefined;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

function parseUnionPayTime(value?: string): Date | undefined {
  if (!value || !/^\d{14}$/.test(value)) return undefined;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function addMinutesToTransactionTime(value: string, minutes: number): string {
  const parsed = parseUnionPayTime(value);
  if (!parsed) throw new Error("银联交易时间格式无效");
  const next = new Date(
    parsed.getTime() + minutes * 60 * 1000 + 8 * 60 * 60 * 1000,
  );
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
    String(next.getUTCHours()).padStart(2, "0"),
    String(next.getUTCMinutes()).padStart(2, "0"),
    String(next.getUTCSeconds()).padStart(2, "0"),
  ].join("");
}

function toStringRecord(body: unknown): UnionPayParams {
  if (typeof body === "string") {
    return Object.fromEntries(new URLSearchParams(body).entries());
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function normalizeCertificate(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function formatUnionPayError(response: UnionPayParams): string {
  return `银联应答 ${response.respCode || "UNKNOWN"}: ${response.respMsg || "交易未受理"}`;
}

function buildAutoSubmitForm(url: string, params: UnionPayParams): string {
  const fields = Object.entries(params)
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`,
    )
    .join("");
  return `<!doctype html><html><body><form id="unionpay" method="post" action="${escapeHtml(url)}">${fields}</form><script>document.getElementById('unionpay').submit();</script></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
