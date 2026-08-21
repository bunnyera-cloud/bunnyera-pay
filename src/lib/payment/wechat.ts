import crypto from 'crypto';
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
  RefundWebhookResult,
} from './provider';
import { PaymentChannel } from '@prisma/client';
import { amountToFen } from './config';

// 微信支付提供商（支持 Native、H5、JSAPI、小程序）
export class WechatPayProvider implements PaymentProvider {
  channel: PaymentChannel;
  private appId: string;
  private mchId: string;
  private apiV3Key: string;
  private merchantSerialNo: string;
  private merchantPrivateKey: string;
  private platformPublicKey: string;
  private platformSerialNo: string;

  constructor(config: {
    appId: string;
    mchId: string;
    apiV3Key: string;
    merchantSerialNo: string;
    merchantPrivateKey: string;
    platformPublicKey: string;
    platformSerialNo: string;
    channel: PaymentChannel;
  }) {
    this.channel = config.channel;
    this.appId = config.appId;
    this.mchId = config.mchId;
    this.apiV3Key = config.apiV3Key;
    this.merchantSerialNo = config.merchantSerialNo;
    this.merchantPrivateKey = config.merchantPrivateKey;
    this.platformPublicKey = config.platformPublicKey;
    this.platformSerialNo = config.platformSerialNo;
  }

  // 微信支付 V3 签名
  private signRequest(method: string, url: string, timestamp: string, nonceStr: string, body: string): string {
    const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    return sign.sign(this.merchantPrivateKey, 'base64');
  }

  // 生成 Authorization 头
  private getAuthHeader(method: string, url: string, body: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const signature = this.signRequest(method, url, timestamp, nonceStr, body);
    return `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${this.merchantSerialNo}"`;
  }

  // 微信平台签名校验：API 响应与回调共用，缺头/证书/序列号一律拒绝
  private verifyPlatformSignature(rawBody: string, headers: Record<string, string>): boolean {
    try {
      const timestamp = headers['wechatpay-timestamp'];
      const nonce = headers['wechatpay-nonce'];
      const signature = headers['wechatpay-signature'];
      const serial = headers['wechatpay-serial'];
      if (!timestamp || !nonce || !signature || !serial) return false;
      if (!this.platformPublicKey || serial !== this.platformSerialNo) return false;

      const timestampSeconds = Number(timestamp);
      if (!Number.isInteger(timestampSeconds)) return false;
      if (Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) return false;

      const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(message, 'utf8');
      verifier.end();
      return verifier.verify(this.platformPublicKey, signature, 'base64');
    } catch {
      return false;
    }
  }

