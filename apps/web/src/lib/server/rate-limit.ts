import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { SqliteDb } from '@arcuex/persistence';

export class DurableRateLimiter {
  constructor(
    readonly db: SqliteDb,
    readonly secret: string,
  ) {}

  consume(
    scope: string,
    identity: string,
    limit: number,
    seconds: number,
    now = Math.floor(Date.now() / 1000),
  ): { allowed: boolean; retryAfter: number } {
    const key = createHmac('sha256', this.secret).update(`${scope}:${identity}`).digest('hex');
    const window = Math.floor(now / seconds) * seconds;
    return this.db
      .transaction(() => {
        this.db.prepare('DELETE FROM launch_rate_limits WHERE window_start < ?').run(now - 3600);
        this.db
          .prepare(
            `INSERT INTO launch_rate_limits (key_hash, window_start, attempts)
             VALUES (?, ?, 1)
             ON CONFLICT(key_hash, window_start) DO UPDATE SET attempts = attempts + 1`,
          )
          .run(key, window);
        const row = this.db
          .prepare(
            'SELECT attempts FROM launch_rate_limits WHERE key_hash = ? AND window_start = ?',
          )
          .get(key, window) as { attempts: number };
        return {
          allowed: row.attempts <= limit,
          retryAfter: Math.max(1, window + seconds - now),
        };
      })
      .immediate();
  }
}

/**
 * Client IP for rate limiting.
 * In public-beta, only Railway-overwritten X-Real-IP is accepted (single IP).
 * Never trust x-arcuex-client-ip or leftmost X-Forwarded-For chains.
 */
export function verifiedClientIp(request: Request, enforced: boolean): string {
  if (!enforced) return 'development';

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp && isIP(realIp)) return realIp;

  // local-test without Railway edge: fall back to a stable bucket, not client-spoofable headers.
  return 'local-test';
}
