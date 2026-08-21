import { createSign, createVerify } from 'crypto';
import type { PaymentChannel } from '@prisma/client';
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
} from './provider';

// ============================================================
// Antom (Alipay+ AMS) Provider —— 接入准备阶段最小骨架
//
// 状态：未注册进 resolver.ts（schema PaymentChannel enum 已预留 ANTOM，
// 下一阶段可直接注册；见 docs/payment/antom-integration-v1.md）。
//
// 安全约束（本阶段硬性要求）：
// 1. externalRequestsEnabled 默认 false，绝不发送真实外部请求
// 2. 不使用任何真实商户密钥；凭证仅由构造函数注入（配置系统/环境变量）
// 3. 一切缺配置/未启用场景 fail-closed，不 fallback 到 mock
// 4. 日志不输出 key / token / signature
// 5. Webhook 必须验签成功才允许进入业务状态更新
// 6. 未识别状态一律映射为 UNKNOWN / fail-closed，绝不误判 success
// ============================================================

export interface AntomConfig {
  /** Antom Client ID（Dashboard 获取；sandbox 形如 SANDBOX_5X...） */
  clientId: string;
  /** 商户 RSA 私钥（PKCS8，Base64，不含 PEM 头尾）—— 用于请求签名 */
  privateKey: string;
  /** Antom 平台公钥（Base64，不含 PEM 头尾）—— 用于验证响应/Webhook 签名 */
  antomPublicKey: string;
  /** API 网关基址，如 https://open-sea-global.alipay.com（区域域名由 Antom 提供） */
  baseUrl: string;
  /** 是否 Sandbox 环境（决定线上支付走 /ams/sandbox/api/ 前缀路径） */
  sandbox?: boolean;
  /** 密钥版本（Signature header 的 keyVersion，默认 1） */
  keyVersion?: string;
  /** 多账号场景的 merchantAccountId（可选） */
  merchantAccountId?: string;
  /** Webhook 验签原文使用的请求路径（必须与实际路由一致） */
  webhookPath?: string;
}

// Antom result.resultStatus：S=成功 F=失败 U=未知（fail-closed 按未完成处理）
type ResultStatus = 'S' | 'F' | 'U';

interface AntomResult {
  resultCode?: string;
  resultStatus?: ResultStatus | string;
  resultMessage?: string;
}

interface AntomAmount {
  currency?: string;
  /** 最小货币单位（如分）的字符串表示 */
  value?: string;
}

// notifyPayment 关键字段（仅声明业务所需部分）
interface AntomNotifyBody {
  notifyType?: string;
  result?: AntomResult;
  paymentRequestId?: string;
  paymentId?: string;
  paymentAmount?: AntomAmount;
  paymentTime?: string;
  paymentMethodType?: string;
}

export class AntomProvider implements PaymentProvider {
  // PaymentChannel enum 已预留 ANTOM（schema.prisma 已核验），无需类型断言
  readonly channel: PaymentChannel = 'ANTOM';

  private clientId: string;
  private privateKey: string;
  private antomPublicKey: string;
  private baseUrl: string;
  private sandbox: boolean;
  private keyVersion: string;
  private merchantAccountId?: string;
  private webhookPath: string;

  // 外部请求开关：本阶段恒为 false。接入 Sandbox 凭证前不得置 true。
  private externalRequestsEnabled = false;

  constructor(config: AntomConfig) {
    this.clientId = config.clientId || '';
    this.privateKey = config.privateKey || '';
    this.antomPublicKey = config.antomPublicKey || '';
    this.baseUrl = (config.baseUrl || '').replace(/\/$/, '');
    this.sandbox = config.sandbox ?? true;
    this.keyVersion = config.keyVersion || '1';
    this.merchantAccountId = config.merchantAccountId;
    this.webhookPath = config.webhookPath || '/api/pay/antom/notify';
  }

  // 与其他 Provider 一致的可用性问题清单（resolver fail-closed 依据）
  getConfigIssues(): string[] {
    const missing: string[] = [];
    if (!this.clientId) missing.push('clientId');
    if (!this.privateKey) missing.push('privateKey');
    if (!this.antomPublicKey) missing.push('antomPublicKey');
    if (!this.baseUrl) missing.push('baseUrl');
    return missing;
  }

  // ---------- 签名基础设施（RSA256 = SHA256withRSA） ----------

