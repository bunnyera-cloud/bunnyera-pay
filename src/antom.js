import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { config } from './config.js';

const PAY_PATH = '/ams/sandbox/api/v1/payments/pay';

export function antomReady() {
  return Boolean(config.antom.clientId && config.antom.privateKeyPath && config.antom.publicKeyPath);
}

function signatureValue(header = '') {
  const match = header.match(/signature=([^,\s]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

async function key(path) { return readFile(path, 'utf8'); }

export async function signAntom(path, requestTime, body) {
  const content = `POST ${path}\n${config.antom.clientId}.${requestTime}.${body}`;
  const signed = crypto.sign('RSA-SHA256', Buffer.from(content), await key(config.antom.privateKeyPath)).toString('base64');
  return encodeURIComponent(signed);
}

export async function verifyAntom(path, responseTime, clientId, body, signatureHeader) {
  if (!antomReady() || clientId !== config.antom.clientId) return false;
  const content = `POST ${path}\n${clientId}.${responseTime}.${body}`;
  return crypto.verify('RSA-SHA256', Buffer.from(content), await key(config.antom.publicKeyPath), Buffer.from(signatureValue(signatureHeader), 'base64'));
}

export async function createAntomPayment(order) {
  if (!antomReady()) throw new Error('ANTOM_SANDBOX_CONFIG_REQUIRED');
  const requestTime = String(Date.now());
  const payload = {
    productCode: 'CASHIER_PAYMENT', paymentRequestId: order.id,
    paymentAmount: { currency: 'CNY', value: String(order.amountFen) },
    paymentMethod: { paymentMethodType: 'ALIPAY_CN' },
    order: { referenceOrderId: order.id, orderDescription: order.subject, orderAmount: { currency: 'CNY', value: String(order.amountFen) } },
    env: { terminalType: order.channel === 'h5' ? 'WAP' : 'WEB' },
    paymentNotifyUrl: `${config.baseUrl}/api/callbacks/antom`,
    paymentRedirectUrl: `${config.baseUrl}/?returned_order=${encodeURIComponent(order.id)}`
  };
  const body = JSON.stringify(payload);
  const signature = await signAntom(PAY_PATH, requestTime, body);
  const response = await fetch(`${config.antom.gateway}${PAY_PATH}`, { method: 'POST', headers: {
    'content-type': 'application/json; charset=UTF-8', 'client-id': config.antom.clientId,
    'request-time': requestTime, 'signature': `algorithm=RSA256,keyVersion=1,signature=${signature}`
  }, body });
  const raw = await response.text();
  const valid = await verifyAntom(PAY_PATH, response.headers.get('response-time') || '', response.headers.get('client-id') || '', raw, response.headers.get('signature') || '');
  if (!valid) throw new Error('ANTOM_RESPONSE_SIGNATURE_INVALID');
  const data = JSON.parse(raw);
  if (data.result?.resultStatus !== 'S') throw new Error(`ANTOM_${data.result?.resultCode || 'PAY_FAILED'}`);
  const payUrl = data.normalUrl || data.schemeUrl || data.applinkUrl;
  if (!payUrl) throw new Error('ANTOM_PAY_URL_MISSING');
  return { providerTradeNo: data.paymentId || null, payUrl, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
}

export async function verifyAntomNotification(path, headers, body) {
  return verifyAntom(path, headers['request-time'] || '', headers['client-id'] || '', body, headers.signature || '');
}
