'use client';

import type { PolicyLifecycle, ProcurementAgent } from '@arcuex/domain';
import { useEffect, useRef, useState } from 'react';
import { PROCUREMENT_OFFERINGS, type ProcurementPolicy as Policy } from '@arcuex/domain/procurement';
import { useProcurement } from '@/hooks/use-procurement';
import { freshLifecycle, policyPhase } from '@/lib/procurement/presentation';
import { readBindAttempt } from '@/lib/procurement/bind-attempt';
import { portfolioState, type PolicyPhase, type PortfolioCategory, type Tone } from '@/lib/procurement/checkout-presentation';
import { useFixtureMode } from '@/providers/source-mode';

export type Reconciliation = {
  bound: boolean;
  cancelled: boolean;
  matches: boolean;
  paidOutMicros: string;
  reservedMicros: string;
  checkedAt: string;
};

export type PendingRecord = { onchainPolicyId: string; completeness: string; claimsEligible: false };

export type PolicyView = {
  policy: Policy;
  phase: PolicyPhase;
  label: string;
  /** Compact table label; same meaning as `label`, never stronger. */
  shortLabel: string;
  tone: Tone;
  category: PortfolioCategory;
  lifecycle: PolicyLifecycle | undefined;
  agent: ProcurementAgent | undefined;
  productName: string;
  limitations: string | undefined;
  attempt: ReturnType<typeof readBindAttempt>;
  canClaim: boolean;
  canResume: boolean;
};

const SHORT: Record<PolicyPhase, string> = {
  prepared: 'Accepted · unpaid',
  submitted: 'Bind submitted',
  uncertain: 'Check wallet',
  reconciling: 'Reconciliation pending',
  expired: 'Expired',
  scheduled: 'Scheduled',
  effective: 'In force',
  unknown: 'Unverified',
  fixture: 'Synthetic fixture',
};

const LABELS: Record<PolicyPhase, string> = {
  prepared: 'Prepared — no coverage confirmed',
  submitted: 'Bind submitted · receipt pending',
  uncertain: 'Bind status unknown · check wallet',
  reconciling: 'Reconciliation pending — no coverage confirmed',
  expired: 'Expired',
  scheduled: 'Confirmed · scheduled',
  effective: 'Confirmed · effective window',
  unknown: 'Verification unavailable — no coverage confirmed',
  fixture: 'Synthetic fixture ready · no chain confirmation',
};

/**
 * Policy records for the connected wallet (or one policy when `id` is set).
 * Loading is explicit because it may ask the wallet to sign in.
 */
