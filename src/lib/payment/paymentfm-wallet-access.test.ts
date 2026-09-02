import assert from "node:assert/strict";
import test from "node:test";
import {
  canReadPaymentFmWallets,
  canWritePaymentFmWallets,
  PAYMENTFM_WALLET_WRITE_ROLES,
} from "./paymentfm-wallet-access";

test("unauthorized merchant roles cannot update PaymentFM wallets", () => {
  assert.equal(canWritePaymentFmWallets("CASHIER"), false);
  assert.equal(canWritePaymentFmWallets("STORE_MANAGER"), false);
  assert.equal(canWritePaymentFmWallets("FINANCE"), false);
  assert.equal(canWritePaymentFmWallets("AUDITOR"), false);
  assert.equal(canWritePaymentFmWallets(undefined), false);
  assert.equal(canWritePaymentFmWallets("MERCHANT_OWNER"), true);
  assert.equal(canWritePaymentFmWallets("MERCHANT_ADMIN"), true);
  assert.deepEqual([...PAYMENTFM_WALLET_WRITE_ROLES], ["MERCHANT_OWNER", "MERCHANT_ADMIN"]);
});

test("finance may read PaymentFM wallet config but not write it", () => {
  assert.equal(canReadPaymentFmWallets("FINANCE"), true);
  assert.equal(canWritePaymentFmWallets("FINANCE"), false);
});
