import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  amountToFen,
  normalizePrivateKey,
  normalizePublicKey,
} from './config';
import {
  decryptPaymentSecret,
  encryptPaymentSecret,
} from './secret-storage';
import { sanitizePaymentPayload } from './sanitize';
import { resolveProvider } from './resolver';

test('amountToFen uses exact decimal conversion', () => {
  assert.equal(amountToFen('10'), 1000);
  assert.equal(amountToFen('10.01'), 1001);
  assert.equal(amountToFen('0.10'), 10);
  assert.throws(() => amountToFen('0.001'));
  assert.throws(() => amountToFen('not-an-amount'));
});

test('PEM normalization supports escaped newlines and bare base64', () => {
  assert.match(normalizePrivateKey('YWJj'), /BEGIN PRIVATE KEY/);
  assert.match(normalizePublicKey('YWJj'), /BEGIN PUBLIC KEY/);
  assert.equal(
    normalizePrivateKey('-----BEGIN PRIVATE KEY-----\\nYWJj\\n-----END PRIVATE KEY-----'),
    '-----BEGIN PRIVATE KEY-----\nYWJj\n-----END PRIVATE KEY-----'
  );
});

test('payment config secrets encrypt and decrypt without plaintext persistence', () => {
  const previous = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY;
  process.env.PAYMENT_CONFIG_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  try {
    const encrypted = encryptPaymentSecret('payment-secret-value');
    assert.match(encrypted, /^enc:v1:/);
    assert.equal(encrypted.includes('payment-secret-value'), false);
    assert.equal(decryptPaymentSecret(encrypted), 'payment-secret-value');
  } finally {
    if (previous === undefined) delete process.env.PAYMENT_CONFIG_ENCRYPTION_KEY;
    else process.env.PAYMENT_CONFIG_ENCRYPTION_KEY = previous;
  }
});

test('payment payload sanitizer redacts signatures and payer identifiers', () => {
  assert.deepEqual(
    sanitizePaymentPayload({
      sign: 'signature',
      nested: { buyer_id: 'buyer', amount: 100 },
    }),
    {
      sign: '[REDACTED]',
      nested: { buyer_id: '[REDACTED]', amount: 100 },
    }
  );
});

test('unfinished UnionPay adapter remains fail-closed', () => {
  const result = resolveProvider('UNIONPAY_QR', null);
  assert.equal(result.usable, false);
  assert.equal(result.provider, null);
  assert.deepEqual(result.missing, ['UNIONPAY_PROVIDER_NOT_IMPLEMENTED']);
});
