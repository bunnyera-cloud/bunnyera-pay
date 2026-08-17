import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderPayment, verifyMockCallback } from '../src/providers.js';
import crypto from 'node:crypto';
import { getCompany, resolveCollection } from '../src/catalog.js';
import { getPlatform, publicPlatformInfo } from '../src/platform.js';
import { channelStatus } from '../src/channels.js';

test('wechat uses a safe mock payment in sandbox mode', async () => {
  const payment = await createProviderPayment({ id: 'ORDER1', provider: 'wechat', channel: 'qr' });
  assert.match(payment.payUrl, /mock-pay\.html/);
  assert.ok(payment.expiresAt);
});

test('mock callbacks require a valid HMAC', () => {
  const raw = JSON.stringify({ orderId: 'ORDER1' });
  const signature = crypto.createHmac('sha256', 'mock-development-key').update(raw).digest('hex');
  assert.equal(verifyMockCallback(raw, signature), true);
  assert.equal(verifyMockCallback(raw, 'bad'), false);
});

test('default collection resolves to brand and store metadata', async () => {
  const item = await resolveCollection({ brandId: 'brand-main', storeId: 'store-main', collectionCodeId: 'counter-main' });
  assert.equal(item.brandName, '默认品牌');
  assert.equal(item.storeName, '默认门店');
  assert.equal(item.collectionCodeName, '默认收银台');
});

test('each brand has an independent company profile', async () => {
  const company = await getCompany('brand-main');
  assert.equal(company.profile.brandId, 'brand-main');
  assert.ok(Array.isArray(company.assets));
  assert.ok(Array.isArray(company.stores));
});

test('BunnyEra LLC is the platform operator and merchants are isolated records', async () => {
  const info = await publicPlatformInfo();
  const platform = await getPlatform();
  assert.equal(info.operator, 'BUNNYERA LLC');
  assert.equal(info.productName, 'BunnyEra Pay');
  assert.ok(platform.merchants.some(x => x.legalName === '杭州奕溪贸易有限公司'));
  assert.ok(Array.isArray(platform.departments));
  assert.ok(Array.isArray(platform.products));
  assert.ok(Array.isArray(platform.auditLogs));
});

test('major China payment channels are registered without pretending credentials exist', async () => {
  const channels = await channelStatus();
  assert.deepEqual(channels.map(x => x.id), ['alipay', 'wechat', 'unionpay']);
  assert.ok(channels.every(x => typeof x.configured === 'boolean'));
});
