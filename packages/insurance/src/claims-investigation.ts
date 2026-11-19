import { z } from 'zod';
import type {
  InsuranceRepository,
  InvestigationEntry,
  InvestigationKind,
} from '@arcuex/persistence';
import { ValidationError } from '@arcuex/domain';
import { assertClaimsRole, claimsActorId, type ClaimsPrincipal } from './claims-auth';
import {
  assertClaimsCaseAccess,
  attachEvidenceManifest,
  getClaimsCase,
  escalateClaimsInvestigation,
} from './claims-case-service';
import {
  CLAIM_FIXTURE,
  claimVerificationContext,
  verificationDigest,
  type PersistedClaimVerification,
} from './claim-verification';
import { COVERAGE_RELATIONS, isWithinClaimWindow, readClaimChronology } from './claim-chronology';

const text = z.string().trim().min(1).max(4000),
  uuid = z.string().uuid();
export const CLAIMS_EXAMINER_PROMPT = 'claims-dossier-v3';
const citationId = z.string().min(1).max(128);
export const ExaminerAnalysisSchema = z
  .object({
    summary: text,
    chronology: z.enum(COVERAGE_RELATIONS),
    verifiedFindings: z.array(uuid).max(8),
    claimantAssertions: z.array(text).max(8),
    gaps: z.array(text).max(8),
    proposedRequests: z
      .array(z.object({ question: text, citations: z.array(citationId).min(1).max(8) }).strict())
      .max(8),
    recommendation: z.enum(['request_proof', 'escalate', 'human_review']),
    citations: z.array(citationId).min(1).max(20),
  })
  .strict()
  .refine(
    (analysis) =>
      analysis.recommendation !== 'request_proof' || analysis.proposedRequests.length > 0,
    {
      message: 'A proof recommendation requires an evidence-linked request',
    },
  );
export type ExaminerAnalysis = z.infer<typeof ExaminerAnalysisSchema>;
const key = z.string().min(8).max(120);
const message = { requestKey: key, text };
const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('cancel_examiner'), ...message, requestId: uuid }).strict(),
  z.object({ action: z.literal('message'), ...message }).strict(),
  z.object({ action: z.literal('request_proof'), ...message }).strict(),
  z
    .object({
      action: z.literal('adopt_examiner_request'),
      requestKey: key,
      reportId: uuid,
      proposalIndex: z.number().int().min(0).max(7),
    })
    .strict(),
  z
    .object({
      action: z.literal('submit_proof'),
      requestKey: key,
      requestId: uuid.nullable(),
      filename: z.string().trim().min(1).max(120),
      content: z.string().min(1).max(16000),
      contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      declaredSource: z.string().trim().min(1).max(240),
    })
    .strict(),
  z
    .object({
      action: z.literal('resolve_request'),
      ...message,
      requestId: uuid,
      submissionId: uuid,
      resolution: z.enum(['accepted', 'withdrawn']),
    })
    .strict(),
  z.object({ action: z.literal('escalate'), ...message }).strict(),
  z.object({ action: z.literal('request_examiner'), requestKey: key }).strict(),
]);
const safeJson = (value: unknown) =>
  JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
const body = (entry: InvestigationEntry) =>
  JSON.parse(entry.payloadJson) as Record<string, unknown>;
