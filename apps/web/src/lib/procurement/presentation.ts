import type { PolicyLifecycle, ProcurementPolicy, ProcurementDelegationView } from '@arcuex/domain';
import { formatUnits, parseUnits, type Hex } from 'viem';

export const usdc = (micros: string) => `${formatUnits(BigInt(micros), 6)} USDC`;
export const displayDate = (seconds: number) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(seconds * 1000) + ' UTC';

export function usdToMicros(input: string) {
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(input.trim()))
    throw new Error('Enter a positive USDC amount with at most six decimal places.');
  const micros = parseUnits(input.trim(), 6);
  if (micros <= 0n) throw new Error('Enter a positive USDC amount.');
  return micros.toString();
}

export function eligibleLimits(
  limits: readonly string[],
  notional: string,
  grant?: ProcurementDelegationView,
) {
  return limits.filter((value) => {
    const limit = BigInt(value);
    return (
      limit <= BigInt(notional) &&
      (!grant ||
        (limit <= BigInt(grant.limitCapMicros) &&
          limit / 100n <= BigInt(grant.remainingPremiumMicros)))
    );
  });
}

export function isBindHash(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value);
}

export function isWalletRejection(error: unknown) {
  for (let cause = error, depth = 0; cause && typeof cause === 'object' && depth < 8; depth++) {
    const value = cause as { code?: number; name?: string; cause?: unknown };
    if (value.code === 4001 || value.name === 'UserRejectedRequestError') return true;
    cause = value.cause;
  }
  return false;
}

export function freshLifecycle(lifecycle: PolicyLifecycle | undefined | null, now: number) {
  return (
    lifecycle?.completeness === 'VERIFIED_LINKED' &&
    lifecycle.checkedAt !== null &&
    lifecycle.checkedAt <= now &&
    now <= lifecycle.checkedAt + 300
  );
}

export function policyPhase(
  policy: ProcurementPolicy,
  lifecycle: PolicyLifecycle | undefined | null,
  now: number,
  attempt?: 'submitted' | 'uncertain',
) {
  if (lifecycle?.source?.mode === 'fixture')
    return lifecycle.state === 'fixture_ready' &&
      freshLifecycle(lifecycle, now) &&
      now < (lifecycle.source.checkpoint?.validUntil ?? 0)
      ? 'fixture'
      : 'unknown';
  if (
    (lifecycle?.state === 'confirmed' || lifecycle?.state === 'expired') &&
    lifecycle.source?.mode === 'arc-testnet' &&
    freshLifecycle(lifecycle, now) &&
    isBindHash(lifecycle.confirmation?.transactionHash)
  ) {
    if (lifecycle.state === 'expired' || now > policy.terms.expiresAt) return 'expired';
    return now < policy.terms.effectiveAt ? 'scheduled' : 'effective';
  }
  if (lifecycle?.state === 'reconciliation_pending' || policy.bindTx) return 'reconciling';
  if (attempt) return attempt;
  if (lifecycle?.state === 'expired' || now >= policy.terms.quoteExpiresAt) return 'expired';
  return lifecycle?.state === 'prepared' ? 'prepared' : 'unknown';
}
