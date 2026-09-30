import Redis from "ioredis";

// Singleton Redis client
let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    redisClient.on("error", (err) => {
      // Swallow connection errors so the app degrades gracefully
      console.error("[Redis] Connection error:", err.message);
    });
  }
  return redisClient;
}

/**
 * Simple sliding-window rate limiter.
 * Returns { allowed: boolean, remaining: number }
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedis();
  const redisKey = `rl:${key}`;

  try {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    // Atomic sliding window with sorted set
    const pipe = redis.pipeline();
    pipe.zremrangebyscore(redisKey, 0, windowStart);
    pipe.zadd(redisKey, now, `${now}-${Math.random()}`);
    pipe.zcard(redisKey);
    pipe.expire(redisKey, windowSeconds + 1);
    const results = await pipe.exec();

    const count = (results?.[2]?.[1] as number) ?? 0;
    const remaining = Math.max(0, limit - count);
    return { allowed: count <= limit, remaining };
  } catch {
    // If Redis is unreachable, fail open (allow the request)
    return { allowed: true, remaining: limit };
  }
}

/**
 * Lockout for repeated failures (e.g. wrong download codes): after `max` failures
 * within `windowSeconds`, the key stays locked until the window expires.
 * Fails open if Redis is unreachable, like rateLimit.
 */
export async function isLockedOut(key: string, max: number): Promise<boolean> {
  try {
    const count = Number(await getRedis().get(`fail:${key}`));
    return count >= max;
  } catch {
    return false;
  }
}

export async function recordFailure(key: string, windowSeconds: number): Promise<void> {
  try {
    const redis = getRedis();
    const redisKey = `fail:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, windowSeconds);
  } catch {}
}

/**
 * Resolve the real client IP behind Cloudflare Tunnel.
 * CF-Connecting-IP is set by Cloudflare and can't be forged as long as the app
 * port is only reachable through the tunnel (bound to 127.0.0.1 in docker-compose).
 * X-Forwarded-For's first entry is client-controlled, so only its last hop is used.
 */
export function getClientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip")?.trim()
    || headers.get("x-real-ip")?.trim()
    || headers.get("x-forwarded-for")?.split(",").pop()?.trim()
    || "unknown";
}
