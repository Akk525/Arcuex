'use client';
import Link from 'next/link';
import type { PolicyLifecycle } from '@arcuex/domain';
import { useEffect, useRef, useState } from 'react';
import { formatUnits, type Hex } from 'viem';
import {
  PROCUREMENT_OFFERINGS,
  type ProcurementPolicy as Policy,
} from '@arcuex/domain/procurement';
import { useProcurement } from '@/hooks/use-procurement';
import { EmptyState } from '@/components/ui/empty-state';
import { Callout } from '@/components/ui/callout';
import { StatusBadge } from '@/components/status-badge';
import { useFixtureMode } from '@/providers/source-mode';
function statusTone(label: string): 'neutral' | 'ok' | 'warn' | 'error' | 'pending' | 'synthetic' {
  if (label.startsWith('Confirmed')) return 'ok';
  if (label.includes('Prepared')) return 'pending';
  if (label.includes('mismatch') || label.includes('exhausted')) return 'warn';
  if (label.includes('Expired') || label.includes('cancelled')) return 'neutral';
  return 'synthetic';
}

type Reconciliation = {
  bound: boolean;
  cancelled: boolean;
  matches: boolean;
  paidOutMicros: string;
  reservedMicros: string;
  checkedAt: string;
};
export function PoliciesPanel({ id }: { id?: string }) {
  const fixtureMode = useFixtureMode();
  const { api, run, busy, error, wallet } = useProcurement();
  const identityRevision = useRef(0);
  const [lifecycles, setLifecycles] = useState<Record<string, PolicyLifecycle>>({});
  const [pending, setPending] = useState<
    Array<{ onchainPolicyId: string; completeness: string; claimsEligible: false }>
  >([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const reset = () => {
      identityRevision.current++;
      setPolicies(null);
      setLifecycles({});
      setPending([]);
    };
    window.addEventListener('arcuex-session-changed', reset);
    return () => window.removeEventListener('arcuex-session-changed', reset);
  }, []);
  const [chainError, setChainError] = useState('');
  const [approvals, setApprovals] = useState<{ hash: string; at: number }[]>([]);
  const [policies, setPolicies] = useState<Policy[] | null>(null),
    [live, setLive] = useState<Reconciliation | null>(null),
    [hash, setHash] = useState('');
  useEffect(() => {
    identityRevision.current++;
    setPolicies(null);
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
      setHash(result.policy.bindTx ?? sessionStorage.getItem(`arcuex-bind:${id}`) ?? '');
    } else {
      rows = await api<Policy[]>('policies');
      if (revision !== identityRevision.current) return;
      setPolicies(rows);
    }
    const records = await api<{ version: 1; records: typeof pending }>(
      '/api/policies/reconciliation',
    );
    if (revision !== identityRevision.current) return;
    setPending(records.records);
    const projections = await Promise.all(
      rows.map((p) => api<PolicyLifecycle>(`/api/policies/${p.terms.policyId}/lifecycle`)),
    );
    if (revision !== identityRevision.current) return;
    setLifecycles(Object.fromEntries(projections.map((p) => [p.policyId, p])));
  }
  function status(p: Policy) {
    const lifecycle = lifecycles[p.terms.policyId];
    if (!lifecycle) return 'Verification unavailable — no coverage confirmed';
    if (fixtureMode || lifecycle.source?.mode === 'fixture') {
      return lifecycle.state === 'fixture_ready' && lifecycle.source?.checkpoint &&
        now / 1000 < lifecycle.source.checkpoint.validUntil
        ? 'Synthetic fixture ready · no chain confirmation' : 'Fixture unavailable · claims disabled';
    }
    if (
      lifecycle.state === 'confirmed' &&
      (lifecycle.completeness !== 'VERIFIED_LINKED' ||
        lifecycle.checkedAt === null ||
        now / 1000 > lifecycle.checkedAt + 300)
    )
      return 'Reconciliation pending — no coverage confirmed';
    if (lifecycle.state === 'expired') return 'Expired';
    if (lifecycle.state === 'prepared') return 'Prepared — no coverage confirmed';
    if (lifecycle.state !== 'confirmed') return 'Reconciliation pending — no coverage confirmed';
    if (live?.matches && BigInt(live.paidOutMicros) >= BigInt(p.terms.limitMicros))
      return 'Policy limit exhausted';
    if (live?.cancelled) return 'Reservation released / cancelled';
    if (live && !live.matches) return 'Chain mismatch — investigate';
    if (Math.floor(now / 1000) > p.terms.expiresAt) return 'Expired';
    return now / 1000 < p.terms.effectiveAt
      ? 'Confirmed · scheduled'
      : 'Confirmed · effective window';
  }
  return (
    <div className="procurement space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <Callout kind="synthetic" title={fixtureMode ? 'Synthetic rehearsal · no live chain state' : 'Arc Testnet procurement'}>
            {fixtureMode ? 'Policy, reservation and checkpoint are synthetic fixture data. No bind or settlement transactions are available. Restart never renews the checkpoint.' : 'Product type and confirmation are shown for each policy. Accepted quotes remain offchain until a canonical bind is linked.'}
          </Callout>
          <button className="proc-btn" disabled={busy} onClick={() => void run(load)}>
            {busy ? 'Loading…' : 'Refresh my policies'}
          </button>
          <p className="text-xs text-[var(--ink-muted)]">
            Connect and sign in from the header. This list is filtered to policies owned or paid for by the authenticated
            session.
          </p>
        </div>
      </div>
      {chainError && (
        <Callout kind="warn" title="Chain reconciliation">
          <p role="status">{chainError}</p>
        </Callout>
      )}
      {error && (
        <Callout kind="danger" title="Unable to load policies">
          <p role="alert">{error}</p>
        </Callout>
      )}
      {pending.length > 0 && (
        <Callout kind="warn" title="Reconciliation pending / incomplete">
          {pending.map((r) => (
            <p key={r.onchainPolicyId} className="break-all text-sm">
              {r.onchainPolicyId} · {r.completeness} · Claims disabled
            </p>
          ))}
        </Callout>
      )}
      {policies?.length === 0 && (
        <EmptyState
          title="No policies for this wallet"
          description="Bind coverage first. Empty lists come from authenticated API results — not placeholders."
          action={
            <Link className="text-sm font-medium text-[var(--accent)] underline" href="/coverage">
              Obtain coverage
            </Link>
          }
        />
      )}
      {policies?.map((p) => {
        const label = status(p);
        const lifecycle = lifecycles[p.terms.policyId];
        return (
          <article
            key={p.terms.policyId}
            className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <StatusBadge label={p.terms.synthetic ? 'SYNTHETIC COVER' : 'INDEPENDENT-EVIDENCE PILOT'} tone={p.terms.synthetic ? 'synthetic' : 'pending'} />
                <h3 className="mt-2 break-all font-mono text-sm">
                  <Link className="underline" href={`/policies/${p.terms.policyId}`}>
                    {p.terms.policyId}
                  </Link>
                </h3>
              </div>
              <StatusBadge label={label} tone={statusTone(label)} />
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              {[
                ['Premium', `${formatUnits(BigInt(p.terms.premiumMicros), 6)} USDC`],
                ['Limit', `${formatUnits(BigInt(p.terms.limitMicros), 6)} USDC`],
                ['Deductible', `${formatUnits(BigInt(p.terms.deductibleMicros), 6)} USDC`],
                ['Beneficiary', p.terms.beneficiary],
                ['Effective', new Date(p.terms.effectiveAt * 1000).toLocaleString()],
                ['Expiry', new Date(p.terms.expiresAt * 1000).toLocaleString()],
                ['Position', p.terms.exposure.position],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[var(--ink-muted)]">{k}</dt>
                  <dd className="mt-1 break-all text-[var(--ink)]">{v}</dd>
                </div>
              ))}
            </dl>
            {id &&
              approvals.map((a) => (
                <a
                  key={a.hash}
                  className="block break-all text-sm underline"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://explorer.testnet.arc.io/tx/${a.hash}`}
                >
                  Premium approval receipt: {a.hash}
                </a>
              ))}
            {!fixtureMode && lifecycle?.source?.mode !== 'fixture' && p.bindTx && (
              <a
                className="block break-all text-sm underline"
                target="_blank"
                rel="noreferrer"
                href={`https://explorer.testnet.arc.io/tx/${p.bindTx}`}
              >
                Bind receipt: {p.bindTx}
              </a>
            )}
            {id &&
              lifecycle?.claimsEligible &&
              lifecycle.completeness === 'VERIFIED_LINKED' &&
              lifecycle.checkedAt !== null &&
              now / 1000 <= lifecycle.checkedAt + 300 && (
                <Link
                  className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
                  href={`/claims/new?policyId=${p.terms.policyId}`}
                >
                  {p.terms.synthetic ? 'Submit a synthetic claim' : 'Open an independent claim'}
                </Link>
              )}
            {id && lifecycle && (
              <div className="space-y-2 text-sm">
                <p>{lifecycle.notice}</p>
                {lifecycle.source && <p className="break-all">Source: {lifecycle.source.mode} · {lifecycle.source.id} · {lifecycle.source.digest ?? 'live RPC'} {lifecycle.source.checkpoint && `· checkpoint ${lifecycle.source.checkpoint.sequence} · created ${new Date(lifecycle.source.checkpoint.createdAt * 1000).toISOString()} · expires ${new Date(lifecycle.source.checkpoint.validUntil * 1000).toISOString()}`}</p>}
                {lifecycle.confirmation?.explorerUrl && (
                  <a
                    className="underline"
                    href={lifecycle.confirmation.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Indexed bind evidence (historical; see current status)
                  </a>
                )}
                {lifecycle.settlements.map((s) => (
                  <p key={s.caseId}>
                    Settlement case {s.caseId}: {s.state} ·{' '}
                    {s.explorerUrl ? (
                      <a
                        className="underline"
                        href={s.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Receipt reference — independently verify
                      </a>
                    ) : (
                      'No verified receipt link'
                    )}
                  </p>
                ))}
              </div>
            )}
            {id && (
              <>
                <p className="break-all text-sm">Beneficiary: {p.terms.beneficiary}</p>
                <p className="text-sm leading-6">{PROCUREMENT_OFFERINGS.find((offering) => offering.code === p.terms.productCode)?.limitations}</p>
                {live && (
                  <p className="text-sm">
                    {fixtureMode ? 'Synthetic snapshot check' : 'Live contract check'}:{' '}
                    {live.matches ? 'terms match' : live.bound ? 'mismatch' : 'not bound'} ·
                    reserved {formatUnits(BigInt(live.reservedMicros), 6)} USDC · paid{' '}
                    {formatUnits(BigInt(live.paidOutMicros), 6)} USDC · {live.checkedAt}
                  </p>
                )}
                {!fixtureMode && p.state === 'prepared' && (
                  <div className="space-y-3">
                    {p.payer === wallet.address?.toLowerCase() && now / 1000 < p.terms.quoteExpiresAt && (
                      <Link className="text-sm underline" href={`/coverage?policyId=${p.terms.policyId}`}>
                        Resume accepted purchase
                      </Link>
                    )}
                    <label>
                      Recover a submitted bind receipt
                      <input
                        value={hash}
                        onChange={(e) => setHash(e.target.value)}
                        placeholder="0x…"
                      />
                    </label>
                    <button
                      className="proc-btn-secondary"
                      disabled={busy || !hash}
                      onClick={() =>
                        void run(async () => {
                          await api('confirm', { policyId: p.terms.policyId, hash: hash as Hex });
                          await load();
                        })
                      }
                    >
                      Verify receipt & recover confirmation
                    </button>
                    <p className="text-xs text-zinc-500">
                      Verification is read-only. A late or mismatched bind remains ineligible even
                      if its transaction succeeded.
                    </p>
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer text-sm">
                    Immutable policy terms & digest
                  </summary>
                  <pre className="mt-3 overflow-auto rounded-lg bg-[var(--surface-inset)] p-4 font-mono text-xs">
                    {JSON.stringify(p, null, 2)}
                  </pre>
                </details>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
