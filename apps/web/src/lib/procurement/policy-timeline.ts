import type { PolicyLifecycle, ProcurementPolicy } from '@arcuex/domain';
import { currentPaymentReceipt } from '../claims/payment-finality';
import type { PolicyPhase } from './checkout-presentation';

export type TimelineState = 'done' | 'current' | 'upcoming' | 'attention' | 'skipped';

export type TimelineEvent = {
  id: string;
  title: string;
  state: TimelineState;
  /** Seconds since epoch, when the record carries a time. */
  at?: number;
  detail?: string;
  hash?: string;
};

const confirmedPhase = (phase: PolicyPhase) => phase === 'scheduled' || phase === 'effective';

/**
 * Binding and coverage chronology derived only from recorded facts.
 * A bind is never shown as reconciled, and reconciliation is never shown as
 * coverage, unless the lifecycle projection says so.
 */
export function policyTimeline(input: {
  policy: ProcurementPolicy;
  lifecycle: PolicyLifecycle | undefined;
  phase: PolicyPhase;
  approvals: Array<{ hash: string }>;
  localBindHash?: string | null;
  bindUncertain?: boolean;
  nowSeconds: number;
}): TimelineEvent[] {
  const { policy, lifecycle, phase, approvals, nowSeconds } = input;
  const t = policy.terms;
  const confirmed = confirmedPhase(phase) || (phase === 'expired' && Boolean(lifecycle?.confirmation));
  const bindHash = lifecycle?.confirmation?.transactionHash ?? policy.bindTx ?? input.localBindHash ?? null;
  const events: TimelineEvent[] = [
    {
      id: 'accepted',
      title: 'Terms accepted',
      state: 'done',
      // No acceptance timestamp is recorded, so none is shown.
      detail: `Quote ${t.quoteId.slice(0, 8)}, accepted offchain`,
    },
  ];

  events.push(
    approvals.length > 0
      ? { id: 'allowance', title: 'Premium allowance approved', state: 'done', hash: approvals[approvals.length - 1]!.hash }
      : {
          id: 'allowance',
          title: 'Premium allowance',
          state: bindHash || confirmed ? 'skipped' : 'upcoming',
          detail: bindHash || confirmed ? 'No separate approval recorded' : 'Not yet approved',
        },
  );

  if (bindHash)
    events.push({
      id: 'bind',
      title: lifecycle?.confirmation ? 'Bind transaction indexed' : 'Bind transaction submitted',
      state: 'done',
      hash: bindHash,
      detail: lifecycle?.confirmation ? `Block ${lifecycle.confirmation.blockNumber}` : 'Receipt recorded, not yet reconciled',
    });
  else
    events.push({
      id: 'bind',
      title: 'Pay premium and bind',
      state: input.bindUncertain ? 'attention' : phase === 'expired' ? 'skipped' : 'upcoming',
      detail: input.bindUncertain
        ? 'The wallet did not return a hash. Verify it before paying again.'
        : phase === 'expired'
          ? 'Quote expired before a bind was recorded'
          : 'Not submitted',
    });

  events.push({
    id: 'reconciled',
    title: confirmed ? 'Reconciled on Arc Testnet' : 'Reconciliation',
    state: confirmed ? 'done' : bindHash ? 'current' : 'upcoming',
    detail: confirmed
      ? 'Bind linked to these terms by canonical reconciliation'
      : bindHash
        ? 'Waiting for the bind to be linked. No coverage is confirmed yet.'
        : 'Follows the bind',
  });

  const started = confirmed && nowSeconds >= t.effectiveAt;
  events.push({
    id: 'starts',
    title: started ? 'Coverage started' : 'Coverage can start',
    state: started ? 'done' : confirmed ? 'current' : 'upcoming',
    at: t.effectiveAt,
    detail: confirmed ? undefined : 'Only if reconciled before this time',
  });

  const ended = nowSeconds >= t.expiresAt;
  events.push({
    id: 'ends',
    title: ended ? 'Coverage ended' : 'Coverage ends',
    state: ended && confirmed ? 'done' : 'upcoming',
    at: t.expiresAt,
  });

  for (const s of lifecycle?.settlements ?? []) {
    const finality = 'paymentFinality' in s ? s.paymentFinality : undefined;
    const receipt = currentPaymentReceipt(s.state, finality, s.receiptRef, lifecycle?.source?.mode !== 'arc-testnet');
    const status = finality === 'reorged' ? 'Payment reorged · reconciliation pending'
      : finality === 'unverified' || (s.state === 'PAID' && !receipt) ? 'Payment unconfirmed'
        : s.state === 'SETTLEMENT_PENDING' ? 'Intent prepared' : s.state;
    events.push({
      id: `settlement-${s.caseId}`,
      title: `Settlement for claim ${s.caseId.slice(0, 8)}`,
      state: receipt ? 'done' : 'current',
      detail: receipt ? 'Payment confirmed' : status,
      hash: receipt,
    });
  }

  return events;
}
