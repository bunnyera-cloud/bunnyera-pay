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

// 银联支付提供商（支持网关支付、手机网页支付、二维码支付）
export class UnionPayProvider implements PaymentProvider {
  channel: PaymentChannel;
  private merId: string;
  private certPath: string;
  private certPass: string;
  private gateway: string;
  private version: string;
  private encoding: string;
  private signMethod: string;

  constructor(config: {
    merId: string;
    certPath: string;
    certPass: string;
    gateway: string;
    channel: PaymentChannel;
  }) {
    this.channel = config.channel;
    this.merId = config.merId;
    this.certPath = config.certPath;
    this.certPass = config.certPass;
    this.gateway = config.gateway;
    this.version = '5.1.0';
    this.encoding = 'UTF-8';
    this.signMethod = '01'; // RSA
  }

  // 银联签名（生产环境需加载商户私钥证书）
  private sign(params: Record<string, string>): string {
    // production_not_configured: 需要商户私钥证书 (pfx/p12) 进行 RSA 签名
    throw new Error('[UnionPay] Signing requires production certificate (production_not_configured)');
  }

  // 银联验签（生产环境需加载银联公钥证书）
  private verify(params: Record<string, string>, _signature: string): boolean {
    // production_not_configured: 需要银联公钥证书进行验签
    // fail closed: 缺少证书直接拒绝
    console.warn('[UnionPay] Verification requires UnionPay public key certificate (production_not_configured)');
    return false;
  }

  // 检查配置状态
  private checkConfig(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!this.merId || this.merId === 'TODO') missing.push('merId');
    if (!this.certPath || this.certPath === 'TODO') missing.push('certPath');
    
    return {
      configured: missing.length === 0,
      missing
    };
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const configCheck = this.checkConfig();
    if (!configCheck.configured) {
      return {
        success: false,
        error: `UnionPay configuration missing: ${configCheck.missing.join(', ')}`
      };
    }

    try {
      // 根据渠道类型处理
      let payData: string;
      switch (this.channel) {
        case 'UNIONPAY_GATEWAY':
          // 网关支付：返回支付页面URL
          payData = `${this.gateway}/gateway?merId=${this.merId}&orderNo=${params.orderNo}`;
          break;
        case 'UNIONPAY_WAP':
          // WAP支付：返回手机支付页面URL
          payData = `${this.gateway}/wap?merId=${this.merId}&orderNo=${params.orderNo}`;
          break;
        case 'UNIONPAY_QR':
          // 二维码支付：返回二维码内容
          payData = `${this.gateway}/qr?merId=${this.merId}&orderNo=${params.orderNo}`;
          break;
        default:
          return { success: false, error: `Unsupported channel: ${this.channel}` };
      }

      return { success: true, payData };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async queryOrder(params: QueryOrderParams): Promise<OrderQueryResult> {
    const configCheck = this.checkConfig();
    if (!configCheck.configured) {
      return { status: 'UNKNOWN' };
    }

    // production_not_configured: 需要调用银联订单查询 API
    console.warn('[UnionPay] Order query requires production API integration (production_not_configured)');
    return { status: 'UNKNOWN' };
  }

  async closeOrder(_params: CloseOrderParams): Promise<boolean> {
    // production_not_configured: 需要调用银联订单关闭 API
    console.warn('[UnionPay] Close order requires production API integration (production_not_configured)');
    return false;
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const configCheck = this.checkConfig();
    if (!configCheck.configured) {
      return {
        success: false,
        error: `UnionPay configuration missing: ${configCheck.missing.join(', ')}`
      };
    }

    // production_not_configured: 需要调用银联退款 API
    console.warn('[UnionPay] Refund requires production API integration (production_not_configured)');
    return { success: false, error: 'UnionPay refund not yet integrated (production_not_configured)' };
  }

  async queryRefund(params: QueryRefundParams): Promise<RefundQueryResult> {
    const configCheck = this.checkConfig();
    if (!configCheck.configured) {
      return { status: 'UNKNOWN' };
    }

    // production_not_configured: 需要调用银联退款查询 API
    console.warn('[UnionPay] Refund query requires production API integration (production_not_configured)');
    return { status: 'UNKNOWN' };
  }

  verifyCallback(body: unknown, headers: Record<string, string>): boolean {
    // 银联回调验签
    const configCheck = this.checkConfig();
    if (!configCheck.configured) {
      console.warn('[UnionPay] Missing production configuration for callback verification');
      return false;
    }

    // 安全检查：返回false确保安全
    console.warn('[UnionPay] Callback verification requires UnionPay certificate (not implemented)');
    return false;
  }

  parseCallback(body: unknown): CallbackData {
    const data = body as Record<string, string>;
    
    return {
      orderNo: data.orderNo || '',
      tradeNo: data.txnId || '',
      amount: data.txnAmt ? parseInt(data.txnAmt) / 100 : 0,
      currency: data.currency || 'CNY',
      status: data.respCode === '00' ? 'SUCCESS' : 'FAILED',
      paidAt: data.txnTime ? new Date(data.txnTime) : undefined,
      raw: body,
    };
  }

  // 统一 Webhook：验签（fail-closed，银联证书接入前一律拒绝）+ 解析。
  // 验签失败绝不返回 verified=true，禁止兼容性假成功。
  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    if (!this.verifyCallback(payload.body, payload.headers)) {
      return { verified: false, error: '银联回调验签失败（需银联公钥证书，验签未通过前拒绝处理）' };
    }
    try {
      return { verified: true, data: this.parseCallback(payload.body) };
    } catch (error) {
      return { verified: false, error: `回调解析失败: ${(error as Error).message}` };
    }
  }

  // 获取配置状态
  getConfigStatus(): { configured: boolean; missing: string[]; environment: string } {
    const configCheck = this.checkConfig();
    return {
      configured: configCheck.configured,
      missing: configCheck.missing,
      environment: this.gateway?.includes('test') ? 'sandbox' : 'production'
    };
  }
}