/**
 * Presentation-only derivations for the coverage checkout and policy portfolio.
 * Nothing here authorizes, sends or confirms anything; it only names states the
 * existing procurement flow has already established.
 */

export type Tone = 'neutral' | 'ok' | 'warn' | 'error' | 'pending' | 'live' | 'synthetic';

export type PolicyPhase =
  | 'prepared'
  | 'submitted'
  | 'uncertain'
  | 'reconciling'
  | 'expired'
  | 'scheduled'
  | 'effective'
  | 'unknown'
  | 'fixture';

export type CheckoutFacts = {
  hasQuote: boolean;
  accepted: boolean; // terms accepted offchain (prep exists)
  quoteExpired: boolean;
  allowanceConfirmed: boolean;
  allowanceHash: boolean;
  bindHash: boolean; // a submitted bind hash is known locally or recorded
  bindUncertain: boolean;
  phase: PolicyPhase | undefined;
};

const isConfirmed = (phase: PolicyPhase | undefined) => phase === 'scheduled' || phase === 'effective';

/** Single, highest-priority status line for the purchase. Never claims coverage before reconciliation. */
export function checkoutStatus(f: CheckoutFacts): { label: string; tone: Tone } | null {
  if (isConfirmed(f.phase))
    return f.phase === 'effective'
      ? { label: 'Confirmed · coverage window open', tone: 'ok' }
      : { label: 'Confirmed · coverage scheduled', tone: 'ok' };
  if (f.bindHash)
    return f.phase === 'submitted'
      ? { label: 'Bind submitted · receipt pending', tone: 'pending' }
      : { label: 'Reconciliation pending · no coverage yet', tone: 'pending' };
  if (f.bindUncertain) return { label: 'Bind status unknown · check your wallet', tone: 'warn' };
  if (f.accepted && f.quoteExpired) return { label: 'Quote expired · start a fresh quote', tone: 'warn' };
  if (f.allowanceConfirmed) return { label: 'Allowance confirmed · bind required', tone: 'pending' };
  if (f.accepted) return { label: 'Awaiting wallet authorization', tone: 'pending' };
  if (f.hasQuote)
    return f.quoteExpired
      ? { label: 'Quote expired', tone: 'warn' }
      : { label: 'Quote ready · not accepted', tone: 'neutral' };
  return null;
}

export type PaymentStepState = 'done' | 'current' | 'waiting' | 'attention';

/** The three wallet-and-chain steps after acceptance. Each is a separate fact. */
export function paymentSteps(f: CheckoutFacts): Array<{
  id: 'allowance' | 'bind' | 'reconcile';
  state: PaymentStepState;
  status: string;
}> {
  const confirmed = isConfirmed(f.phase);
  const bound = f.bindHash || confirmed;
  const allowance: PaymentStepState =
    f.allowanceConfirmed || bound
      ? 'done'
      : f.allowanceHash
        ? 'attention'
        : f.bindUncertain
          ? 'waiting'
          : 'current';
  const bind: PaymentStepState = bound
    ? 'done'
    : f.bindUncertain
      ? 'attention'
      : f.allowanceConfirmed
        ? 'current'
        : 'waiting';
  const reconcile: PaymentStepState = confirmed ? 'done' : bound ? 'current' : 'waiting';
  return [
    {
      id: 'allowance',
      state: allowance,
      status:
        allowance === 'done'
          ? f.allowanceConfirmed
            ? 'Allowance receipt confirmed'
            : 'Not needed separately'
          : f.allowanceHash
            ? 'Submitted · receipt not yet checked'
            : f.bindUncertain
              ? 'Check the bind first'
              : 'Not started',
    },
    {
      id: 'bind',
      state: bind,
      status: bound
        ? f.phase === 'submitted'
          ? 'Submitted · receipt pending'
          : 'Bind transaction recorded'
        : f.bindUncertain
          ? 'Wallet did not return a hash'
          : 'Not started',
    },
    {
      id: 'reconcile',
      state: reconcile,
      status: confirmed
        ? 'Verified on Arc Testnet'
        : bound
          ? 'Waiting for canonical reconciliation'
          : 'Starts after the bind',
    },
  ];
}

/** Human countdown for a quote deadline (seconds since epoch). */
export function quoteCountdown(deadline: number, nowSeconds: number) {
  const left = Math.floor(deadline - nowSeconds);
  if (left <= 0) return 'Expired';
  if (left < 60) return `${left}s left`;
  const minutes = Math.floor(left / 60);
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min left`;
  return `${Math.floor(hours / 24)} days left`;
}

/** Plain-language answer to "when does my coverage begin?" for a given phase. */
export function coverageStartCopy(phase: PolicyPhase | undefined, effectiveLabel: string) {
  switch (phase) {
    case 'effective':
      return 'Coverage is in force. The bind is reconciled and the window has started.';
    case 'scheduled':
      return `The bind is reconciled. Coverage begins ${effectiveLabel}.`;
    case 'reconciling':
    case 'submitted':
      return `Not yet. Coverage begins at ${effectiveLabel} only once the bind is reconciled on Arc Testnet.`;
    default:
      return `After you pay and the bind is reconciled on Arc Testnet, coverage begins ${effectiveLabel}. Accepting the quote alone does not start coverage.`;
  }
}

export type PortfolioCategory = 'action' | 'pending' | 'in_force' | 'scheduled' | 'ended';

/** Portfolio grouping and tone for an existing phase label. */
export function portfolioState(phase: PolicyPhase, opts: { exhausted?: boolean; mismatch?: boolean; cancelled?: boolean } = {}): {
  category: PortfolioCategory;
  tone: Tone;
} {
  if (opts.mismatch) return { category: 'action', tone: 'error' };
  if (opts.cancelled) return { category: 'ended', tone: 'neutral' };
  if (opts.exhausted) return { category: 'ended', tone: 'warn' };
  switch (phase) {
    case 'effective':
      return { category: 'in_force', tone: 'ok' };
    case 'scheduled':
      return { category: 'scheduled', tone: 'live' };
    case 'fixture':
      return { category: 'in_force', tone: 'synthetic' };
    case 'prepared':
    case 'uncertain':
      return { category: 'action', tone: phase === 'uncertain' ? 'warn' : 'pending' };
    case 'submitted':
    case 'reconciling':
      return { category: 'pending', tone: 'pending' };
    case 'expired':
      return { category: 'ended', tone: 'neutral' };
    default:
      return { category: 'pending', tone: 'warn' };
  }
}

/** True when an in-force or scheduled policy ends within `withinSeconds`. */
export function endsSoon(expiresAt: number, nowSeconds: number, withinSeconds = 7 * 86_400) {
  return expiresAt > nowSeconds && expiresAt - nowSeconds <= withinSeconds;
}

export const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…` : id);

/** Compact UTC calendar date for tables (seconds since epoch). */
export const dayDate = (seconds: number) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    seconds * 1000,
  );
