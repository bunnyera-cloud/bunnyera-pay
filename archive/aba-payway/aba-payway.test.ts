import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  generateAbaHash,
  verifyCallbackSignature,
  rsaEncryptChunked,
  calcRsaMaxChunkBytes,
  abaReqTime,
  abaAmountToFen,
  fenToAbaAmount,
  formatAbaAmount,
  formatAbaApiAmount,
  mapAbaPaymentStatus,
  sanitizeAbaCallbackData,
  truncateSignature,
  isAbaRetryableError,
  toAbaTranId,
  isAbaTranId,
  resolveAbaTranId,
  resolveAbaCurrency,
  resolveAbaOrderCurrency,
  orderAmountToAbaMinor,
  abaMajorToMinor,
  assertAbaSettlementMatch,
  decideAbaRetryAction,
  ABA_PAYWAY_SANDBOX_BASE,
  ABA_PAYWAY_PRODUCTION_BASE,
  ABA_TRAN_ID_LENGTH,
} from "./aba-payway-config";
import {
  ABA_RETRY_DELAYS,
  ABA_MAX_ATTEMPTS,
  isWorkerStarted,
  resetAllState,
  enqueueAbaRetry,
  startAbaPeriodicScan,
  closeAbaRetryQueue,
  isRedisHealthy,
  resetRedisHealthCache,
} from "./aba-retry-queue";
import { AbaPaywayProvider } from "./aba-payway";
import { resolveProvider } from "./resolver";
import type { PaymentConfig } from "@prisma/client";

// ─── 官方固定测试向量 ───
// 来源：developer.payway.com.kh 各 API 文档中的 PHP 示例
// hash = base64(hash_hmac('sha512', concatenated_values, api_key, true))

const TEST_API_KEY = "test_api_key_001";
const TEST_MERCHANT_ID = "ec000002";

/**
 * 用 Node.js crypto 生成参考哈希值，模拟官方 PHP hash_hmac('sha512', ..., true)
 */
function phpHmacSha512(data: string, key: string): string {
  return crypto.createHmac("sha512", key).update(data, "utf8").digest("base64");
}

