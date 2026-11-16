import { describe, expect, it } from 'vitest';
import {
  assertUsdcConservation,
  formatUsdc,
  parseUsdcDecimal,
  subUsdc,
  usdcMicros,
} from './money';

describe('USDC micros', () => {
  it('parses and formats decimals', () => {
    const v = parseUsdcDecimal('12.340000');
    expect(v).toBe(12_340_000n);
    expect(formatUsdc(v)).toBe('12.340000');
  });

  it('rejects negative amounts', () => {
    expect(() => usdcMicros(-1n)).toThrow();
  });

  it('subtracts with floor at zero', () => {
    expect(subUsdc(10n, 3n)).toBe(7n);
    expect(() => subUsdc(1n, 2n)).toThrow();
  });

  it('checks conservation', () => {
    expect(() => assertUsdcConservation([1n, 2n], 3n)).not.toThrow();
    expect(() => assertUsdcConservation([1n, 2n], 4n)).toThrow(/conservation/);
  });
});
