'use client';

import { type ReactNode, useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  CaretLeft,
  CheckCircle,
  Gavel,
  Robot,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react';
import { PageHeader } from '@/components/ui/page-header';
import { ClaimsInvestigation } from './claims-investigation';
import { ClaimEventMetadata, ClaimEvidenceLinks, formatClaimTime } from './claim-evidence-links';
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
import { Button, ButtonLink } from '@/components/ui/button';
import { settlementPresentation } from '@/lib/claims/settlement-presentation';
import { claimsFetch } from '@/lib/claims/claims-api';
import {
  CLAIMS_SIGN_IN_REQUIRED,
  claimsNetworkFailure,
  parseClaimCaseDetailPayload,
  readClaimsClientResponse,
  type ClaimListContext,
} from '@/lib/claims/claims-client-response';
import {
  claimTitle,
  dossierNextAction,
  freshnessLabel,
  type NextAction,
  type Tone,
} from '@/lib/claims/claim-presentation';
import type { ExaminerSummary } from './claims-investigation';

type DetailResponse = {
  source?: {
    mode: string;
    id?: string;
    digest?: string;
    checkpoint?: { sequence: number; createdAt: number; validUntil: number };
  };
  principalRole?: string;
  context?: ClaimListContext;
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
  const [examiner, setExaminer] = useState<ExaminerSummary>({ pending: false, latest: null });

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
      <div className="space-y-4">
        <BackLink />
        <div
          role="alert"
          className="max-w-2xl rounded-[var(--radius-lg)] border border-[#f3c4bf] bg-[var(--danger-soft)] px-5 py-4"
        >
          <p className="text-sm font-semibold text-[var(--danger)]">
            This claim could not be opened
          </p>
          <p className="mt-1 text-[0.8125rem] text-[var(--ink-secondary)]">{error}</p>
          {error === CLAIMS_SIGN_IN_REQUIRED ? (
            <p className="mt-1 text-[0.8125rem] text-[var(--ink-secondary)]">
              Sign in with the wallet that holds the policy, or a reviewer session. A failed sign-in
              is never shown as an empty claim.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void refresh()}>
              Retry claim
            </Button>
            <ButtonLink href="/claims" size="sm" variant="secondary">
              Back to claims
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div role="status" className="space-y-3">
          <span className="sr-only">Loading case…</span>
          <div className="h-9 w-72 max-w-full animate-pulse rounded-[var(--radius)] bg-[var(--surface-inset)]" />
          <div className="h-20 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-inset)]" />
          <div className="h-64 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-inset)]" />
        </div>
      </div>
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

  const ctx = data.context;
  const unanswered = ctx ? Math.max(0, ctx.openRequests - ctx.respondedRequests) : 0;
  const next = dossierNextAction({
    role: data.principalRole,
    status: c.status,
    unansweredRequests: unanswered,
    responsesAwaitingReview: ctx?.respondedRequests ?? 0,
    reviewBlocker: approvalBlocker,
    approvalReady: canReview && Boolean(approvalId) && !approvalBlocker,
    examinerPending: examiner.pending,
    fixtureBlocked,
    receipt,
    canPrepare,
  });
  const recordedDecision = (() => {
    if (!c.adjudicationBindingJson) return null;
    try {
      const binding = JSON.parse(c.adjudicationBindingJson) as {
        reviewer?: { actor?: string; contractualReview?: { rationale?: string } };
      };
      return binding.reviewer ?? null;
    } catch {
      return null;
    }
  })();
  const decisionEvent = [...data.timeline]
    .reverse()
    .find((e) => ['APPROVED', 'DENIED'].includes(e.toStatus) && e.fromStatus !== e.toStatus);
  const payableLabel = fixtureBlocked
    ? 'Illustrative payable'
    : receipt
      ? 'Reimbursed'
      : 'Proposed payable';
  const payableHint = fixtureBlocked
    ? 'Synthetic fixture. Not reimbursed.'
    : receipt
      ? 'Matched to a reconciled settlement receipt.'
      : 'Not paid. Requires a verified settlement receipt.';
  const title = claimTitle({ id: c.id, context: ctx });
  const verificationFresh = (id: string) => data.verificationStates[id];
  const latestVerification = data.verifications?.at(-1);

  return (
    <div className="claim-case min-w-0 [overflow-wrap:anywhere]">
      <BackLink />
      <PageHeader
        title={title}
        badges={
          <>
            <CaseStatusBadge status={c.status} confirmedReceipt={receipt} />
            {c.syntheticDemo ? <TruthBadge label="Synthetic fixture" tone="synthetic" /> : null}
          </>
        }
        description={[
          ctx?.product,
          ctx?.insured.position,
          data.linkedIncident
            ? `Incident observed ${formatClaimTime(data.linkedIncident.observedAt)}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={
          <>
            {isReviewer ? (
              <ButtonLink href="/claims/review" variant="secondary" size="sm">
                Review queue
              </ButtonLink>
            ) : null}
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => void refresh()}>
              <ArrowsClockwise
                size={14}
                aria-hidden="true"
                className={pending ? 'motion-safe:animate-spin' : ''}
              />
              Reload claim and findings
            </Button>
          </>
        }
      />

      <NextActionBand
        next={next}
        notice={notice}
        error={error}
        reviewNote={
          c.status === 'REVIEW' && c.reviewReasonCode
            ? (reviewHelp[c.reviewReasonCode] ?? null)
            : null
        }
      />

      {/* Compact outcome summary for small screens; the sidebar carries it on desktop. */}
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--line)] text-[0.8125rem] lg:hidden">
        {[
          ['Decision', decision],
          ['Settlement', settlement.label],
          [payableLabel, `${c.payable.usdc ?? '—'} USDC`],
          ['Open requests', ctx ? String(ctx.openRequests) : '—'],
        ].map(([k, v]) => (
          <div key={k} className="bg-[var(--surface)] px-3.5 py-2.5">
            <dt className="text-xs text-[var(--ink-muted)]">{k}</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-[var(--ink)]">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-6">
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
              onSummary={setExaminer}
              findings={
                <FindingsComparison
                  verification={latestVerification}
                  state={latestVerification ? verificationFresh(latestVerification.id) : undefined}
                  examiner={examiner.latest}
                  synthetic={c.syntheticDemo}
                />
              }
            />
          ) : (
            <>
              <FindingsComparison
                verification={latestVerification}
                state={latestVerification ? verificationFresh(latestVerification.id) : undefined}
                examiner={null}
                synthetic={false}
              />
              <DossierSection title="Timeline" id="claim-timeline">
                <ol className="timeline-rail px-5 py-4" aria-label="Case timeline">
                  {data.timeline.map((event) => (
                    <ClaimAuditEvent
                      key={event.id}
                      event={event}
                      receipt={receipt}
                      targets={targets}
                    />
                  ))}
                </ol>
              </DossierSection>
            </>
          )}

          <DossierSection
            id="claim-verifier-findings"
            title="Verification records"
            description={
              c.syntheticDemo
                ? 'Fixture consistency only. No real-world event or economic loss is independently authenticated.'
                : 'Submit the signed replay and recovery envelope through the independent verification API. Coverage remains a human determination.'
            }
            badges={
              <>
                <TruthBadge
                  label={c.syntheticDemo ? 'Fixture consistency' : 'Independent verifier'}
                  tone={c.syntheticDemo ? 'synthetic' : 'ok'}
                />
                <TruthBadge label="Not a human decision" tone="human" />
              </>
            }
          >
            <div className="space-y-3 px-5 py-4">
              {!data.verifications?.length && (
                <p className="text-[0.8125rem] text-[var(--ink-muted)]">
                  No verifier record yet. Verification runs on the current evidence and is recorded
                  here before any human decision.
                </p>
              )}
              {data.verifications?.map((v) => {
                const state = verificationFresh(v.id);
                return (
                  <article
                    key={v.id}
                    id={evidenceAnchor('verification', v.id)}
                    tabIndex={-1}
                    className="scroll-mt-24 rounded-[var(--radius)] border border-[var(--line)] p-3.5 text-[0.8125rem] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[var(--ink)]">
                        {v.executionStatus} · Evidence {v.evidenceSufficiency}
                      </p>
                      <TruthBadge
                        label={
                          state === 'stale'
                            ? 'Stale'
                            : state === 'failed'
                              ? 'Failed'
                              : state === 'current'
                                ? 'Current'
                                : 'Unknown freshness'
                        }
                        tone={state === 'current' ? 'ok' : state === 'stale' ? 'warn' : 'danger'}
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
                    <ClaimEventMetadata actor={v.actor} timestamp={v.createdAt} />
                    {v.findings.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[var(--ink-secondary)]">
                        {v.findings.map((finding, i) => (
                          <li key={i} className="flex gap-2">
                            <CheckCircle
                              size={14}
                              weight="bold"
                              aria-hidden="true"
                              className="mt-0.5 shrink-0 text-[var(--accent-signal)]"
                            />
                            {finding}
                          </li>
                        ))}
                      </ul>
                    )}
                    <details className="record-details">
                      <summary>Technical verification detail</summary>
                      <pre>
                        {[
                          `Verification ${v.id}`,
                          `Verifier ${v.verifierVersion ?? 'unavailable'}`,
                          c.syntheticDemo
                            ? `Fixture ${v.fixtureReference} · ${v.fixtureDigest}`
                            : null,
                          `Context ${v.contextDigest}`,
                          v.validUntilMs
                            ? `Valid until ${new Date(v.validUntilMs).toISOString()}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join('\n')}
                      </pre>
                    </details>
                  </article>
                );
              })}
              {c.syntheticDemo &&
                ['COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'].includes(c.status) &&
                ['claimant', 'reviewer'].includes(data.principalRole ?? '') && (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={verifyFixture}>
                    <ShieldCheck size={15} aria-hidden="true" />
                    Attach and verify synthetic fixture
                  </Button>
                )}
            </div>
          </DossierSection>

          <DossierSection
            id="claim-review-actions"
            title="Human decision"
            description={
              isReviewer
                ? 'Only a signed-in reviewer can record coverage. Examiner advice and verifier output never decide on their own.'
                : 'Coverage is decided by a human reviewer. Approval is not payment.'
            }
          >
            <div className="space-y-4 px-5 py-4">
              {decisionEvent ? (
                <div className="flex gap-3 rounded-[var(--radius)] bg-[var(--surface-inset)] p-3.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-white">
                    <Gavel size={15} weight="bold" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 text-[0.8125rem]">
                    <p className="font-semibold text-[var(--ink)]">
                      {decisionEvent.toStatus === 'APPROVED'
                        ? 'Coverage approved'
                        : 'Coverage denied'}
                    </p>
                    <ClaimEventMetadata
                      actor={decisionEvent.actor}
                      timestamp={decisionEvent.createdAt}
                    />
                    {recordedDecision?.contractualReview?.rationale ? (
                      <blockquote className="mt-2 border-l-2 border-[var(--line-emphasis)] pl-3 whitespace-pre-wrap text-[var(--ink-secondary)]">
                        {recordedDecision.contractualReview.rationale}
                      </blockquote>
                    ) : (
                      <p className="mt-1 text-[var(--ink-muted)]">
                        Reason code {decisionEvent.reasonCode}.
                      </p>
                    )}
                    {decisionEvent.toStatus === 'APPROVED' ? (
                      <p className="mt-2 font-medium text-[var(--live)]">
                        Approval is not reimbursement. {settlement.label}.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : !isReviewer ? (
                <p className="text-[0.8125rem] text-[var(--ink-muted)]">
                  No decision yet. {decision}.
                </p>
              ) : null}

              {isReviewer && (
                <>
                  <p className="text-[0.8125rem] text-[var(--ink-secondary)]">{reviewActionHelp}</p>
                  {approvalId && (
                    <ClaimEvidenceLinks
                      references={[approvalId]}
                      targets={targets}
                      kind="verification"
                      label="Verification for human review"
                    />
                  )}
                  {canReview && (
                    <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] p-4">
                      <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
                        {c.syntheticDemo
                          ? 'Catalog gross economic loss: 1.50 USDC after extinguished debt. Scenario recoveries and prior compensation: zero. Policy deductible and limits still apply.'
                          : independentLoss
                            ? `Verified gross loss ${asUsdc(independentLoss.grossLossMicros)} USDC, recoveries ${asUsdc(independentLoss.recoveriesMicros)} USDC, prior compensation ${asUsdc(independentLoss.priorCompensationMicros)} USDC. Policy limits and deductible apply.`
                            : 'A current independent verification is required for approval.'}
                      </p>
                      <label className="flex min-h-10 items-start gap-2.5 text-[0.8125rem] text-[var(--ink)]">
                        <input
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                          type="checkbox"
                          checked={reviewConfirmed}
                          onChange={(e) => setReviewConfirmed(e.target.checked)}
                        />
                        {c.syntheticDemo
                          ? 'I reviewed event applicability and resolved all policy exclusions for this synthetic scenario.'
                          : 'I reviewed event applicability and resolved all policy exclusions for the verified incident.'}
                      </label>
                      <label className="block">
                        <span className="field-label">Contractual review rationale</span>
                        <textarea
                          value={reviewRationale}
                          onChange={(e) => setReviewRationale(e.target.value)}
                          maxLength={4000}
                          rows={3}
                          className="field-control mt-1.5 block w-full"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          className="active:scale-100"
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
                            className="active:scale-100"
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
                          className="active:scale-100"
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
                    </div>
                  )}
                  {data.principalRole === 'authority' && (
                    <div className="space-y-2 rounded-[var(--radius)] border border-[var(--line)] p-4">
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        Settlement preparation
                      </p>
                      {!canPrepare && (
                        <p className="text-xs text-[var(--ink-muted)]">
                          {data.settlementVerificationBlocker
                            ? settlementBlockerMessage(data.settlementVerificationBlocker)
                            : settlement.action}
                        </p>
                      )}
                      <Button
                        size="sm"
                        className="active:scale-100"
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
                    </div>
                  )}
                </>
              )}
            </div>
          </DossierSection>
        </div>

        <aside
          aria-label="Claim summary"
          className="mt-6 space-y-4 lg:sticky lg:top-[calc(var(--topbar-h)+1.25rem)] lg:mt-0"
        >
          <section
            aria-labelledby="claim-outcome"
            className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]"
          >
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 id="claim-outcome" className="text-xs font-medium text-[var(--ink-muted)]">
                Financial outcome
              </h2>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">{payableLabel}</p>
              <p className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] tabular-nums text-[var(--ink)]">
                {c.payable.usdc ?? '—'}{' '}
                <span className="text-base font-medium text-[var(--ink-muted)]">USDC</span>
              </p>
              <p className="mt-1 text-xs text-[var(--ink-secondary)]">{payableHint}</p>
            </div>
            <dl className="facts px-5 py-4">
              <dt>Decision</dt>
              <dd>{decision}</dd>
              <dt>Settlement</dt>
              <dd>{settlement.label}</dd>
              <dt>Gross loss{c.syntheticDemo ? ' (synthetic)' : ''}</dt>
              <dd>{c.verifiedLoss.usdc ?? '—'} USDC</dd>
              <dt>Deductible</dt>
              <dd>{c.deductible?.usdc ?? '—'} USDC</dd>
              <dt>Coverage limit</dt>
              <dd>{c.lossCap?.usdc ?? '—'} USDC</dd>
              <dt>Recoveries</dt>
              <dd>{c.recoveries.usdc ? `${c.recoveries.usdc} USDC` : 'Unknown'}</dd>
              <dt>Evidence</dt>
              <dd>{c.evidenceAuthenticity.replaceAll('_', ' ')}</dd>
            </dl>
            <div className="border-t border-[var(--line)] px-5 py-3.5 text-xs text-[var(--ink-secondary)]">
              <p className="flex gap-2">
                <WarningCircle
                  size={14}
                  aria-hidden="true"
                  className="mt-px shrink-0 text-[var(--ink-muted)]"
                />
                <span>
                  {data.settlementVerificationBlocker
                    ? settlementBlockerMessage(data.settlementVerificationBlocker)
                    : settlement.action}
                </span>
              </p>
              {receipt ? (
                <a
                  className="mt-2 inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                  href={`https://explorer.testnet.arc.io/tx/${receipt}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  View verified settlement receipt
                  <ArrowSquareOut size={12} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </section>

          <section
            aria-labelledby="claim-records"
            className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]"
          >
            <h2
              id="claim-records"
              className="border-b border-[var(--line)] px-5 py-3 text-xs font-medium text-[var(--ink-muted)]"
            >
              Linked records
            </h2>
            <dl
              id={evidenceAnchor('case', c.id)}
              tabIndex={-1}
              className="scroll-mt-24 divide-y divide-[var(--line)] text-[0.8125rem]"
            >
              <RecordRow id={evidenceAnchor('policy', c.policyId)} label="Policy">
                <Link
                  className="font-mono text-xs text-[var(--accent)] hover:underline"
                  href={`/policies/${c.policyId}`}
                >
                  {c.policyId}
                </Link>
                {ctx?.product ? (
                  <span className="block text-xs text-[var(--ink-muted)]">{ctx.product}</span>
                ) : null}
              </RecordRow>
              <RecordRow label="Claim">
                <span className="font-mono text-xs">{c.id}</span>
              </RecordRow>
              <RecordRow
                id={
                  data.linkedIncident
                    ? evidenceAnchor('incident', data.linkedIncident.id)
                    : undefined
                }
                label="Incident"
              >
                {data.linkedIncident ? (
                  <>
                    <span className="block font-mono text-xs">
                      {data.linkedIncident.observedEventRef ?? data.linkedIncident.id}
                    </span>
                    <time
                      className="block text-xs text-[var(--ink-muted)]"
                      dateTime={data.linkedIncident.observedAt}
                    >
                      Observed {formatClaimTime(data.linkedIncident.observedAt)}
                    </time>
                  </>
                ) : (
                  <span className="text-[var(--ink-muted)]">Not recorded</span>
                )}
              </RecordRow>
              <RecordRow label="Insured agent">
                <span>{ctx?.insured.label ?? '—'}</span>
                <span className="block font-mono text-xs text-[var(--ink-muted)]">
                  {c.exposureId}
                </span>
              </RecordRow>
              <RecordRow label="Beneficiary">
                <span className="font-mono text-xs">{c.payoutTo ?? '—'}</span>
              </RecordRow>
            </dl>
          </section>

          <section
            aria-labelledby="claim-manifests"
            className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]"
          >
            <h2
              id="claim-manifests"
              className="border-b border-[var(--line)] px-5 py-3 text-xs font-medium text-[var(--ink-muted)]"
            >
              Evidence manifests
            </h2>
            {data.evidenceManifests.length === 0 ? (
              <p className="px-5 py-3.5 text-[0.8125rem] text-[var(--ink-muted)]">
                No manifests attached.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {data.evidenceManifests.map((m) => (
                  <li
                    key={m.id}
                    id={evidenceAnchor('manifest', m.id)}
                    tabIndex={-1}
                    className="scroll-mt-24 px-5 py-3 text-xs focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                  >
                    <p className="text-[0.8125rem] font-medium text-[var(--ink)]">{m.source}</p>
                    <p className="text-[var(--ink-muted)]">
                      {m.syntheticFixture ? 'Synthetic fixture' : 'Recorded evidence'} ·{' '}
                      {m.sourceReliability.replaceAll('_', ' ')} · {formatClaimTime(m.createdAt)}
                    </p>
                    <details className="record-details">
                      <summary>Digest and chain</summary>
                      <pre>
                        {[m.rawEvidenceDigest, m.transactionHash].filter(Boolean).join('\n')}
                      </pre>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-xs">
            <summary className="cursor-pointer text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]">
              Technical identifiers
            </summary>
            <dl className="mt-3 space-y-2.5">
              <div>
                <dt className="text-[var(--ink-muted)]">Evidence root</dt>
                <dd className="font-mono break-all">{c.evidenceRoot ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-muted)]">Loss key</dt>
                <dd className="font-mono break-all">{c.lossKey ?? '—'}</dd>
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
              {data.source?.mode === 'fixture' ? (
                <div>
                  <dt className="text-[var(--ink-muted)]">Fixture source</dt>
                  <dd className="font-mono break-all">{data.source.id}</dd>
                  <dd className="mt-0.5 text-[var(--ink-muted)]">
                    Checkpoint {data.source.checkpoint?.sequence}
                    {data.source.checkpoint
                      ? `, expires ${new Date(data.source.checkpoint.validUntil * 1000).toISOString()}`
                      : ''}
                    . Not Arc confirmations.
                  </dd>
                </div>
              ) : null}
            </dl>
          </details>
          {c.labels.synthetic ? (
            <p className="px-1 text-xs text-[var(--synthetic)]">{c.labels.synthetic}</p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/claims"
      className="mb-3 inline-flex min-h-9 items-center gap-1 text-[0.8125rem] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
    >
      <CaretLeft size={13} weight="bold" aria-hidden="true" />
      Claims
    </Link>
  );
}

const bandTone: Record<Tone, string> = {
  neutral: 'border-l-[var(--line-emphasis)]',
  ok: 'border-l-[var(--ok)]',
  warn: 'border-l-[var(--warn)]',
  error: 'border-l-[var(--danger)]',
  pending: 'border-l-[var(--pending)]',
  live: 'border-l-[var(--accent-signal)]',
  synthetic: 'border-l-[var(--synthetic)]',
};

function NextActionBand({
  next,
  notice,
  error,
  reviewNote,
}: {
  next: NextAction;
  notice: string | null;
  error: string | null;
  reviewNote: string | null;
}) {
  return (
    <section
      aria-label="Next action"
      className={`flex flex-col gap-3 rounded-[var(--radius-lg)] border border-l-[3px] border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:justify-between ${bandTone[next.tone]}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--ink-muted)]">Next step</p>
        <p className="mt-0.5 text-[0.9375rem] font-semibold text-[var(--ink)]">{next.title}</p>
        <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-secondary)]">{next.detail}</p>
        {reviewNote ? (
          <p className="mt-1 text-[0.8125rem] text-[var(--ink-secondary)]">{reviewNote}</p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-1.5 text-[0.8125rem] font-medium text-[var(--live)]">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-1.5 text-[0.8125rem] font-medium text-[var(--danger)]">
            {error}
          </p>
        ) : null}
      </div>
      {next.anchor ? (
        <a
          href={`#${next.anchor}`}
          className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--line-strong)] px-3 text-[0.8125rem] font-semibold text-[var(--ink)] hover:bg-[var(--surface-inset)]"
        >
          Go to {next.anchor === 'outstanding-requests' ? 'requests' : 'decision'}
        </a>
      ) : null}
    </section>
  );
}

function DossierSection({
  id,
  title,
  description,
  badges,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  badges?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className="scroll-mt-24 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]"
    >
      <header className="border-b border-[var(--line)] px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id={id ? `${id}-title` : undefined}
            className="text-sm font-semibold text-[var(--ink)]"
          >
            {title}
          </h2>
          {badges}
        </div>
        {description ? (
          <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-muted)]">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function RecordRow({ id, label, children }: { id?: string; label: string; children: ReactNode }) {
  return (
    <div
      id={id}
      tabIndex={id ? -1 : undefined}
      className="scroll-mt-24 px-5 py-2.5 focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
    >
      <dt className="text-xs text-[var(--ink-muted)]">{label}</dt>
      <dd className="mt-0.5 min-w-0 break-all text-[var(--ink)]">{children}</dd>
    </div>
  );
}

/** Deterministic verifier output beside the examiner's advisory reading, never merged. */
function FindingsComparison({
  verification,
  state,
  examiner,
  synthetic,
}: {
  verification?: NonNullable<DetailResponse['verifications']>[number];
  state?: VerificationState;
  examiner: ExaminerSummary['latest'];
  synthetic: boolean;
}) {
  const fresh = freshnessLabel(
    verification
      ? {
          state: state ?? 'failed',
          at: verification.createdAt ?? null,
          validUntilMs: verification.validUntilMs ?? null,
          records: 1,
        }
      : undefined,
    Date.now(),
  );
  return (
    <section
      aria-labelledby="claim-findings"
      className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]"
    >
      <h2 id="claim-findings" className="sr-only">
        Findings
      </h2>
      <div className="grid md:grid-cols-2">
        <div className="border-b border-[var(--line)] px-5 py-4 md:border-r md:border-b-0">
          <p className="flex items-center gap-2 text-xs font-medium text-[var(--ink-muted)]">
            <ShieldCheck
              size={14}
              weight="bold"
              aria-hidden="true"
              className="text-[var(--accent-signal)]"
            />
            Verified by the server
          </p>
          {verification ? (
            <>
              <p className="mt-2 text-sm font-semibold text-[var(--ink)]">
                {verification.executionStatus === 'completed'
                  ? `Evidence ${verification.evidenceSufficiency}`
                  : `Verification ${verification.executionStatus}`}
              </p>
              <p className="mt-0.5 text-xs">
                <span
                  className={
                    fresh.tone === 'ok'
                      ? 'text-[var(--ok)]'
                      : fresh.tone === 'warn'
                        ? 'text-[var(--warn)]'
                        : 'text-[var(--danger)]'
                  }
                >
                  {fresh.label}
                </span>
                <span className="text-[var(--ink-muted)]">
                  {' · '}
                  {verification.independentlyAuthenticated
                    ? 'independently authenticated'
                    : synthetic
                      ? 'fixture consistency only'
                      : 'not independently authenticated'}
                </span>
              </p>
              <a
                href={`#${evidenceAnchor('verification', verification.id)}`}
                className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Open verification record
              </a>
            </>
          ) : (
            <p className="mt-2 text-[0.8125rem] text-[var(--ink-muted)]">
              No verification has run on this claim yet.
            </p>
          )}
        </div>
        <div className="bg-[color-mix(in_srgb,var(--ai-soft)_45%,var(--surface))] px-5 py-4">
          <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--ink-muted)]">
            <Robot size={14} weight="bold" aria-hidden="true" className="text-[var(--ai)]" />
            Examiner advice
            <TruthBadge
              label="Advisory only"
              tone="ai"
              title="Never authorizes payout or any action"
            />
          </p>
          {examiner ? (
            <>
              <p className="mt-2 line-clamp-3 text-[0.8125rem] text-[var(--ink)]">
                {examiner.summary}
              </p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                {examiner.execution}
                {examiner.recommendation
                  ? ` · suggests ${examiner.recommendation.replaceAll('_', ' ')}`
                  : ''}
                {examiner.stale ? ' · earlier dossier' : ''}
              </p>
              <a
                href={`#${examiner.anchor}`}
                className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Read the full assessment
              </a>
            </>
          ) : (
            <p className="mt-2 text-[0.8125rem] text-[var(--ink-muted)]">
              {synthetic
                ? 'No examiner assessment recorded yet.'
                : 'No examiner assessment is shown for this claim.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
