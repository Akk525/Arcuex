export const queueSections = {
  awaiting_human: 'Awaiting human action',
  awaiting_evidence: 'Outstanding claimant evidence',
  verification_attention: 'Stale or failed verification',
  ready: 'Ready for review',
  settlement: 'Pending settlement authority',
} as const;

export type QueueSection = keyof typeof queueSections;
export type ReviewReadiness = { verificationId: string | null; blocker: string | null };
export type VerificationState = 'current' | 'stale' | 'failed';
export type CaseTriage = { section: QueueSection; reason: string };

const blockerMessages: Record<string, string> = {
  OUTSTANDING_EVIDENCE_REQUESTS: 'Review the outstanding evidence requests before approving.',
  UNSUPPORTED_EVIDENCE_REQUIRES_REVIEW:
    'An upload falls outside the supported verifier. Review the evidence before proceeding.',
  PERSISTED_VERIFICATION_REQUIRED:
    'Run the supported verifier and retain its result before approving.',
  FRESH_PERSISTED_VERIFICATION_REQUIRED:
    'Run verification on the current evidence before approving.',
  STALE_VERIFICATION_CONTEXT:
    'The evidence or policy changed. Reverify the current dossier before approving.',
  UNRESOLVED_VERIFICATION_FINDINGS:
    'Resolve incomplete or conflicting verification findings before approving.',
  INSUFFICIENT_VERIFICATION_EVIDENCE: 'Verification found insufficient evidence for an approval.',
  INDEPENDENT_VERIFICATION_UNSUPPORTED_OR_STALE:
    'The independent verification is stale or unsupported. Review and verify the current proof.',
  INDEPENDENT_EVENT_ALREADY_COMMITTED:
    'The independent loss event is already committed to another case.',
  UNRESOLVED_RECOVERIES: 'Resolve recoveries before approving.',
  POLICY_INCIDENT_NOT_ELIGIBLE:
    'Review the policy, insured exposure and recorded incident linkage.',
  COVERAGE_CHRONOLOGY_REQUIRES_REVIEW: 'The recorded coverage chronology requires human review.',
  INCIDENT_OUTSIDE_COVERAGE:
    'The recorded incident or waiting period falls outside the eligible coverage window.',
  INDEPENDENT_SETTLEMENT_WINDOW_CLOSED: 'The policy settlement window has closed.',
};

export function reviewBlockerMessage(code: string) {
  return blockerMessages[code] ?? `Review the server finding before approving (${code}).`;
}

export function settlementBlockerMessage(code: string) {
  if (code === 'SETTLEMENT_BINDING_MISSING')
    return 'Settlement preparation requires a frozen decision linked to the supported verification record.';
  if (
    code === 'STALE_VERIFICATION_CONTEXT' ||
    code === 'INDEPENDENT_VERIFICATION_UNSUPPORTED_OR_STALE'
  )
    return 'The verification bound to the decision is stale or unsupported. Review it before preparing settlement.';
  return `Settlement preparation requires review of the recorded finding (${code}).`;
}

export type EvidenceTarget = { id: string; kind: string; label: string; stale?: boolean };

export function evidenceAnchor(kind: string, id: string) {
  return `claim-${kind}-${encodeURIComponent(id).replaceAll('%', ':')}`;
}

export function resolveEvidenceTargets(
  references: unknown,
  targets: readonly EvidenceTarget[],
  requiredKind?: string,
) {
  if (!Array.isArray(references)) return [];
  const authorized = new Map<string, EvidenceTarget | null>();
  for (const target of targets) {
    if (requiredKind && target.kind !== requiredKind) continue;
    authorized.set(target.id, authorized.has(target.id) ? null : target);
  }
  return [...new Set(references as unknown[])].map((ref) =>
    typeof ref === 'string' ? (authorized.get(ref) ?? null) : null,
  );
}

export function examinerExecutionLabel(execution: unknown, provider: unknown) {
  if (execution === 'test_double') return 'TEST DOUBLE · no live AI inference';
  if (execution === 'live' && provider === 'openai') return 'LIVE OPENAI · advisory only';
  return 'Examiner source unavailable';
}

export function actorLabel(actor: string) {
  const role = actor.split(':', 1)[0];
  if (role === 'claimant') return actor.includes('/agent:') ? 'Insured agent' : 'Policyholder';
  if (role === 'reviewer') return 'Human reviewer';
  if (role === 'authority') return 'Settlement authority';
  if (role === 'system') return 'System';
  return 'Recorded actor';
}