  // 签名原文：<http-method> <http-uri>\n<client-id>.<request-time>.<request-body>
  private buildSignContent(path: string, requestTime: string, body: string): string {
    return `POST ${path}\n${this.clientId}.${requestTime}.${body}`;
  }

  // 生成请求签名：urlEncode(base64Encode(sha256withRSA(content, privateKey)))
  private signRequest(path: string, requestTime: string, body: string): string | null {
    if (!this.privateKey) return null;
    try {
      const signer = createSign('RSA-SHA256');
      signer.update(this.buildSignContent(path, requestTime, body), 'utf8');
      const pem = `-----BEGIN PRIVATE KEY-----\n${this.privateKey}\n-----END PRIVATE KEY-----`;
      const signature = signer.sign(pem, 'base64');
      return `algorithm=RSA256,keyVersion=${this.keyVersion},signature=${encodeURIComponent(signature)}`;
    } catch {
      return null;
    }
  }

  // 验证 Antom 响应 / Webhook 签名（使用 Antom 平台公钥）。失败一律返回 false。
  private verifySignature(path: string, requestTime: string, body: string, signatureHeader: string): boolean {
    if (!this.antomPublicKey || !signatureHeader) return false;
    try {
      const match = signatureHeader.match(/signature=([^,]+)/);
      if (!match) return false;
      const signature = decodeURIComponent(match[1].trim());
      const verifier = createVerify('RSA-SHA256');
      verifier.update(this.buildSignContent(path, requestTime, body), 'utf8');
      const pem = `-----BEGIN PUBLIC KEY-----\n${this.antomPublicKey}\n-----END PUBLIC KEY-----`;
      return verifier.verify(pem, signature, 'base64');
    } catch {
      return false;
    }
  }

  // ---------- 请求构造与发送 ----------

  // 在线支付：Sandbox 走 /ams/sandbox/api/ 前缀；Production 走 /ams/api/
  private resolvePath(endpoint: string): string {
    const prefix = this.sandbox ? '/ams/sandbox/api' : '/ams/api';
    return `${prefix}${endpoint}`;
  }

  private buildHeaders(path: string, body: string): Record<string, string> | null {
    const requestTime = Date.now().toString();
    const signature = this.signRequest(path, requestTime, body);
    if (!signature) return null;
    return {
      'Content-Type': 'application/json; charset=UTF-8',
      'client-id': this.clientId,
      'request-time': requestTime,
      signature,
    };
  }