function accessible(repo: InsuranceRepository, caseId: string, p: ClaimsPrincipal, open = false) {
  assertClaimsRole(p, ['claimant', 'reviewer', 'authority', 'system']);
  const c = getClaimsCase(repo, caseId);
  if (!c) throw new ValidationError('Claim not found');
  assertClaimsCaseAccess(repo, p, c);
  if (open && !['COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'].includes(c.status))
    throw new ValidationError('Investigation is closed; financial decision remains frozen');
  return c;
}
export function outstandingProofRequests(repo: InsuranceRepository, caseId: string) {
  const entries = repo.listInvestigationEntries(caseId);
  return entries.filter(
    (e) =>
      e.kind === 'proof_request' &&
      !entries.some((r) => r.kind === 'request_resolution' && body(r).requestId === e.id),
  );
}
export function investigationApprovalBlocker(
  repo: InsuranceRepository,
  caseId: string,
): string | null {
  if (outstandingProofRequests(repo, caseId).length) return 'OUTSTANDING_EVIDENCE_REQUESTS';
  const proofs = repo.listInvestigationEntries(caseId).filter((e) => e.kind === 'proof_submission');
  if (proofs.some((e) => body(e).sourceClassification !== 'synthetic_fixture'))
    return 'UNSUPPORTED_EVIDENCE_REQUIRES_REVIEW';
  return null;
}
function examinerAuthorityContext(
  repo: InsuranceRepository,
  c: NonNullable<ReturnType<typeof getClaimsCase>>,
  timeline: ReturnType<InsuranceRepository['listClaimsCaseEvents']>,
) {
  const policy = repo.getProcurementPolicy(c.policyId);
  const agent = policy ? repo.getProcurementAgent(policy.terms.agentId) : null;
  const policyContext = repo.claimsPolicyContext(c.policyId);
  const submitted = timeline.find((e) => e.toStatus === 'SUBMITTED');
  const wallet = c.claimantRef.toLowerCase();
  const ownerVerified =
    policyContext?.owner?.toLowerCase() === wallet && submitted?.actor === `claimant:${wallet}`;
  const agentVerified =
    !!agent &&
    !!policy &&
    agent.id === c.exposureId &&
    agent.exposure.position === policy.terms.exposure?.position &&
    agent.exposure.protocol === policy.terms.exposure?.protocol &&
    agent.exposure.chainId === policy.terms.exposure?.chainId &&
    agent.owner.toLowerCase() === policy.terms.owner.toLowerCase() &&
    agent.signer.toLowerCase() === wallet &&
    submitted?.actor === `claimant:${wallet}/agent:${agent.id}`;
  const delegationId = policy?.delegationId;
  const context =
    policy && delegationId ? repo.getProcurementDelegationEvidence(c.policyId, delegationId) : null;
  const delegation = context?.delegation;
  const acceptance = context?.acceptance;
  const revocation = context?.revocation;
  const delegatedBindingVerified =
    !!policy &&
    !!delegation &&
    !!acceptance &&
    delegation.id === delegationId &&
    delegation.agentId === policy.terms.agentId &&
    agent?.owner === delegation.owner &&
    agent.signer === policy.payer &&
    delegation.owner === policy.terms.owner &&
    delegation.beneficiary === policy.terms.beneficiary &&
    delegation.position === policy.terms.exposure.position &&
    delegation.productCode === policy.terms.productCode &&
    acceptance.actor === policy.payer &&
    acceptance.digest === policy.digest &&
    Number.isSafeInteger(acceptance.at) &&
    Number.isSafeInteger(delegation.expiresAt) &&
    acceptance.at < delegation.expiresAt &&
    (!revocation || (Number.isSafeInteger(revocation.at) && revocation.at > acceptance.at)) &&
    /^[0-9]+$/.test(delegation.premiumCapMicros) &&
    /^[0-9]+$/.test(delegation.limitCapMicros) &&
    /^[0-9]+$/.test(policy.terms.premiumMicros) &&
    /^[0-9]+$/.test(policy.terms.limitMicros) &&
    BigInt(policy.terms.premiumMicros) <= BigInt(delegation.premiumCapMicros) &&
    BigInt(policy.terms.limitMicros) <= BigInt(delegation.limitCapMicros);
  const selfProcured =
    (!!policy && !delegationId && policy.payer === policy.terms.owner) ||
    policyContext?.source === 'legacy';
  return {
    claimant: {
      role: 'claimant',
      basis: agentVerified
        ? 'authenticated_policy_agent'
        : ownerVerified
          ? 'authenticated_policy_owner'
          : 'unresolved',
      wallet: agentVerified || ownerVerified ? wallet : null,
      agentId: agentVerified ? agent.id : null,
      intakeEventId: submitted?.id ?? null,
      authenticationBasis: 'Recorded server-authenticated intake; no active session is asserted.',
      evidenceSubmission:
        agentVerified || ownerVerified ? 'authorized_for_this_claim_while_open' : 'unresolved',
    },
    policyDelegation: delegatedBindingVerified
      ? {
          status: 'verified_at_policy_acceptance',
          scope: delegation,
          acceptedAt: acceptance.at,
          revokedAt: revocation?.at ?? null,
        }
      : { status: selfProcured ? 'owner_procured_no_delegation' : 'unresolved' },
    requiresHumanReview:
      !(agentVerified || ownerVerified) || !(delegatedBindingVerified || selfProcured),
    limits: {
      claimant:
        'May submit proof and request reassessment within authenticated policy scope; cannot adopt requests, adjudicate or settle.',
      reviewer:
        'Human may request and resolve proof, escalate and adjudicate under existing gates; resolving proof is not independent verification.',
      authority:
        'Separate authenticated authority is required for settlement operations; fixture proof provides no payment authority.',
      examiner: 'Advisory only. Cannot confer permissions or perform any of these operations.',
      delegation:
        'Historical policy procurement scope only; it does not grant claims review or settlement permissions.',
    },
  };
}

