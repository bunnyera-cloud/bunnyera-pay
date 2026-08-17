import crypto from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve('data');
const file = path.join(dir, 'catalog.json');
let queue = Promise.resolve();
const initialCatalog = {
  brands: [{ id: 'brand-main', name: '默认品牌', active: true }],
  stores: [{ id: 'store-main', brandId: 'brand-main', name: '默认门店', active: true }],
  collectionCodes: [{ id: 'counter-main', storeId: 'store-main', name: '默认收银台', active: true }],
  profiles: [], assets: []
};

const yixiDefaults = {
  legalName: '杭州奕溪贸易有限公司', shortName: '杭州奕溪贸易',
  entityType: '有限责任公司（自然人独资）', registeredCapital: '伍拾万元整',
  establishedDate: '2026-04-01', legalRepresentativeMasked: '张**',
  creditCodeMasked: '91330106********G1E',
  registeredAddressMasked: '浙江省杭州市西湖区留下街道***',
  registrationAuthority: '杭州市西湖区市场监督管理局',
  businessScope: '日用百货、箱包、鞋帽、皮革制品、母婴用品、日用品、服装服饰、针纺织品、家居用品、化妆品、办公用品、电子产品、家用电器、体育用品及器材、文具用品、钟表、户外用品、卫生洁具、五金产品、厨具卫具及日用杂品、照相机及器材、美发饰品等零售。',
  licenseImage: '/assets/licenses/hangzhou-yixi-license-masked.png', status: 'active'
};

function normalize(catalog) {
  catalog.brands ||= []; catalog.stores ||= []; catalog.collectionCodes ||= []; catalog.profiles ||= []; catalog.assets ||= [];
  for (const brand of catalog.brands) {
    if (!catalog.profiles.some(x => x.brandId === brand.id)) {
      const defaults = brand.name === yixiDefaults.legalName ? yixiDefaults : { legalName: brand.name, shortName: brand.name, status: 'draft' };
      catalog.profiles.push({ id: makeId('company'), brandId: brand.id, ...defaults, updatedAt: new Date().toISOString() });
    }
  }
  return catalog;
}

async function load() {
  try { return normalize(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return normalize(structuredClone(initialCatalog)); throw error; }
}
async function save(catalog) {
  await mkdir(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(catalog, null, 2), { mode: 0o600 });
  await rename(tmp, file);
}
const clean = (value, max = 60) => String(value || '').trim().slice(0, max);
const makeId = prefix => `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
export async function getCatalog() { return load(); }
export async function getCompany(brandId) {
  const catalog = await load();
  const brand = catalog.brands.find(x => x.id === brandId);
  if (!brand) throw new Error('COMPANY_NOT_FOUND');
  return { brand, profile: catalog.profiles.find(x => x.brandId === brandId), assets: catalog.assets.filter(x => x.brandId === brandId), stores: catalog.stores.filter(x => x.brandId === brandId), collectionCodes: catalog.collectionCodes.filter(code => catalog.stores.some(store => store.id === code.storeId && store.brandId === brandId)) };
}
export async function resolveCollection({ brandId, storeId, collectionCodeId }) {
  const catalog = await load();
  const brand = catalog.brands.find(x => x.id === brandId && x.active);
  const store = catalog.stores.find(x => x.id === storeId && x.brandId === brandId && x.active);
  const code = collectionCodeId ? catalog.collectionCodes.find(x => x.id === collectionCodeId && x.storeId === storeId && x.active) : null;
  if (!brand || !store || (collectionCodeId && !code)) throw new Error('INVALID_COLLECTION');
  return { brandId: brand.id, brandName: brand.name, storeId: store.id, storeName: store.name, collectionCodeId: code?.id || '', collectionCodeName: code?.name || '' };
}
export function mutateCatalog(action) {
  const operation = queue.then(async () => {
    const catalog = await load(); let result;
    if (action.type === 'brand') {
      const name = clean(action.name); if (!name) throw new Error('INVALID_NAME');
      result = { id: makeId('brand'), name, active: true }; catalog.brands.push(result);
      catalog.profiles.push({ id: makeId('company'), brandId: result.id, legalName: name, shortName: name, status: 'draft', updatedAt: new Date().toISOString() });
    } else if (action.type === 'store') {
      const name = clean(action.name); if (!name || !catalog.brands.some(x => x.id === action.brandId)) throw new Error('INVALID_STORE');
      result = { id: makeId('store'), brandId: action.brandId, name, active: true }; catalog.stores.push(result);
    } else if (action.type === 'collectionCode') {
      const name = clean(action.name); if (!name || !catalog.stores.some(x => x.id === action.storeId)) throw new Error('INVALID_COLLECTION');
      result = { id: makeId('counter'), storeId: action.storeId, name, active: true }; catalog.collectionCodes.push(result);
    } else if (action.type === 'profile') {
      const profile = catalog.profiles.find(x => x.brandId === action.brandId); if (!profile) throw new Error('COMPANY_NOT_FOUND');
      const allowed = ['legalName','shortName','entityType','registeredCapital','establishedDate','legalRepresentativeMasked','creditCodeMasked','registeredAddressMasked','registrationAuthority','businessScope','licenseImage','status'];
      for (const key of allowed) if (action.data[key] !== undefined) profile[key] = clean(action.data[key], key === 'businessScope' ? 1000 : 160);
      profile.updatedAt = new Date().toISOString(); result = profile;
    } else if (action.type === 'asset') {
      const categories = ['alipay','wechat','bank_card','virtual_card','platform','wallet'];
      if (!catalog.brands.some(x => x.id === action.brandId) || !categories.includes(action.data.category)) throw new Error('INVALID_ASSET');
      const label = clean(action.data.label); if (!label) throw new Error('INVALID_ASSET');
      result = { id: makeId('asset'), brandId: action.brandId, category: action.data.category, label, provider: clean(action.data.provider), accountMask: clean(action.data.accountMask), currency: clean(action.data.currency, 12), status: clean(action.data.status, 20) || 'pending', portalUrl: clean(action.data.portalUrl, 300), notes: clean(action.data.notes, 300), updatedAt: new Date().toISOString() };
      catalog.assets.push(result);
    } else throw new Error('INVALID_CATALOG_ACTION');
    await save(catalog); return result;
  });
  queue = operation.catch(() => {}); return operation;
}