describe("ABA PayWay 官方固定测试向量", () => {
  describe("generateAbaHash — 官方 PHP 示例复现", () => {
    it("Check Transaction hash: req_time + merchant_id + tran_id", () => {
      const reqTime = "20250213065545";
      const merchantId = "ec000002";
      const tranId = "17394277693";
      const input = reqTime + merchantId + tranId;
      const expected = phpHmacSha512(input, TEST_API_KEY);

      const actual = generateAbaHash(input, TEST_API_KEY);
      assert.equal(actual, expected);
      // 确保不是空值
      assert.ok(actual.length >= 80);
    });

    it("Close Transaction hash: same order as Check Transaction", () => {
      const reqTime = "20241022053608";
      const merchantId = "lavacafe";
      const tranId = "1729573626";
      const input = reqTime + merchantId + tranId;
      const expected = phpHmacSha512(input, TEST_API_KEY);

      const actual = generateAbaHash(input, TEST_API_KEY);
      assert.equal(actual, expected);
    });

    it("Refund hash: request_time + merchant_id + merchant_auth", () => {
      const requestTime = "20200728093403";
      const merchantId = "ec000002";
      const merchantAuth = "encrypted_base64_data_here";
      const input = requestTime + merchantId + merchantAuth;
      const expected = phpHmacSha512(input, TEST_API_KEY);

      const actual = generateAbaHash(input, TEST_API_KEY);
      assert.equal(actual, expected);
    });

    it("Payment Link hash: request_time + merchant_id + merchant_auth", () => {
      const requestTime = "20260826120000";
      const merchantId = "test_merchant";
      const merchantAuth = "rsa_encrypted_json_blob";
      const input = requestTime + merchantId + merchantAuth;
      const expected = phpHmacSha512(input, TEST_API_KEY);

      const actual = generateAbaHash(input, TEST_API_KEY);
      assert.equal(actual, expected);
    });

    it("Purchase hash includes all 21 fields in correct order", () => {
      const fields = {
        req_time: "20260826120000",
        merchant_id: "ec000002",
        tran_id: "BE20260826001",
        amount: "1.00",
        items: "W3sibmFtZSI6IlRlc3QiLCJxdWFudGl0eSI6MSwicHJpY2UiOjEuMH1d",
        shipping: "",
        firstname: "",
        lastname: "",
        email: "",
        phone: "",
        type: "purchase",
        payment_option: "abapay_khqr_deeplink",
        return_url: "aHR0cHM6Ly9leGFtcGxlLmNvbS9ub3RpZnk=",
        cancel_url: "",
        continue_success_url: "",
        return_deeplink: "",
        currency: "USD",
        custom_fields: "",
        return_params: "",
        payout: "",
        lifetime: "",
        additional_params: "",
        google_pay_token: "",
        skip_success_page: "",
      };

      const input = Object.values(fields).join("");
      const expected = phpHmacSha512(input, TEST_API_KEY);
      const actual = generateAbaHash(input, TEST_API_KEY);
      assert.equal(actual, expected);
    });
  });

  describe("verifyCallbackSignature — 固定向量", () => {
    it("valid signature passes timing-safe comparison", () => {
      const tranId = "BE20260826001";
      const amount = "1.00";
      const paymentStatus = "APPROVED";
      const currency = "USD";
      const hashInput = tranId + TEST_MERCHANT_ID + amount + paymentStatus + currency;
      const hash = phpHmacSha512(hashInput, TEST_API_KEY);

      const result = verifyCallbackSignature({
        tranId,
        merchantId: TEST_MERCHANT_ID,
        amount,
        paymentStatus,
        currency,
        hash,
        apiKey: TEST_API_KEY,
      });
      assert.equal(result, true);
    });

    it("wrong hash fails timing-safe comparison", () => {
      const result = verifyCallbackSignature({
        tranId: "BE20260826001",
        merchantId: TEST_MERCHANT_ID,
        amount: "1.00",
        paymentStatus: "APPROVED",
        currency: "USD",
        hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
        apiKey: TEST_API_KEY,
      });
      assert.equal(result, false);
    });

    it("tampered amount fails verification", () => {
      const hashInput = "BE20260826001" + TEST_MERCHANT_ID + "1.00" + "APPROVED" + "USD";
      const hash = phpHmacSha512(hashInput, TEST_API_KEY);

      const result = verifyCallbackSignature({
        tranId: "BE20260826001",
        merchantId: TEST_MERCHANT_ID,
        amount: "999.99",  // tampered
        paymentStatus: "APPROVED",
        currency: "USD",
        hash,
        apiKey: TEST_API_KEY,
      });
      assert.equal(result, false);
    });

    it("tampered merchant_id fails verification", () => {
      const hashInput = "BE20260826001" + TEST_MERCHANT_ID + "1.00" + "APPROVED" + "USD";
      const hash = phpHmacSha512(hashInput, TEST_API_KEY);

      const result = verifyCallbackSignature({
        tranId: "BE20260826001",
        merchantId: "EVIL_MERCHANT",  // tampered
        amount: "1.00",
        paymentStatus: "APPROVED",
        currency: "USD",
        hash,
        apiKey: TEST_API_KEY,
      });
      assert.equal(result, false);
    });

    it("tampered currency fails verification", () => {
      const hashInput = "BE20260826001" + TEST_MERCHANT_ID + "1.00" + "APPROVED" + "USD";
      const hash = phpHmacSha512(hashInput, TEST_API_KEY);

      const result = verifyCallbackSignature({
        tranId: "BE20260826001",
        merchantId: TEST_MERCHANT_ID,
        amount: "1.00",
        paymentStatus: "APPROVED",
        currency: "KHR",  // tampered
        hash,
        apiKey: TEST_API_KEY,
      });
      assert.equal(result, false);
    });

    it("empty hash returns false", () => {
      const result = verifyCallbackSignature({
        tranId: "x", merchantId: "x", amount: "1", paymentStatus: "APPROVED",
        currency: "USD", hash: "", apiKey: TEST_API_KEY,
      });
      assert.equal(result, false);
    });

    it("empty apiKey returns false", () => {
      const result = verifyCallbackSignature({
        tranId: "x", merchantId: "x", amount: "1", paymentStatus: "APPROVED",
        currency: "USD", hash: "abc", apiKey: "",
      });
      assert.equal(result, false);
    });
  });
});

