export type PaymentFinality = 'confirmed' | 'unverified' | 'reorged' | 'not_paid';

export function parsePaymentFinality(value: unknown): PaymentFinality | undefined {
  if (
    value === 'confirmed' ||
    value === 'unverified' ||
    value === 'reorged' ||
    value === 'not_paid'
  )
    return value;
}

export function hasArcReceiptHash(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value) && !/^0x0{64}$/.test(value);
}

export function currentPaymentReceipt(
  status: unknown,
  finality: unknown,
  receipt: unknown,
  synthetic = false,
): string | undefined {
  if (!synthetic && status === 'PAID' && finality === 'confirmed' && hasArcReceiptHash(receipt))
    return receipt;
}
