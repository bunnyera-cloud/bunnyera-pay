import { access } from 'node:fs/promises';
import { config } from './config.js';

async function readable(file) {
  if (!file) return false;
  try { await access(file); return true; } catch { return false; }
}

export async function channelStatus() {
  const alipayConfigured = Boolean(config.alipay.appId) && await readable(config.alipay.privateKeyPath) && await readable(config.alipay.publicKeyPath);
  const wechatConfigured = Boolean(config.wechat.mchId && config.wechat.appId && config.wechat.apiV3Key && config.wechat.certSerial)
    && await readable(config.wechat.privateKeyPath) && await readable(config.wechat.platformPublicKeyPath);
  const unionpayConfigured = Boolean(config.unionpay.merId && config.unionpay.certId)
    && await readable(config.unionpay.privateKeyPath) && await readable(config.unionpay.publicKeyPath);
  return [
    { id: 'alipay', name: '支付宝', scenes: ['qr', 'h5'], configured: alipayConfigured, mode: config.paymentMode, settlement: '支付宝商户账户' },
    { id: 'wechat', name: '微信支付', scenes: ['qr', 'h5', 'jsapi', 'miniprogram'], configured: wechatConfigured, mode: wechatConfigured ? config.paymentMode : 'pending', settlement: '微信支付商户账户' },
    { id: 'unionpay', name: '银联/云闪付', scenes: ['web', 'h5'], configured: unionpayConfigured, mode: unionpayConfigured ? config.paymentMode : 'pending', settlement: '银联收单商户结算账户' }
  ];
}

export async function requireChannel(provider, channel) {
  const entry = (await channelStatus()).find(x => x.id === provider);
  if (!entry) throw new Error('INVALID_PROVIDER');
  if (!entry.scenes.includes(channel)) throw new Error('INVALID_CHANNEL');
  if (config.paymentMode === 'live' && !entry.configured) {
    const error = new Error('CHANNEL_NOT_CONFIGURED');
    error.code = `${provider.toUpperCase()}_PRODUCTION_CREDENTIALS_REQUIRED`;
    throw error;
  }
  return entry;
}
