'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { claimStatusLabel } from '@/lib/claims/settlement-presentation';
import { Button, ButtonLink } from '@/components/ui/button';
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
  const [loading, setLoading] = useState(true);
  const readVersion = useRef(0);

  const refresh = useCallback(async (status: (typeof FILTERS)[number]) => {
    const version = ++readVersion.current;
    setError(null);
    setCases(null);
    setLoading(true);
    setAuthRequired(false);
    try {
      const q = status === 'ALL' ? '' : `?status=${status}`;
      const res = await claimsFetch('any', `/api/claims/cases${q}`);
      const result = await readClaimsClientResponse(res, parseClaimsCaseListPayload);
      if (version !== readVersion.current) return;
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
      if (version !== readVersion.current) return;
      setCases(null);
      setError(claimsNetworkFailure(e).message);
    } finally {
      if (version === readVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(filter);
    return () => {
      readVersion.current++;
    };
  }, [filter, refresh]);

  return (
    <Panel title="Case history">
      <label className="mb-4 block text-sm font-medium">
        Case status
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as typeof filter)}
          className="mt-1 block w-full rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 sm:w-60"
        >
          {FILTERS.map((status) => (
            <option key={status} value={status}>
              {status === 'ALL'
                ? 'All cases'
                : status === 'PAID'
                  ? 'Payment confirmed'
                  : claimStatusLabel(status)}
            </option>
          ))}
        </select>
      </label>
      {error && !authRequired && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void refresh(filter)}>
            Retry cases
          </Button>
        </div>
      )}
      {authRequired && (
        <AuthRequired description="Sign in with your wallet session to load claims." />
      )}
      {loading && (
        <p role="status" className="text-sm text-[var(--ink-muted)]">
          Loading cases…
        </p>
      )}
      {cases?.length === 0 && (
        <EmptyState
          title={filter === 'ALL' ? 'No claims yet' : 'No claims match this status'}
          description={
            filter === 'ALL'
              ? 'Open a claim from an eligible policy.'
              : 'Choose another status to see other cases.'
          }
          action={
            filter === 'ALL' ? (
              <ButtonLink href="/policies" variant="secondary">
                Open policies
              </ButtonLink>
            ) : undefined
          }
        />
      )}
      <ul className="divide-y divide-zinc-100">
        {(cases ?? []).map((c) => (
          <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 space-y-1">
              <Link
                href={`/claims/${c.id}`}
                className="inline-flex min-h-11 items-center font-mono text-sm text-[var(--accent)] underline"
              >
                Open case · {c.id.slice(0, 8)}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <CaseStatusBadge
                  status={c.status}
                  confirmedReceipt={c.confirmedSettlementReceipt}
                />
                {c.syntheticDemo ? (
                  <StatusBadge label="SYNTHETIC FIXTURE" tone="synthetic" />
                ) : null}
              </div>
              {c.reviewReasonCode ? (
                <p className="text-xs text-zinc-500">Review: {c.reviewReasonCode}</p>
              ) : null}
            </div>
            <div className="shrink-0 text-right text-xs text-zinc-500">
              {c.payable.usdc && (
                <div>
                  {c.syntheticDemo
                    ? 'Illustrative amount'
                    : c.confirmedSettlementReceipt
                      ? 'Confirmed payment'
                      : 'Proposed amount'}{' '}
                  · {c.payable.usdc} USDC
                </div>
              )}
              <time dateTime={c.updatedAt}>{new Date(c.updatedAt).toLocaleString()}</time>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
