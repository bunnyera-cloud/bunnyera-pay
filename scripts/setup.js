import crypto from 'node:crypto';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const secretsDir = path.join(root, 'secrets');
const privatePath = path.join(secretsDir, 'alipay-app-private.pem');
const publicPath = path.join(secretsDir, 'alipay-app-public.pem');
const alipayPublicPath = path.join(secretsDir, 'alipay-public.pem');
const envPath = path.join(root, '.env');
await mkdir(secretsDir, { recursive: true });

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
try { await readFile(privatePath); } catch { await writeFile(privatePath, privateKey, { mode: 0o600 }); }
try { await readFile(publicPath); } catch { await writeFile(publicPath, publicKey, { mode: 0o644 }); }
try { await readFile(alipayPublicPath); } catch { await writeFile(alipayPublicPath, '# Replace with the Alipay sandbox public key in PEM format.\n', { mode: 0o600 }); }
try { await chmod(privatePath, 0o600); } catch {}

let existing = '';
try { existing = await readFile(envPath, 'utf8'); } catch {}
if (!existing) {
  const adminToken = crypto.randomBytes(32).toString('base64url');
  await writeFile(envPath, `PORT=8080\nAPP_BASE_URL=http://localhost:8080\nADMIN_TOKEN=${adminToken}\nPAYMENT_MODE=sandbox\nALIPAY_APP_ID=\nALIPAY_PRIVATE_KEY_PATH=${privatePath.replaceAll('\\', '/')}\nALIPAY_PUBLIC_KEY_PATH=${alipayPublicPath.replaceAll('\\', '/')}\nALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do\n`, { mode: 0o600 });
}

console.log('Setup complete.');
console.log(`Public key to upload to Alipay sandbox: ${publicPath}`);
console.log('Add ALIPAY_APP_ID and replace secrets/alipay-public.pem, then restart.');
