import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createUnionPaySignature, verifyUnionPaySignature } from "./unionpay";

test("UnionPay ACP 5.1 signature verifies and rejects tampering", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const params = {
    version: "5.1.0",
    encoding: "UTF-8",
    signMethod: "01",
    certId: "123456789",
    txnType: "01",
    txnSubType: "07",
    bizType: "000000",
    accessType: "0",
    merId: "123456789012345",
    orderId: "BEP202608220451001234567890",
    txnTime: "20260822045100",
    txnAmt: "100",
    currencyCode: "156",
  };
  const signature = createUnionPaySignature(params, privateKey);

  assert.equal(
    verifyUnionPaySignature({ ...params, signature }, signature, publicKey),
    true,
  );
  assert.equal(
    verifyUnionPaySignature(
      { ...params, txnAmt: "101", signature },
      signature,
      publicKey,
    ),
    false,
  );
});