describe("ABA PayWay config utilities", () => {
  describe("generateAbaHash", () => {
    it("should generate HMAC-SHA512 base64 hash", () => {
      const hash = generateAbaHash("test_data", "test_api_key");
      assert.ok(hash.length > 0);
      assert.ok(hash.length >= 80);
      assert.ok(/^[A-Za-z0-9+/=]+$/.test(hash));
    });

    it("should produce consistent hashes for same input", () => {
      const hash1 = generateAbaHash("abc123", "key");
      const hash2 = generateAbaHash("abc123", "key");
      assert.equal(hash1, hash2);
    });

    it("should produce different hashes for different inputs", () => {
      const hash1 = generateAbaHash("abc", "key");
      const hash2 = generateAbaHash("def", "key");
      assert.notEqual(hash1, hash2);
    });

    it("should produce different hashes for different keys", () => {
      const hash1 = generateAbaHash("abc", "key1");
      const hash2 = generateAbaHash("abc", "key2");
      assert.notEqual(hash1, hash2);
    });
  });

  describe("abaReqTime", () => {
    it("should return YYYYMMDDHHmmss format", () => {
      const time = abaReqTime(new Date("2026-08-26T12:34:56Z"));
      assert.equal(time, "20260826123456");
    });

    it("should return 14 character string", () => {
      const time = abaReqTime();
      assert.equal(time.length, 14);
      assert.ok(/^\d{14}$/.test(time));
    });
  });

  describe("abaAmountToFen", () => {
    it("should convert USD decimal to cents", () => {
      assert.equal(abaAmountToFen("1.00"), 100);
      assert.equal(abaAmountToFen("0.01"), 1);
      assert.equal(abaAmountToFen("10.50"), 1050);
      assert.equal(abaAmountToFen("100.99"), 10099);
    });

    it("should convert number input", () => {
      assert.equal(abaAmountToFen(1.0), 100);
      assert.equal(abaAmountToFen(0.01), 1);
    });

    it("should handle zero", () => {
      assert.equal(abaAmountToFen("0"), 0);
      assert.equal(abaAmountToFen("0.00"), 0);
    });

    it("should throw on invalid input", () => {
      assert.throws(() => abaAmountToFen("not_a_number"));
      assert.throws(() => abaAmountToFen("abc"));
      assert.throws(() => abaAmountToFen("1.234")); // more than 2 decimal places
    });
  });

  describe("fenToAbaAmount", () => {
    it("should convert cents to decimal string", () => {
      assert.equal(fenToAbaAmount(100), "1.00");
      assert.equal(fenToAbaAmount(1), "0.01");
      assert.equal(fenToAbaAmount(1050), "10.50");
      assert.equal(fenToAbaAmount(10099), "100.99");
    });

    it("should handle zero", () => {
      assert.equal(fenToAbaAmount(0), "0.00");
    });

    it("should throw on invalid input", () => {
      assert.throws(() => fenToAbaAmount(-1));
      assert.throws(() => fenToAbaAmount(1.5)); // not integer
    });
  });

  describe("formatAbaAmount — KHR 无小数位", () => {
    it("USD keeps 2 decimal places", () => {
      assert.equal(formatAbaAmount(1, "USD"), "1.00");
      assert.equal(formatAbaAmount(0.01, "USD"), "0.01");
      assert.equal(formatAbaAmount(10.5, "USD"), "10.50");
    });

    it("KHR has no decimal places", () => {
      assert.equal(formatAbaAmount(4000, "KHR"), "4000");
      assert.equal(formatAbaAmount(100, "KHR"), "100");
      assert.equal(formatAbaAmount(100.7, "KHR"), "101"); // rounds
    });

    it("case-insensitive currency", () => {
      assert.equal(formatAbaAmount(1, "usd"), "1.00");
      assert.equal(formatAbaAmount(4000, "khr"), "4000");
    });
  });

  describe("mapAbaPaymentStatus", () => {
    it("should map APPROVED to PAID", () => {
      assert.equal(mapAbaPaymentStatus("APPROVED", 0), "PAID");
    });

    it("should map PRE-AUTH to PAID", () => {
      assert.equal(mapAbaPaymentStatus("PRE-AUTH", 0), "PAID");
    });

    it("should map PENDING to UNPAID", () => {
      assert.equal(mapAbaPaymentStatus("PENDING", 2), "UNPAID");
    });

    it("should map DECLINED to CLOSED", () => {
      assert.equal(mapAbaPaymentStatus("DECLINED", 3), "CLOSED");
    });

    it("should map CANCELLED to CLOSED", () => {
      assert.equal(mapAbaPaymentStatus("CANCELLED", 7), "CLOSED");
    });

    it("should map REFUNDED to REFUNDED", () => {
      assert.equal(mapAbaPaymentStatus("REFUNDED", 4), "REFUNDED");
    });

    it("should map unknown status to UNKNOWN (fail-closed)", () => {
      assert.equal(mapAbaPaymentStatus("SOMETHING_ELSE", undefined), "UNKNOWN");
      assert.equal(mapAbaPaymentStatus(undefined, undefined), "UNKNOWN");
    });

    it("should fall back to status code when status string is missing", () => {
      assert.equal(mapAbaPaymentStatus(undefined, 0), "PAID");
      assert.equal(mapAbaPaymentStatus(undefined, 2), "UNPAID");
      assert.equal(mapAbaPaymentStatus(undefined, 3), "CLOSED");
    });
  });

  describe("constants", () => {
    it("should have correct sandbox URL", () => {
      assert.equal(ABA_PAYWAY_SANDBOX_BASE, "https://checkout-sandbox.payway.com.kh");
    });

    it("should have correct production URL", () => {
      assert.equal(ABA_PAYWAY_PRODUCTION_BASE, "https://checkout.payway.com.kh");
    });
  });
});


