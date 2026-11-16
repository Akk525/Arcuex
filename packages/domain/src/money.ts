import { z } from 'zod';

/** USDC with 6 decimal places, stored as integer micros (1 USDC = 1_000_000). */
export const UsdcMicrosSchema = z
  .bigint()
  .refine((v) => v >= 0n, { message: 'USDC amount must be non-negative' });

export type UsdcMicros = z.infer<typeof UsdcMicrosSchema>;

export const USDC_DECIMALS = 6;
export const USDC_MICROS_PER_UNIT = 1_000_000n;

export function usdcMicros(value: bigint | number | string): UsdcMicros {
  const parsed =
    typeof value === 'bigint'
      ? value
      : typeof value === 'number'
        ? BigInt(Math.trunc(value))
        : BigInt(value);
  return UsdcMicrosSchema.parse(parsed);
}

export function parseUsdcDecimal(decimal: string): UsdcMicros {
  const trimmed = decimal.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid USDC decimal: ${decimal}`);
  }
  const [whole = '0', frac = ''] = trimmed.split('.');
  if (frac.length > USDC_DECIMALS) {
    throw new Error(`USDC supports at most ${USDC_DECIMALS} decimals`);
  }
  const micros = BigInt(whole) * USDC_MICROS_PER_UNIT + BigInt(frac.padEnd(USDC_DECIMALS, '0'));
  return usdcMicros(micros);
}

export function formatUsdc(micros: UsdcMicros): string {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const whole = abs / USDC_MICROS_PER_UNIT;
  const frac = (abs % USDC_MICROS_PER_UNIT).toString().padStart(USDC_DECIMALS, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
}

export function addUsdc(a: UsdcMicros, b: UsdcMicros): UsdcMicros {
  return usdcMicros(a + b);
}

export function subUsdc(a: UsdcMicros, b: UsdcMicros): UsdcMicros {
  if (a < b) throw new Error('USDC subtraction would go negative');
  return usdcMicros(a - b);
}

export function assertUsdcConservation(parts: UsdcMicros[], total: UsdcMicros): void {
  const sum = parts.reduce((acc, part) => acc + part, 0n);
  if (sum !== total) {
    throw new Error(`USDC conservation violated: sum=${sum} total=${total}`);
  }
}