  // V3 API 请求：先验证微信平台响应签名，再解析或信任响应内容
  private async apiRequest(method: string, path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = `https://api.mch.weixin.qq.com${path}`;
    const bodyStr = body ? JSON.stringify(body) : '';
    const auth = this.getAuthHeader(method, path, bodyStr);

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': auth,
      },
      body: method !== 'GET' ? bodyStr : undefined,
    });

    const rawBody = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });
    if (!this.verifyPlatformSignature(rawBody, responseHeaders)) {
      throw new Error('微信支付响应验签失败');
    }

    let parsed: Record<string, unknown> = {};
    if (rawBody) {
      try {
        parsed = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        throw new Error('微信支付响应格式错误');
      }
    }
    if (!response.ok) {
      const message = typeof parsed.message === 'string' ? parsed.message : '';
      throw new Error(message || `微信支付请求失败: ${response.status}`);
    }
    return parsed;
  }

  // 解密回调通知
  private decryptNotify(ciphertext: string, nonce: string, associatedData: string): string {
    const key = Buffer.from(this.apiV3Key, 'utf8');
    if (key.length !== 32) throw new Error('APIv3 Key 必须为32字节');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce));
    decipher.setAAD(Buffer.from(associatedData));
    const ciphertextBuf = Buffer.from(ciphertext, 'base64');
    const authTag = ciphertextBuf.subarray(ciphertextBuf.length - 16);
    const data = ciphertextBuf.subarray(0, ciphertextBuf.length - 16);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    try {
      let path: string;
      const total = amountToFen(params.amount.toString());
      if (total <= 0) throw new Error('支付金额必须大于0');
      const body: Record<string, unknown> = {
        appid: this.appId,
        mchid: this.mchId,
        description: params.subject,
        out_trade_no: params.orderNo,
        notify_url: params.notifyUrl,
        amount: {
          total,
          currency: params.currency || 'CNY',
        },
      };

      switch (this.channel) {
        case 'WECHAT_NATIVE':
          path = '/v3/pay/transactions/native';
          break;
        case 'WECHAT_H5':
          if (!params.clientIp) throw new Error('微信 H5 支付缺少 payer_client_ip');
          path = '/v3/pay/transactions/h5';
          body.scene_info = {
            payer_client_ip: params.clientIp,
            h5_info: { type: 'Wap' },
          };
          break;
        case 'WECHAT_JSAPI':
          if (!params.extraParams?.openid) throw new Error('微信 JSAPI 支付缺少 openid');
          path = '/v3/pay/transactions/jsapi';
          body.payer = { openid: params.extraParams.openid };
          break;
        case 'WECHAT_MINI':
          if (!params.extraParams?.openid) throw new Error('微信小程序支付缺少 openid');
          path = '/v3/pay/transactions/jsapi';
          body.payer = { openid: params.extraParams.openid };
          break;
        default:
          throw new Error(`Unsupported channel: ${this.channel}`);
      }

      const result = await this.apiRequest('POST', path, body) as Record<string, string>;

      if (this.channel === 'WECHAT_NATIVE') {
        return { success: true, payData: result.code_url };
      }
      if (this.channel === 'WECHAT_H5') {
        return { success: true, payData: result.h5_url };
      }
      if (!result.prepay_id) throw new Error('微信支付未返回 prepay_id');
      return { success: true, payData: this.buildJsapiPayData(result.prepay_id) };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async queryOrder(params: QueryOrderParams): Promise<OrderQueryResult> {
    try {
      let path: string;
      if (params.tradeNo) {
        path = `/v3/pay/transactions/id/${params.tradeNo}?mchid=${this.mchId}`;
      } else {
        path = `/v3/pay/transactions/out-trade-no/${params.orderNo}?mchid=${this.mchId}`;
      }

      const result = await this.apiRequest('GET', path) as {
        trade_state?: string; transaction_id?: string; success_time?: string;
        amount?: { total?: number };
      };
      const statusMap: Record<string, OrderQueryResult['status']> = {
        'SUCCESS': 'PAID',
        'NOTPAY': 'UNPAID',
        'CLOSED': 'CLOSED',
        'REFUND': 'REFUNDED',
      };

      return {
        status: statusMap[result.trade_state || ''] || 'UNKNOWN',
        amount: result.amount?.total,
        tradeNo: result.transaction_id,
        paidAt: result.success_time ? new Date(result.success_time) : undefined,
      };
    } catch {
      return { status: 'UNKNOWN' };
    }
  }

  async closeOrder(params: CloseOrderParams): Promise<boolean> {
    try {
      await this.apiRequest('POST', `/v3/pay/transactions/out-trade-no/${params.orderNo}/close`, {
        mchid: this.mchId,
      });
      return true;
    } catch {
      return false;
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    try {
      const refundAmount = amountToFen(params.refundAmount.toString());
      const totalAmount = amountToFen(params.totalAmount.toString());
      const body: Record<string, unknown> = {
        out_trade_no: params.orderNo,
        out_refund_no: params.refundNo,
        reason: params.reason || '商户退款',
        amount: {
          refund: refundAmount,
          total: totalAmount,
          currency: 'CNY',
        },
      };
      if (params.notifyUrl) body.notify_url = params.notifyUrl;

      const result = await this.apiRequest('POST', '/v3/refund/domestic/refunds', body) as { refund_id?: string };
      return {
        success: true,
        channelRefundNo: result.refund_id,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async queryRefund(params: QueryRefundParams): Promise<RefundQueryResult> {
    try {
      const result = await this.apiRequest('GET', `/v3/refund/domestic/refunds/${params.refundNo}`) as {
        status?: string; amount?: { refund?: number };
      };
      const statusMap: Record<string, RefundQueryResult['status']> = {
        'SUCCESS': 'SUCCESS',
        'PROCESSING': 'PROCESSING',
        'ABNORMAL': 'FAILED',
        'CLOSED': 'FAILED',
      };
      return {
        status: statusMap[result.status || ''] || 'UNKNOWN',
        refundAmount: result.amount?.refund,
      };
    } catch {
      return { status: 'UNKNOWN' };
    }
  }

  verifyCallback(body: unknown, headers: Record<string, string>): boolean {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    return this.verifyPlatformSignature(bodyStr, normalizeHeaders(headers));
  }

  parseCallback(body: unknown): CallbackData {
    const resource = this.parseNotifyResource(body);

    return {
      orderNo: resource.out_trade_no || '',
      tradeNo: resource.transaction_id || '',
      amount: resource.amount?.total || 0,
      currency: resource.amount?.currency || 'CNY',
      status: resource.trade_state === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      paidAt: resource.success_time ? new Date(resource.success_time) : undefined,
      raw: body,
    };
  }

  // 统一 Webhook：V3 验签（fail-closed，平台证书接入前一律拒绝）+ 解密 + 解析。
  // 验签失败绝不返回 verified=true，禁止兼容性假成功。
  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    if (!this.verifyCallback(payload.body, payload.headers)) {
      return { verified: false, error: '微信回调验签失败' };
    }
    try {
      const envelope = typeof payload.body === 'string'
        ? JSON.parse(payload.body) as { event_type?: string }
        : payload.body as { event_type?: string };
      if (envelope.event_type !== 'TRANSACTION.SUCCESS') {
        return { verified: false, error: `非支付成功通知: ${envelope.event_type || 'UNKNOWN'}` };
      }
      const data = this.parseCallback(payload.body);
      const resource = this.parseNotifyResource(payload.body);
      if (
        resource.appid !== this.appId ||
        resource.mchid !== this.mchId ||
        resource.trade_state !== 'SUCCESS' ||
        !data.orderNo ||
        !data.tradeNo ||
        !Number.isSafeInteger(data.amount) ||
        data.amount <= 0 ||
        data.currency !== 'CNY'
      ) {
        return { verified: false, error: '微信回调商户、状态或金额字段不一致' };
      }
      return { verified: true, data };
    } catch (error) {
      return { verified: false, error: `回调解密/解析失败: ${(error as Error).message}` };
    }
  }

  async handleRefundWebhook(payload: WebhookPayload): Promise<RefundWebhookResult> {
    if (!this.verifyCallback(payload.body, payload.headers)) {
      return { verified: false, error: '微信退款回调验签失败' };
    }
    try {
      const envelope = typeof payload.body === 'string'
        ? JSON.parse(payload.body) as { event_type?: string }
        : payload.body as { event_type?: string };
      const eventType = envelope.event_type || '';
      if (!['REFUND.SUCCESS', 'REFUND.ABNORMAL', 'REFUND.CLOSED'].includes(eventType)) {
        return { verified: false, error: `非退款终态通知: ${eventType || 'UNKNOWN'}` };
      }
      const resource = this.parseRefundNotifyResource(payload.body);
      if (
        resource.mchid !== this.mchId ||
        !resource.out_refund_no ||
        !resource.out_trade_no ||
        !resource.refund_id ||
        !Number.isSafeInteger(resource.amount?.refund) ||
        (resource.amount?.refund || 0) <= 0
      ) {
        return { verified: false, error: '微信退款回调商户或金额字段不一致' };
      }
      const status = resource.refund_status === 'SUCCESS'
        ? 'SUCCESS'
        : resource.refund_status === 'PROCESSING'
          ? 'PROCESSING'
          : 'FAILED';
      return {
        verified: true,
        data: {
          refundNo: resource.out_refund_no,
          orderNo: resource.out_trade_no,
          channelRefundNo: resource.refund_id,
          refundAmount: resource.amount?.refund || 0,
          status,
        },
      };
    } catch (error) {
      return { verified: false, error: `退款回调解密/解析失败: ${(error as Error).message}` };
    }
  }

  private buildJsapiPayData(prepayId: string): string {
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const packageValue = `prepay_id=${prepayId}`;
    const message = `${this.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(message, 'utf8');
    const paySign = signer.sign(this.merchantPrivateKey, 'base64');
    return JSON.stringify({
      appId: this.appId,
      timeStamp,
      nonceStr,
      package: packageValue,
      signType: 'RSA',
      paySign,
    });
  }

  private parseNotifyResource(body: unknown): {
    appid?: string;
    mchid?: string;
    out_trade_no?: string;
    transaction_id?: string;
    trade_state?: string;
    amount?: { total?: number; currency?: string };
    success_time?: string;
  } {
    const envelope = (typeof body === 'string' ? JSON.parse(body) : body) as {
      resource?: {
        algorithm?: string;
        ciphertext?: string;
        nonce?: string;
        associated_data?: string;
      };
    };
    const resource = envelope?.resource;
    if (
      resource?.algorithm !== 'AEAD_AES_256_GCM' ||
      !resource.ciphertext ||
      !resource.nonce
    ) {
      throw new Error('微信回调加密资源不完整');
    }
    const decrypted = this.decryptNotify(
      resource.ciphertext,
      resource.nonce,
      resource.associated_data || ''
    );
    return JSON.parse(decrypted) as {
      appid?: string;
      mchid?: string;
      out_trade_no?: string;
      transaction_id?: string;
      trade_state?: string;
      amount?: { total?: number; currency?: string };
      success_time?: string;
    };
  }

  private parseRefundNotifyResource(body: unknown): {
    mchid?: string;
    out_trade_no?: string;
    out_refund_no?: string;
    refund_id?: string;
    refund_status?: string;
    amount?: { refund?: number; total?: number; currency?: string };
  } {
    const envelope = (typeof body === 'string' ? JSON.parse(body) : body) as {
      resource?: {
        algorithm?: string;
        ciphertext?: string;
        nonce?: string;
        associated_data?: string;
      };
    };
    const resource = envelope?.resource;
    if (
      resource?.algorithm !== 'AEAD_AES_256_GCM' ||
      !resource.ciphertext ||
      !resource.nonce
    ) {
      throw new Error('微信退款回调加密资源不完整');
    }
    const decrypted = this.decryptNotify(
      resource.ciphertext,
      resource.nonce,
      resource.associated_data || ''
    );
    return JSON.parse(decrypted) as {
      mchid?: string;
      out_trade_no?: string;
      out_refund_no?: string;
      refund_id?: string;
      refund_status?: string;
      amount?: { refund?: number; total?: number; currency?: string };
    };
  }
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
}