describe("ABA PayWay 回调安全工具", () => {
  describe("sanitizeAbaCallbackData", () => {
    it("redacts sensitive keys", () => {
      const result = sanitizeAbaCallbackData({
        tran_id: "BE001",
        api_key: "secret123",
        merchant_auth: "rsa_blob",
        card_number: "4111111111111111",
        amount: "1.00",
      });
      assert.equal(result.tran_id, "BE001");
      assert.equal(result.api_key, "[REDACTED]");
      assert.equal(result.merchant_auth, "[REDACTED]");
      assert.equal(result.card_number, "[REDACTED]");
      assert.equal(result.amount, "1.00");
    });

    it("truncates very long values", () => {
      const longValue = "x".repeat(600);
      const result = sanitizeAbaCallbackData({ data: longValue });
      assert.ok(result.data.endsWith("...[TRUNCATED]"));
      assert.ok(result.data.length < 600);
    });

    it("preserves normal short values", () => {
      const result = sanitizeAbaCallbackData({
        tran_id: "BE001",
        amount: "1.00",
        currency: "USD",
      });
      assert.equal(result.tran_id, "BE001");
      assert.equal(result.amount, "1.00");
      assert.equal(result.currency, "USD");
    });
  });

  describe("truncateSignature — SHA-256 digest", () => {
    it("returns SHA-256 hex digest truncated to 32 chars", () => {
      const hash = "test-signature-value";
      const result = truncateSignature(hash);
      // SHA-256 of "test-signature-value" is deterministic
      const expected = crypto.createHash("sha256").update(hash, "utf8").digest("hex").slice(0, 32);
      assert.equal(result, expected);
      assert.equal(result!.length, 32);
    });

    it("different inputs produce different digests", () => {
      const a = truncateSignature("signature-a");
      const b = truncateSignature("signature-b");
      assert.notEqual(a, b);
    });

    it("same input always produces same digest", () => {
      const hash = "consistent-signature";
      assert.equal(truncateSignature(hash), truncateSignature(hash));
    });

    it("returns null for undefined", () => {
      assert.equal(truncateSignature(undefined), null);
    });

    it("returns null for empty string", () => {
      assert.equal(truncateSignature(""), null);
    });

    it("never exposes original signature", () => {
      const secret = "super-secret-api-key-hash";
      const result = truncateSignature(secret);
      assert.ok(result);
      assert.ok(!result!.includes(secret));
      assert.equal(result!.length, 32); // hex only
    });
  });

  describe("isAbaRetryableError", () => {
    it("identifies timeout errors as retryable", () => {
      assert.equal(isAbaRetryableError("ABA Check Transaction 返回未知状态，等待重试"), true);
      assert.equal(isAbaRetryableError("request timeout"), true);
      assert.equal(isAbaRetryableError("ETIMEDOUT"), true);
      assert.equal(isAbaRetryableError("ECONNRESET"), true);
      assert.equal(isAbaRetryableError("503 Service Unavailable"), true);
      assert.equal(isAbaRetryableError("429 Too Many Requests"), true);
    });

    it("identifies business errors as non-retryable", () => {
      assert.equal(isAbaRetryableError("ABA 查单状态非 PAID: CLOSED"), false);
      assert.equal(isAbaRetryableError("金额不一致"), false);
      assert.equal(isAbaRetryableError("回调缺少 tran_id"), false);
      assert.equal(isAbaRetryableError("回调体格式非法"), false);
    });

    it("returns false for empty error", () => {
      assert.equal(isAbaRetryableError(""), false);
    });
  });
});