/** Full append-only dossier; examiner entries never affect the evidence/verifier context themselves. */
export function claimsDossier(repo: InsuranceRepository, caseId: string, p: ClaimsPrincipal) {
  const c = accessible(repo, caseId, p),
    entries = repo.listInvestigationEntries(caseId);
  const verifications = repo
    .listClaimVerifications(caseId)
    .map((r) => JSON.parse(r.recordJson) as PersistedClaimVerification);
  const timeline = repo.listClaimsCaseEvents(caseId);
  const authority = examinerAuthorityContext(repo, c, timeline);
  const outstanding = outstandingProofRequests(repo, caseId);
  const context = claimVerificationContext(repo, caseId);
  const latest = verifications.filter((v) => v.contextDigest === context);
  const chronology = readClaimChronology(repo, c);
  const inWindow = isWithinClaimWindow(chronology, Date.now());
  const verifiedFindingIds = inWindow
    ? latest
        .filter((v) => v.executionStatus === 'completed' && v.evidenceSufficiency === 'sufficient')
        .map((v) => v.id)
    : [];
  const blockers: string[] = [];
  if (!inWindow || !chronology.waitingPeriodSatisfied)
    blockers.push('COVERAGE_CHRONOLOGY_REQUIRES_REVIEW');
  if (outstanding.length) blockers.push('OUTSTANDING_EVIDENCE_REQUESTS');
  const authorityReview = authority.requiresHumanReview
    ? ['CLAIMANT_OR_DELEGATION_AUTHORITY_UNRESOLVED']
    : [];
  if (!latest.length) blockers.push('FRESH_PERSISTED_VERIFICATION_REQUIRED');
  if (
    latest.some((v) => v.executionStatus !== 'completed' || v.evidenceSufficiency !== 'sufficient')
  )
    blockers.push('UNRESOLVED_VERIFICATION_FINDINGS');
  const unsupported = investigationApprovalBlocker(repo, caseId);
  if (unsupported && !blockers.includes(unsupported)) blockers.push(unsupported);
  const incident = c.incidentId ? repo.getIncident(c.incidentId) : null;
  const manifests = repo.listEvidenceManifests(caseId);
  const evidenceEntries = entries
    .filter((entry) => !entry.kind.startsWith('examiner_'))
    .map(({ id, kind, actor, createdAt, payloadJson }) => {
      const payload = JSON.parse(payloadJson) as Record<string, unknown>;
      delete payload.input;
      return { id, kind, actor, createdAt, payload };
    });
  const citationIds = [
    ...new Set([
      caseId,
      c.policyId,
      ...(incident ? [incident.id] : []),
      ...timeline.map((entry) => entry.id),
      ...evidenceEntries.map((entry) => entry.id),
      ...manifests.map((manifest) => manifest.id),
      ...verifications.map((verification) => verification.id),
    ]),
  ];
  const dossier = JSON.parse(
    safeJson({
      case: c,
      chronology,
      citationIds,
      authority,
      authorityReview,
      timeline: timeline.map(({ id, fromStatus, toStatus, reasonCode, createdAt }) => ({
        id,
        fromStatus,
        toStatus,
        reasonCode,
        createdAt,
      })),
      outstandingRequestIds: outstanding.map((entry) => entry.id),
      acceptedProof: entries
        .filter(
          (entry) => entry.kind === 'request_resolution' && body(entry).resolution === 'accepted',
        )
        .map((entry) => ({ resolutionId: entry.id, submissionId: body(entry).submissionId })),
      policy: repo.claimsPolicyContext(c.policyId),
      terms: repo.getProcurementPolicy(c.policyId)?.terms ?? repo.getPolicy(c.policyId)?.terms,
      incident,
      incidentPolicyLink: {
        policyId: c.policyId,
        exposureId: c.exposureId,
        incidentId: c.incidentId,
        recorded:
          !!c.incidentId && repo.incidentMatchesPolicy(c.incidentId, c.policyId, c.exposureId),
        limitation:
          'Server-recorded linkage is independent of any assertion about incident causation.',
      },
      manifests,
      entries: evidenceEntries,
      verifications,
      currentVerificationIds: latest.map((v) => v.id),
      verifiedFindingIds,
      lossAndRecovery: {
        caseFigures: {
          verifiedLossMicros: c.verifiedLossMicros,
          recoveriesMicros: c.recoveriesMicros,
          priorCompensationMicros: c.priorCompensationMicros,
          deductibleMicros: c.deductibleMicros,
          remainingLimitMicros: c.remainingLimitMicros,
        },
        basis: c.syntheticDemo ? 'synthetic_scenario_only' : 'case_record_requires_human_review',
        limitation:
          'Null figures are unknown. A verifier scenario and missing recovery entries cannot establish independent loss or zero recovery.',
      },
      verificationContext: context,
      reviewBlockers: blockers,
      financialNotice:
        'AI is advisory, not independent proof or payment authority. Fixture chain state is synthetic. Approval is not reimbursement.',
    }),
  );
  return { dossier, digest: verificationDigest(safeJson(dossier)) };
}
export function getClaimsInvestigation(
  repo: InsuranceRepository,
  caseId: string,
  p: ClaimsPrincipal,
) {
  const { dossier, digest } = claimsDossier(repo, caseId, p),
    entries = repo.listInvestigationEntries(caseId);
  return {
    dossierDigest: digest,
    chronology: dossier.chronology as ReturnType<typeof readClaimChronology>,
    reviewBlockers: dossier.reviewBlockers as string[],
    authorityReview: dossier.authorityReview as string[],
    outstandingRequests: outstandingProofRequests(repo, caseId).map((e) => e.id),
    entries: entries.map((e) => ({
      ...e,
      payload: body(e),
      proofVerificationStatus:
        e.kind === 'proof_submission' &&
        body(e).sourceClassification === 'synthetic_fixture' &&
        dossier.verifiedFindingIds.length > 0
          ? 'fixture_consistency_only'
          : 'unverified',
      stale: e.kind === 'examiner_report' && body(e).dossierDigest !== digest,
    })),
    sourceNotice:
      'Evidence hashes prove recorded bytes and attribution, not truth. AI analysis is never independent verification.',
  };
}
export function appendClaimsInvestigation(
  repo: InsuranceRepository,
  caseId: string,
  input: unknown,
  p: ClaimsPrincipal,
) {
  const value = Action.parse(input);
  return repo.runInTransaction(() => {
    const c = accessible(repo, caseId, p, true),
      entries = repo.listInvestigationEntries(caseId);
    if (!c.syntheticDemo && repo.getProcurementPolicy(c.policyId)?.terms.synthetic === false)
      throw new ValidationError(
        'Independent pilot uses the dedicated verification and human review routes',
      );
    let kind: InvestigationKind, payload: Record<string, unknown>;
    const append = () =>
      repo.appendInvestigationEntry({
        caseId,
        kind,
        actor: claimsActorId(p),
        requestKey: value.requestKey,
        payload,
      });
    // An exact replay is permitted even if its request was subsequently resolved.
    const previous = entries.find(
      (e) => e.actor === claimsActorId(p) && e.requestKey === value.requestKey,
    );
    if (previous) {
      const original = body(previous).input;
      if (safeJson(original) !== safeJson(value))
        throw new ValidationError('Investigation idempotency conflict');
      return previous;
    }
    if (
      value.action === 'request_proof' ||
      value.action === 'adopt_examiner_request' ||
      value.action === 'resolve_request' ||
      value.action === 'escalate' ||
      value.action === 'cancel_examiner'
    )
      assertClaimsRole(p, ['reviewer', 'authority']);
    if (value.action === 'submit_proof') {
      assertClaimsRole(p, ['claimant', 'reviewer']);
      if (
        Buffer.byteLength(value.content, 'utf8') > 16000 ||
        verificationDigest(value.content) !== value.contentHash
      )
        throw new ValidationError('Evidence content hash mismatch or size exceeded');
      if (
        value.requestId &&
        !outstandingProofRequests(repo, caseId).some((e) => e.id === value.requestId)
      )
        throw new ValidationError('Evidence request must be open and belong to this claim');
      const classification =
        c.syntheticDemo && value.content === CLAIM_FIXTURE.raw
          ? 'synthetic_fixture'
          : p.role === 'claimant'
            ? 'claimant_assertion'
            : 'reviewer_observation';
      // Always unverified on submission; only the existing persisted verifier can establish consistency.
      kind = 'proof_submission';
      payload = {
        input: value,
        requestId: value.requestId,
        filename: value.filename,
        content: value.content,
        contentHash: value.contentHash,
        declaredSource: value.declaredSource,
        sourceClassification: classification,
        verificationStatus: 'unverified',
        submitter: {
          actor: claimsActorId(p),
          wallet: p.walletAddress ?? null,
          agentId: p.agentId ?? null,
        },
      };
      attachEvidenceManifest(
        repo,
        {
          caseId,
          source: 'investigation-proof',
          provenance: value.declaredSource,
          rawEvidence: value.content,
          verificationMethod:
            classification === 'synthetic_fixture'
              ? 'fixture_consistency'
              : 'unverified_submission',
          sourceReliability: classification === 'synthetic_fixture' ? 'demo_only' : 'untrusted',
          syntheticFixture: classification === 'synthetic_fixture',
        },
        p,
      );
    } else if (value.action === 'adopt_examiner_request') {
      const report = entries.find(
        (entry) => entry.id === value.reportId && entry.kind === 'examiner_report',
      );
      const recorded = report && body(report);
      if (!recorded || recorded.dossierDigest !== claimsDossier(repo, caseId, p).digest)
        throw new ValidationError('Examiner report is missing or stale; request reassessment');
      const proposal = ExaminerAnalysisSchema.parse(recorded.analysis).proposedRequests[
        value.proposalIndex
      ];
      if (!proposal) throw new ValidationError('Examiner proposal not found');
      kind = 'proof_request';
      payload = {
        input: value,
        text: proposal.question,
        citations: proposal.citations,
        reportId: value.reportId,
      };
    } else if (value.action === 'resolve_request') {
      if (!outstandingProofRequests(repo, caseId).some((e) => e.id === value.requestId))
        throw new ValidationError('Request not open on this claim');
      const submission = entries.find(
        (e) =>
          e.id === value.submissionId &&
          e.kind === 'proof_submission' &&
          body(e).requestId === value.requestId,
      );
      if (!submission) throw new ValidationError('Resolution requires linked submitted proof');
      kind = 'request_resolution';
      payload = {
        input: value,
        requestId: value.requestId,
        submissionId: value.submissionId,
        resolution: value.resolution,
        text: value.text,
      };
    } else if (value.action === 'cancel_examiner') {
      const request = entries.find(
        (e) => e.id === value.requestId && e.kind === 'examiner_request',
      );
      if (
        !request ||
        entries.some(
          (e) =>
            ['examiner_report', 'examiner_failure'].includes(e.kind) &&
            body(e).requestId === request.id,
        )
      )
        throw new ValidationError('No pending examiner request');
      kind = 'examiner_failure';
      payload = {
        input: value,
        requestId: request.id,
        text: value.text,
        reason: 'human_cancelled',
      };
    } else if (value.action === 'request_examiner') {
      assertClaimsRole(p, ['claimant', 'reviewer', 'authority']);
      const requests = entries.filter((e) => e.kind === 'examiner_request');
      if (requests.length >= 6)
        throw new ValidationError('Examiner six-call claim budget exhausted');
      if (
        requests.some(
          (e) =>
            !entries.some(
              (r) =>
                ['examiner_report', 'examiner_failure'].includes(r.kind) &&
                body(r).requestId === e.id,
            ),
        )
      )
        throw new ValidationError('An examiner request is already pending');
      kind = 'examiner_request';
      payload = { input: value, dossierDigest: claimsDossier(repo, caseId, p).digest };
    } else {
      kind =
        value.action === 'request_proof'
          ? 'proof_request'
          : value.action === 'escalate'
            ? 'escalation'
            : 'message';
      payload = { input: value, text: value.text };
    }
    if (value.action === 'escalate') escalateClaimsInvestigation(repo, caseId, p);
    const entry = append();
    repo.insertAudit('claims_case', caseId, `investigation.${kind}`, {
      entryId: entry.id,
      recordHash: entry.recordHash,
    });
    return entry;
  });
}
/** Worker capability: reserve exactly one provider attempt. The model gets no repository or mutation tools. */
export function beginClaimsExamination(
  repo: InsuranceRepository,
  caseId: string,
  requestId: string,
  p: ClaimsPrincipal,
) {
  assertClaimsRole(p, ['system']);
  return repo.runInTransaction(() => {
    accessible(repo, caseId, p, true);
    const entries = repo.listInvestigationEntries(caseId);
    if (
      !entries.some((e) => e.id === requestId && e.kind === 'examiner_request') ||
      entries.some(
        (e) =>
          body(e).requestId === requestId &&
          ['examiner_started', 'examiner_report', 'examiner_failure'].includes(e.kind),
      )
    )
      throw new ValidationError('Examiner request absent or already attempted; no automatic retry');
    const snapshot = claimsDossier(repo, caseId, p);
    if (Buffer.byteLength(safeJson(snapshot.dossier)) > 24000)
      throw new ValidationError('Dossier exceeds examiner input budget');
    repo.appendInvestigationEntry({
      caseId,
      kind: 'examiner_started',
      actor: claimsActorId(p),
      requestKey: `start:${requestId}`,
      payload: { requestId, dossierDigest: snapshot.digest },
    });
    return snapshot;
  });
}
const Report = z
  .object({
    requestId: uuid,
    dossierDigest: z.string(),
    provider: z.literal('openai'),
    model: z.string().min(1).max(120),
    responseId: z.string().min(1).max(160),
    execution: z.enum(['live', 'test_double']),
    analysis: ExaminerAnalysisSchema,
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().max(100000),
        outputTokens: z.number().int().nonnegative().max(1500),
      })
      .strict(),
  })
  .strict();
