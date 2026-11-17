export type RateLimiterOptions = {
  /** Most requests allowed per key in one window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Clock, replaceable in tests. */
  now?: () => number;
};

export type RateLimiter = {
  /** Records a request for the key. Returns false when the key is over its limit. */
  allow(key: string): boolean;
};

const SWEEP_AT = 10_000;

/**
 * A small in-memory, fixed-window rate limiter. State is lost on restart and
 * is not shared between servers, which is fine for one Lightsail container.
 */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    allow(key: string): boolean {
      const time = now();

      // Drop expired windows so the map can't grow without bound.
      if (windows.size > SWEEP_AT) {
        for (const [k, w] of windows) {
          if (w.resetAt <= time) windows.delete(k);
        }
      }

      const current = windows.get(key);
      if (!current || current.resetAt <= time) {
        windows.set(key, { count: 1, resetAt: time + windowMs });
        return true;
      }
      if (current.count >= limit) return false;
      current.count += 1;
      return true;
    },
  };
}
