import Redis from "ioredis";

export interface RateLimitRule {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
  exceeded: boolean;
  key: string;
}

export interface RateLimitStore {
  consume(orgId: string, rule: RateLimitRule, nowMs?: number): Promise<RateLimitResult>;
  close?(): Promise<void>;
}

interface CounterState {
  count: number;
  resetAt: number;
}

function windowStartFor(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs) * windowMs;
}

function redisCounterKey(orgId: string, rule: RateLimitRule, windowStart: number): string {
  return `ratelimit:${orgId}:${rule.key}:${windowStart}`;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, CounterState>();

  async consume(orgId: string, rule: RateLimitRule, nowMs = Date.now()): Promise<RateLimitResult> {
    const windowStart = windowStartFor(nowMs, rule.windowMs);
    const resetAt = windowStart + rule.windowMs;
    const key = redisCounterKey(orgId, rule, windowStart);
    const existing = this.counters.get(key);

    let count = 1;
    if (existing && existing.resetAt > nowMs) {
      count = existing.count + 1;
    }

    this.counters.set(key, { count, resetAt });
    return {
      key: rule.key,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetAt,
      retryAfter: Math.max(1, Math.ceil((resetAt - nowMs) / 1000)),
      exceeded: count > rule.limit,
    };
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.redis.on("error", () => {});
  }

  async consume(orgId: string, rule: RateLimitRule, nowMs = Date.now()): Promise<RateLimitResult> {
    if (this.redis.status === "wait") {
      await this.redis.connect();
    }

    const windowStart = windowStartFor(nowMs, rule.windowMs);
    const resetAt = windowStart + rule.windowMs;
    const key = redisCounterKey(orgId, rule, windowStart);
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.pexpire(key, Math.max(1, resetAt - nowMs));
    }

    return {
      key: rule.key,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetAt,
      retryAfter: Math.max(1, Math.ceil((resetAt - nowMs) / 1000)),
      exceeded: count > rule.limit,
    };
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }
}
