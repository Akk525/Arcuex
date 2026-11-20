import Link from 'next/link';
import type { DashboardOverview } from '@/lib/server/dashboard-overview';
import { Panel } from '@/components/panel';
import { EmptyState } from '@/components/ui/empty-state';

export function AttentionRail({
  claims,
  evidence,
  reconciliation,
}: {
  claims: DashboardOverview['claimsNeedingAttention'];
  evidence: DashboardOverview['evidenceRequests'];
  reconciliation: DashboardOverview['pendingReconciliation'];
}) {
  const empty = claims.length === 0 && evidence.length === 0 && reconciliation.length === 0;

  return (
    <Panel title="Needs attention">
      {empty ? (
        <EmptyState
          title="Nothing needs attention"
          description="Claims, evidence requests, and pending reconciliations will appear here."
        />
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {claims.map((item) => (
            <li key={`claim-${item.id}`} className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--ink)]">{item.reason}</p>
                <p className="mt-0.5 font-mono text-xs text-[var(--ink-faint)]">
                  {item.status} · {item.id.slice(0, 8)}
                </p>
              </div>
              <Link href={item.href} className="text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline">
                Open
              </Link>
            </li>
          ))}
          {evidence.map((item) => (
            <li key={`ev-${item.id}`} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--ink)]">Outstanding evidence request</p>
                <p className="mt-0.5 font-mono text-xs text-[var(--ink-faint)]">{item.id}</p>
              </div>
              <Link href={item.href} className="text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline">
                Respond
              </Link>
            </li>
          ))}
          {reconciliation.map((item) => (
            <li
              key={`rec-${item.onchainPolicyId}`}
              className="flex flex-wrap items-baseline justify-between gap-2 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--ink)]">Pending policy reconciliation</p>
                <p className="mt-0.5 font-mono text-xs text-[var(--ink-faint)]">{item.completeness}</p>
              </div>
              <Link href={item.href} className="text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline">
                Review
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
