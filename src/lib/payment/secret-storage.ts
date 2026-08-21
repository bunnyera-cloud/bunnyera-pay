import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

const PREFIX = 'enc:v1:';

export function encryptPaymentSecret(value: string): string {
  const plaintext = value.trim();
  if (!plaintext || plaintext.startsWith(PREFIX)) return plaintext;
  const key = encryptionKey();
  if (!key) {
    throw new Error('PAYMENT_CONFIG_ENCRYPTION_KEY 未配置，拒绝保存支付密钥');
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptPaymentSecret(value?: string | null): string {
  const stored = (value || '').trim();
  if (!stored || !stored.startsWith(PREFIX)) return stored;
  const key = encryptionKey();
  if (!key) return '';
  try {
    const [ivValue, tagValue, ciphertextValue] = stored.slice(PREFIX.length).split(':');
    if (!ivValue || !tagValue || !ciphertextValue) return '';
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

function encryptionKey(): Buffer | null {
  const raw = (process.env.PAYMENT_CONFIG_ENCRYPTION_KEY || '').trim();
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, 'base64');
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}
