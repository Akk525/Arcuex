'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatUnits, type Hex } from 'viem';
import {
  PROCUREMENT_PRODUCT as PRODUCT,
  type ProcurementPolicy as Policy,
} from '@arcuex/domain/procurement';
import { WalletPanel } from '@/components/wallet/wallet-panel';
import { useProcurement } from '@/hooks/use-procurement';
type Reconciliation = {
  bound: boolean;
  cancelled: boolean;
  matches: boolean;
  paidOutMicros: string;
  reservedMicros: string;
  checkedAt: string;
};
export function PoliciesPanel({ id }: { id?: string }) {
  const { api, run, busy, error, wallet } = useProcurement();
  const [chainError, setChainError] = useState('');
  const [approvals, setApprovals] = useState<{ hash: string; at: number }[]>([]);
  const [policies, setPolicies] = useState<Policy[] | null>(null),
    [live, setLive] = useState<Reconciliation | null>(null),
    [hash, setHash] = useState('');
  useEffect(() => {
    setPolicies(null);
    setLive(null);
    setApprovals([]);
    setHash('');
    setChainError('');
  }, [wallet.address]);
  async function load() {
    if (id) {
      const result = await api<{
        policy: Policy;
        reconciliation: Reconciliation | null;
        reconciliationError?: string;
        approvals?: { hash: string; at: number }[];
      }>(`policies/${id}`);
      setPolicies([result.policy]);
      setApprovals(result.approvals ?? []);
      setLive(result.reconciliation);
      setChainError(result.reconciliationError ?? '');
      setHash(result.policy.bindTx ?? sessionStorage.getItem(`arcuex-bind:${id}`) ?? '');
    } else setPolicies(await api<Policy[]>('policies'));
  }
  function status(p: Policy) {
    if (p.state !== 'confirmed') return 'Prepared — no coverage confirmed';
    if (live?.matches && BigInt(live.paidOutMicros) >= BigInt(p.terms.limitMicros))
      return 'Policy limit exhausted';
    if (live?.cancelled) return 'Reservation released / cancelled';
    if (live && !live.matches) return 'Chain mismatch — investigate';
    if (Date.now() / 1000 >= p.terms.expiresAt) return 'Expired';
    return Date.now() / 1000 < p.terms.effectiveAt
      ? 'Confirmed · scheduled'
      : 'Confirmed · effective window';
  }
  return (
    <div className="procurement space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="text-3xl font-semibold">{id ? 'Policy details' : 'My policies'}</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Immutable synthetic terms with real Arc Testnet transaction references. Prepared records
            provide no coverage. Refresh details to read current contract state.
          </p>
          <button className="proc-btn mt-5" disabled={busy} onClick={() => void run(load)}>
            {busy ? 'Loading…' : 'Sign in & refresh policies'}
          </button>
        </div>
        <WalletPanel />
      </div>
      {chainError && (
        <p role="status" className="text-sm text-amber-900">
          {chainError}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </p>
      )}
      {policies?.length === 0 && (
        <p className="py-8 text-sm text-zinc-500">
          No policies for this wallet.{' '}
          <Link className="underline" href="/coverage">
            Discover coverage
          </Link>
          .
        </p>
      )}
      {policies?.map((p) => (
        <article
          key={p.terms.policyId}
          className="space-y-4 rounded-xl border border-zinc-200 p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-amber-800">
                Synthetic oracle adapter liquidation
              </p>
              <h3 className="mt-2 break-all font-mono text-sm">
                <Link className="underline" href={`/policies/${p.terms.policyId}`}>
                  {p.terms.policyId}
                </Link>
              </h3>
            </div>
            <span className="rounded-md bg-zinc-100 px-3 py-2 text-sm">{status(p)}</span>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            {[
              ['Premium', `${formatUnits(BigInt(p.terms.premiumMicros), 6)} USDC`],
              ['Limit', `${formatUnits(BigInt(p.terms.limitMicros), 6)} USDC`],
              ['Deductible', `${formatUnits(BigInt(p.terms.deductibleMicros), 6)} USDC`],
              ['Effective', new Date(p.terms.effectiveAt * 1000).toLocaleString()],
              ['Expiry', new Date(p.terms.expiresAt * 1000).toLocaleString()],
              ['Position', p.terms.exposure.position],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-zinc-500">{k}</dt>
                <dd className="mt-1 break-all">{v}</dd>
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
          {p.bindTx && (
            <a
              className="block break-all text-sm underline"
              target="_blank"
              rel="noreferrer"
              href={`https://explorer.testnet.arc.io/tx/${p.bindTx}`}
            >
              Bind receipt: {p.bindTx}
            </a>
          )}
          {id && p.state === 'confirmed' && (
            <Link
              className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
              href={`/claims/new?policyId=${p.terms.policyId}`}
            >
              Submit a synthetic claim
            </Link>
          )}
          {id && (
            <>
              <p className="break-all text-sm">Beneficiary: {p.terms.beneficiary}</p>
              <p className="text-sm leading-6">{PRODUCT.limitations}</p>
              {live && (
                <p className="text-sm">
                  Live contract check:{' '}
                  {live.matches ? 'terms match' : live.bound ? 'mismatch' : 'not bound'} · reserved{' '}
                  {formatUnits(BigInt(live.reservedMicros), 6)} USDC · paid{' '}
                  {formatUnits(BigInt(live.paidOutMicros), 6)} USDC · {live.checkedAt}
                </p>
              )}
              {p.state === 'prepared' && (
                <div className="space-y-3">
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
                    Verification is read-only. A late or mismatched bind remains ineligible even if
                    its transaction succeeded.
                  </p>
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-sm">
                  Immutable policy terms & digest
                </summary>
                <pre className="mt-3 overflow-auto rounded-lg bg-zinc-100 p-4 text-xs">
                  {JSON.stringify(p, null, 2)}
                </pre>
              </details>
            </>
          )}
        </article>
      ))}
    </div>
  );
}