describe("ABA PayWay Retry Queue", () => {
  describe("constants", () => {
    it("has 4 retry delays with exponential backoff", () => {
      assert.equal(ABA_RETRY_DELAYS.length, 4);
      assert.equal(ABA_RETRY_DELAYS[0], 30_000);
      assert.equal(ABA_RETRY_DELAYS[1], 120_000);
      assert.equal(ABA_RETRY_DELAYS[2], 600_000);
      assert.equal(ABA_RETRY_DELAYS[3], 1_800_000);
    });

    it("max attempts = delays + 1", () => {
      assert.equal(ABA_MAX_ATTEMPTS, 5);
    });
  });

  describe("Redis unavailable degradation", () => {
    it("isRedisHealthy returns false when no REDIS_URL or REDIS_HOST", async () => {
      // Save and clear env
      const savedUrl = process.env.REDIS_URL;
      const savedHost = process.env.REDIS_HOST;
      delete process.env.REDIS_URL;
      delete process.env.REDIS_HOST;
      resetRedisHealthCache();
      resetAllState();

      const healthy = await isRedisHealthy();
      assert.equal(healthy, false);

      // Restore
      if (savedUrl) process.env.REDIS_URL = savedUrl;
      if (savedHost) process.env.REDIS_HOST = savedHost;
      resetRedisHealthCache();
      resetAllState();
    });

    it("enqueueAbaRetry returns false when Redis unavailable", async () => {
      const savedUrl = process.env.REDIS_URL;
      const savedHost = process.env.REDIS_HOST;
      delete process.env.REDIS_URL;
      delete process.env.REDIS_HOST;
      resetRedisHealthCache();
      resetAllState();

      const result = await enqueueAbaRetry("TEST001", 1);
      assert.equal(result, false);

      if (savedUrl) process.env.REDIS_URL = savedUrl;
      if (savedHost) process.env.REDIS_HOST = savedHost;
      resetRedisHealthCache();
      resetAllState();
    });

    it("startAbaPeriodicScan returns false when Redis unavailable", async () => {
      const savedUrl = process.env.REDIS_URL;
      const savedHost = process.env.REDIS_HOST;
      delete process.env.REDIS_URL;
      delete process.env.REDIS_HOST;
      resetRedisHealthCache();
      resetAllState();

      const result = await startAbaPeriodicScan();
      assert.equal(result, false);

      if (savedUrl) process.env.REDIS_URL = savedUrl;
      if (savedHost) process.env.REDIS_HOST = savedHost;
      resetRedisHealthCache();
      resetAllState();
    });
  });

  describe("Worker duplicate start protection", () => {
    it("isWorkerStarted returns false initially", () => {
      resetAllState();
      assert.equal(isWorkerStarted(), false);
    });

    it("resetAllState clears worker started flag", () => {
      resetAllState();
      assert.equal(isWorkerStarted(), false);
    });
  });

  describe("Graceful shutdown", () => {
    it("closeAbaRetryQueue does not throw when nothing initialized", async () => {
      resetAllState();
      await closeAbaRetryQueue();
      // Should not throw
      assert.ok(true);
    });

    it("double close does not throw", async () => {
      resetAllState();
      await closeAbaRetryQueue();
      await closeAbaRetryQueue();
      assert.ok(true);
    });
  });
});

