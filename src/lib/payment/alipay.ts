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
} from './provider';
import { PaymentChannel } from '@prisma/client';
import { amountToFen } from './config';

// 支付宝支付提供商（支持当面付、电脑网站、手机网站）
export class AlipayProvider implements PaymentProvider {
  channel: PaymentChannel;
  private appId: string;
  private privateKey: string;
  private publicKey: string;
  private gateway: string;
  private sellerId: string;

  constructor(config: {
    appId: string;
    privateKey: string;
    publicKey: string;
    gateway: string;
    sellerId?: string;
    channel: PaymentChannel;
  }) {
    this.channel = config.channel;
    this.appId = config.appId;
    this.privateKey = config.privateKey;
    this.publicKey = config.publicKey;
    this.gateway = config.gateway;
    this.sellerId = config.sellerId || '';
  }

  // 生成签名
  private sign(params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort();
    const signStr = sortedKeys
      .filter(k => params[k] !== '' && params[k] !== undefined && k !== 'sign')
      .map(k => `${k}=${params[k]}`)
      .join('&');

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signStr, 'utf8');
    return sign.sign(this.privateKey, 'base64');
  }

  // 验证签名
  private verify(params: Record<string, string>, signature: string): boolean {
    const sortedKeys = Object.keys(params).sort();
    const signStr = sortedKeys
      .filter(k => params[k] !== '' && params[k] !== undefined && k !== 'sign' && k !== 'sign_type')
      .map(k => `${k}=${params[k]}`)
      .join('&');

    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(signStr, 'utf8');
    return verify.verify(this.publicKey, signature, 'base64');
  }

  // 构建请求参数
  private buildParams(
    method: string,
    bizContent: Record<string, unknown>,
    options?: { notifyUrl?: string; returnUrl?: string }
  ): Record<string, string> {
    const params: Record<string, string> = {
      app_id: this.appId,
      method,
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      version: '1.0',
      biz_content: JSON.stringify(bizContent),
    };
    if (options?.notifyUrl) params.notify_url = options.notifyUrl;
    if (options?.returnUrl) params.return_url = options.returnUrl;
    params.sign = this.sign(params);
    return params;
  }

  // 发送请求到支付宝
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async sendRequest(params: Record<string, string>): Promise<any> {
    const queryString = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const response = await fetch(`${this.gateway}?${queryString}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return response.json();
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    try {
      let method: string;
      const bizContent: Record<string, unknown> = {
        out_trade_no: params.orderNo,
        total_amount: params.amount.toFixed(2),
        subject: params.subject,
      };

      let notifyUrl: string | undefined;
      let returnUrl: string | undefined;

      switch (this.channel) {
        case 'ALIPAY_BAR':
          method = 'alipay.trade.precreate';
          notifyUrl = params.notifyUrl;
          break;
        case 'ALIPAY_PC':
          method = 'alipay.trade.page.pay';
          bizContent.product_code = 'FAST_INSTANT_TRADE_PAY';
          returnUrl = params.returnUrl;
          notifyUrl = params.notifyUrl;
          break;
        case 'ALIPAY_WAP':
          method = 'alipay.trade.wap.pay';
          bizContent.product_code = 'QUICK_WAP_WAY';
          returnUrl = params.returnUrl;
          notifyUrl = params.notifyUrl;
          break;
        default:
          throw new Error(`Unsupported channel: ${this.channel}`);
      }

      const reqParams = this.buildParams(method, bizContent, { notifyUrl, returnUrl });

      // 对于当面付，直接调用 API 获取二维码
      if (this.channel === 'ALIPAY_BAR') {
        const result = await this.sendRequest(reqParams);
        const response = result?.alipay_trade_precreate_response;
        if (response?.code === '10000') {
          return {
            success: true,
            payData: response.qr_code,
            tradeNo: response.trade_no,
          };
        }
        return { success: false, error: response?.sub_msg || '创建支付失败' };
      }

      // 对于网页支付，生成跳转 URL
      const queryString = Object.entries(reqParams)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

      return {
        success: true,
        payData: `${this.gateway}?${queryString}`,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async queryOrder(params: QueryOrderParams): Promise<OrderQueryResult> {
    try {
      const bizContent: Record<string, unknown> = {
        out_trade_no: params.orderNo,
      };
      if (params.tradeNo) bizContent.trade_no = params.tradeNo;

      const reqParams = this.buildParams('alipay.trade.query', bizContent);
      const result = await this.sendRequest(reqParams);
      const response = result?.alipay_trade_query_response;

      if (response?.code === '10000') {
        const statusMap: Record<string, OrderQueryResult['status']> = {
          'WAIT_BUYER_PAY': 'UNPAID',
          'TRADE_SUCCESS': 'PAID',
          'TRADE_FINISHED': 'PAID',
          'TRADE_CLOSED': 'CLOSED',
        };
        return {
          status: statusMap[response.trade_status] || 'UNKNOWN',
          amount: amountToFen(response.total_amount),
          tradeNo: response.trade_no,
        };
      }
      return { status: 'UNKNOWN' };
    } catch {
      return { status: 'UNKNOWN' };
    }
  }

  async closeOrder(params: CloseOrderParams): Promise<boolean> {
    try {
      const bizContent = { out_trade_no: params.orderNo };
      const reqParams = this.buildParams('alipay.trade.close', bizContent);
      const result = await this.sendRequest(reqParams);
      return result?.alipay_trade_close_response?.code === '10000';
    } catch {
      return false;
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    try {
      const bizContent: Record<string, unknown> = {
        out_trade_no: params.orderNo,
        refund_amount: params.refundAmount.toFixed(2),
        out_request_no: params.refundNo,
        refund_reason: params.reason || '商户退款',
      };

      const reqParams = this.buildParams('alipay.trade.refund', bizContent);
      const result = await this.sendRequest(reqParams);
      const response = result?.alipay_trade_refund_response;

      if (response?.code === '10000') {
        return { success: true, channelRefundNo: response.trade_no };
      }
      return { success: false, error: response?.sub_msg || '退款失败' };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async queryRefund(params: QueryRefundParams): Promise<RefundQueryResult> {
    try {
      const bizContent = {
        out_trade_no: params.orderNo,
        out_request_no: params.refundNo,
      };
      const reqParams = this.buildParams('alipay.trade.fastpay.refund.query', bizContent);
      const result = await this.sendRequest(reqParams);
      const response = result?.alipay_trade_fastpay_refund_query_response;

      if (response?.code === '10000') {
        return {
          status: response.refund_amount ? 'SUCCESS' : 'PROCESSING',
          refundAmount: parseFloat(response.refund_amount || '0'),
        };
      }
      return { status: 'UNKNOWN' };
    } catch {
      return { status: 'UNKNOWN' };
    }
  }

  verifyCallback(body: unknown, _headers: Record<string, string>): boolean {
    if (typeof body !== 'object' || body === null) return false;
    const params = body as Record<string, string>;
    const signature = params.sign;
    if (!signature) return false;
    // sign_type 必须严格等于 RSA2，缺失也拒绝
    if (params.sign_type !== 'RSA2') return false;
    return this.verify(params, signature);
  }

  parseCallback(body: unknown): CallbackData {
    const params = body as Record<string, string>;
    const statusMap: Record<string, 'SUCCESS' | 'FAILED'> = {
      'TRADE_SUCCESS': 'SUCCESS',
      'TRADE_FINISHED': 'SUCCESS',
    };
    return {
      orderNo: params.out_trade_no,
      tradeNo: params.trade_no,
      amount: amountToFen(params.total_amount),
      currency: 'CNY',
      status: statusMap[params.trade_status] || 'FAILED',
      paidAt: params.gmt_payment ? new Date(params.gmt_payment) : undefined,
      raw: body,
    };
  }

  // 统一 Webhook：RSA2 验签 + app_id/seller_id 凭证一致性校验 + 解析。
  // 任一环节失败即 verified=false，禁止兼容性假成功。
  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    if (typeof payload.body !== 'object' || payload.body === null) {
      return { verified: false, error: '回调体格式非法' };
    }
    const params = payload.body as Record<string, string>;

    if (!this.verifyCallback(payload.body, payload.headers)) {
      return { verified: false, error: '签名验证失败' };
    }

    // app_id 必须与服务端配置一致
    if (!this.appId || params.app_id !== this.appId) {
      return { verified: false, error: 'app_id 与服务端配置不一致' };
    }

    // seller_id 校验（可以可靠获得时校验）
    if (this.sellerId && params.seller_id && params.seller_id !== this.sellerId) {
      return { verified: false, error: 'seller_id 与服务端配置不一致' };
    }

    try {
      return { verified: true, data: this.parseCallback(payload.body) };
    } catch (error) {
      return { verified: false, error: `回调解析失败: ${(error as Error).message}` };
    }
  }
}
