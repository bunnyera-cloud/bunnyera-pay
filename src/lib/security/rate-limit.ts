import { createHash } from "node:crypto";
import Redis from "ioredis";
import { NextResponse } from "next/server";

export interface RateLimitHit {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSec: number;
}

interface RateLimitBackend {
  increment(key: string, windowMs: number): Promise<number>;
  reset(): Promise<void>;
}

class MemoryRateLimitBackend implements RateLimitBackend {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }
    current.count += 1;
    return current.count;
  }

  async reset(): Promise<void> {
    this.buckets.clear();
  }
}

const INCR_EXPIRE_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return n
`;

class RedisRateLimitBackend implements RateLimitBackend {
  constructor(private readonly redis: Redis) {}

  async increment(key: string, windowMs: number): Promise<number> {
    const count = await this.redis.eval(INCR_EXPIRE_LUA, 1, key, String(windowMs));
    return Number(count);
  }

  async reset(): Promise<void> {
    // Test-only; production Redis keys expire on their own.
  }
}

let memoryBackend = new MemoryRateLimitBackend();
let redisBackend: RateLimitBackend | null = null;
let redisAttempted = false;
let forcedBackend: RateLimitBackend | null = null;

function redisUrl(): string {
  return (process.env.REDIS_URL || "").trim();
}

async function resolveBackend(): Promise<RateLimitBackend> {
  if (forcedBackend) return forcedBackend;
  if (redisBackend) return redisBackend;
  const url = redisUrl();
  if (!url || redisAttempted) return memoryBackend;
  redisAttempted = true;
  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    await client.connect();
    redisBackend = new RedisRateLimitBackend(client);
    return redisBackend;
  } catch (error) {
    console.warn("[security] Redis rate limiter unavailable, using in-process fallback", error);
    return memoryBackend;
  }
}

export function hashIdentity(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitHit> {
  const backend = await resolveBackend();
  const count = await backend.increment(`bep:rl:${key}`, windowMs);
  const allowed = count <= limit;
  return {
    allowed,
    count,
    limit,
    retryAfterSec: Math.max(1, Math.ceil(windowMs / 1000)),
  };
}

export async function consumeFirstExceeded(
  checks: Array<{ key: string; limit: number; windowMs: number }>,
): Promise<RateLimitHit | null> {
  for (const check of checks) {
    const hit = await consumeRateLimit(check.key, check.limit, check.windowMs);
    if (!hit.allowed) return hit;
  }
  return null;
}

export function rateLimitResponse(hit: RateLimitHit): NextResponse {
  return NextResponse.json(
    { success: false, error: "请求过于频繁，请稍后再试" },
    {
      status: 429,
      headers: { "Retry-After": String(hit.retryAfterSec) },
    },
  );
}

export async function resetRateLimitStoreForTests(): Promise<void> {
  memoryBackend = new MemoryRateLimitBackend();
  forcedBackend = memoryBackend;
  redisBackend = null;
  redisAttempted = true;
  await memoryBackend.reset();
}

export function useMemoryRateLimitForTests(): void {
  forcedBackend = memoryBackend;
  redisAttempted = true;
}