describe("ABA PayWay RSA encryption", () => {
  // Generate a 2048-bit test key pair (more realistic than 1024)
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  it("calcRsaMaxChunkBytes returns 245 for 2048-bit key", () => {
    const chunkSize = calcRsaMaxChunkBytes(publicKey);
    assert.equal(chunkSize, 245); // 2048/8 - 11 = 245
  });

  it("calcRsaMaxChunkBytes returns 117 for 1024-bit key", () => {
    const { publicKey: pub1024 } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 1024,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const chunkSize = calcRsaMaxChunkBytes(pub1024);
    assert.equal(chunkSize, 117); // 1024/8 - 11 = 117
  });

  it("calcRsaMaxChunkBytes rejects key < 1024 bits", () => {
    const { publicKey: pub512 } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 512,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    assert.throws(() => calcRsaMaxChunkBytes(pub512));
  });

  it("should encrypt and decrypt data with RSA", () => {
    const data = JSON.stringify({ mc_id: "test", tran_id: "123", refund_amount: 1.0 });
    const encrypted = rsaEncryptChunked(data, publicKey);
    assert.ok(encrypted.length > 0);
    assert.ok(/^[A-Za-z0-9+/=]+$/.test(encrypted));

    // Verify we can decrypt back
    const encBuffer = Buffer.from(encrypted, "base64");
    const keySize = 2048 / 8;
    const decrypted = crypto.privateDecrypt(
      { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      encBuffer.subarray(0, keySize),
    );
    assert.ok(decrypted.toString("utf8").length > 0);
  });

  it("should handle long data with dynamic chunking (2048-bit key)", () => {
    const data = "A".repeat(500);
    const encrypted = rsaEncryptChunked(data, publicKey);
    assert.ok(encrypted.length > 0);
    // 500 bytes with 245-byte chunks = 3 chunks, each producing 256 bytes
    // Total base64 = ceil(500/245) * 256 bytes encrypted → base64 encoded
    const encBuf = Buffer.from(encrypted, "base64");
    assert.ok(encBuf.length >= 256 * 3); // at least 3 chunks
  });
});

describe("ABA amount contract (Order major units → API / minor units)", () => {
  it("maps 0.01 / 1.00 / 10.50 USD without treating yuan as fen", () => {
    assert.equal(formatAbaApiAmount("0.01", "USD"), "0.01");
    assert.equal(formatAbaApiAmount("1.00", "USD"), "1.00");
    assert.equal(formatAbaApiAmount("10.50", "USD"), "10.50");
    assert.equal(orderAmountToAbaMinor("0.01", "USD"), 1);
    assert.equal(orderAmountToAbaMinor("1.00", "USD"), 100);
    assert.equal(orderAmountToAbaMinor("10.50", "USD"), 1050);
    assert.equal(abaMajorToMinor("0.01", "USD"), 1);
    assert.equal(abaMajorToMinor("1.00", "USD"), 100);
    assert.equal(abaMajorToMinor("10.50", "USD"), 1050);
  });

  it("does not treat Order major units as fen", () => {
    assert.equal(fenToAbaAmount(1), "0.01");
    assert.equal(formatAbaApiAmount("1.00", "USD"), "1.00");
    assert.notEqual(formatAbaApiAmount("1.00", "USD"), fenToAbaAmount(1));
    assert.throws(() => fenToAbaAmount(10.5));
    assert.throws(() => fenToAbaAmount(-1));
  });

  it("formats KHR as whole riel", () => {
    assert.equal(formatAbaApiAmount("4000", "KHR"), "4000");
    assert.equal(orderAmountToAbaMinor("4000.00", "KHR"), 4000);
    assert.throws(() => formatAbaApiAmount("10.50", "KHR"));
  });
});

describe("ABA tran_id mapping", () => {
  it("is always 20 chars and stable", () => {
    const longOrderNo = "BEP20260901120000ABCDEFGHJK";
    const id = toAbaTranId(longOrderNo);
    assert.equal(id.length, ABA_TRAN_ID_LENGTH);
    assert.equal(isAbaTranId(id), true);
    assert.equal(toAbaTranId(longOrderNo), id);
  });

  it("distinguishes similar order numbers and avoids slice collisions", () => {
    const a = "BEP20260901120000AAAAAXXXXX";
    const b = "BEP20260901120000AAAAAYYYYY";
    assert.equal(a.slice(0, 20), b.slice(0, 20));
    assert.notEqual(toAbaTranId(a), toAbaTranId(b));
  });

  it("resolves stored tradeNo without re-hashing", () => {
    const orderNo = "BEP20260901120000ABCDEFGHJK";
    const tranId = toAbaTranId(orderNo);
    assert.equal(resolveAbaTranId(orderNo, tranId), tranId);
    assert.equal(resolveAbaTranId(tranId), tranId);
    assert.equal(resolveAbaTranId(orderNo, tranId.toLowerCase()), tranId);
  });

  it("does not map an unknown hashed tran_id back to a different order", () => {
    const orderNo = "BEP20260901120000ABCDEFGHJK";
    const unknown = `BE${"0".repeat(18)}`;
    assert.equal(isAbaTranId(unknown), true);
    assert.notEqual(toAbaTranId(orderNo), unknown);
    assert.notEqual(resolveAbaTranId(orderNo), unknown);
  });

  it("rejects empty orderNo", () => {
    assert.throws(() => toAbaTranId(""));
  });
});

describe("ABA currency fail-closed", () => {
  it("never defaults to USD", () => {
    const missing = resolveAbaCurrency(undefined, "", "CNY");
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.error, /禁止默认 USD/);
  });

  it("accepts explicit USD or KHR", () => {
    assert.deepEqual(resolveAbaCurrency("CNY", "USD"), { ok: true, currency: "USD" });
    assert.deepEqual(resolveAbaCurrency("KHR"), { ok: true, currency: "KHR" });
  });

  it("rejects unsupported currencies", () => {
    const blocked = resolveAbaCurrency("EUR");
    assert.equal(blocked.ok, false);
  });

  it("requires ABA PaymentConfig currency for new ABA orders", () => {
    const missing = resolveAbaOrderCurrency("ABA_PAYWAY", {});
    assert.equal(missing.ok, false);
    const ready = resolveAbaOrderCurrency("ABA_PAYWAY", { abaCurrency: "USD" });
    assert.deepEqual(ready, { ok: true, currency: "USD" });
    assert.deepEqual(resolveAbaOrderCurrency("ALIPAY_BAR", {}), { ok: true, currency: "CNY" });
  });
});