  // 统一发送入口：未启用外部请求时 fail-closed，绝不发真实请求
  private async sendRequest<T>(endpoint: string, bodyPayload: Record<string, unknown>): Promise<T | null> {
    if (!this.externalRequestsEnabled) {
      throw new Error('Antom external requests disabled: no sandbox credentials configured');
    }
    const path = this.resolvePath(endpoint);
    const body = JSON.stringify(bodyPayload);
    const headers = this.buildHeaders(path, body);
    if (!headers) {
      throw new Error('Antom request signing failed: missing or invalid private key');
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body,
    });
    if (!response.ok) {
      throw new Error(`Antom API HTTP error: ${response.status}`);
    }
    // TODO(Sandbox 阶段): 验证响应签名（response header 中的 signature）后再信任响应体
    return (await response.json()) as T;
  }

  // ---------- Request builders（纯构造，不发请求） ----------

  // pay API：paymentRequestId 使用我方 orderNo（天然唯一，Antom 侧幂等键）
  buildPayRequest(params: CreatePaymentParams): Record<string, unknown> {
    const request: Record<string, unknown> = {
      productCode: 'CASHIER_PAYMENT',
      paymentRequestId: params.orderNo,
      paymentAmount: {
        currency: params.currency || 'CNY',
        value: String(params.amount),
      },
      settlementStrategy: { settlementCurrency: 'USD' }, // 结算币种需按合同约定配置
      paymentMethod: { paymentMethodType: 'CARD' }, // 默认 CARD，APM/Wallet 类型待业务层指定
      env: { terminalType: 'WEB' },
      order: {
        referenceOrderId: params.orderNo,
        orderDescription: params.subject,
        orderAmount: {
          currency: params.currency || 'CNY',
          value: String(params.amount),
        },
      },
      paymentNotifyUrl: params.notifyUrl,
      paymentRedirectUrl: params.returnUrl || params.notifyUrl,
    };
    if (this.merchantAccountId) request.merchantAccountId = this.merchantAccountId;
    return request;
  }

  // refund API：refundRequestId 使用我方 refundNo（幂等键）
  buildRefundRequest(params: RefundParams, paymentId: string): Record<string, unknown> {
    const request: Record<string, unknown> = {
      refundRequestId: params.refundNo,
      paymentId,
      refundAmount: { value: String(params.refundAmount) },
    };
    if (params.reason) request.refundReason = params.reason;
    if (params.notifyUrl) request.refundNotifyUrl = params.notifyUrl;
    return request;
  }

  // ---------- PaymentProvider 实现 ----------

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    try {
      const body = this.buildPayRequest(params);
      const response = await this.sendRequest<{
        result?: AntomResult;
        paymentId?: string;
        normalUrl?: string;
        schemeUrl?: string;
        applinkUrl?: string;
      }>('/v1/payments/pay', body);
      if (!response) {
        return { success: false, error: 'Antom pay 无响应' };
      }
      const status = response.result?.resultStatus;
      if (status !== 'S' && status !== 'U') {
        return { success: false, error: `Antom pay 失败: ${response.result?.resultCode || 'UNKNOWN'}` };
      }
      // PAYMENT_IN_PROCESS（U）：支付处理中，返回收银台跳转 URL
      const payUrl = response.normalUrl || response.schemeUrl || response.applinkUrl;
      if (!payUrl && !response.paymentId) {
        return { success: false, error: 'Antom pay 未返回跳转地址' };
      }
      return { success: true, payData: payUrl, tradeNo: response.paymentId };
    } catch (error) {
      return { success: false, error: `Antom 支付创建失败: ${(error as Error).message}` };
    }
  }

  async queryOrder(params: QueryOrderParams): Promise<OrderQueryResult> {
    try {
      const body: Record<string, unknown> = {};
      if (params.tradeNo) body.paymentId = params.tradeNo;
      else body.paymentRequestId = params.orderNo;
      const response = await this.sendRequest<{
        result?: AntomResult;
        paymentStatus?: string;
        paymentAmount?: AntomAmount;
        paymentId?: string;
        paymentTime?: string;
      }>('/v1/payments/inquiryPayment', body);
      return this.mapOrderQuery(response?.paymentStatus, response ?? undefined);
    } catch {
      // fail-closed：查询失败不得误判为已支付
      return { status: 'UNKNOWN' };
    }
  }

  // Antom paymentStatus → BunnyEra OrderQueryResult 状态映射（fail-closed）：
  // SUCCESS   → PAID
  // FAIL      → CLOSED（支付失败终态，不可再支付）
  // CANCELLED → CLOSED
  // PROCESSING / 未识别 → UNKNOWN（绝不误判成功）
  private mapOrderQuery(
    paymentStatus: string | undefined,
    response?: { paymentAmount?: AntomAmount; paymentId?: string; paymentTime?: string }
  ): OrderQueryResult {
    switch (paymentStatus) {
      case 'SUCCESS':
        return {
          status: 'PAID',
          amount: response?.paymentAmount?.value ? Number(response.paymentAmount.value) : undefined,
          tradeNo: response?.paymentId,
          paidAt: response?.paymentTime ? new Date(response.paymentTime) : undefined,
        };
      case 'FAIL':
      case 'CANCELLED':
        return { status: 'CLOSED', tradeNo: response?.paymentId };
      default:
        return { status: 'UNKNOWN' };
    }
  }

  async closeOrder(params: CloseOrderParams): Promise<boolean> {
    try {
      // cancel API：仅未达终态的支付可取消
      const response = await this.sendRequest<{ result?: AntomResult }>('/v1/payments/cancel', {
        paymentRequestId: params.orderNo,
      });
      return response?.result?.resultStatus === 'S';
    } catch {
      return false;
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    try {
      if (!params.tradeNo) {
        // Antom 退款必须提供原支付 paymentId；缺失时 fail-closed
        return { success: false, error: '缺少 Antom paymentId，无法发起退款' };
      }
      const response = await this.sendRequest<{
        result?: AntomResult;
        refundId?: string;
      }>('/v1/payments/refund', this.buildRefundRequest(params, params.tradeNo));
      const status = response?.result?.resultStatus;
      if (status === 'S') {
        return { success: true, channelRefundNo: response?.refundId };
      }
      if (status === 'U') {
        // REFUND_IN_PROCESS：结果未知，交由 queryRefund 确认终态，此处不标记成功
        return { success: false, channelRefundNo: response?.refundId, error: 'REFUND_IN_PROCESS' };
      }
      return { success: false, error: `Antom 退款失败: ${response?.result?.resultCode || 'UNKNOWN'}` };
    } catch (error) {
      return { success: false, error: `Antom 退款失败: ${(error as Error).message}` };
    }
  }

  async queryRefund(params: QueryRefundParams): Promise<RefundQueryResult> {
    try {
      const response = await this.sendRequest<{
        result?: AntomResult;
        refundStatus?: string;
        refundAmount?: AntomAmount;
      }>('/v1/payments/inquiryRefund', { refundRequestId: params.refundNo });
      // inquiryRefund 的终态以 refundStatus / result.resultStatus 判断
      const status = response?.refundStatus || response?.result?.resultStatus;
      switch (status) {
        case 'SUCCESS':
        case 'S':
          return {
            status: 'SUCCESS',
            refundAmount: response?.refundAmount?.value ? Number(response.refundAmount.value) : undefined,
          };
        case 'FAIL':
        case 'F':
          return { status: 'FAILED' };
        case 'PROCESSING':
        case 'U':
          return { status: 'PROCESSING' };
        default:
          return { status: 'UNKNOWN' };
      }
    } catch {
      return { status: 'UNKNOWN' };
    }
  }

  // 兼容方法：验签统一收敛到 handleWebhook，此方法保持 fail-closed 拒绝
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  verifyCallback(_body: unknown, _headers: Record<string, string>): boolean {
    return false;
  }

  // 兼容方法：纯解析（不验签）。业务侧必须经由 handleWebhook 完成验签后再使用解析结果。
  parseCallback(body: unknown): CallbackData {
    const payload = body as AntomNotifyBody;
    const success = payload.result?.resultStatus === 'S';
    return {
      orderNo: payload.paymentRequestId || '',
      tradeNo: payload.paymentId || '',
      amount: payload.paymentAmount?.value ? Number(payload.paymentAmount.value) : 0,
      currency: payload.paymentAmount?.currency || '',
      status: success ? 'SUCCESS' : 'FAILED',
      paidAt: payload.paymentTime ? new Date(payload.paymentTime) : undefined,
      raw: body,
    };
  }

  // 统一 Webhook 入口：验签 + client-id 一致性 + 解析。
  // 规则：
  // 1. 验签失败 → verified=false，调用方必须拒绝
  // 2. header client-id 与本配置不一致 → verified=false
  // 3. 仅 PAYMENT_RESULT（终态通知）产出 CallbackData；
  //    PAYMENT_PENDING 等中间态 → verified=false（不更新订单，不得误判成功）
  // 4. 非 S 的 resultStatus → status=FAILED（fail-closed）
  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    try {
      const headers = payload.headers || {};
      const requestTime = headers['request-time'] || headers['Request-Time'] || '';
      const clientId = headers['client-id'] || headers['Client-Id'] || '';
      const signatureHeader = headers['signature'] || headers['Signature'] || '';

      if (!requestTime || !clientId || !signatureHeader) {
        return { verified: false, error: '缺少签名相关请求头' };
      }
      if (clientId !== this.clientId) {
        return { verified: false, error: 'client-id 与配置不一致' };
      }

      // 验签原文必须使用原始请求体字符串，调用方需以 text 方式读取 body
      const rawBody = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body);
      if (!this.verifySignature(this.webhookPath, requestTime, rawBody, signatureHeader)) {
        return { verified: false, error: 'Webhook 签名验证失败' };
      }

      const parsed: AntomNotifyBody = typeof payload.body === 'string' ? JSON.parse(payload.body) : (payload.body as AntomNotifyBody);
      if (parsed.notifyType !== 'PAYMENT_RESULT') {
        return { verified: false, error: `非终态通知类型: ${parsed.notifyType || 'UNKNOWN'}` };
      }
      if (!parsed.paymentRequestId || !parsed.paymentId) {
        return { verified: false, error: '通知缺少 paymentRequestId 或 paymentId' };
      }
      return { verified: true, data: this.parseCallback(parsed) };
    } catch {
      return { verified: false, error: 'Webhook 解析异常' };
    }
  }
}
