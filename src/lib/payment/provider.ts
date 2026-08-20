import { PaymentChannel } from '@prisma/client';

// 统一支付接口
export interface PaymentProvider {
  channel: PaymentChannel;

  // 创建支付
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;

  // 查询订单
  queryOrder(params: QueryOrderParams): Promise<OrderQueryResult>;

  // 关闭订单
  closeOrder(params: CloseOrderParams): Promise<boolean>;

  // 退款
  refund(params: RefundParams): Promise<RefundResult>;

  // 查询退款
  queryRefund(params: QueryRefundParams): Promise<RefundQueryResult>;

  // 验证回调签名（逐步收敛到 handleWebhook，保留兼容）
  verifyCallback(body: unknown, headers: Record<string, string>): boolean;

  // 解析回调（逐步收敛到 handleWebhook，保留兼容）
  parseCallback(body: unknown): CallbackData;

  // 统一 Webhook 处理：验签 + 凭证一致性校验 + 解密 + 解析。
  // 验签失败必须返回 verified=false，调用方不得继续处理；禁止兼容性假成功。
  handleWebhook(payload: WebhookPayload): Promise<WebhookResult>;

  // 下载账单
  downloadBill?(date: string): Promise<BillData>;
}

// Webhook 入参：原始请求体 + 请求头（验签所需的签名信息在 headers 中）
export interface WebhookPayload {
  body: unknown;
  headers: Record<string, string>;
}

// Webhook 处理结果：verified=false 时 data 必须为空
export interface WebhookResult {
  verified: boolean;
  data?: CallbackData;
  error?: string;
}

export interface CreatePaymentParams {
  orderNo: string;
  amount: number;
  subject: string;
  currency?: string;
  clientIp?: string;
  returnUrl?: string;
  notifyUrl: string;
  extraParams?: Record<string, string>;
}

export interface CreatePaymentResult {
  success: boolean;
  payData?: string; // 二维码URL、跳转URL、或HTML表单
  tradeNo?: string;
  error?: string;
}

export interface QueryOrderParams {
  orderNo: string;
  tradeNo?: string;
}

export interface OrderQueryResult {
  status: 'PAID' | 'UNPAID' | 'CLOSED' | 'REFUNDED' | 'UNKNOWN';
  amount?: number;
  tradeNo?: string;
  paidAt?: Date;
}

export interface CloseOrderParams {
  orderNo: string;
}

export interface RefundParams {
  refundNo: string;
  orderNo: string;
  tradeNo?: string;
  refundAmount: number;
  totalAmount: number;
  reason?: string;
  notifyUrl?: string;
}

export interface RefundResult {
  success: boolean;
  channelRefundNo?: string;
  error?: string;
}

export interface QueryRefundParams {
  refundNo: string;
  orderNo?: string;
}

export interface RefundQueryResult {
  status: 'SUCCESS' | 'PROCESSING' | 'FAILED' | 'UNKNOWN';
  refundAmount?: number;
}

export interface CallbackData {
  orderNo: string;
  tradeNo: string;
  amount: number;
  currency: string;
  status: 'SUCCESS' | 'FAILED';
  paidAt?: Date;
  raw: unknown;
}

export interface BillData {
  records: BillRecord[];
  totalCount: number;
  totalAmount: number;
}

export interface BillRecord {
  tradeNo: string;
  orderNo: string;
  amount: number;
  fee: number;
  type: string;
  time: Date;
}

// 支付渠道工厂
export class PaymentFactory {
  private static providers: Map<PaymentChannel, PaymentProvider> = new Map();

  static register(channel: PaymentChannel, provider: PaymentProvider) {
    this.providers.set(channel, provider);
  }

  static getProvider(channel: PaymentChannel): PaymentProvider | undefined {
    return this.providers.get(channel);
  }

  static getAvailableChannels(): PaymentChannel[] {
    return Array.from(this.providers.keys());
  }
}