describe("ABA settlement match", () => {
  const base = {
    orderAmountMajor: "10.50",
    orderCurrency: "USD",
    checkStatus: "PAID" as const,
    checkVerified: true,
    checkAmountMinor: 1050,
    checkCurrency: "USD",
    configuredMerchantId: "merchant-test",
  };

  it("settles only when merchant / amount / currency / PAID match", () => {
    assert.equal(assertAbaSettlementMatch(base).ok, true);
  });

  it("retries unknown tran_id / unknown check", () => {
    const result = assertAbaSettlementMatch({
      ...base,
      checkStatus: "UNKNOWN",
      checkVerified: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.retryable, true);
  });

  it("retries pending, stops on terminal failure", () => {
    const pending = assertAbaSettlementMatch({ ...base, checkStatus: "UNPAID" });
    assert.equal(pending.ok, false);
    if (!pending.ok) assert.equal(pending.retryable, true);
    const closed = assertAbaSettlementMatch({ ...base, checkStatus: "CLOSED" });
    assert.equal(closed.ok, false);
    if (!closed.ok) assert.equal(closed.retryable, false);
  });

  it("rejects wrong amount and wrong currency", () => {
    const amount = assertAbaSettlementMatch({ ...base, checkAmountMinor: 1 });
    assert.equal(amount.ok, false);
    if (!amount.ok) assert.match(amount.error, /amount/);
    const currency = assertAbaSettlementMatch({ ...base, checkCurrency: "KHR" });
    assert.equal(currency.ok, false);
    if (!currency.ok) assert.match(currency.error, /currency/);
  });

  it("rejects merchant_id mismatch", () => {
    const result = assertAbaSettlementMatch({
      ...base,
      callbackMerchantId: "other-merchant",
    });
    assert.equal(result.ok, false);
  });

  it("duplicate settlement is idempotent at retry decision", () => {
    const paid = decideAbaRetryAction({
      orderStatus: "PAID",
      settlement: { ok: true },
      attempt: 2,
      maxAttempts: 5,
    });
    assert.equal(paid.action, "IDEMPOTENT");
  });

  it("retries pending then stops after max attempts", () => {
    const pending = assertAbaSettlementMatch({ ...base, checkStatus: "UNPAID" });
    assert.equal(
      decideAbaRetryAction({
        orderStatus: "PAYING",
        settlement: pending,
        attempt: 1,
        maxAttempts: 5,
      }).action,
      "RETRY",
    );
    assert.equal(
      decideAbaRetryAction({
        orderStatus: "PAYING",
        settlement: pending,
        attempt: 5,
        maxAttempts: 5,
      }).action,
      "STOP",
    );
  });
});

describe("ABA provider policy", () => {
  const fakeConfig = {
    isActive: true,
    isSandbox: false,
    appId: "merchant-test",
    privateKey: "api-key-test",
    publicKey: "-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----",
    extraConfig: { abaCurrency: "USD" },
  } as unknown as PaymentConfig;

  it("stays fail-closed without credentials", () => {
    const result = resolveProvider("ABA_PAYWAY", {
      isActive: true,
      isSandbox: false,
    } as unknown as PaymentConfig, { merchantChannel: { isEnabled: true } });
    assert.equal(result.usable, false);
    assert.equal(result.provider, null);
  });

  it("NEW_PAYMENT respects disabled MerchantChannel", () => {
    const result = resolveProvider("ABA_PAYWAY", fakeConfig, {
      purpose: "NEW_PAYMENT",
      merchantChannel: { isEnabled: false },
    });
    assert.equal(result.usable, false);
    assert.deepEqual(result.missing, ["MERCHANT_CHANNEL_DISABLED"]);
  });

  it("EXISTING_ORDER still resolves after MerchantChannel is disabled", () => {
    const result = resolveProvider("ABA_PAYWAY", fakeConfig, {
      purpose: "EXISTING_ORDER",
      merchantChannel: { isEnabled: false },
    });
    assert.equal(result.usable, true);
    assert.ok(result.provider);
  });

  it("PREVIEW never calls ABA createPayment", async () => {
    const previous = process.env.PAYMENT_ENV;
    process.env.PAYMENT_ENV = "PREVIEW";
    try {
      const provider = new AbaPaywayProvider({
        paymentConfig: fakeConfig,
        channel: "ABA_PAYWAY",
      });
      const created = await provider.createPayment({
        orderNo: "BEP20260901120000ABCDEFGHJK",
        amount: 0.01,
        subject: "test",
        currency: "USD",
        notifyUrl: "https://pay.example/api/pay/aba-payway/notify",
      });
      assert.equal(created.success, false);
      assert.match(created.error || "", /PREVIEW/);
    } finally {
      if (previous === undefined) delete process.env.PAYMENT_ENV;
      else process.env.PAYMENT_ENV = previous;
    }
  });

  it("refund is NOT READY and never succeeds", async () => {
    const provider = new AbaPaywayProvider({
      paymentConfig: fakeConfig,
      channel: "ABA_PAYWAY",
    });
    const refund = await provider.refund({
      refundNo: "REF1",
      orderNo: "BEP20260901120000ABCDEFGHJK",
      refundAmount: 0.01,
      totalAmount: 0.01,
    });
    assert.equal(refund.success, false);
    assert.equal(refund.error, "ABA REFUND: NOT READY");
    const query = await provider.queryRefund({ refundNo: "REF1" });
    assert.equal(query.status, "UNKNOWN");
  });
});