export function usePolicyRecords(id?: string) {
  const fixtureMode = useFixtureMode();
  const { api, run, busy, error, wallet } = useProcurement();
  const identityRevision = useRef(0);
  const [lifecycles, setLifecycles] = useState<Record<string, PolicyLifecycle>>({});
  const [pending, setPending] = useState<PendingRecord[]>([]);
  const [now, setNow] = useState(Date.now());
  const [agents, setAgents] = useState<ProcurementAgent[]>([]);
  const [chainError, setChainError] = useState('');
  const [approvals, setApprovals] = useState<{ hash: string; at: number }[]>([]);
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [live, setLive] = useState<Reconciliation | null>(null);
  const [hash, setHash] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const reset = () => {
      identityRevision.current++;
      setPolicies(null);
      setAgents([]);
      setLifecycles({});
      setPending([]);
    };
    window.addEventListener('arcuex-session-changed', reset);
    return () => window.removeEventListener('arcuex-session-changed', reset);
  }, []);
  useEffect(() => {
    identityRevision.current++;
    setPolicies(null);
    setAgents([]);
    setLifecycles({});
    setPending([]);
    setLive(null);
    setApprovals([]);
    setHash('');
    setChainError('');
  }, [wallet.address, wallet.chainId]);

  async function load() {
    const revision = identityRevision.current;
    setLifecycles({});
    setPending([]);
    let rows: Policy[];
    if (id) {
      const result = await api<{
        policy: Policy;
        reconciliation: Reconciliation | null;
        reconciliationError?: string;
        approvals?: { hash: string; at: number }[];
      }>(`policies/${id}`);
      rows = [result.policy];
      if (revision !== identityRevision.current) return;
      setPolicies(rows);
      setApprovals(result.approvals ?? []);
      setLive(result.reconciliation);
      setChainError(result.reconciliationError ?? '');
      const attempt = readBindAttempt(id);
      setHash(result.policy.bindTx ?? (attempt?.state === 'submitted' ? attempt.hash : ''));
    } else {
      rows = await api<Policy[]>('policies');
      if (revision !== identityRevision.current) return;
      setPolicies(rows);
    }
    const visibleAgents = await api<ProcurementAgent[]>('agents');
    if (revision !== identityRevision.current) return;
    setAgents(visibleAgents);
    const records = await api<{ version: 1; records: PendingRecord[] }>('/api/policies/reconciliation');
    if (revision !== identityRevision.current) return;
    setPending(records.records);
    const projections = await Promise.all(
      rows.map((p) => api<PolicyLifecycle>(`/api/policies/${p.terms.policyId}/lifecycle`)),
    );
    if (revision !== identityRevision.current) return;
    setLifecycles(Object.fromEntries(projections.map((p) => [p.policyId, p])));
  }

  const nowSeconds = Math.floor(now / 1000);

  function view(p: Policy): PolicyView {
    const lifecycle = lifecycles[p.terms.policyId];
    const attempt = readBindAttempt(p.terms.policyId);
    const phase = policyPhase(p, lifecycle, nowSeconds, attempt?.state) as PolicyPhase;
    let label: string;
    let shortLabel: string = SHORT[phase];
    const flags = { cancelled: false, mismatch: false, exhausted: false };
    if (fixtureMode)
    {
      label =
        phase === 'fixture'
          ? 'Synthetic fixture ready · no chain confirmation'
          : 'Fixture unavailable · claims disabled';
      shortLabel = phase === 'fixture' ? 'Synthetic fixture' : 'Fixture unavailable';
    }
    else if (live?.cancelled) {
      label = 'Reservation released / cancelled';
      shortLabel = 'Cancelled';
      flags.cancelled = true;
    } else if (live?.bound && !live.matches) {
      label = 'Chain mismatch — investigate';
      shortLabel = 'Chain mismatch';
      flags.mismatch = true;
    } else if (live?.matches && BigInt(live.paidOutMicros) >= BigInt(p.terms.limitMicros)) {
      label = 'Policy limit exhausted';
      shortLabel = 'Limit exhausted';
      flags.exhausted = true;
    } else label = LABELS[phase];
    const state = portfolioState(fixtureMode && phase !== 'fixture' ? 'unknown' : phase, flags);
    const offering = PROCUREMENT_OFFERINGS.find((row) => row.code === p.terms.productCode);
    const canClaim = Boolean(
      lifecycle?.claimsEligible &&
        freshLifecycle(lifecycle, nowSeconds) &&
        (label === 'Confirmed · effective window' ||
          label === 'Synthetic fixture ready · no chain confirmation'),
    );
    const canResume =
      !fixtureMode &&
      p.state === 'prepared' &&
      p.payer === wallet.address?.toLowerCase() &&
      (Boolean(attempt) || nowSeconds < p.terms.quoteExpiresAt);
    return {
      policy: p,
      phase,
      label,
      shortLabel,
      tone: state.tone,
      category: state.category,
      lifecycle,
      agent: agents.find((row) => row.id === p.terms.agentId),
      productName: offering?.name ?? p.terms.productCode,
      limitations: offering?.limitations,
      attempt,
      canClaim,
      canResume,
    };
  }

  return {
    wallet,
    api,
    run,
    busy,
    error,
    fixtureMode,
    load,
    policies,
    views: policies?.map(view) ?? null,
    pending,
    approvals,
    live,
    chainError,
    hash,
    setHash,
    nowSeconds,
  };
}
