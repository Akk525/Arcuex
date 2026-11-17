'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Panel } from '@/components/panel';
import { CaseStatusBadge } from '@/components/claims/case-status-badge';
import { StatusBadge } from '@/components/status-badge';

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
    transactionHash: string | null;
    blockHash: string | null;
    chain: string | null;
  }>;
  error?: string;
};

export function ClaimCaseDetail({ caseId }: { caseId: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [authorityActor, setAuthorityActor] = useState('authority:claims');
  const [recipient, setRecipient] = useState('0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760');
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/claims/cases/${caseId}`);
    const json = (await res.json()) as DetailResponse;
    if (!res.ok) throw new Error(json.error ?? 'Failed to load case');
    setData(json);
  }, [caseId]);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [refresh]);

  function run(action: string, body: Record<string, unknown> = {}) {
    setError(null);
    setNotice(null);
    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/claims/cases/${caseId}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body.action ? body : { action, ...body }),
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
            <dt className="text-xs text-zinc-500">Exposure</dt>
            <dd className="font-mono text-xs">{c.exposureId}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Claimant</dt>
            <dd>{c.claimantRef}</dd>
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
                  <div className="text-zinc-500">{m.provenance}</div>
                  <div className="break-all font-mono">{m.rawEvidenceDigest}</div>
                  <div>
                    {m.verificationMethod} · {m.sourceReliability}
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

      <Panel title="Reviewer / authority actions">
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            onClick={() =>
              run('adjudicate', {
                action: 'adjudicate',
                actor: 'reviewer:dashboard',
                coverageDetermination: 'covered',
                verifiedLossUsdc: '1.000000',
                recoveriesUsdc: '0.000000',
                requestedUsdc: '1.000000',
                lossKey:
                  c.lossKey ??
                  '0x7a6dfe6606b3c2651a98c69e36d0f4e806ae77f16dea70adcd342ab8a8fa121c',
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
              run('adjudicate', {
                action: 'adjudicate',
                actor: 'reviewer:dashboard',
                coverageDetermination: 'covered',
                verifiedLossUsdc: '1.000000',
                recoveriesUsdc: null,
                requestedUsdc: '1.000000',
                lossKey: c.lossKey ?? '0x' + '11'.repeat(32),
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
              run('adjudicate', {
                action: 'adjudicate',
                actor: 'reviewer:dashboard',
                coverageDetermination: 'not_covered',
                verifiedLossUsdc: '1.000000',
                recoveriesUsdc: '0.000000',
                requestedUsdc: '1.000000',
                lossKey: c.lossKey ?? '0x' + '22'.repeat(32),
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
              onClick={() => run('reopen_investigation', { action: 'reopen_investigation' })}
            >
              Reopen investigation
            </button>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-zinc-100 pt-3 text-sm">
          <p className="text-xs text-zinc-500">
            Settlement preparation requires authenticated <code>authority:*</code> actor. This UI
            never broadcasts on-chain transfers.
          </p>
          <label className="block space-y-1">
            <span className="text-xs text-zinc-600">Authority actor</span>
            <input
              className="w-full rounded-md border border-zinc-200 px-2 py-1 font-mono text-xs"
              value={authorityActor}
              onChange={(e) => setAuthorityActor(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-zinc-600">Confirm recipient</span>
            <input
              className="w-full rounded-md border border-zinc-200 px-2 py-1 font-mono text-xs"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={pending || !c.payable.usdc}
            className="rounded-md bg-sky-800 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            onClick={() =>
              run('prepare_settlement', {
                action: 'prepare_settlement',
                authorityActor,
                confirmedRecipient: recipient,
                confirmedAmountUsdc: c.payable.usdc,
              })
            }
          >
            Prepare settlement (no broadcast)
          </button>
        </div>
        {notice ? <p className="mt-2 text-xs text-sky-800">{notice}</p> : null}
        {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      </Panel>
    </div>
  );
}
