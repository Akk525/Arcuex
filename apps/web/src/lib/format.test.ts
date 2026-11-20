import { describe, expect, it } from 'vitest';
import { relativeTime, shortAddress, shortHash } from './format';

describe('format helpers', () => {
  it('shortens addresses and hashes', () => {
    expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678');
    expect(
      shortHash('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ).toBe('0xaaaaaa…aaaaaa');
  });

  it('formats relative times from real timestamps', () => {
    const now = Date.parse('2026-11-19T12:00:00Z');
    expect(relativeTime('2026-11-19T11:59:50Z', now)).toBe('just now');
    expect(relativeTime('2026-11-19T10:00:00Z', now)).toBe('2 hours ago');
    expect(relativeTime('2026-11-18T12:00:00Z', now)).toBe('yesterday');
    expect(relativeTime('not-a-date', now)).toBeNull();
  });
});
