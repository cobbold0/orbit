/**
 * In-memory sliding-window rate limiter for production endpoints and server actions.
 * Scoped by key (e.g. `userId:action` or `ip:action`).
 * In serverless environments, this protects warm instances against rapid hammering;
 * combined with input-size limits and timeout controls, it stops abuse vectors.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Clean up stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function purgeStale(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const maxAge = 10 * 60 * 1000; // 10 minutes
  for (const [key, record] of rateLimitStore.entries()) {
    const fresh = record.timestamps.filter((ts) => now - ts < maxAge);
    if (fresh.length === 0) {
      rateLimitStore.delete(key);
    } else {
      record.timestamps = fresh;
    }
  }
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

/**
 * Checks whether the given key is within rate limits.
 * @param key Unique identifier (e.g. `user_123:ask_planner`)
 * @param limit Maximum allowed requests within the window
 * @param windowMs Time window in milliseconds (default: 60,000ms / 1 min)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  purgeStale(now);

  const windowStart = now - windowMs;
  let record = rateLimitStore.get(key);

  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  // Filter timestamps within the current sliding window
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0] ?? now;
    const resetMs = Math.max(0, oldest + windowMs - now);
    return {
      success: false,
      limit,
      remaining: 0,
      resetMs,
    };
  }

  record.timestamps.push(now);
  return {
    success: true,
    limit,
    remaining: limit - record.timestamps.length,
    resetMs: windowMs,
  };
}
