import crypto from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve('data');
const file = path.join(dir, 'platform.json');
let queue = Promise.resolve();
const now = () => new Date().toISOString();
const id = prefix => `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
const clean = (value, max = 160) => String(value || '').trim().slice(0, max);

const defaults = {
  platform: {
    legalName: 'BUNNYERA LLC', productName: 'BunnyEra Pay', entityType: 'LLC',
    formationState: 'Wyoming', formationDate: '2025-08-29', entityId: '2025-001756889',
    status: 'active', naics: '541613', contactEmail: 'admin@bunnyera.pro'
  },
  applications: [],
  merchants: [{ id: 'merchant-yixi', legalName: '杭州奕溪贸易有限公司', country: 'CN', entityType: '有限责任公司（自然人独资）', registrationNumberMasked: '91330106********G1E', contactEmail: '', status: 'active', verificationStatus: 'business_verified', legacyBrandId: 'brand-main', createdAt: '2026-08-16T00:00:00.000Z' }],
  departments: [], products: [], members: [], refunds: [], auditLogs: []
};

function normalize(data) {
  for (const [key, value] of Object.entries(defaults)) if (data[key] === undefined) data[key] = structuredClone(value);
  return data;
}
async function load() {
  try { return normalize(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return structuredClone(defaults); throw error; }
}
async function save(data) {
  await mkdir(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(tmp, file);
}
function log(data, action, merchantId = '', detail = '') {
  data.auditLogs.unshift({ id: id('audit'), action, merchantId, detail: clean(detail, 300), createdAt: now() });
  data.auditLogs = data.auditLogs.slice(0, 1000);
}
export async function getPlatform() { return load(); }
export async function publicPlatformInfo() { const { platform } = await load(); return { productName: platform.productName, operator: platform.legalName, status: platform.status }; }

export function mutatePlatform(action) {
  const operation = queue.then(async () => {
    const data = await load(); let result;
    if (action.type === 'application') {
      const legalName = clean(action.data.legalName);
      const registrationNumberMasked = clean(action.data.registrationNumberMasked);
      const contactEmail = clean(action.data.contactEmail, 120).toLowerCase();
      if (!legalName || !registrationNumberMasked || !/^\S+@\S+\.\S+$/.test(contactEmail)) throw new Error('INVALID_APPLICATION');
      const documents = Array.isArray(action.data.documents) ? action.data.documents.filter(x => x && ['license', 'storefront', 'interior'].includes(x.kind) && /^[a-z]+-[a-f0-9]{24}\.(jpg|png|webp)$/.test(x.id)).slice(0, 3) : [];
      if (!clean(action.data.legalRepresentative) || !clean(action.data.dialCode, 8) || !clean(action.data.phoneNumber, 30) || documents.length !== 3) throw new Error('INVALID_APPLICATION');
      result = { id: id('application'), legalName, country: clean(action.data.country, 60) || 'CN', registrationNumberMasked, legalRepresentative: clean(action.data.legalRepresentative), contactEmail, dialCode: clean(action.data.dialCode, 8), phoneNumber: clean(action.data.phoneNumber, 30), businessCategory: clean(action.data.businessCategory), website: clean(action.data.website, 240), documents, status: 'submitted', submittedAt: now(), updatedAt: now() };
      data.applications.unshift(result); log(data, 'application.submitted', '', legalName);
    } else if (action.type === 'approve') {
      const app = data.applications.find(x => x.id === action.applicationId);
      if (!app || app.status !== 'submitted') throw new Error('INVALID_APPLICATION_STATUS');
      app.status = 'approved'; app.updatedAt = now();
      result = { id: id('merchant'), legalName: app.legalName, country: app.country, registrationNumberMasked: app.registrationNumberMasked, legalRepresentative: app.legalRepresentative, contactEmail: app.contactEmail, dialCode: app.dialCode, phoneNumber: app.phoneNumber, businessCategory: app.businessCategory, documents: app.documents, status: 'active', verificationStatus: 'business_verified', legacyBrandId: clean(action.legacyBrandId), createdAt: now() };
      data.merchants.push(result); app.merchantId = result.id; log(data, 'application.approved', result.id, app.legalName);
    } else if (action.type === 'reject') {
      const app = data.applications.find(x => x.id === action.applicationId);
      if (!app || app.status !== 'submitted') throw new Error('INVALID_APPLICATION_STATUS');
      app.status = 'rejected'; app.reviewNote = clean(action.reviewNote, 300); app.updatedAt = now(); result = app;
      log(data, 'application.rejected', '', app.legalName);
    } else if (action.type === 'department') {
      if (!data.merchants.some(x => x.id === action.merchantId)) throw new Error('MERCHANT_NOT_FOUND');
      const name = clean(action.data.name); if (!name) throw new Error('INVALID_NAME');
      result = { id: id('dept'), merchantId: action.merchantId, code: clean(action.data.code, 30), name, status: 'active', createdAt: now() };
      data.departments.push(result); log(data, 'department.created', action.merchantId, name);
    } else if (action.type === 'product') {
      if (!data.merchants.some(x => x.id === action.merchantId)) throw new Error('MERCHANT_NOT_FOUND');
      const name = clean(action.data.name); const priceFen = Number(action.data.priceFen);
      if (!name || !Number.isInteger(priceFen) || priceFen < 0) throw new Error('INVALID_PRODUCT');
      result = { id: id('product'), merchantId: action.merchantId, departmentId: clean(action.data.departmentId), name, sku: clean(action.data.sku, 60), priceFen, currency: clean(action.data.currency, 12) || 'CNY', status: 'active', createdAt: now() };
      data.products.push(result); log(data, 'product.created', action.merchantId, name);
    } else if (action.type === 'member') {
      if (!data.merchants.some(x => x.id === action.merchantId)) throw new Error('MERCHANT_NOT_FOUND');
      const email = clean(action.data.email, 120).toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('INVALID_MEMBER');
      result = { id: id('member'), merchantId: action.merchantId, departmentId: clean(action.data.departmentId), name: clean(action.data.name), email, role: clean(action.data.role, 30) || 'staff', status: 'invited', createdAt: now() };
      data.members.push(result); log(data, 'member.invited', action.merchantId, email);
    } else if (action.type === 'refund') {
      const amountFen = Number(action.data.amountFen);
      if (!clean(action.data.orderId, 80) || !Number.isInteger(amountFen) || amountFen < 1) throw new Error('INVALID_REFUND');
      result = { id: id('refund'), orderId: clean(action.data.orderId, 80), amountFen, reason: clean(action.data.reason, 300), status: 'requested', createdAt: now() };
      data.refunds.unshift(result); log(data, 'refund.requested', '', result.orderId);
    } else throw new Error('INVALID_PLATFORM_ACTION');
    await save(data); return result;
  });
  queue = operation.catch(() => {}); return operation;
}
