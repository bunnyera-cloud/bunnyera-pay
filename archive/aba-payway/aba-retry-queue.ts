import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import prisma from "@/lib/db";
import { resolveProvider } from "./resolver";
import { settleVerifiedPayment } from "./transitions";
import { recordAuditLog } from "@/lib/audit";
import {
  assertAbaSettlementMatch,
  decideAbaRetryAction,
  resolveAbaPaywayConfig,
} from "./aba-payway-config";

/**
 * ABA PayWay Check Transaction 持久化重试队列。
 *
 * 当回调首次 Check Transaction 超时/临时失败时，
 * 将任务加入 BullMQ 队列，使用指数退避重试。
 *
 * 退避序列：30s → 2min → 10min → 30min → 标记人工复核
 * 最大重试 4 次（共 5 次尝试）。
 *
 * 若 Redis 未配置或不可用，优雅降级为仅日志记录，
 * 回调保持 fail-closed，不声称重试已安排，不错误入账。
 */

// ── 退避配置 ──
export const ABA_RETRY_DELAYS = [
  30 * 1000,        // 30 秒
  2 * 60 * 1000,    // 2 分钟
  10 * 60 * 1000,   // 10 分钟
  30 * 60 * 1000,   // 30 分钟
];
export const ABA_MAX_ATTEMPTS = ABA_RETRY_DELAYS.length + 1; // 5 次总尝试

const QUEUE_NAME = "aba-check-transaction";
const SCAN_JOB_ID = "aba-paying-scan";

// ── 单例状态 ──
let connection: IORedis | null = null;
let queue: Queue | null = null;
let worker: Worker | null = null;
let workerStarted = false;       // 防止重复启动
let closing = false;             // 防止重复 close
let redisHealthy: boolean | null = null; // 缓存健康状态

// ── Redis 连接 ──
function getConnection(): IORedis | null {
  if (connection) return connection;
  if (closing) return null;

  const url = process.env.REDIS_URL;
  if (url) {
    connection = new IORedis(url, { maxRetriesPerRequest: null });
    return connection;
  }
  const host = process.env.REDIS_HOST;
  if (host) {
    connection = new IORedis({
      host,
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });
    return connection;
  }
  return null;
}

/**
 * 检查 Redis 是否可连接。
 * 不输出密码或敏感信息。
 */
export async function isRedisHealthy(): Promise<boolean> {
  if (redisHealthy !== null) return redisHealthy;

  const conn = getConnection();
  if (!conn) {
    redisHealthy = false;
    return false;
  }

  try {
    const result = await conn.ping();
    redisHealthy = result === "PONG";
  } catch {
    redisHealthy = false;
  }
  return redisHealthy;
}

/**
 * 重置 Redis 健康缓存（用于测试或连接恢复后）。
 */
export function resetRedisHealthCache(): void {
  redisHealthy = null;
}

// ── Queue ──
function getQueue(): Queue | null {
  if (queue) return queue;
  if (closing) return null;
  const conn = getConnection();
  if (!conn) return null;
  queue = new Queue(QUEUE_NAME, { connection: conn });
  return queue;
}

// ── 任务数据 ──
export interface AbaRetryJobData {
  orderNo: string;
  attempt: number;
  callbackLogId?: string;
}

/**
 * 将 ABA Check Transaction 重试任务加入队列。
 * 若 Redis 不可用，返回 false（调用方不得声称重试已安排）。
 */
