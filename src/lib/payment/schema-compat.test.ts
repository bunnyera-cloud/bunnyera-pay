import assert from "node:assert/strict";
import test from "node:test";
import { isMissingOrderWalletType, isMissingPaymentChannelEnum } from "./schema-compat";

test("detects Postgres PaymentChannel enum drift as fail-closed", () => {
  assert.equal(
    isMissingPaymentChannelEnum(
      new Error('invalid input value for enum "PaymentChannel": "PAYMENTFM_AGGREGATE"'),
    ),
    true,
  );
  assert.equal(isMissingPaymentChannelEnum(new Error("unrelated")), false);
});

test("detects missing orders.walletType column as fail-closed", () => {
  assert.equal(
    isMissingOrderWalletType(new Error("The column `orders.walletType` does not exist in the current database.")),
    true,
  );
  assert.equal(isMissingOrderWalletType(new Error("unrelated")), false);
});
