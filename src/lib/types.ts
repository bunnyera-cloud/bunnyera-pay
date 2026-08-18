import { PaymentChannel, PaymentScene, UserRole, OrderStatus, MerchantStatus, RefundStatus } from '@prisma/client';

export { PaymentChannel, PaymentScene, UserRole, OrderStatus, MerchantStatus, RefundStatus };

// 支付渠道中文名称映射
export const PAYMENT_CHANNEL_NAMES: Record<PaymentChannel, string> = {
  ALIPAY_BAR: '支付宝当面付',
  ALIPAY_PC: '支付宝电脑网站',
  ALIPAY_WAP: '支付宝手机网站',
  WECHAT_NATIVE: '微信 Native',
  WECHAT_H5: '微信 H5',
  WECHAT_JSAPI: '微信 JSAPI',
  WECHAT_MINI: '微信小程序',
  UNIONPAY_GATEWAY: '银联在线网关',
  UNIONPAY_WAP: '银联 WAP',
  UNIONPAY_QR: '云闪付二维码',
  LAKALA_AGGREGATE: '拉卡拉聚合',
  DIGITAL_RMB: '数字人民币',
  VISA: 'Visa',
  MASTERCARD: 'Mastercard',
  ANTOM: 'Antom',
  PAYPAL: 'PayPal',
};

// 商户状态中文映射
export const MERCHANT_STATUS_NAMES: Record<MerchantStatus, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  REVIEWING: '审核中',
  SUPPLEMENTARY: '补充资料',
  APPROVED: '已通过',
  CHANNEL_PROVISION: '通道开通中',
  ACTIVE: '正常运营',
  SUSPENDED: '暂停',
  REJECTED: '已拒绝',
  TERMINATED: '已终止',
};

// 订单状态中文映射
export const ORDER_STATUS_NAMES: Record<OrderStatus, string> = {
  CREATED: '已创建',
  PAYING: '支付中',
  PAID: '已支付',
  CLOSED: '已关闭',
  PARTIALLY_REFUNDED: '部分退款',
  REFUNDED: '已全额退款',
  DISPUTED: '争议',
  FAILED: '失败',
};

// 角色权限定义
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  PLATFORM_SUPER_ADMIN: ['*'],
  PLATFORM_REVIEWER: ['merchant:review', 'merchant:view', 'order:view'],
  MERCHANT_OWNER: ['merchant:*', 'store:*', 'employee:*', 'order:*', 'refund:*', 'finance:*', 'report:*'],
  MERCHANT_ADMIN: ['store:*', 'employee:*', 'order:*', 'refund:apply', 'report:view'],
  FINANCE: ['order:view', 'refund:*', 'finance:*', 'report:*'],
  STORE_MANAGER: ['store:view_current', 'order:view_current', 'refund:apply', 'employee:view_current'],
  CASHIER: ['order:create', 'order:view_own'],
  CUSTOMER_SERVICE: ['order:view', 'refund:apply'],
  AUDITOR: ['log:view', 'order:view', 'merchant:view'],
};

// 经营类别选项
export const BUSINESS_CATEGORIES = [
  { value: 'retail', label: '零售' },
  { value: 'food', label: '餐饮' },
  { value: 'hotel', label: '酒店住宿' },
  { value: 'travel', label: '旅游' },
  { value: 'education', label: '教育培训' },
  { value: 'healthcare', label: '医疗健康' },
  { value: 'entertainment', label: '休闲娱乐' },
  { value: 'transportation', label: '交通运输' },
  { value: 'ecommerce', label: '电子商务' },
  { value: 'services', label: '生活服务' },
  { value: 'finance', label: '金融服务' },
  { value: 'technology', label: '科技服务' },
  { value: 'other', label: '其他' },
];

// 国家/地区
export const COUNTRIES = [
  { value: 'CN', label: '中国', phoneCode: '+86' },
  { value: 'US', label: '美国', phoneCode: '+1' },
  { value: 'HK', label: '中国香港', phoneCode: '+852' },
  { value: 'SG', label: '新加坡', phoneCode: '+65' },
  { value: 'JP', label: '日本', phoneCode: '+81' },
  { value: 'KR', label: '韩国', phoneCode: '+82' },
  { value: 'GB', label: '英国', phoneCode: '+44' },
  { value: 'DE', label: '德国', phoneCode: '+49' },
  { value: 'AU', label: '澳大利亚', phoneCode: '+61' },
  { value: 'CA', label: '加拿大', phoneCode: '+1' },
];
