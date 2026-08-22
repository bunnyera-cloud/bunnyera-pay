import assert from "node:assert/strict";
import test from "node:test";
import { formatAlipayTimestamp } from "./alipay";
import {
  type PaymentSettlementStore,
  settleVerifiedPayment,
  validatePaidQueryTransition,
  validateRefundSuccessAmount,
} from "./transitions";

test("active query without amount cannot transition to PAID", () => {
  const error = validatePaidQueryTransition(
    { status: "PAID", verified: true, tradeNo: "wx-trade-1" },
    { expectedAmountFen: 100 },
  );
  assert.match(error || "", /缺少有效金额/);
});

test("active query without provider trade number cannot transition to PAID", () => {
  const error = validatePaidQueryTransition(
    { status: "PAID", verified: true, amount: 100 },
    { expectedAmountFen: 100 },
  );
  assert.match(error || "", /缺少交易号/);
});

test("active query must be explicitly marked as signature verified", () => {
  const error = validatePaidQueryTransition(
    { status: "PAID", amount: 100, tradeNo: "wx-trade-1" },
    { expectedAmountFen: 100 },
  );
  assert.match(error || "", /未通过响应验签/);
});

test("refund query without amount cannot confirm success", () => {
  const error = validateRefundSuccessAmount({ status: "SUCCESS" }, 100);
  assert.match(error || "", /缺少有效金额/);
});

test("duplicate callback creates only one PaymentRecord", async () => {
  let orderStatus = "PAYING";
  let paymentRecordCount = 0;
  const store = {
    order: {
      async updateMany() {
        if (orderStatus !== "CREATED" && orderStatus !== "PAYING") {
          return { count: 0 };
        }
        orderStatus = "PAID";
        return { count: 1 };
      },
    },
    paymentRecord: {
      async create() {
        paymentRecordCount += 1;
        return {};
      },
    },
  } as unknown as PaymentSettlementStore;
  const input = {
    orderId: "order-1",
    amount: "1.00",
    channel: "WECHAT_NATIVE" as const,
    tradeNo: "wx-trade-1",
    paidAt: new Date("2026-08-23T00:00:00.000Z"),
  };

  assert.equal(await settleVerifiedPayment(store, input), true);
  assert.equal(await settleVerifiedPayment(store, input), false);
  assert.equal(paymentRecordCount, 1);
});

test("Alipay gateway timestamp uses Asia/Shanghai time", () => {
  assert.equal(
    formatAlipayTimestamp(new Date("2026-08-22T20:00:00.000Z")),
    "2026-08-23 04:00:00",
  );
});
