import { ArrowsLeftRight } from '@phosphor-icons/react/ssr';
import { claimStatusLabel } from '@/lib/claims/settlement-presentation';
import { evidenceAnchor, type EvidenceTarget } from '@/lib/claims/investigation-presentation';
import { ClaimEventMetadata, ClaimEvidenceLinks } from './claim-evidence-links';
import { TimelineItem } from './timeline-item';

export type ClaimAuditRecord = {
  id: string;
  fromStatus: string;
  toStatus: string;
  actor: string;
  reasonCode: string;
  createdAt: string;
  payload?: { [key: string]: unknown };
};

export function ClaimAuditEvent({
  event,
  receipt,
  targets,
}: {
  event: ClaimAuditRecord;
  receipt?: string | null;
  targets: readonly EvidenceTarget[];
}) {
  const recordedReceipt = event.payload?.receiptRef;
  const currentReceipt =
    typeof recordedReceipt === 'string' && recordedReceipt.toLowerCase() === receipt?.toLowerCase()
      ? receipt
      : undefined;
  const binding = event.payload?.binding;
  const verificationId =
    binding && typeof binding === 'object' && 'verificationId' in binding
      ? binding.verificationId
      : event.payload?.verificationId;
  const decision =
    ['APPROVED', 'DENIED'].includes(event.toStatus) && event.fromStatus !== event.toStatus;
  return (
    <TimelineItem
      id={evidenceAnchor('event', event.id)}
      icon={<ArrowsLeftRight size={14} weight="bold" />}
      tone={decision ? 'human' : 'neutral'}
      kind="status_change"
    >
      <p className="text-sm font-semibold text-[var(--ink)]">
        {decision ? 'Human decision · ' : ''}
        {claimStatusLabel(event.fromStatus)} → {claimStatusLabel(event.toStatus, currentReceipt)}
      </p>
      <ClaimEventMetadata actor={event.actor} timestamp={event.createdAt} />
      <p className="mt-1 font-mono text-[0.6875rem] text-[var(--ink-muted)]">{event.reasonCode}</p>
      {typeof verificationId === 'string' && (
        <ClaimEvidenceLinks
          references={[verificationId]}
          targets={targets}
          kind="verification"
          label="Decision verification"
        />
      )}
      {event.payload && (
        <details className="record-details">
          <summary>Decision record</summary>
          <pre>{JSON.stringify(event.payload, null, 2)}</pre>
        </details>
      )}
    </TimelineItem>
  );
}
