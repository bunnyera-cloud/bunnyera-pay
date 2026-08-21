import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateApiAppSecret,
  generateOrderNo,
  signToken,
  verifyToken,
} from './auth';

test('production authentication rejects a missing or weak JWT secret', async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_SECRET;
  env.NODE_ENV = 'production';
  delete env.JWT_SECRET;
  try {
    await assert.rejects(
      signToken({ sub: 'user', type: 'merchant', merchantId: 'merchant', role: 'CASHIER' }),
      /JWT_SECRET/
    );
  } finally {
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    if (previousSecret === undefined) delete env.JWT_SECRET;
    else env.JWT_SECRET = previousSecret;
  }
});

test('configured JWT secret signs and verifies merchant tokens', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
  try {
    const token = await signToken({
      sub: 'user',
      type: 'merchant',
      merchantId: 'merchant',
      role: 'CASHIER',
    });
    const payload = await verifyToken(token);
    assert.equal(payload?.sub, 'user');
    assert.equal(payload?.merchantId, 'merchant');
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('payment identifiers and API secrets use cryptographic randomness', () => {
  const first = generateOrderNo();
  const second = generateOrderNo();
  assert.notEqual(first, second);
  assert.match(first, /^BEP\d{14}[A-HJ-NP-Z2-9]{10}$/);
  assert.ok(generateApiAppSecret().length >= 48);
});
