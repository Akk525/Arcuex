'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Panel } from '@/components/panel';
import { ClaimsInvestigation } from './claims-investigation';
import { ClaimEventMetadata, ClaimEvidenceLinks } from './claim-evidence-links';
import { ClaimAuditEvent, type ClaimAuditRecord } from './claim-audit-event';
import {
  evidenceAnchor,
  reviewBlockerMessage,
  settlementBlockerMessage,
  type EvidenceTarget,
  type ReviewReadiness,
  type VerificationState,
} from '@/lib/claims/investigation-presentation';
import { CaseStatusBadge } from '@/components/claims/case-status-badge';
import { StatusBadge } from '@/components/status-badge';
import { settlementPresentation } from '@/lib/claims/settlement-presentation';
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
  confirmedSettlementReceipt?: string;
  fixtureCatalog?: { reference: string; digest: string; raw: string };
  linkedIncident?: { id: string; observedAt: string; observedEventRef?: string };
  reviewReadiness?: ReviewReadiness;
  settlementVerificationBlocker?: string | null;
  verificationStates: Record<string, VerificationState>;
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
    independentlyAuthenticated: boolean;
    authenticity?: string;
    validUntilMs?: number;
    lossAssessment?: {
      grossLossMicros: string;
      recoveriesMicros: string;
      priorCompensationMicros: string;
    };
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
  timeline: ClaimAuditRecord[];
  evidenceManifests: Array<{
    id: string;
    source: string;
    provenance: string;
    rawEvidenceDigest: string;
    verificationMethod: string;
    sourceReliability: string;
    syntheticFixture: boolean;
    createdAt: string;
    chain: string | null;
    blockHash: string | null;
    transactionHash: string | null;
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
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
        {error === CLAIMS_SIGN_IN_REQUIRED ? (
          <p className="mt-2 text-sm text-zinc-600">
            Sign in with a claims session to open this case. Authorization failures are not treated
            as an empty case.
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            className="min-h-11 rounded border px-3 text-sm"
          >
            Retry claim
          </button>
          <Link
            href="/claims"
            className="inline-flex min-h-11 items-center text-sm text-sky-800 underline"
          >
            Back to list
          </Link>
        </div>
      </Panel>
    );
  }

  if (!data) {
    return (
      <Panel title="Claim case">
        <p role="status" className="text-sm text-zinc-500">
          Loading case…
        </p>
      </Panel>
    );
  }

  const c = data.case;
  const targets: EvidenceTarget[] = [
    { id: c.id, kind: 'case', label: 'Claim record' },
    { id: c.policyId, kind: 'policy', label: 'Linked policy' },
    ...(data.linkedIncident
      ? [{ id: data.linkedIncident.id, kind: 'incident', label: 'Incident record' }]
      : []),
    ...data.timeline.map((e) => ({ id: e.id, kind: 'event', label: 'Case timeline event' })),
    ...data.evidenceManifests.map((m) => ({
      id: m.id,
      kind: 'manifest',
      label: `Evidence manifest · ${m.source}`,
    })),
    ...(data.verifications ?? []).map((v) => ({
      id: v.id,
      kind: 'verification',
      label: 'Verifier record',
      stale: data.verificationStates[v.id] === 'stale',
    })),
  ];
  const approvalId = data.reviewReadiness?.verificationId;
  const adjudicationRecord = data.verifications?.find((v) => v.id === approvalId);
  const isReviewer = data.principalRole === 'reviewer' || data.principalRole === 'authority';
  const independentLoss = adjudicationRecord?.lossAssessment;
  const asUsdc = (micros: string) => {
    const value = BigInt(micros);
    return `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, '0')}`;
  };

  const canReview = ['INVESTIGATING', 'REVIEW'].includes(c.status);
  const approvalBlocker = data.reviewReadiness?.blocker;
  const reviewActionHelp = !canReview
    ? 'The current claim stage does not accept a new coverage determination.'
    : approvalBlocker
      ? reviewBlockerMessage(approvalBlocker)
      : !approvalId
        ? 'Reload the claim to check whether a current verification supports human review.'
        : 'Current evidence checks are ready. Record your contractual review and rationale to enable approval.';
  const fixtureBlocked =
    data.source?.mode === 'fixture' ||
    c.syntheticDemo ||
    c.evidenceAuthenticity === 'synthetic_fixture';
  const receipt = fixtureBlocked ? null : data.confirmedSettlementReceipt;
  const canPrepare =
    data.principalRole === 'authority' &&
    !fixtureBlocked &&
    c.evidenceAuthenticity === 'verified_independent' &&
    data.settlementVerificationBlocker === null &&
    ['APPROVED', 'SETTLEMENT_FAILED'].includes(c.status) &&
    Boolean(
      c.payable.micros &&
      c.payable.micros !== '0' &&
      c.evidenceRoot &&
      c.payoutTo &&
      c.lossKey &&
      c.adjudicationBindingJson,
    );
  const settlement = settlementPresentation({
    status: c.status,
    blocked: fixtureBlocked,
    confirmedReceipt: receipt,
    canPrepare,
  });
  const decision =
    c.status === 'DENIED'
      ? 'Coverage denied'
      : ['APPROVED', 'SETTLEMENT_PENDING', 'SETTLEMENT_FAILED', 'PAID'].includes(c.status)
        ? 'Coverage approved by a human reviewer'
        : 'Human review pending';
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
    <div className="claim-case min-w-0 space-y-4 [overflow-wrap:anywhere]">
      <nav aria-label="Claim navigation" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link className="inline-flex min-h-11 items-center underline" href="/claims">
          All claims
        </Link>
        <Link
          className="inline-flex min-h-11 items-center underline"
          href={`/policies/${c.policyId}`}
        >
          Linked policy
        </Link>
        <a className="inline-flex min-h-11 items-center underline" href="#claim-verifier-findings">
          Verifier findings
        </a>
        {isReviewer && (
          <>
            <Link className="inline-flex min-h-11 items-center underline" href="/claims/review">
              Review queue
            </Link>
            <a className="inline-flex min-h-11 items-center underline" href="#claim-review-actions">
              Reviewer actions
            </a>
          </>
        )}
      </nav>
      <Panel title="Decision and payment">
        <div role="status" className="space-y-1 text-sm">
          <p className="font-semibold">{decision}</p>
          <p className="font-semibold">{settlement.label}</p>
          <p>{settlement.action}</p>
          {fixtureBlocked && c.status === 'DENIED' && (
            <p>Synthetic fixture financial restrictions apply.</p>
          )}
          {receipt && (
            <a
              className="inline-flex min-h-11 items-center underline"
              href={`https://explorer.testnet.arc.io/tx/${receipt}`}
            >
              View verified settlement receipt
            </a>
          )}
        </div>
        {c.status === 'REVIEW' && c.reviewReasonCode && reviewHelp[c.reviewReasonCode] && (
          <p className="mt-2 text-sm">{reviewHelp[c.reviewReasonCode]}</p>
        )}
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
      {c.syntheticDemo ? (
        <ClaimsInvestigation
          caseId={caseId}
          role={data.principalRole}
          status={c.status}
          verificationRevision={data.verifications?.length ?? 0}
          onChange={refresh}
          targets={targets}
          audit={data.timeline}
          verificationEvents={data.verifications ?? []}
          receipt={receipt}
        />
      ) : null}
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
      <Panel
        title={`Case ${c.id.slice(0, 8)}…`}
        action={
          <div className="flex flex-wrap gap-2">
            <CaseStatusBadge status={c.status} confirmedReceipt={receipt} />
            {c.syntheticDemo ? <StatusBadge label="SYNTHETIC" tone="warn" /> : null}
          </div>
        }
      >
        {c.labels.synthetic ? (
          <p className="mb-3 text-xs text-amber-800">{c.labels.synthetic}</p>
        ) : null}
        <dl
          id={evidenceAnchor('case', c.id)}
          tabIndex={-1}
          className="scroll-mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2"
        >
          <div id={evidenceAnchor('policy', c.policyId)} tabIndex={-1} className="scroll-mt-4">
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
          <div
            id={
              data.linkedIncident ? evidenceAnchor('incident', data.linkedIncident.id) : undefined
            }
            tabIndex={-1}
            className="scroll-mt-4"
          >
            <dt className="text-xs text-zinc-500">Incident reference</dt>
            <dd className="break-all font-mono text-xs">
              {data.linkedIncident?.id ?? '—'} · {data.linkedIncident?.observedEventRef ?? '—'}
              <br />
              {data.linkedIncident ? (
                <time dateTime={data.linkedIncident.observedAt}>
                  {data.linkedIncident.observedAt}
                </time>
              ) : (
                '—'
              )}
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
              Settlement status: <strong>{settlement.label}</strong>
            </li>
            <li>
              Assessed gross loss{c.syntheticDemo ? ' (synthetic)' : ''}:{' '}
              {c.verifiedLoss.usdc ?? '—'} USDC
            </li>
            <li>Policy deductible: {c.deductible?.usdc ?? '—'} USDC</li>
            <li>Prior compensation: {c.priorCompensation?.usdc ?? '—'} USDC</li>
            <li>Coverage limit: {c.lossCap?.usdc ?? '—'} USDC</li>
            <li>Recoveries: {c.recoveries.usdc ?? 'unknown / REVIEW'}</li>
            <li>
              {fixtureBlocked
                ? 'Illustrative amount'
                : receipt
                  ? 'Reimbursed amount'
                  : 'Proposed settlement amount'}
              : {c.payable.usdc ?? '—'} USDC
            </li>
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
                <li
                  key={m.id}
                  id={evidenceAnchor('manifest', m.id)}
                  tabIndex={-1}
                  className="scroll-mt-4 rounded-md border border-zinc-200 p-3"
                >
                  <p className="font-medium">{m.source}</p>
                  <p>Provenance: {m.provenance}</p>
                  <p>
                    {m.syntheticFixture ? 'Synthetic fixture' : 'Recorded evidence'} · Source
                    reliability: {m.sourceReliability.replaceAll('_', ' ')}
                  </p>
                  <p>Verification method: {m.verificationMethod.replaceAll('_', ' ')}</p>
                  <p>
                    Recorded <time dateTime={m.createdAt}>{m.createdAt}</time>
                  </p>
                  {m.chain && <p>Chain: {m.chain}</p>}
                  {m.blockHash && <p className="font-mono">Block: {m.blockHash}</p>}
                  {m.transactionHash && (
                    <p className="font-mono">Transaction: {m.transactionHash}</p>
                  )}
                  <p className="font-mono">Digest: {m.rawEvidenceDigest}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div id="claim-verifier-findings" className="scroll-mt-4">
        <Panel
          title={
            c.syntheticDemo
              ? 'Deterministic findings · synthetic fixture'
              : 'Deterministic findings · independent liquidation'
          }
        >
          <p className="text-sm">
            {c.syntheticDemo
              ? 'Fixture consistency only. No real-world event or economic loss is independently authenticated.'
              : 'Submit the signed replay and recovery envelope through the independent verification API. Coverage remains a human determination.'}
          </p>
          {!data.verifications?.length && (
            <p className="mt-2 text-sm text-zinc-600">No verifier record yet.</p>
          )}
          {data.verifications?.map((v) => (
            <article
              key={v.id}
              id={evidenceAnchor('verification', v.id)}
              tabIndex={-1}
              className="mt-3 scroll-mt-4 space-y-1 rounded border border-zinc-200 p-3 text-xs"
            >
              <p className="font-semibold">
                {data.verificationStates[v.id] === 'stale'
                  ? 'Stale · earlier evidence context or expired proof'
                  : data.verificationStates[v.id] === 'failed'
                    ? 'Verification incomplete or failed'
                    : data.verificationStates[v.id] === 'current'
                      ? 'Current verifier record'
                      : 'Verification freshness unavailable'}
              </p>
              <p>
                {v.executionStatus} · Evidence {v.evidenceSufficiency}
              </p>
              <p className="mt-1 break-all font-mono">Verification {v.id}</p>
              <ClaimEventMetadata actor={v.actor} timestamp={v.createdAt} />
              <p>
                Verifier {v.verifierVersion ?? 'unavailable'} ·{' '}
                {v.independentlyAuthenticated
                  ? 'Independently authenticated at verification'
                  : v.authenticity === 'synthetic_fixture'
                    ? 'Fixture consistency only'
                    : 'No independent authentication recorded'}
              </p>
              {c.syntheticDemo ? (
                <p className="break-all">
                  Fixture: {v.fixtureReference} · {v.fixtureDigest}
                </p>
              ) : null}
              <p className="break-all">Context: {v.contextDigest}</p>
              <ul>
                {v.findings.map((finding, i) => (
                  <li key={i}>{finding}</li>
                ))}
              </ul>
            </article>
          ))}
          {c.syntheticDemo &&
            ['COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'].includes(c.status) &&
            ['claimant', 'reviewer'].includes(data.principalRole ?? '') && (
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
      </div>

      {!c.syntheticDemo && (
        <Panel title="Case timeline">
          <ol className="space-y-2 text-sm">
            {data.timeline.map((event) => (
              <ClaimAuditEvent key={event.id} event={event} receipt={receipt} targets={targets} />
            ))}
          </ol>
        </Panel>
      )}

      {isReviewer && (
        <div id="claim-review-actions" className="scroll-mt-4">
          <Panel title="Reviewer / authority actions">
            <p className="mb-2 text-xs text-zinc-600">{reviewActionHelp}</p>
            {approvalId && (
              <ClaimEvidenceLinks
                references={[approvalId]}
                targets={targets}
                kind="verification"
                label="Verification for human review"
              />
            )}
            {canReview && (
              <>
                <p className="mb-2 text-xs">
                  {c.syntheticDemo
                    ? 'Catalog gross economic loss: 1.50 USDC after extinguished debt. Scenario recoveries and prior compensation: zero. Policy deductible and limits still apply.'
                    : independentLoss
                      ? `Verified gross loss ${asUsdc(independentLoss.grossLossMicros)} USDC, recoveries ${asUsdc(independentLoss.recoveriesMicros)} USDC, prior compensation ${asUsdc(independentLoss.priorCompensationMicros)} USDC. Policy limits and deductible apply.`
                      : 'A current independent verification is required for approval.'}
                </p>
                <label className="mb-2 flex min-h-11 items-start gap-2 text-sm">
                  <input
                    className="mt-1 shrink-0"
                    type="checkbox"
                    checked={reviewConfirmed}
                    onChange={(e) => setReviewConfirmed(e.target.checked)}
                  />
                  {c.syntheticDemo
                    ? 'I reviewed event applicability and resolved all policy exclusions for this synthetic scenario.'
                    : 'I reviewed event applicability and resolved all policy exclusions for the verified incident.'}
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
                      !approvalId ||
                      (!c.syntheticDemo && !independentLoss)
                    }
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    onClick={() =>
                      run('reviewer', {
                        action: 'adjudicate',
                        coverageDetermination: 'covered',
                        verificationId: approvalId,
                        contractualReview: {
                          eventApplies: reviewConfirmed,
                          exclusionsResolved: reviewConfirmed,
                          rationale: reviewRationale,
                        },
                        verifiedLossUsdc: c.syntheticDemo
                          ? '1.500000'
                          : independentLoss
                            ? asUsdc(independentLoss.grossLossMicros)
                            : null,
                        recoveriesUsdc: c.syntheticDemo
                          ? '0.000000'
                          : independentLoss
                            ? asUsdc(independentLoss.recoveriesMicros)
                            : null,
                        ...(independentLoss
                          ? {
                              priorCompensationUsdc: asUsdc(
                                independentLoss.priorCompensationMicros,
                              ),
                            }
                          : {}),
                        requestedUsdc: '1.000000',
                      })
                    }
                  >
                    Review and approve up to 1 USDC
                  </button>
                  {c.syntheticDemo ? (
                    <button
                      type="button"
                      disabled={pending || !canReview}
                      className="rounded-md bg-amber-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                      onClick={() =>
                        run('reviewer', {
                          action: 'adjudicate',
                          coverageDetermination: 'covered',
                          verificationId: approvalId ?? undefined,
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
                  ) : null}
                  <button
                    type="button"
                    disabled={pending || !canReview}
                    className="rounded-md bg-rose-800 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    onClick={() =>
                      run('reviewer', {
                        action: 'adjudicate',
                        coverageDetermination: 'not_covered',
                        verifiedLossUsdc: c.syntheticDemo ? '1.500000' : null,
                        recoveriesUsdc: c.syntheticDemo ? '0.000000' : null,
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
              </>
            )}
            {data.principalRole === 'authority' && (
              <>
                {!canPrepare && (
                  <p className="mb-2 text-xs text-zinc-600">
                    {data.settlementVerificationBlocker
                      ? settlementBlockerMessage(data.settlementVerificationBlocker)
                      : settlement.action}
                  </p>
                )}
                <button
                  type="button"
                  disabled={pending || !canPrepare}
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
              </>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
