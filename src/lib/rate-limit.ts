interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  now?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = options.now ?? Date.now();
  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1000, Math.floor(options.windowMs));
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, limit, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}

export function pruneExpiredRateLimits(now = Date.now()): void {
  if (buckets.size < 2000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
