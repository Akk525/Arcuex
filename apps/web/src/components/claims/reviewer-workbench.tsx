'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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

export function ReviewerWorkbench() {
  const [cases, setCases] = useState<ClaimsCaseListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await claimsFetch('reviewer', '/api/claims/cases?status=REVIEW');
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
    })();
  }, []);

  return (
    <Panel
      title="Reviewer workbench"
      action={<StatusBadge label="REVIEW QUEUE" tone="warn" />}
    >
      <p className="mb-3 text-xs text-zinc-600">
        REVIEW cases have zero authorized payout until resolved. Missing independent evidence or
        unknown recoveries stay here — never silent approve/deny.
      </p>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {authRequired ? (
        <p className="text-sm text-zinc-600">
          Sign in with a reviewer session to load the review queue. Unauthorized responses are not
          shown as an empty queue.
        </p>
      ) : null}
      {!cases && !error ? <p className="text-sm text-zinc-500">Loading review queue…</p> : null}
      {cases && cases.length === 0 ? (
        <p className="text-sm text-zinc-500">Review queue empty.</p>
      ) : null}
      <ul className="divide-y divide-zinc-100">
        {(cases ?? []).map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <div>
              <Link href={`/claims/${c.id}`} className="font-mono text-xs text-sky-800 underline">
                {c.id}
              </Link>
              <div className="mt-1 flex flex-wrap gap-2">
                <CaseStatusBadge status={c.status} />
                {c.syntheticDemo ? <StatusBadge label="SYNTHETIC" tone="warn" /> : null}
              </div>
              {c.reviewReasonCode ? (
                <p className="text-xs text-zinc-500">{c.reviewReasonCode}</p>
              ) : null}
            </div>
            <span className="text-xs text-zinc-500">{new Date(c.updatedAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
