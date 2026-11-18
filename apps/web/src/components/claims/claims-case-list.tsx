'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { Panel } from '@/components/panel';
import { CaseStatusBadge } from '@/components/claims/case-status-badge';
import { StatusBadge } from '@/components/status-badge';
import { claimsFetch } from '@/lib/claims/claims-api';
import {
  claimsNetworkFailure,
  parseClaimsCaseListPayload,
  readClaimsClientResponse,
  type ClaimsCaseListRow,
} from '@/lib/claims/claims-client-response';
import { AuthRequired } from '@/components/ui/auth-required';
import { EmptyState } from '@/components/ui/empty-state';

const FILTERS = [
  'ALL',
  'REVIEW',
  'APPROVED',
  'DENIED',
  'SETTLEMENT_PENDING',
  'PAID',
  'SETTLEMENT_FAILED',
] as const;

export function ClaimsCaseList() {
  const [cases, setCases] = useState<ClaimsCaseListRow[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async (status: (typeof FILTERS)[number]) => {
    setError(null);
    setAuthRequired(false);
    try {
      const q = status === 'ALL' ? '' : `?status=${status}`;
      const res = await claimsFetch('any', `/api/claims/cases${q}`);
      const result = await readClaimsClientResponse(res, parseClaimsCaseListPayload);
      if (!result.ok) {
        setCases(null);
        if (result.kind === 'unauthorized' || result.kind === 'forbidden') {
          setAuthRequired(true);
        }
        setError(result.message);
        return;
      }
      setCases(result.data);
    } catch (e) {
      setCases(null);
      setError(claimsNetworkFailure(e).message);
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void refresh(filter);
    });
  }, [filter, refresh]);

  return (
    <Panel
      title="Claims cases"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="ADJUDICATION v1" tone="pending" />
          <Link
            href="/claims/new"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            Submit claim
          </Link>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-2 py-1 text-xs ring-1 ring-inset ${
              filter === f
                ? 'bg-zinc-900 text-white ring-zinc-900'
                : 'bg-white text-zinc-700 ring-zinc-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && !authRequired ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {authRequired ? (
        <AuthRequired
          description="Sign in with your wallet session to load claims cases. Unauthorized responses are not shown as an empty list."
        />
      ) : null}
      {pending && !cases && !error ? (
        <p className="text-sm text-[var(--ink-muted)]">Loading cases…</p>
      ) : null}
      {cases && cases.length === 0 ? (
        <EmptyState
          title="No claims cases yet"
          description="Submit a claim against a confirmed policy you own. This empty state is an authenticated result."
        />
      ) : null}

      <ul className="divide-y divide-zinc-100">
        {(cases ?? []).map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0 space-y-1">
              <Link href={`/claims/${c.id}`} className="font-mono text-xs text-sky-800 underline">
                {c.id.slice(0, 8)}…
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <CaseStatusBadge status={c.status} />
                {c.syntheticDemo ? <StatusBadge label="SYNTHETIC" tone="warn" /> : null}
              </div>
              {c.labels.synthetic ? (
                <p className="text-[11px] text-amber-800">{c.labels.synthetic}</p>
              ) : null}
              {c.reviewReasonCode ? (
                <p className="text-xs text-zinc-500">Review: {c.reviewReasonCode}</p>
              ) : null}
            </div>
            <div className="shrink-0 text-right text-xs text-zinc-500">
              <div>{c.payable.usdc ? `${c.payable.usdc} USDC` : '—'}</div>
              <div>{new Date(c.updatedAt).toLocaleString()}</div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
