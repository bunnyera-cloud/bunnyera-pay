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
  
  // 验证回调签名
  verifyCallback(body: unknown, headers: Record<string, string>): boolean;
  
  // 解析回调
  parseCallback(body: unknown): CallbackData;
  
  // 下载账单
  downloadBill?(date: string): Promise<BillData>;
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
