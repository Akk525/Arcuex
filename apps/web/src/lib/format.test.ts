import { describe, expect, it } from 'vitest';
import { shortAddress, shortHash } from './format';

describe('format helpers', () => {
  it('shortens addresses and hashes', () => {
    expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678');
    expect(
      shortHash('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ).toBe('0xaaaaaa…aaaaaa');
  });
});
