import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve('data');
const file = path.join(dir, 'orders.json');
let queue = Promise.resolve();

async function load() {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function save(rows) {
  await mkdir(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(rows, null, 2), { mode: 0o600 });
  await rename(tmp, file);
}

export async function listOrders() { return load(); }

export function mutateOrders(fn) {
  const operation = queue.then(async () => {
    const rows = await load();
    const result = await fn(rows);
    await save(rows);
    return result;
  });
  queue = operation.catch(() => {});
  return operation;
}
