import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { config } from './config.js';
import { createAntomPayment } from './antom.js';
import { requireChannel } from './channels.js';

const sandboxGatewayHost = 'openapi-sandbox.dl.alipaydev.com';

function canonical(params) {
  return Object.keys(params).filter(key => key !== 'sign' && params[key] !== '' && params[key] != null)
    .sort().map(key => `${key}=${params[key]}`).join('&');
}

function chinaTimestamp() {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function alipayForm(order) {
  const { appId, privateKeyPath, gateway } = config.alipay;
  if (!appId || !privateKeyPath) return mockPayment(order, 'ALIPAY_SANDBOX_CONFIG_REQUIRED');
  if (new URL(gateway).hostname !== sandboxGatewayHost) throw new Error('SANDBOX_GATEWAY_REQUIRED');
  const method = order.channel === 'qr' ? 'alipay.trade.page.pay' : 'alipay.trade.wap.pay';
  const productCode = order.channel === 'qr' ? 'FAST_INSTANT_TRADE_PAY' : 'QUICK_WAP_WAY';
  const params = {
    app_id: appId, method, format: 'JSON', charset: 'utf-8', sign_type: 'RSA2',
    timestamp: chinaTimestamp(), version: '1.0',
    notify_url: `${config.baseUrl}/api/callbacks/alipay`,
    return_url: `${config.baseUrl}/?returned_order=${encodeURIComponent(order.id)}`,
    biz_content: JSON.stringify({ out_trade_no: order.id, total_amount: (order.amountFen / 100).toFixed(2), subject: order.subject, product_code: productCode, timeout_express: '15m' })
  };
  const privateKey = await readFile(privateKeyPath, 'utf8');
  params.sign = crypto.sign('RSA-SHA256', Buffer.from(canonical(params)), privateKey).toString('base64');
  const fields = Object.entries(params).map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`).join('');
  return { payHtml: `<!doctype html><html><body><form id="alipay" method="post" action="${escapeHtml(gateway)}">${fields}</form><script>document.getElementById('alipay').submit()</script></body></html>`, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
}

function mockPayment(order, setupNotice = null) {
  const token = crypto.randomBytes(18).toString('base64url');
  return { providerTradeNo: `MOCK-${Date.now()}`, payUrl: `${config.baseUrl}/mock-pay.html?order=${encodeURIComponent(order.id)}&token=${token}`, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), simulation: true, setupNotice };
}

export async function createProviderPayment(order) {
  await requireChannel(order.provider, order.channel);
  if (config.paymentMode === 'antom-sandbox' && order.provider === 'alipay') return createAntomPayment(order);
  if (config.paymentMode === 'sandbox' && order.provider === 'alipay') return alipayForm(order);
  if (config.paymentMode === 'mock' || (['sandbox', 'antom-sandbox'].includes(config.paymentMode) && ['wechat', 'unionpay'].includes(order.provider))) return mockPayment(order);
  throw new Error('CHANNEL_ADAPTER_NOT_ACTIVATED');
}

export async function verifyAlipayCallback(params) {
  if (config.paymentMode !== 'sandbox' || !config.alipay.publicKeyPath) return false;
  if (new URL(config.alipay.gateway).hostname !== sandboxGatewayHost) return false;
  const publicKey = await readFile(config.alipay.publicKeyPath, 'utf8');
  return crypto.verify('RSA-SHA256', Buffer.from(canonical(params)), publicKey, Buffer.from(params.sign || '', 'base64'));
}

export function verifyMockCallback(rawBody, signature) {
  const expected = crypto.createHmac('sha256', config.adminToken || 'mock-development-key').update(rawBody).digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(signature || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
