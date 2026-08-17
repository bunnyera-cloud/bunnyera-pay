import http from 'node:http';
import crypto from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config, assertSafeConfig } from './config.js';
import { createProviderPayment, verifyAlipayCallback, verifyMockCallback } from './providers.js';
import { listOrders, mutateOrders } from './store.js';
import { antomReady, verifyAntomNotification } from './antom.js';
import { getCatalog, getCompany, mutateCatalog, resolveCollection } from './catalog.js';
import { getPlatform, mutatePlatform, publicPlatformInfo } from './platform.js';
import { channelStatus } from './channels.js';

assertSafeConfig();
const publicDir = path.resolve('public');

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024) throw new Error('BODY_TOO_LARGE'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}
async function binaryBody(req, limit = 5 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('FILE_TOO_LARGE'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function admin(req) {
  if (!config.adminToken) return false;
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${config.adminToken}`);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}
function amountFen(value) {
  if (!Number.isInteger(value) || value < 1 || value > 5_000_000) throw new Error('INVALID_AMOUNT');
  return value;
}
async function staticFile(res, name, type = 'text/html; charset=utf-8') {
  try { const data = await readFile(path.join(publicDir, name)); res.writeHead(200, { 'content-type': type, 'x-content-type-options': 'nosniff' }); res.end(data); }
  catch { json(res, 404, { error: 'NOT_FOUND' }); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, config.baseUrl);
    if (req.method === 'GET' && url.pathname === '/') return staticFile(res, 'index.html');
    if (req.method === 'GET' && url.pathname === '/admin.html') return staticFile(res, 'admin.html');
    if (req.method === 'GET' && url.pathname === '/mock-pay.html') return staticFile(res, 'mock-pay.html');
    if (req.method === 'GET' && url.pathname === '/app.js') return staticFile(res, 'app.js', 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/styles.css') return staticFile(res, 'styles.css', 'text/css; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/company.html') return staticFile(res, 'company.html');
    if (req.method === 'GET' && url.pathname === '/platform.html') return staticFile(res, 'console.html');
    if (req.method === 'GET' && url.pathname === '/console.html') return staticFile(res, 'console.html');
    if (req.method === 'GET' && url.pathname === '/console.js') return staticFile(res, 'console.js', 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/console.css') return staticFile(res, 'console.css', 'text/css; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/shop.html') return staticFile(res, 'shop.html');
    if (req.method === 'GET' && url.pathname === '/shop.js') return staticFile(res, 'shop.js', 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/shop.css') return staticFile(res, 'shop.css', 'text/css; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/merchant-register.html') return staticFile(res, 'merchant-register.html');
    if (req.method === 'GET' && url.pathname === '/login.html') return staticFile(res, 'login.html');
    if (req.method === 'GET' && url.pathname === '/ui.css') return staticFile(res, 'ui.css', 'text/css; charset=utf-8');
    if (req.method === 'GET' && /^\/assets\/licenses\/[a-z0-9-]+\.png$/.test(url.pathname)) return staticFile(res, url.pathname.slice(1), 'image/png');
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, mode: config.paymentMode });
    if (req.method === 'GET' && url.pathname === '/api/platform-info') return json(res, 200, { ok: true, platform: await publicPlatformInfo() });
    if (req.method === 'POST' && url.pathname === '/api/merchant-applications') {
      const input = JSON.parse(await body(req) || '{}');
      return json(res, 201, { ok: true, application: await mutatePlatform({ type: 'application', data: input }) });
    }
    if (req.method === 'POST' && url.pathname === '/api/merchant-application-assets') {
      const kind = String(req.headers['x-document-kind'] || '');
      const mime = String(req.headers['content-type'] || '').split(';')[0];
      if (!['license', 'storefront', 'interior'].includes(kind) || !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('INVALID_DOCUMENT');
      const bytes = await binaryBody(req);
      if (bytes.length < 32) throw new Error('INVALID_DOCUMENT');
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const assetId = `${kind}-${crypto.randomBytes(12).toString('hex')}.${ext}`;
      const assetDir = path.resolve('data', 'application-assets');
      await mkdir(assetDir, { recursive: true });
      await writeFile(path.join(assetDir, assetId), bytes, { mode: 0o600 });
      return json(res, 201, { ok: true, asset: { id: assetId, kind, mime, size: bytes.length } });
    }
    if (req.method === 'GET' && url.pathname === '/api/config-status') return json(res, 200, {
      ok: true,
      mode: config.paymentMode,
      alipaySandboxReady: Boolean(config.alipay.appId && config.alipay.privateKeyPath && config.alipay.publicKeyPath),
      antomSandboxReady: antomReady(),
      wechatMode: config.paymentMode === 'sandbox' ? 'simulation' : config.paymentMode
    });
    if (req.method === 'GET' && url.pathname === '/api/channels') return json(res, 200, { ok: true, channels: await channelStatus() });
    if (req.method === 'GET' && url.pathname === '/api/catalog') {
      const catalog = await getCatalog();
      return json(res, 200, { ok: true, catalog: { brands: catalog.brands.filter(x => x.active), stores: catalog.stores.filter(x => x.active), collectionCodes: catalog.collectionCodes.filter(x => x.active) } });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/pay/')) {
      const id = url.pathname.split('/').pop();
      const order = (await listOrders()).find(row => row.id === id);
      if (!order) return json(res, 404, { error: 'ORDER_NOT_FOUND' });
      if (order.payHtml) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; form-action https://openapi-sandbox.dl.alipaydev.com; script-src 'unsafe-inline'" });
        return res.end(order.payHtml);
      }
      res.writeHead(302, { location: order.payUrl, 'cache-control': 'no-store' }); return res.end();
    }

    if (req.method === 'POST' && url.pathname === '/api/orders') {
      const input = JSON.parse(await body(req) || '{}');
      if (!['wechat', 'alipay', 'unionpay'].includes(input.provider)) throw new Error('INVALID_PROVIDER');
      if (!['qr', 'h5', 'web', 'jsapi', 'miniprogram'].includes(input.channel)) throw new Error('INVALID_CHANNEL');
      const order = {
        id: `YP${Date.now()}${crypto.randomInt(1000, 9999)}`,
        provider: input.provider, channel: input.channel,
        amountFen: amountFen(input.amountFen),
        subject: String(input.subject || '').trim().slice(0, 80),
        invoiceType: ['none', 'personal', 'company'].includes(input.invoiceType) ? input.invoiceType : 'none',
        invoiceTitle: String(input.invoiceTitle || '').trim().slice(0, 120),
        invoiceTaxId: String(input.invoiceTaxId || '').trim().slice(0, 40),
        invoiceEmail: String(input.invoiceEmail || '').trim().slice(0, 120),
        items: Array.isArray(input.items) ? input.items.slice(0, 30).map(x => ({ sku: String(x.sku || '').slice(0, 40), name: String(x.name || '').slice(0, 80), quantity: Math.max(1, Math.min(99, Number(x.quantity) || 1)), priceFen: Math.max(0, Number(x.priceFen) || 0) })) : [],
        status: 'CREATED', createdAt: new Date().toISOString()
      };
      if (!order.subject) throw new Error('INVALID_SUBJECT');
      Object.assign(order, await resolveCollection({ brandId: input.brandId, storeId: input.storeId, collectionCodeId: input.collectionCodeId }));
      const payment = await createProviderPayment(order);
      Object.assign(order, payment, { status: 'PAYING' });
      await mutateOrders(rows => rows.unshift(order));
      return json(res, 201, { ok: true, order: { ...order, payHtml: undefined, payUrl: `${config.baseUrl}/pay/${order.id}` } });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/orders/')) {
      const id = url.pathname.split('/').pop();
      const order = (await listOrders()).find(row => row.id === id);
      return order ? json(res, 200, { ok: true, order }) : json(res, 404, { error: 'ORDER_NOT_FOUND' });
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/orders') {
      if (!admin(req)) return json(res, 401, { error: 'UNAUTHORIZED' });
      return json(res, 200, { ok: true, orders: await listOrders() });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/catalog') {
      if (!admin(req)) return json(res, 401, { error: 'UNAUTHORIZED' });
      return json(res, 200, { ok: true, catalog: await getCatalog() });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/platform') {
      if (!admin(req)) return json(res, 401, { error: 'UNAUTHORIZED' });
      return json(res, 200, { ok: true, data: await getPlatform() });
    }
    const applicationMatch = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)\/(approve|reject)$/);
    if (applicationMatch && req.method === 'POST') {
      if (!admin(req)) return json(res, 401, { error: 'UNAUTHORIZED' });
      const input = JSON.parse(await body(req) || '{}');
      let legacyBrandId = input.legacyBrandId;
      if (applicationMatch[2] === 'approve' && !legacyBrandId) {
        const platform = await getPlatform();
        const application = platform.applications.find(x => x.id === applicationMatch[1]);
        if (!application) throw new Error('INVALID_APPLICATION');
        legacyBrandId = (await mutateCatalog({ type: 'brand', name: application.legalName })).id;
      }
      return json(res, 200, { ok: true, item: await mutatePlatform({ type: applicationMatch[2], applicationId: applicationMatch[1], legacyBrandId, reviewNote: input.reviewNote }) });
    }
    const merchantResourceMatch = url.pathname.match(/^\/api\/admin\/merchants\/([^/]+)\/(departments|products|members)$/);
    if (merchantResourceMatch && req.method === 'POST') {
      if (!admin(req)) return json(res, 401, { error: 'UNAUTHORIZED' });
      const input = JSON.parse(await body(req) || '{}');
      const type = merchantResourceMatch[2] === 'departments' ? 'department' : merchantResourceMatch[2] === 'products' ? 'product' : 'member';
      return json(res, 201, { ok: true, item: await mutatePlatform({ type, merchantId: merchantResourceMatch[1], data: input }) });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/refunds') {
      if (!admin(req)) return json(res, 401, { error: 'UNAUTHORIZED' });
      const input = JSON.parse(await body(req) || '{}');
      const order = (await listOrders()).find(row => row.id === input.orderId);
      if (!order || order.status !== 'PAID' || !Number.isInteger(Number(input.amountFen)) || Number(input.amountFen) > order.amountFen) throw new Error('INVALID_REFUND');
      return json(res, 201, { ok: true, item: await mutatePlatform({ type: 'refund', data: input }) });
    }
    if (req.method === 'POST' && ['/api/admin/brands', '/api/admin/stores', '/api/admin/collection-codes'].includes(url.pathname)) {
      if (!admin(req)) return json(res, 401, { error: 'UNAUTHORIZED' });
      const input = JSON.parse(await body(req) || '{}');
      const type = url.pathname.endsWith('/brands') ? 'brand' : url.pathname.endsWith('/stores') ? 'store' : 'collectionCode';
      return json(res, 201, { ok: true, item: await mutateCatalog({ type, name: input.name, brandId: input.brandId, storeId: input.storeId }) });
    }
    const companyMatch = url.pathname.match(/^\/api\/admin\/companies\/([^/]+)$/);
    if (companyMatch && req.method === 'GET') {
      if (!admin(req)) return json(res, 401, { error: 'UNAUTHORIZED' });
      const company = await getCompany(companyMatch[1]);
      const orders = (await listOrders()).filter(x => x.brandId === companyMatch[1]);
      return json(res, 200, { ok: true, company: { ...company, orders } });
    }
    if (companyMatch && req.method === 'PUT') {
      if (!admin(req)) return json(res, 401, { error: 'UNAUTHORIZED' });
      const input = JSON.parse(await body(req) || '{}');
      return json(res, 200, { ok: true, profile: await mutateCatalog({ type: 'profile', brandId: companyMatch[1], data: input }) });
    }
    const assetMatch = url.pathname.match(/^\/api\/admin\/companies\/([^/]+)\/assets$/);
    if (assetMatch && req.method === 'POST') {
      if (!admin(req)) return json(res, 401, { error: 'UNAUTHORIZED' });
      const input = JSON.parse(await body(req) || '{}');
      return json(res, 201, { ok: true, asset: await mutateCatalog({ type: 'asset', brandId: assetMatch[1], data: input }) });
    }

    if (req.method === 'POST' && url.pathname === '/api/mock/paid') {
      if (!['mock', 'sandbox', 'antom-sandbox'].includes(config.paymentMode)) return json(res, 404, { error: 'NOT_FOUND' });
      const raw = await body(req); const signature = req.headers['x-mock-signature'];
      if (!verifyMockCallback(raw, signature)) return json(res, 401, { error: 'BAD_SIGNATURE' });
      const input = JSON.parse(raw); let found = false;
      await mutateOrders(rows => { const order = rows.find(row => row.id === input.orderId); if (order) { order.status = 'PAID'; order.paidAt = new Date().toISOString(); found = true; } });
      return found ? json(res, 200, { ok: true }) : json(res, 404, { error: 'ORDER_NOT_FOUND' });
    }

    if (req.method === 'POST' && url.pathname === '/api/callbacks/alipay') {
      const raw = await body(req); const params = Object.fromEntries(new URLSearchParams(raw));
      if (!await verifyAlipayCallback(params)) { res.writeHead(400); return res.end('failure'); }
      const callbackAmountFen = Math.round(Number(params.total_amount) * 100); let accepted = false;
      await mutateOrders(rows => {
        const order = rows.find(row => row.id === params.out_trade_no && row.provider === 'alipay');
        if (order && order.amountFen === callbackAmountFen && ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(params.trade_status)) {
          order.status = 'PAID'; order.providerTradeNo = params.trade_no; order.paidAt = new Date().toISOString(); accepted = true;
        }
      });
      res.writeHead(accepted ? 200 : 400, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(accepted ? 'success' : 'failure');
    }

    if (req.method === 'POST' && url.pathname === '/api/callbacks/wechat') {
      return json(res, 501, { error: 'LIVE_CALLBACK_LOCKED', message: 'Official signature verification must be configured before activation.' });
    }
    if (req.method === 'POST' && url.pathname === '/api/callbacks/antom') {
      const raw = await body(req);
      if (!await verifyAntomNotification(url.pathname, req.headers, raw)) return json(res, 401, { result: { resultCode: 'ERROR', resultStatus: 'F', resultMessage: 'invalid signature' } });
      const input = JSON.parse(raw); let accepted = false;
      await mutateOrders(rows => {
        const order = rows.find(row => row.id === input.paymentRequestId && row.provider === 'alipay');
        if (order && input.paymentStatus === 'SUCCESS' && Number(input.paymentAmount?.value) === order.amountFen && input.paymentAmount?.currency === 'CNY') {
          order.status = 'PAID'; order.providerTradeNo = input.paymentId; order.paidAt = new Date().toISOString(); accepted = true;
        }
      });
      return json(res, accepted ? 200 : 400, { result: { resultCode: accepted ? 'SUCCESS' : 'ERROR', resultStatus: accepted ? 'S' : 'F', resultMessage: accepted ? 'success' : 'order mismatch' } });
    }
    json(res, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    console.error('request_failed', { path: req.url, code: error.code || error.message });
    const status = ['INVALID_AMOUNT', 'INVALID_PROVIDER', 'INVALID_CHANNEL', 'INVALID_SUBJECT', 'INVALID_COLLECTION', 'INVALID_NAME', 'INVALID_STORE', 'INVALID_ASSET', 'INVALID_APPLICATION', 'INVALID_APPLICATION_STATUS', 'INVALID_PRODUCT', 'INVALID_MEMBER', 'INVALID_REFUND', 'INVALID_DOCUMENT', 'FILE_TOO_LARGE'].includes(error.message) ? 400 : ['CHANNEL_NOT_CONFIGURED', 'CHANNEL_ADAPTER_NOT_ACTIVATED'].includes(error.message) ? 503 : ['COMPANY_NOT_FOUND', 'MERCHANT_NOT_FOUND'].includes(error.message) ? 404 : 500;
    json(res, status, { error: error.message === 'BODY_TOO_LARGE' ? error.message : status < 500 || status === 503 ? error.message : 'INTERNAL_ERROR', code: error.code });
  }
});

server.listen(config.port, () => console.log(`BunnyEra Pay V2 running at ${config.baseUrl} (${config.paymentMode})`));
