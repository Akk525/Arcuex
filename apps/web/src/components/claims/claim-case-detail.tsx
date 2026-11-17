'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Panel } from '@/components/panel';
import { CaseStatusBadge } from '@/components/claims/case-status-badge';
import { StatusBadge } from '@/components/status-badge';
import { claimsFetch } from '@/lib/claims/claims-api';

type DetailResponse = {
  case: {
    id: string;
    status: string;
    syntheticDemo: boolean;
    evidenceAuthenticity: string;
    coverageDetermination: string;
    settlementAuthorization: string;
    verifiedLoss: { usdc: string | null };
    recoveries: { usdc: string | null };
    payable: { usdc: string | null; micros: string | null };
    lossKey: string | null;
    evidenceRoot: string | null;
    payoutTo: string | null;
    adjudicationBindingJson: string | null;
    reviewReasonCode: string | null;
    denialReasonCode: string | null;
    authorityActor: string | null;
    labels: { synthetic: string | null };
    policyId: string;
    exposureId: string;
    claimantRef: string;
  };
  timeline: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    actor: string;
    reasonCode: string;
    createdAt: string;
  }>;
  evidenceManifests: Array<{
    id: string;
    source: string;
    provenance: string;
    rawEvidenceDigest: string;
    verificationMethod: string;
    sourceReliability: string;
    syntheticFixture: boolean;
  }>;
  error?: string;
};

export function ClaimCaseDetail({ caseId }: { caseId: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await claimsFetch('any', `/api/claims/cases/${caseId}`);
    const json = (await res.json()) as DetailResponse;
    if (!res.ok) throw new Error(json.error ?? 'Failed to load case');
    setData(json);
  }, [caseId]);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [refresh]);

  function run(
    role: 'reviewer' | 'authority',
    body: Record<string, unknown>,
  ) {
    setError(null);
    setNotice(null);
    startTransition(() => {
      void (async () => {
        const res = await claimsFetch(role, `/api/claims/cases/${caseId}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Action failed');
        if (json.notice) setNotice(String(json.notice));
        await refresh();
      })().catch((e) => setError(e instanceof Error ? e.message : 'Action failed'));
    });
  }

  if (error && !data) {
    return (
      <Panel title="Claim case">
        <p className="text-sm text-rose-700">{error}</p>
        <Link href="/claims" className="text-xs text-sky-800 underline">
          Back to list
        </Link>
      </Panel>
    );
  }

  if (!data) {
    return (
      <Panel title="Claim case">
        <p className="text-sm text-zinc-500">Loading case…</p>
      </Panel>
    );
  }

  const c = data.case;

  return (
    <div className="space-y-4">
      <Panel
        title={`Case ${c.id.slice(0, 8)}…`}
        action={
          <div className="flex flex-wrap gap-2">
            <CaseStatusBadge status={c.status} />
            {c.syntheticDemo ? <StatusBadge label="SYNTHETIC" tone="warn" /> : null}
          </div>
        }
      >
        {c.labels.synthetic ? (
          <p className="mb-3 text-xs text-amber-800">{c.labels.synthetic}</p>
        ) : null}
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-zinc-500">Policy</dt>
            <dd className="font-mono text-xs">{c.policyId}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Frozen payoutTo</dt>
            <dd className="font-mono text-xs">{c.payoutTo ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Evidence root</dt>
            <dd className="break-all font-mono text-xs">{c.evidenceRoot ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Loss key</dt>
            <dd className="break-all font-mono text-xs">{c.lossKey ?? '—'}</dd>
          </div>
        </dl>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Verification checks">
          <ul className="space-y-2 text-sm">
            <li>
              Evidence authenticity: <strong>{c.evidenceAuthenticity}</strong>
            </li>
            <li>
              Coverage determination: <strong>{c.coverageDetermination}</strong>
            </li>
            <li>
              Settlement authorization: <strong>{c.settlementAuthorization}</strong>
            </li>
            <li>Verified loss: {c.verifiedLoss.usdc ?? '—'} USDC</li>
            <li>Recoveries: {c.recoveries.usdc ?? 'unknown / REVIEW'}</li>
            <li>Payable: {c.payable.usdc ?? '—'} USDC</li>
            {c.reviewReasonCode ? <li>Review reason: {c.reviewReasonCode}</li> : null}
            {c.denialReasonCode ? <li>Denial reason: {c.denialReasonCode}</li> : null}
          </ul>
        </Panel>

        <Panel title="Evidence manifests">
          {data.evidenceManifests.length === 0 ? (
            <p className="text-sm text-zinc-500">No manifests attached.</p>
          ) : (
            <ul className="space-y-3 text-xs">
              {data.evidenceManifests.map((m) => (
                <li key={m.id} className="rounded-md border border-zinc-100 p-2">
                  <div className="font-medium">{m.source}</div>
                  <div className="break-all font-mono">{m.rawEvidenceDigest}</div>
                  <div>
                    {m.verificationMethod}
                    {m.syntheticFixture ? ' · SYNTHETIC FIXTURE' : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Incident timeline">
        <ol className="space-y-2 text-sm">
          {data.timeline.map((e) => (
            <li key={e.id} className="border-l-2 border-zinc-200 pl-3">
              <div className="font-medium">
                {e.fromStatus} → {e.toStatus}
              </div>
              <div className="text-xs text-zinc-500">
                {e.reasonCode} · {e.actor} · {new Date(e.createdAt).toLocaleString()}
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Reviewer / authority actions (token-gated)">
        <p className="mb-3 text-xs text-zinc-500">
          Buttons call APIs with reviewer/authority Bearer tokens only. Sending actor strings cannot
          escalate privilege.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            onClick={() =>
              run('reviewer', {
                action: 'adjudicate',
                coverageDetermination: 'covered',
                verifiedLossUsdc: '1.000000',
                recoveriesUsdc: '0.000000',
                requestedUsdc: '1.000000',
              })
            }
          >
            Adjudicate approve (1 USDC)
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-md bg-amber-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            onClick={() =>
              run('reviewer', {
                action: 'adjudicate',
                coverageDetermination: 'covered',
                verifiedLossUsdc: '1.000000',
                recoveriesUsdc: null,
                requestedUsdc: '1.000000',
              })
            }
          >
            Force REVIEW (unknown recoveries)
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-md bg-rose-800 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            onClick={() =>
              run('reviewer', {
                action: 'adjudicate',
                coverageDetermination: 'not_covered',
                verifiedLossUsdc: '1.000000',
                recoveriesUsdc: '0.000000',
                requestedUsdc: '1.000000',
              })
            }
          >
            Deny (not covered)
          </button>
          {c.status === 'REVIEW' ? (
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs disabled:opacity-50"
              onClick={() => run('reviewer', { action: 'reopen_investigation' })}
            >
              Reopen investigation
            </button>
          ) : null}
        </div>

        <button
          type="button"
          disabled={pending || !c.payable.usdc || !c.evidenceRoot || !c.payoutTo || !c.lossKey}
          className="rounded-md bg-sky-800 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          onClick={() =>
            run('authority', {
              action: 'prepare_settlement',
              confirmedRecipient: c.payoutTo,
              confirmedAmountUsdc: c.payable.usdc,
              confirmedLossKey: c.lossKey,
              confirmedEvidenceRoot: c.evidenceRoot,
            })
          }
        >
          Prepare settlement (authority token, no broadcast)
        </button>
        {notice ? <p className="mt-2 text-xs text-sky-800">{notice}</p> : null}
        {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      </Panel>
    </div>
  );
}