export async function enqueueAbaRetry(
  orderNo: string,
  attempt: number,
  callbackLogId?: string,
): Promise<boolean> {
  const q = getQueue();
  if (!q) return false;

  const delay = ABA_RETRY_DELAYS[
    Math.min(attempt - 1, ABA_RETRY_DELAYS.length - 1)
  ] ?? ABA_RETRY_DELAYS[ABA_RETRY_DELAYS.length - 1];

  try {
    await q.add(
      "check-transaction",
      { orderNo, attempt, callbackLogId } satisfies AbaRetryJobData,
      { attempts: 1, delay, jobId: `retry-${orderNo}-${attempt}` },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 启动 Worker + 定时补偿扫描。
 * 防止同一进程重复注册。
 * 返回 false 表示已启动过或 Redis 不可用。
 */
export async function startAbaWorker(): Promise<boolean> {
  if (workerStarted) return false; // 防止重复启动

  const healthy = await isRedisHealthy();
  if (!healthy) return false;

  const conn = getConnection();
  if (!conn) return false;

  // 创建 Queue（如果尚未创建）
  getQueue();

  // 创建 Worker
  worker = new Worker(QUEUE_NAME, processJob, {
    connection: conn,
    concurrency: 3,
  });
  workerStarted = true;

  // 注册定时补偿扫描
  await startAbaPeriodicScan();

  return true;
}

/**
 * 启动定时补偿扫描（每 15 分钟）。
 * 查找长时间处于 PAYING/CREATED 且存在 ABA 回调记录但未入账的订单。
 */
export async function startAbaPeriodicScan(): Promise<boolean> {
  const q = getQueue();
  if (!q) return false;

  try {
    await q.upsertJobScheduler(
      SCAN_JOB_ID,
      { every: 15 * 60 * 1000 },
      {
        name: "paying-scan",
        data: {},
        opts: { removeOnComplete: { count: 10 } },
      },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 查询当前 Worker 是否已启动（用于测试）。
 */
export function isWorkerStarted(): boolean {
  return workerStarted;
}

/**
 * 重置所有单例状态（仅用于测试）。
 */
export function resetAllState(): void {
  workerStarted = false;
  closing = false;
  redisHealthy = null;
  // 不自动关闭连接——由测试显式调用 closeAbaRetryQueue
}

// ── Worker 处理器 ──
async function processJob(job: { name: string; data: unknown; attemptsMade: number }): Promise<void> {
  if (job.name === "paying-scan") {
    await processScan();
    return;
  }

  const data = job.data as AbaRetryJobData;
  const { orderNo, attempt, callbackLogId } = data;

  // 1. 查找订单
  const order = await prisma.order.findUnique({
    where: { orderNo },
    include: { merchant: { include: { paymentConfigs: true } } },
  });

  if (!order) {
    console.warn(`[ABA-retry] Order not found: ${orderNo}`);
    return;
  }

  // 2. 只允许 CREATED/PAYING 进入 PAID
  if (order.status === "PAID") {
    if (callbackLogId) {
      await prisma.callbackLog.update({
        where: { id: callbackLogId },
        data: { processed: true, error: "重试时订单已入账（幂等）" },
      });
    }
    return;
  }

  if (order.status !== "CREATED" && order.status !== "PAYING") {
    if (callbackLogId) {
      await prisma.callbackLog.update({
        where: { id: callbackLogId },
        data: { processed: true, error: `重试时订单已终态: ${order.status}` },
      });
    }
    return;
  }

  // 3. 解析 Provider
  const paymentConfig = order.merchant.paymentConfigs.find(
    (c) => c.channel === order.channel,
  );
  const resolved = resolveProvider(order.channel, paymentConfig, {
    purpose: "EXISTING_ORDER",
  });

  if (!resolved.provider || !resolved.usable) {
    if (attempt >= ABA_MAX_ATTEMPTS) {
      await recordAuditLog({
        action: "PAYMENT_RETRY_EXHAUSTED",
        resource: "order",
        resourceId: order.id,
        result: "FAILED",
        detail: `ABA Provider 不可用，重试耗尽 - 订单 ${orderNo}`,
      });
      return;
    }
    await enqueueAbaRetry(orderNo, attempt + 1, callbackLogId);
    return;
  }

  const checkResult = await resolved.provider.queryOrder({
    orderNo: order.orderNo,
    tradeNo: order.channelTradeNo || undefined,
  });
  const abaCfg = resolveAbaPaywayConfig(paymentConfig);
  const settlement = assertAbaSettlementMatch({
    orderAmountMajor: order.amount.toString(),
    orderCurrency: order.currency,
    checkStatus: checkResult.status,
    checkVerified: checkResult.verified === true,
    checkAmountMinor: checkResult.amount,
    checkCurrency: checkResult.currency,
    configuredMerchantId: abaCfg.merchantId,
  });
  const decision = decideAbaRetryAction({
    orderStatus: order.status,
    settlement,
    attempt,
    maxAttempts: ABA_MAX_ATTEMPTS,
  });

  if (decision.action === "IDEMPOTENT") {
    if (callbackLogId) {
      await prisma.callbackLog.update({
        where: { id: callbackLogId },
        data: { processed: true, error: "重试时订单已入账（幂等）" },
      });
    }
    return;
  }

  if (decision.action === "SETTLE") {
    const settled = await settleVerifiedPayment(prisma, {
      orderId: order.id,
      amount: order.amount,
      channel: order.channel,
      tradeNo: checkResult.tradeNo || order.channelTradeNo || order.orderNo,
      paidAt: checkResult.paidAt ?? new Date(),
    });

    if (callbackLogId) {
      await prisma.callbackLog.update({
        where: { id: callbackLogId },
        data: { processed: true, verified: settled },
      });
    }

    if (settled) {
      await recordAuditLog({
        action: "PAYMENT_RETRY_SETTLED",
        resource: "order",
        resourceId: order.id,
        result: "SUCCESS",
        detail: `ABA 重试第 ${attempt} 次入账成功 - 订单 ${orderNo}`,
      });
    }
    return;
  }

  if (decision.action === "RETRY") {
    await enqueueAbaRetry(orderNo, attempt + 1, callbackLogId);
    return;
  }

  await recordAuditLog({
    action: attempt >= ABA_MAX_ATTEMPTS ? "PAYMENT_RETRY_EXHAUSTED" : "PAYMENT_RETRY_STOPPED",
    resource: "order",
    resourceId: order.id,
    result: "FAILED",
    detail: `ABA 重试停止 - 订单 ${orderNo} - ${decision.reason}`,
  });
  if (callbackLogId) {
    await prisma.callbackLog.update({
      where: { id: callbackLogId },
      data: {
        processed: true,
        error: `[MANUAL_REVIEW] ${decision.reason}`,
      },
    });
  }
}

// ── 补偿扫描 ──
async function processScan(): Promise<void> {
  const stuckOrders = await prisma.order.findMany({
    where: {
      channel: "ABA_PAYWAY",
      status: { in: ["CREATED", "PAYING"] },
      createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
      callbackLogs: {
        some: { processed: true, verified: false },
      },
    },
    select: { orderNo: true, id: true },
    take: 50,
  });

  for (const order of stuckOrders) {
    await enqueueAbaRetry(order.orderNo, 1);
  }

  if (stuckOrders.length > 0) {
    console.log(`[ABA-scan] Enqueued ${stuckOrders.length} stuck orders for retry`);
  }
}

/**
 * 优雅关闭：Worker → Queue → Redis。
 * 防止重复 close。
 */
export async function closeAbaRetryQueue(): Promise<void> {
  if (closing) return;
  closing = true;

  try {
    if (worker) {
      await worker.close();
      worker = null;
    }
  } catch { /* ignore */ }

  try {
    if (queue) {
      await queue.close();
      queue = null;
    }
  } catch { /* ignore */ }

  try {
    if (connection) {
      await connection.quit();
      connection = null;
    }
  } catch { /* ignore */ }

  workerStarted = false;
  redisHealthy = null;
}
