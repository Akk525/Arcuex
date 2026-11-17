import { openDatabase } from '@arcuex/persistence';
import { describe, expect, it } from 'vitest';
import { DurableRateLimiter, verifiedClientIp } from './rate-limit';

describe('DurableRateLimiter', () => {
  it('persists attempts across limiter instances on the same database', () => {
    const db = openDatabase(':memory:');
    const a = new DurableRateLimiter(db, 'ab'.repeat(32));
    const b = new DurableRateLimiter(db, 'ab'.repeat(32));
    expect(a.consume('auth', '203.0.113.1', 2, 60).allowed).toBe(true);
    expect(b.consume('auth', '203.0.113.1', 2, 60).allowed).toBe(true);
    expect(a.consume('auth', '203.0.113.1', 2, 60).allowed).toBe(false);
  });
});

describe('verifiedClientIp', () => {
  it('reads Railway X-Real-IP when enforced', () => {
    const request = new Request('https://beta.example.com/', {
      headers: { 'x-real-ip': '198.51.100.9', 'x-forwarded-for': '203.0.113.1, 198.51.100.9' },
    });
    expect(verifiedClientIp(request, true)).toBe('198.51.100.9');
  });

  it('does not trust x-arcuex-client-ip', () => {
    const request = new Request('https://beta.example.com/', {
      headers: { 'x-arcuex-client-ip': '203.0.113.9' },
    });
    expect(verifiedClientIp(request, true)).toBe('local-test');
  });
});
