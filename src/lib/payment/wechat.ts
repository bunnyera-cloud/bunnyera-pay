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
} from './provider';
import { PaymentChannel } from '@prisma/client';

// 微信支付提供商（支持 Native、H5、JSAPI、小程序）
export class WechatPayProvider implements PaymentProvider {
  channel: PaymentChannel;
  private appId: string;
  private mchId: string;
  private apiKey: string;
  private serialNo: string;
  private privateKey: string;

  constructor(config: {
    appId: string;
    mchId: string;
    apiKey: string;
    serialNo: string;
    privateKey: string;
    channel: PaymentChannel;
  }) {
    this.channel = config.channel;
    this.appId = config.appId;
    this.mchId = config.mchId;
    this.apiKey = config.apiKey;
    this.serialNo = config.serialNo;
    this.privateKey = config.privateKey;
  }

  // 微信支付 V3 签名
  private signRequest(method: string, url: string, timestamp: string, nonceStr: string, body: string): string {
    const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    return sign.sign(this.privateKey, 'base64');
  }

  // 生成 Authorization 头
  private getAuthHeader(method: string, url: string, body: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const signature = this.signRequest(method, url, timestamp, nonceStr, body);
    return `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${this.serialNo}"`;
  }

  // V3 API 请求
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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `微信支付请求失败: ${response.status}`);
    }

    if (response.status === 204) return {};
    return response.json();
  }

  // 解密回调通知
  private decryptNotify(ciphertext: string, nonce: string, associatedData: string): string {
    const key = crypto.createHash('sha256').update(this.apiKey).digest();
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
      const body: Record<string, unknown> = {
        appid: this.appId,
        mchid: this.mchId,
        description: params.subject,
        out_trade_no: params.orderNo,
        notify_url: params.notifyUrl,
        amount: {
          total: Math.round(params.amount * 100), // 分
          currency: params.currency || 'CNY',
        },
      };

      switch (this.channel) {
        case 'WECHAT_NATIVE':
          path = '/v3/pay/transactions/native';
          break;
        case 'WECHAT_H5':
          path = '/v3/pay/transactions/h5';
          body.scene_info = {
            payer_client_ip: params.clientIp || '127.0.0.1',
            h5_info: { type: 'Wap' },
          };
          break;
        case 'WECHAT_JSAPI':
          path = '/v3/pay/transactions/jsapi';
          body.payer = { openid: params.extraParams?.openid || '' };
          break;
        case 'WECHAT_MINI':
          path = '/v3/pay/transactions/jsapi';
          body.payer = { openid: params.extraParams?.openid || '' };
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
      // JSAPI/小程序返回 prepay_id
      return { success: true, payData: result.prepay_id };
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
        amount: result.amount?.total ? result.amount.total / 100 : undefined,
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
      const body: Record<string, unknown> = {
        out_trade_no: params.orderNo,
        out_refund_no: params.refundNo,
        reason: params.reason || '商户退款',
        amount: {
          refund: Math.round(params.refundAmount * 100),
          total: Math.round(params.totalAmount * 100),
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
        refundAmount: result.amount?.refund ? result.amount.refund / 100 : undefined,
      };
    } catch {
      return { status: 'UNKNOWN' };
    }
  }

  verifyCallback(body: unknown, headers: Record<string, string>): boolean {
    // 微信支付 V3 回调验签 - 安全修复：没有生产配置时fail closed
    const timestamp = headers['wechatpay-timestamp'];
    const nonce = headers['wechatpay-nonce'];
    const signature = headers['wechatpay-signature'];
    if (!timestamp || !nonce || !signature) return false;

    // 安全检查：如果缺少必要生产配置，直接拒绝
    if (!this.apiKey || !this.serialNo || !this.privateKey || this.apiKey === 'TODO') {
      console.warn('[WeChatPay] Missing production configuration for callback verification');
      return false;
    }

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const message = `${timestamp}\n${nonce}\n${bodyStr}\n`;

    // 使用微信平台证书验签（实际需要从证书管理中获取）
    // 注意：生产环境需要实现完整的证书管理和验签逻辑
    // 当前版本在没有真实证书的情况下安全地返回false
    console.warn('[WeChatPay] Callback verification requires WeChatPay public key certificate (not implemented)');
    return false;
  }

  parseCallback(body: unknown): CallbackData {
    const data = body as {
      resource?: { ciphertext?: string; nonce?: string; associated_data?: string; out_trade_no?: string; transaction_id?: string; trade_state?: string; amount?: { total?: number; currency?: string }; success_time?: string };
      out_trade_no?: string;
      transaction_id?: string;
    };
    
    // 如果包含加密数据，先解密
    let resource = data.resource;
    if (resource?.ciphertext) {
      const decrypted = this.decryptNotify(
        resource.ciphertext,
        resource.nonce || '',
        resource.associated_data || ''
      );
      resource = JSON.parse(decrypted);
    }

    return {
      orderNo: resource?.out_trade_no || data.out_trade_no || '',
      tradeNo: resource?.transaction_id || data.transaction_id || '',
      amount: (resource?.amount?.total || 0) / 100,
      currency: resource?.amount?.currency || 'CNY',
      status: resource?.trade_state === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      paidAt: resource?.success_time ? new Date(resource.success_time) : undefined,
      raw: body,
    };
  }
}