// The validated relation is the only examiner chronology. Reject recognizable
// attempts to restate policy timing in free-text advisory fields.
function makesNarrativeTimingClaim(analysis: ExaminerAnalysis) {
  const narrative = [
    analysis.summary,
    ...analysis.claimantAssertions,
    ...analysis.gaps,
    ...analysis.proposedRequests.map((proposal) => proposal.question),
  ];
  const window =
    /\b(?:inception|expiry|expiration|effective (?:at|date|time)|(?:policy|coverage) (?:window|period|start|end)|(?:policy|coverage) (?:began|begins|started|starts|expired|expires|ended|ends|took effect|was in force)|(?:start|end|effective date) of (?:the )?(?:policy|coverage))\b/i;
  const comparison =
    /\b(?:before|after|pre[- ]?dates?|post[- ]?dates?|preced\w*|prior|following|within|outside|earlier|later|during|between|fall\w*|not yet|already|coincid\w*|equality|overlap\w*)\b/i;
  return narrative.some((text) => {
    const normalized = text
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    return (
      (window.test(normalized) && comparison.test(normalized)) ||
      /\b(?:pre ?inception|post ?expiry|out of window|on time|late reported|(?:before|after|during|preceded|predates) (?:the )?coverage)\b/i.test(
        normalized,
      ) ||
      /\b\d{4}[-/]\d{2}[-/]\d{2}\b/.test(text)
    );
  });
}

