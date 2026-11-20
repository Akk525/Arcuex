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
import { TruthBadge } from '@/components/ui/truth-badge';
import { Metric } from '@/components/ui/metric';
import { Button, ButtonLink } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
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
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
        {error === CLAIMS_SIGN_IN_REQUIRED ? (
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Sign in with a claims session to open this case. Authorization failures are not treated
            as an empty case.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-3">
          <Button onClick={() => void refresh()}>Retry claim</Button>
          <ButtonLink href="/claims" variant="secondary">
            Back to list
          </ButtonLink>
        </div>
      </Panel>
    );
  }

  if (!data) {
    return (
      <Panel title="Claim case">
        <p role="status" className="text-sm text-[var(--ink-muted)]">
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
        <Link className="inline-flex min-h-10 items-center underline" href="/claims">
          All claims
        </Link>
        <Link
          className="inline-flex min-h-10 items-center underline"
          href={`/policies/${c.policyId}`}
        >
          Linked policy
        </Link>
        <a className="inline-flex min-h-10 items-center underline" href="#claim-verifier-findings">
          Verifier findings
        </a>
        {isReviewer && (
          <>
            <Link className="inline-flex min-h-10 items-center underline" href="/claims/review">
              Review queue
            </Link>
            <a className="inline-flex min-h-10 items-center underline" href="#claim-review-actions">
              Reviewer actions
            </a>
          </>
        )}
      </nav>

      <Callout
        kind={fixtureBlocked ? 'synthetic' : receipt ? 'live' : 'warn'}
        title={`${decision} · ${settlement.label}`}
      >
        <p>{settlement.action}</p>
        {fixtureBlocked && c.status === 'APPROVED' ? (
          <p className="mt-1">
            Approved for contractual coverage only. Fixture mode cannot prepare or broadcast
            settlement — this case is not reimbursed.
          </p>
        ) : null}
        {c.status === 'REVIEW' && c.reviewReasonCode && reviewHelp[c.reviewReasonCode] ? (
          <p className="mt-1">{reviewHelp[c.reviewReasonCode]}</p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-1">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-1 text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => void refresh()}>
            Reload claim and findings
          </Button>
          {receipt ? (
            <a
              className="inline-flex min-h-8 items-center text-sm underline"
              href={`https://explorer.testnet.arc.io/tx/${receipt}`}
            >
              View verified settlement receipt
            </a>
          ) : null}
        </div>
      </Callout>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-5">
        <div className="min-w-0 space-y-4">
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
          ) : (
            <Panel title="Case timeline">
              <ol className="space-y-2 text-sm">
                {data.timeline.map((event) => (
                  <ClaimAuditEvent
                    key={event.id}
                    event={event}
                    receipt={receipt}
                    targets={targets}
                  />
                ))}
              </ol>
            </Panel>
          )}

          <div id="claim-verifier-findings" className="scroll-mt-4">
            <Panel
              title={
                c.syntheticDemo
                  ? 'Deterministic findings · synthetic fixture'
                  : 'Deterministic findings · independent liquidation'
              }
            >
              <div className="mb-2 flex flex-wrap gap-2">
                <TruthBadge
                  label={c.syntheticDemo ? 'Fixture consistency' : 'Independent verifier'}
                  tone={c.syntheticDemo ? 'synthetic' : 'ok'}
                />
                <TruthBadge label="Not a human decision" tone="human" />
              </div>
              <p className="text-sm text-[var(--ink-muted)]">
                {c.syntheticDemo
                  ? 'Fixture consistency only. No real-world event or economic loss is independently authenticated.'
                  : 'Submit the signed replay and recovery envelope through the independent verification API. Coverage remains a human determination.'}
              </p>
              {!data.verifications?.length && (
                <p className="mt-2 text-sm text-[var(--ink-muted)]">No verifier record yet.</p>
              )}
              {data.verifications?.map((v) => (
                <article
                  key={v.id}
                  id={evidenceAnchor('verification', v.id)}
                  tabIndex={-1}
                  className="mt-3 scroll-mt-4 space-y-1 rounded-[var(--radius-sm)] border border-[var(--line)] p-3 text-xs"
                >
                  <div className="flex flex-wrap gap-2">
                    <TruthBadge
                      label={
                        data.verificationStates[v.id] === 'stale'
                          ? 'Stale'
                          : data.verificationStates[v.id] === 'failed'
                            ? 'Failed'
                            : data.verificationStates[v.id] === 'current'
                              ? 'Current'
                              : 'Unknown freshness'
                      }
                      tone={
                        data.verificationStates[v.id] === 'current'
                          ? 'ok'
                          : data.verificationStates[v.id] === 'stale'
                            ? 'warn'
                            : 'danger'
                      }
                    />
                    <TruthBadge
                      label={
                        v.independentlyAuthenticated
                          ? 'Independently authenticated'
                          : v.authenticity === 'synthetic_fixture'
                            ? 'Fixture only'
                            : 'Unverified'
                      }
                      tone={v.independentlyAuthenticated ? 'ok' : 'synthetic'}
                    />
                  </div>
                  <p>
                    {v.executionStatus} · Evidence {v.evidenceSufficiency}
                  </p>
                  <ClaimEventMetadata actor={v.actor} timestamp={v.createdAt} />
                  <details>
                    <summary className="cursor-pointer text-xs underline">
                      Technical verification detail
                    </summary>
                    <div className="mt-2 space-y-1 break-all font-mono">
                      <p>Verification {v.id}</p>
                      <p>Verifier {v.verifierVersion ?? 'unavailable'}</p>
                      {c.syntheticDemo ? (
                        <p>
                          Fixture: {v.fixtureReference} · {v.fixtureDigest}
                        </p>
                      ) : null}
                      <p>Context: {v.contextDigest}</p>
                    </div>
                  </details>
                  <ul className="list-disc pl-4">
                    {v.findings.map((finding, i) => (
                      <li key={i}>{finding}</li>
                    ))}
                  </ul>
                </article>
              ))}
              {c.syntheticDemo &&
                ['COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'].includes(c.status) &&
                ['claimant', 'reviewer'].includes(data.principalRole ?? '') && (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={verifyFixture}
                  >
                    Attach and verify synthetic fixture
                  </Button>
                )}
            </Panel>
          </div>

          {isReviewer && (
            <div id="claim-review-actions" className="scroll-mt-4">
              <Panel title="Reviewer / authority actions">
                <p className="mb-2 text-xs text-[var(--ink-muted)]">{reviewActionHelp}</p>
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
                    <p className="mb-2 text-xs text-[var(--ink-secondary)]">
                      {c.syntheticDemo
                        ? 'Catalog gross economic loss: 1.50 USDC after extinguished debt. Scenario recoveries and prior compensation: zero. Policy deductible and limits still apply.'
                        : independentLoss
                          ? `Verified gross loss ${asUsdc(independentLoss.grossLossMicros)} USDC, recoveries ${asUsdc(independentLoss.recoveriesMicros)} USDC, prior compensation ${asUsdc(independentLoss.priorCompensationMicros)} USDC. Policy limits and deductible apply.`
                          : 'A current independent verification is required for approval.'}
                    </p>
                    <label className="mb-2 flex min-h-10 items-start gap-2 text-sm">
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
                        className="field-control mt-1 block"
                      />
                    </label>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={
                          pending ||
                          !canReview ||
                          !reviewConfirmed ||
                          !reviewRationale.trim() ||
                          !approvalId ||
                          (!c.syntheticDemo && !independentLoss)
                        }
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
                      </Button>
                      {c.syntheticDemo ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending || !canReview}
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
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={pending || !canReview}
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
                      </Button>
                      {c.status === 'REVIEW' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => run('reviewer', { action: 'reopen_investigation' })}
                        >
                          Reopen investigation
                        </Button>
                      ) : null}
                    </div>
                  </>
                )}
                {data.principalRole === 'authority' && (
                  <>
                    {!canPrepare && (
                      <p className="mb-2 text-xs text-[var(--ink-muted)]">
                        {data.settlementVerificationBlocker
                          ? settlementBlockerMessage(data.settlementVerificationBlocker)
                          : settlement.action}
                      </p>
                    )}
                    <Button
                      size="sm"
                      disabled={pending || !canPrepare}
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
                    </Button>
                  </>
                )}
              </Panel>
            </div>
          )}
        </div>

        <aside className="mt-4 space-y-3 lg:mt-0 lg:sticky lg:top-4">
          <Panel
            title="Case status"
            action={
              <div className="flex flex-wrap gap-1.5">
                <CaseStatusBadge status={c.status} confirmedReceipt={receipt} />
                {c.syntheticDemo ? <TruthBadge label="Synthetic" tone="synthetic" /> : null}
              </div>
            }
          >
            {c.labels.synthetic ? (
              <p className="mb-3 text-xs text-[var(--synthetic)]">{c.labels.synthetic}</p>
            ) : null}
            <div className="space-y-3">
              <Metric label="Evidence authenticity" value={c.evidenceAuthenticity} />
              <Metric label="Coverage determination" value={c.coverageDetermination} />
              <Metric label="Settlement" value={settlement.label} />
              <Metric
                label={
                  fixtureBlocked
                    ? 'Illustrative payable'
                    : receipt
                      ? 'Reimbursed amount'
                      : 'Proposed payable'
                }
                value={`${c.payable.usdc ?? '—'} USDC`}
                accent
                hint={
                  fixtureBlocked
                    ? 'Not reimbursed in fixture mode'
                    : receipt
                      ? 'Matched settlement receipt'
                      : 'Requires verified settlement receipt'
                }
              />
              <Metric
                label={`Assessed gross loss${c.syntheticDemo ? ' (synthetic)' : ''}`}
                value={`${c.verifiedLoss.usdc ?? '—'} USDC`}
              />
              <Metric label="Deductible" value={`${c.deductible?.usdc ?? '—'} USDC`} />
              <Metric label="Coverage limit" value={`${c.lossCap?.usdc ?? '—'} USDC`} />
              <Metric label="Recoveries" value={`${c.recoveries.usdc ?? 'unknown / REVIEW'} USDC`} />
            </div>
          </Panel>

          <Panel title="Linked records">
            <dl
              id={evidenceAnchor('case', c.id)}
              tabIndex={-1}
              className="scroll-mt-4 space-y-2 text-sm"
            >
              <div id={evidenceAnchor('policy', c.policyId)} tabIndex={-1} className="scroll-mt-4">
                <dt className="text-[0.6875rem] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
                  Policy
                </dt>
                <dd className="break-all font-mono text-xs">
                  <Link className="underline" href={`/policies/${c.policyId}`}>
                    {c.policyId}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
                  Claim
                </dt>
                <dd className="break-all font-mono text-xs">{c.id}</dd>
              </div>
              <div
                id={
                  data.linkedIncident
                    ? evidenceAnchor('incident', data.linkedIncident.id)
                    : undefined
                }
                tabIndex={-1}
                className="scroll-mt-4"
              >
                <dt className="text-[0.6875rem] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
                  Incident
                </dt>
                <dd className="break-all font-mono text-xs">
                  {data.linkedIncident?.id ?? '—'}
                  {data.linkedIncident ? (
                    <>
                      <br />
                      <time dateTime={data.linkedIncident.observedAt}>
                        {data.linkedIncident.observedAt}
                      </time>
                    </>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
                  Beneficiary
                </dt>
                <dd className="break-all font-mono text-xs">{c.payoutTo ?? '—'}</dd>
              </div>
            </dl>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs underline">Technical identifiers</summary>
              <dl className="mt-2 space-y-2 text-xs">
                <div>
                  <dt className="text-[var(--ink-muted)]">Evidence root</dt>
                  <dd className="break-all font-mono">{c.evidenceRoot ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-muted)]">Loss key</dt>
                  <dd className="break-all font-mono">{c.lossKey ?? '—'}</dd>
                </div>
                {c.status === 'REVIEW' && c.reviewReasonCode ? (
                  <div>
                    <dt className="text-[var(--ink-muted)]">Review reason</dt>
                    <dd>{c.reviewReasonCode}</dd>
                  </div>
                ) : null}
                {c.denialReasonCode ? (
                  <div>
                    <dt className="text-[var(--ink-muted)]">Denial reason</dt>
                    <dd>{c.denialReasonCode}</dd>
                  </div>
                ) : null}
              </dl>
            </details>
          </Panel>

          {data.source?.mode === 'fixture' && (
            <Panel title="Fixture source">
              <p className="break-all text-xs font-mono text-[var(--ink-muted)]">
                {data.source.id}
              </p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                Checkpoint {data.source.checkpoint?.sequence}
                {data.source.checkpoint
                  ? ` · expires ${new Date(data.source.checkpoint.validUntil * 1000).toISOString()}`
                  : ''}
                . Not Arc confirmations.
              </p>
            </Panel>
          )}

          <Panel title="Evidence manifests">
            {data.evidenceManifests.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No manifests attached.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {data.evidenceManifests.map((m) => (
                  <li
                    key={m.id}
                    id={evidenceAnchor('manifest', m.id)}
                    tabIndex={-1}
                    className="scroll-mt-4 rounded-[var(--radius-sm)] border border-[var(--line)] p-2.5"
                  >
                    <p className="font-medium">{m.source}</p>
                    <p className="text-[var(--ink-muted)]">
                      {m.syntheticFixture ? 'Synthetic fixture' : 'Recorded evidence'} ·{' '}
                      {m.sourceReliability.replaceAll('_', ' ')}
                    </p>
                    <details>
                      <summary className="mt-1 cursor-pointer underline">Digest & chain</summary>
                      <p className="mt-1 break-all font-mono">{m.rawEvidenceDigest}</p>
                      {m.transactionHash ? (
                        <p className="break-all font-mono">{m.transactionHash}</p>
                      ) : null}
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
