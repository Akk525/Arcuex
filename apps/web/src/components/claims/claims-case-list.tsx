'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { Panel } from '@/components/panel';
import { CaseStatusBadge } from '@/components/claims/case-status-badge';
import { StatusBadge } from '@/components/status-badge';

type CaseRow = {
  id: string;
  status: string;
  policyId: string;
  syntheticDemo: boolean;
  payable: { usdc: string | null };
  reviewReasonCode: string | null;
  updatedAt: string;
  labels: { synthetic: string | null };
};

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
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async (status: (typeof FILTERS)[number]) => {
    const q = status === 'ALL' ? '' : `?status=${status}`;
    const res = await fetch(`/api/claims/cases${q}`);
    const json = (await res.json()) as { cases?: CaseRow[]; error?: string };
    if (!res.ok) throw new Error(json.error ?? 'Failed to load cases');
    setCases(json.cases ?? []);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void refresh(filter).catch((e) =>
        setError(e instanceof Error ? e.message : 'Failed to load'),
      );
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

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {pending && !cases ? <p className="text-sm text-zinc-500">Loading cases…</p> : null}
      {cases && cases.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No claims cases yet. Submit a claim against an active synthetic policy.
        </p>
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
