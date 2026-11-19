'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Panel } from '@/components/panel';
import { CaseStatusBadge } from '@/components/claims/case-status-badge';
import { StatusBadge } from '@/components/status-badge';
import { claimsFetch } from '@/lib/claims/claims-api';
import {
  CLAIMS_SIGN_IN_REQUIRED,
  claimsNetworkFailure,
  parseClaimCaseDetailPayload,
  readClaimsClientResponse,
} from '@/lib/claims/claims-client-response';

type DetailResponse = {
  source?: {
    mode: string;
    id?: string;
    digest?: string;
    checkpoint?: { sequence: number; createdAt: number; validUntil: number };
  };
  principalRole?: string;
  fixtureCatalog?: { reference: string; digest: string; raw: string };
  linkedIncident?: { id: string; observedAt: string; observedEventRef?: string };
  verifications?: Array<{
    id: string;
    actor?: string;
    createdAt?: string;
    verifierVersion?: string;
    contextDigest?: string;
    fixtureReference?: string;
    fixtureDigest?: string;
    executionStatus: string;
    evidenceSufficiency: string;
    findings: string[];
    independentlyAuthenticated: false;
  }>;
  case: {
    id: string;
    status: string;
    syntheticDemo: boolean;
    evidenceAuthenticity: string;
    coverageDetermination: string;
    settlementAuthorization: string;
    verifiedLoss: { usdc: string | null };
    deductible?: { usdc: string | null };
    priorCompensation?: { usdc: string | null };
    lossCap?: { usdc: string | null };
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
    payload?: { receiptRef?: string; [key: string]: unknown };
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
  const [reviewRationale, setReviewRationale] = useState('');
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await claimsFetch('any', `/api/claims/cases/${caseId}`);
      const result = await readClaimsClientResponse(res, (json) => {
        const parsed = parseClaimCaseDetailPayload(json);
        return parsed ? (parsed as unknown as DetailResponse) : null;
      });
      if (!result.ok) {
        setData(null);
        setError(result.message);
        return;
      }
      setError(null);
      setData(result.data);
    } catch (e) {
      setData(null);
      setError(claimsNetworkFailure(e).message);
    }
  }, [caseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function run(role: 'reviewer' | 'authority', body: Record<string, unknown>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      await (async () => {
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

  function verifyFixture() {
    if (!data?.fixtureCatalog || !data.linkedIncident) return;
    const catalog = data.fixtureCatalog,
      incident = data.linkedIncident;
    setError(null);
    startTransition(async () => {
      try {
        const evidence = await claimsFetch('any', '/api/claims/cases', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'attach_evidence',
            caseId,
            evidence: {
              source: 'synthetic-fixture',
              provenance: catalog.reference,
              rawEvidence: catalog.raw,
              verificationMethod: 'fixture_consistency',
              sourceReliability: 'demo_only',
              syntheticFixture: true,
            },
          }),
        });
        if (!evidence.ok)
          throw new Error((await evidence.json()).error ?? 'Evidence attachment failed');
        if (data.case.status === 'COLLECTING_EVIDENCE') {
          const completed = await claimsFetch('any', '/api/claims/cases', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'complete_evidence', caseId, evidenceComplete: true }),
          });
          if (!completed.ok)
            throw new Error((await completed.json()).error ?? 'Evidence completion failed');
        }
        const verified = await claimsFetch('any', `/api/claims/cases/${caseId}/verification`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            revision: (data.verifications?.length ?? 0) + 1,
            fixtureRef: catalog.reference,
            fixtureDigest: catalog.digest,
            policyId: data.case.policyId,
            incidentId: incident.id,
            observedAt: incident.observedAt,
          }),
        });
        if (!verified.ok) throw new Error((await verified.json()).error ?? 'Verification failed');
        setNotice(
          'Fixture verification recorded. Coverage and payment require separate human decisions.',
        );
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Verification failed');
      }
    });
  }

  if (error && !data) {
    return (
      <Panel title="Claim case">
        <p className="text-sm text-rose-700">{error}</p>
        {error === CLAIMS_SIGN_IN_REQUIRED ? (
          <p className="mt-2 text-sm text-zinc-600">
            Sign in with a claims session to open this case. Authorization failures are not treated
            as an empty case.
          </p>
        ) : null}
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
  const canReview = ['INVESTIGATING', 'REVIEW'].includes(c.status);
  const receipt = data.timeline.find((e) => e.reasonCode === 'SETTLEMENT_RECONCILED')?.payload
    ?.receiptRef;
  const nextSteps: Record<string, string> = {
    COLLECTING_EVIDENCE:
      'Attach the supported fixture and run server verification. Missing evidence needs reviewer attention.',
    INVESTIGATING:
      'Verification does not decide coverage. A reviewer must check evidence, policy applicability, loss and recoveries.',
    REVIEW:
      'The case needs more information or reviewer investigation. No payment is authorized. Read the findings below before trying again.',
    APPROVED:
      'Human review is complete. The amount is proposed for settlement; it has not been reimbursed. Separate authority and a verified receipt are still required. Synthetic settlement restrictions remain in force.',
    DENIED: 'The reviewer denied this claim. Inspect the reason and decision history.',
    SETTLEMENT_PENDING:
      'Settlement preparation is authorized. Payment is not confirmed; a matching verified receipt is required.',
    SETTLEMENT_FAILED:
      'Settlement did not complete. An authority must investigate; do not assume reimbursement.',
    PAID: 'The recorded settlement was reconciled against a receipt. Inspect its reference and the policy history.',
  };
  const reviewHelp: Record<string, string> = {
    INCOMPLETE_EVIDENCE:
      'Required evidence is missing. Add supported evidence and request human review.',
    UNRESOLVED_VERIFICATION_FINDINGS:
      'Verification findings conflict or remain incomplete. An older success cannot override them.',
    UNRESOLVED_RECOVERIES:
      'Recoveries are unresolved. A reviewer must establish them before any approval.',
    STALE_VERIFICATION_CONTEXT:
      'The evidence or policy context changed. Reload and reverify the current supported context before review.',
    PERSISTED_VERIFICATION_REQUIRED:
      'Run server verification and retain its record before requesting approval.',
    UNSUPPORTED_EVIDENCE_REQUIRES_REVIEW:
      'Uploaded evidence is outside the supported fixture. Verification does not validate or remove that upload.',
    LOSS_ASSESSMENT_MISMATCH:
      'The entered amount does not match the supported economic assessment. It cannot be approved.',
  };

  return (
    <div className="space-y-4">
      <nav className="flex gap-4 text-sm">
        <Link className="underline" href="/claims">
          All claims
        </Link>
        <Link className="underline" href={`/policies/${c.policyId}`}>
          Linked policy
        </Link>
        {['reviewer', 'authority'].includes(data.principalRole ?? '') && (
          <Link className="underline" href="/claims/review">
            Review queue
          </Link>
        )}
      </nav>
      {data.source?.mode === 'fixture' && (
        <Panel title="Synthetic chain-state source">
          <p className="break-all text-sm">
            {data.source.id} · {data.source.digest}
          </p>
          <p className="text-sm">
            Checkpoint {data.source.checkpoint?.sequence} · expires{' '}
            {data.source.checkpoint &&
              new Date(data.source.checkpoint.validUntil * 1000).toISOString()}
            . Policy and reservation are fixture data, not Arc confirmations.
          </p>
        </Panel>
      )}
      <Panel title="Next step">
        <p role="status" className="text-sm">
          {nextSteps[c.status] ?? 'Continue the claim investigation.'}
        </p>
        {c.status === 'REVIEW' && c.reviewReasonCode && reviewHelp[c.reviewReasonCode] && (
          <p className="mt-2 text-sm">{reviewHelp[c.reviewReasonCode]}</p>
        )}
        <p className="mt-2 text-xs">
          {receipt
            ? `Verified settlement receipt: ${receipt}`
            : 'No verified settlement receipt. Approval is not reimbursement.'}
        </p>
        {notice && (
          <p role="status" className="mt-2 text-sm">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-rose-700">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => void refresh()}
          className="mt-2 rounded-md border px-3 py-1.5 text-xs"
        >
          Reload claim and findings
        </button>
      </Panel>
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
            <dd className="break-all font-mono text-xs">
              <Link className="underline" href={`/policies/${c.policyId}`}>
                {c.policyId}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Claim reference</dt>
            <dd className="break-all font-mono text-xs">{c.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Incident reference</dt>
            <dd className="break-all font-mono text-xs">
              {data.linkedIncident?.id ?? '—'} · {data.linkedIncident?.observedEventRef ?? '—'}
              <br />
              {data.linkedIncident?.observedAt ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Policy beneficiary</dt>
            <dd className="break-all font-mono text-xs">{c.payoutTo ?? '—'}</dd>
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
            <li>Assessed gross loss (synthetic): {c.verifiedLoss.usdc ?? '—'} USDC</li>
            <li>Policy deductible: {c.deductible?.usdc ?? '—'} USDC</li>
            <li>Prior compensation: {c.priorCompensation?.usdc ?? '—'} USDC</li>
            <li>Coverage limit: {c.lossCap?.usdc ?? '—'} USDC</li>
            <li>Recoveries: {c.recoveries.usdc ?? 'unknown / REVIEW'}</li>
            <li>Proposed settlement amount: {c.payable.usdc ?? '—'} USDC</li>
            {c.status === 'REVIEW' && c.reviewReasonCode ? (
              <li>Review reason: {c.reviewReasonCode}</li>
            ) : null}
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

      <Panel title="Synthetic fixture verification">
        <p className="text-sm">
          Fixture consistency only. No real-world event or economic loss is independently
          authenticated.
        </p>
        {data.verifications?.map((v) => (
          <div key={v.id} className="mt-2 text-xs">
            <p>
              {v.executionStatus} · Evidence {v.evidenceSufficiency}
            </p>
            <p className="mt-1 break-all font-mono">Verification {v.id}</p>
            <p>
              {v.verifierVersion} · {v.actor} · {v.createdAt}
            </p>
            <p className="break-all">
              Fixture: {v.fixtureReference} · {v.fixtureDigest}
            </p>
            <p className="break-all">Context: {v.contextDigest}</p>
            <ul>
              {v.findings.map((finding, i) => (
                <li key={i}>{finding}</li>
              ))}
            </ul>
          </div>
        ))}
        {['COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'].includes(c.status) &&
          data.principalRole !== 'authority' && (
            <button
              type="button"
              disabled={pending}
              onClick={verifyFixture}
              className="mt-2 rounded-md border px-3 py-1.5 text-xs"
            >
              Attach and verify synthetic fixture
            </button>
          )}
      </Panel>

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
              {e.payload && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs">
                    Decision / investigation record
                  </summary>
                  <pre className="overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      </Panel>

      {['reviewer', 'authority'].includes(data.principalRole ?? '') && (
        <Panel title="Reviewer / authority actions">
          <p className="mb-3 text-xs text-zinc-500">
            Actions require the matching server-provisioned ops session. Sending actor strings
            cannot escalate privilege.
          </p>
          <p className="mb-2 text-xs">
            Catalog gross economic loss: 1.50 USDC after extinguished debt. Scenario recoveries and
            prior compensation: zero. Policy deductible and limits still apply.
          </p>
          <label className="mb-2 block text-sm">
            <input
              type="checkbox"
              checked={reviewConfirmed}
              onChange={(e) => setReviewConfirmed(e.target.checked)}
            />{' '}
            I reviewed event applicability and resolved all policy exclusions for this synthetic
            scenario.
          </label>
          <label className="mb-3 block text-sm">
            Contractual review rationale
            <textarea
              value={reviewRationale}
              onChange={(e) => setReviewRationale(e.target.value)}
              maxLength={4000}
              className="block w-full rounded border p-2"
            />
          </label>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                pending ||
                !canReview ||
                !reviewConfirmed ||
                !reviewRationale.trim() ||
                !data.verifications?.some(
                  (v) =>
                    v.executionStatus === 'completed' && v.evidenceSufficiency === 'sufficient',
                )
              }
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              onClick={() =>
                run('reviewer', {
                  action: 'adjudicate',
                  coverageDetermination: 'covered',
                  verificationId: data.verifications?.find(
                    (v) =>
                      v.executionStatus === 'completed' && v.evidenceSufficiency === 'sufficient',
                  )?.id,
                  contractualReview: {
                    eventApplies: reviewConfirmed,
                    exclusionsResolved: reviewConfirmed,
                    rationale: reviewRationale,
                  },
                  verifiedLossUsdc: '1.500000',
                  recoveriesUsdc: '0.000000',
                  requestedUsdc: '1.000000',
                })
              }
            >
              Review and approve up to 1 USDC
            </button>
            <button
              type="button"
              disabled={pending || !canReview}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              onClick={() =>
                run('reviewer', {
                  action: 'adjudicate',
                  coverageDetermination: 'covered',
                  verificationId: data.verifications?.find(
                    (v) =>
                      v.executionStatus === 'completed' && v.evidenceSufficiency === 'sufficient',
                  )?.id,
                  contractualReview: {
                    eventApplies: reviewConfirmed,
                    exclusionsResolved: reviewConfirmed,
                    rationale: reviewRationale,
                  },
                  verifiedLossUsdc: '1.500000',
                  recoveriesUsdc: null,
                  requestedUsdc: '1.000000',
                })
              }
            >
              Force REVIEW (unknown recoveries)
            </button>
            <button
              type="button"
              disabled={pending || !canReview}
              className="rounded-md bg-rose-800 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              onClick={() =>
                run('reviewer', {
                  action: 'adjudicate',
                  coverageDetermination: 'not_covered',
                  verifiedLossUsdc: '1.500000',
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

          {data.principalRole === 'authority' && (
            <button
              type="button"
              disabled={
                pending ||
                c.syntheticDemo ||
                !['APPROVED', 'SETTLEMENT_FAILED'].includes(c.status) ||
                !c.payable.usdc ||
                !c.evidenceRoot ||
                !c.payoutTo ||
                !c.lossKey
              }
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
              Prepare settlement (authority session, no broadcast)
            </button>
          )}
          {c.syntheticDemo && (
            <p className="mt-2 text-xs">
              Synthetic fixture claims cannot prepare settlement under production restrictions.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}