export function finishClaimsExamination(
  repo: InsuranceRepository,
  caseId: string,
  input: unknown,
  p: ClaimsPrincipal,
) {
  assertClaimsRole(p, ['system']);
  const report = Report.parse(input);
  return repo.runInTransaction(() => {
    accessible(repo, caseId, p, true);
    const entries = repo.listInvestigationEntries(caseId);
    const start = entries.find(
      (e) => e.kind === 'examiner_started' && body(e).requestId === report.requestId,
    );
    if (
      !start ||
      body(start).dossierDigest !== report.dossierDigest ||
      entries.some(
        (e) =>
          ['examiner_report', 'examiner_failure'].includes(e.kind) &&
          body(e).requestId === report.requestId,
      )
    )
      throw new ValidationError('Examiner request not reserved or already completed');
    const { dossier, digest } = claimsDossier(repo, caseId, p);
    if (digest !== report.dossierDigest)
      throw new ValidationError('Stale examiner dossier; request reassessment');
    if (
      report.analysis.chronology !== dossier.chronology.relation ||
      makesNarrativeTimingClaim(report.analysis)
    )
      throw new ValidationError(
        'Examiner chronology contradicts or restates the server chronology',
      );
    if (
      report.analysis.verifiedFindings.some(
        (id) => !dossier.verifiedFindingIds.includes(id) || !report.analysis.citations.includes(id),
      )
    )
      throw new ValidationError(
        'Examiner verified finding must reference a current cited verification',
      );
    const known = new Set<string>(dossier.citationIds);
    const citations = [
      ...report.analysis.citations,
      ...report.analysis.proposedRequests.flatMap((proposal) => proposal.citations),
    ];
    if (citations.some((id) => !known.has(id)))
      throw new ValidationError('Examiner cited nonexistent dossier evidence');
    return repo.appendInvestigationEntry({
      caseId,
      kind: 'examiner_report',
      actor: claimsActorId(p),
      requestKey: `finish:${report.requestId}`,
      payload: {
        ...report,
        promptVersion: CLAIMS_EXAMINER_PROMPT,
        sourceClassification: 'ai_analysis',
        verificationStatus: 'not_independent_proof',
        analysisHash: verificationDigest(safeJson(report.analysis)),
        notice:
          'Worker-reported provider provenance, not independent evidence or payment authority',
      },
    });
  });
}
export function failClaimsExamination(
  repo: InsuranceRepository,
  caseId: string,
  requestId: string,
  p: ClaimsPrincipal,
) {
  assertClaimsRole(p, ['system']);
  return repo.runInTransaction(() => {
    accessible(repo, caseId, p);
    const entries = repo.listInvestigationEntries(caseId);
    if (
      !entries.some((e) => e.kind === 'examiner_request' && e.id === requestId) ||
      entries.some(
        (e) =>
          ['examiner_report', 'examiner_failure'].includes(e.kind) &&
          body(e).requestId === requestId,
      )
    )
      throw new ValidationError('Unknown or completed examiner request');
    return repo.appendInvestigationEntry({
      caseId,
      kind: 'examiner_failure',
      actor: claimsActorId(p),
      requestKey: `fail:${requestId}`,
      payload: {
        requestId,
        text: 'Examiner unavailable, failed or dossier stale. No recommendation or authority established; human may request another bounded attempt.',
      },
    });
  });
}

export const ExaminerWorkerRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('examiner_start'), requestId: uuid }).strict(),
  z.object({ action: z.literal('examiner_failure'), requestId: uuid }).strict(),
  z.object({ action: z.literal('examiner_finish'), report: z.unknown() }).strict(),
]);
