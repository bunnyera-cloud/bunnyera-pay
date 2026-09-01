/**
 * ABA PayWay Retry Worker — 独立进程入口。
 *
 * 启动命令：npm run worker:aba
 *
 * 职责：
 * 1. 验证 Redis 可连接
 * 2. 注册 ABA Check Transaction 重试消费者
 * 3. 启动定时补偿扫描（每 15 分钟）
 * 4. 监听 SIGINT/SIGTERM 优雅退出
 *
 * 本地启动顺序：PostgreSQL → Redis → Next.js → ABA Worker
 */
import {
  startAbaWorker,
  closeAbaRetryQueue,
  isRedisHealthy,
} from "@/lib/payment/aba-retry-queue";

let shuttingDown = false;

async function main() {
  // ── 启动 ──
  console.log("[ABA-worker] Starting ABA PayWay retry worker...");

  // 检查 Redis 连接
  const redisOk = await isRedisHealthy();
  if (!redisOk) {
    console.error(
      "[ABA-worker] ERROR: Redis is not available. " +
      "Worker cannot start. Callbacks will operate in fail-closed mode " +
      "without retry queue until Redis is restored.",
    );
    process.exit(1);
  }
  console.log("[ABA-worker] Redis connection verified.");

  // 注册 Worker + 定时扫描
  const started = await startAbaWorker();
  if (!started) {
    console.error("[ABA-worker] ERROR: Failed to start worker (duplicate or Redis error).");
    process.exit(1);
  }
  console.log("[ABA-worker] Retry consumer registered.");
  console.log("[ABA-worker] Periodic scan scheduled (every 15 min).");
  console.log("[ABA-worker] ABA PayWay retry worker is running.");

  // ── 优雅退出 ──
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[ABA-worker] Received ${signal}, shutting down gracefully...`);

    try {
      await closeAbaRetryQueue();
      console.log("[ABA-worker] Worker, queue, and Redis connection closed.");
    } catch (err) {
      console.error("[ABA-worker] Error during shutdown:", (err as Error).message);
    }

    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // 防止进程意外退出
  process.on("uncaughtException", (err) => {
    console.error("[ABA-worker] Uncaught exception:", err.message);
    shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[ABA-worker] Unhandled rejection:", reason);
  });
}

main().catch((err) => {
  console.error("[ABA-worker] Fatal error:", err.message);
  process.exit(1);
});
