// In-memory rate limiting. The app runs as a single process, so counters kept in
// memory are shared by every request. They reset when the app restarts, which is
// fine for short windows like these. (Running several app instances would need a
// shared store such as Redis instead.)

type Store = {
  hits: Map<string, number[]>; // sliding-window request timestamps
  failures: Map<string, { count: number; resetAt: number }>;
};

// Kept on globalThis so every route module (and dev hot reloads) share one store
const globalStore = globalThis as typeof globalThis & { __rateLimitStore?: Store };
const store: Store = globalStore.__rateLimitStore ??= { hits: new Map(), failures: new Map() };

const SWEEP_INTERVAL_MS = 60 * 1000;
// Longest window in use (the 15-minute lockout); the privacy policy states IPs are kept no longer
const MAX_WINDOW_MS = 15 * 60 * 1000;

// Drop entries that can no longer affect any decision, so memory stays bounded
const globalTimer = globalThis as typeof globalThis & { __rateLimitSweep?: NodeJS.Timeout };
if (!globalTimer.__rateLimitSweep) {
  globalTimer.__rateLimitSweep = setInterval(() => {
    const now = Date.now();
    for (const [key, times] of store.hits) {
      if (times.length === 0 || times[times.length - 1] < now - MAX_WINDOW_MS) store.hits.delete(key);
    }
    for (const [key, entry] of store.failures) {
      if (entry.resetAt <= now) store.failures.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  globalTimer.__rateLimitSweep.unref?.();
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
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const times = (store.hits.get(key) ?? []).filter((t) => t > windowStart);
  times.push(now);
  store.hits.set(key, times);

  const count = times.length;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

/**
 * Lockout for repeated failures (e.g. wrong download codes): after `max` failures
 * within `windowSeconds`, the key stays locked until the window expires.
 */
export async function isLockedOut(key: string, max: number): Promise<boolean> {
  const entry = store.failures.get(key);
  if (!entry || entry.resetAt <= Date.now()) return false;
  return entry.count >= max;
}

export async function recordFailure(key: string, windowSeconds: number): Promise<void> {
  const now = Date.now();
  const entry = store.failures.get(key);
  if (!entry || entry.resetAt <= now) {
    store.failures.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
  } else {
    entry.count++;
  }
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
