import { FileMagnifyingGlass, FileText, ShieldWarning } from '@phosphor-icons/react/ssr';
import type { DashboardOverview } from '@/lib/dashboard-overview-types';
import { claimStatusLabel } from '@/lib/claims/settlement-presentation';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { WorkList, WorkRow } from '@/components/ui/work-row';
import { claimTone, reconciliationLabel } from '@/components/dashboard/dashboard-presentation';
import { shortHash } from '@/lib/format';

const claimRef = (id: string) => `Claim ${id.slice(0, 8)}`;

export function AttentionRail({
  claims,
  evidence,
  reconciliation,
}: {
  claims: DashboardOverview['claimsNeedingAttention'];
  evidence: DashboardOverview['evidenceRequests'];
  reconciliation: DashboardOverview['pendingReconciliation'];
}) {
  // Evidence requests already surface as claim rows when the claim itself needs attention.
  const claimIds = new Set(claims.map((c) => c.id));
  const separateEvidence = evidence.filter((e) => !claimIds.has(e.caseId));
  const evidenceCount = new Map<string, number>();
  for (const e of evidence) evidenceCount.set(e.caseId, (evidenceCount.get(e.caseId) ?? 0) + 1);
  const count = claims.length + separateEvidence.length + reconciliation.length;

  return (
    <Panel
      title="Requires your attention"
      description={count === 0 ? undefined : `${count} ${count === 1 ? 'item' : 'items'} waiting on you or the chain`}
      flush
    >
      {count === 0 ? (
        <p className="border-t border-[var(--line)] px-4 py-6 text-sm text-[var(--ink-muted)] sm:px-5">
          Nothing is waiting on you. Evidence requests, draft claims and policies awaiting
          reconciliation will appear here.
        </p>
      ) : (
        <WorkList label="Attention queue">
          {claims.map((item) => {
            const requests = evidenceCount.get(item.id) ?? 0;
            return (
              <WorkRow
                key={`claim-${item.id}`}
                href={item.href}
                icon={<FileText size={18} weight="duotone" />}
                iconTone={item.status === 'APPROVED' ? 'pending' : 'warn'}
                title={requests > 0 ? 'Claim evidence requested' : item.reason}
                meta={
                  requests > 0
                    ? `${claimRef(item.id)}, ${requests} open ${requests === 1 ? 'request' : 'requests'}`
                    : claimRef(item.id)
                }
                status={
                  <StatusBadge
                    label={item.status === 'APPROVED' ? 'Not reimbursed' : requests > 0 ? 'Action needed' : (item.status === 'DRAFT' ? 'Draft' : claimStatusLabel(item.status))}
                    tone={item.status === 'APPROVED' ? 'warn' : requests > 0 ? 'warn' : claimTone(item.status)}
                  />
                }
              />
            );
          })}
          {separateEvidence.map((item) => (
            <WorkRow
              key={`ev-${item.id}`}
              href={item.href}
              icon={<FileMagnifyingGlass size={18} weight="duotone" />}
              iconTone="warn"
              title="Claim evidence requested"
              meta={claimRef(item.caseId)}
              status={<StatusBadge label="Action needed" tone="warn" />}
            />
          ))}
          {reconciliation.map((item) => (
            <WorkRow
              key={`rec-${item.onchainPolicyId}`}
              href={item.href}
              icon={<ShieldWarning size={18} weight="duotone" />}
              iconTone="pending"
              title="Policy activation pending"
              meta={`${reconciliationLabel(item.completeness)}, ${shortHash(item.onchainPolicyId, 4)}`}
              status={<StatusBadge label="Pending" tone="pending" />}
            />
          ))}
        </WorkList>
      )}
    </Panel>
  );
}
