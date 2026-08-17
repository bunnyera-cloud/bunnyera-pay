import './env.js';

export const config = {
  port: Number(process.env.PORT || 8080),
  baseUrl: process.env.APP_BASE_URL || 'http://localhost:8080',
  adminToken: process.env.ADMIN_TOKEN || '',
  paymentMode: process.env.PAYMENT_MODE || 'sandbox',
  alipay: {
    appId: process.env.ALIPAY_APP_ID || '',
    privateKeyPath: process.env.ALIPAY_PRIVATE_KEY_PATH || '',
    publicKeyPath: process.env.ALIPAY_PUBLIC_KEY_PATH || '',
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
  },
  wechat: {
    mchId: process.env.WECHAT_MCH_ID || '',
    appId: process.env.WECHAT_APP_ID || '',
    apiV3Key: process.env.WECHAT_API_V3_KEY || '',
    certSerial: process.env.WECHAT_MERCHANT_CERT_SERIAL || '',
    privateKeyPath: process.env.WECHAT_MERCHANT_PRIVATE_KEY_PATH || '',
    platformPublicKeyId: process.env.WECHATPAY_PUBLIC_KEY_ID || '',
    platformPublicKeyPath: process.env.WECHATPAY_PUBLIC_KEY_PATH || ''
  },
  unionpay: {
    merId: process.env.UNIONPAY_MER_ID || '',
    certId: process.env.UNIONPAY_CERT_ID || '',
    privateKeyPath: process.env.UNIONPAY_PRIVATE_KEY_PATH || '',
    publicKeyPath: process.env.UNIONPAY_PUBLIC_KEY_PATH || '',
    gateway: process.env.UNIONPAY_GATEWAY || 'https://gateway.test.95516.com/gateway/api/frontTransReq.do'
  },
  antom: {
    clientId: process.env.ANTOM_CLIENT_ID || '',
    gateway: process.env.ANTOM_GATEWAY || 'https://open.antglobal-us.com',
    privateKeyPath: process.env.ANTOM_MERCHANT_PRIVATE_KEY_PATH || '',
    publicKeyPath: process.env.ANTOM_PUBLIC_KEY_PATH || ''
  }
};

export function assertSafeConfig() {
  if (!['mock', 'sandbox', 'antom-sandbox', 'live'].includes(config.paymentMode)) throw new Error('PAYMENT_MODE must be mock, sandbox, antom-sandbox or live');
  if (config.paymentMode === 'live') {
    if (!config.adminToken || config.adminToken.length < 24) throw new Error('Live mode requires ADMIN_TOKEN >= 24 characters');
  }
}
