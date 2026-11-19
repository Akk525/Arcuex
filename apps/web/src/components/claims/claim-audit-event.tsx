import { displayClaimStatus } from '@/lib/claims/settlement-presentation';
import { evidenceAnchor, type EvidenceTarget } from '@/lib/claims/investigation-presentation';
import { ClaimEventMetadata, ClaimEvidenceLinks } from './claim-evidence-links';

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
  const binding = event.payload?.binding;
  const verificationId =
    binding && typeof binding === 'object' && 'verificationId' in binding
      ? binding.verificationId
      : event.payload?.verificationId;
  return (
    <li
      id={evidenceAnchor('event', event.id)}
      tabIndex={-1}
      className="scroll-mt-4 rounded border border-zinc-200 bg-white p-3 text-sm"
    >
      <p className="font-medium">
        {displayClaimStatus(event.fromStatus, receipt)} →{' '}
        {displayClaimStatus(event.toStatus, receipt)}
      </p>
      <ClaimEventMetadata actor={event.actor} timestamp={event.createdAt} />
      <p className="text-xs text-zinc-600">{event.reasonCode}</p>
      {typeof verificationId === 'string' && (
        <ClaimEvidenceLinks
          references={[verificationId]}
          targets={targets}
          kind="verification"
          label="Decision verification"
        />
      )}
      {event.payload && (
        <details className="mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs underline">
            Decision / investigation record
          </summary>
          <pre className="overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </details>
      )}
    </li>
  );
}
