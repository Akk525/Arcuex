import Link from 'next/link';
import { ShieldCheck } from '@phosphor-icons/react/ssr';
import type { DashboardOverview } from '@/lib/dashboard-overview-types';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { TruthBadge } from '@/components/ui/truth-badge';
import { WorkList, WorkRow } from '@/components/ui/work-row';
import { policyStatusPill } from '@/components/dashboard/dashboard-presentation';

export function PortfolioSummary({ portfolio }: { portfolio: DashboardOverview['portfolio'] }) {
  return (
    <Panel
      title="Policies"
      action={
        portfolio.total > 0 ? (
          <Link href="/coverage" className="text-[0.8125rem] font-medium text-[var(--accent-signal)] hover:text-[var(--accent)]">
            View all
          </Link>
        ) : null
      }
      flush
    >
      {portfolio.total === 0 ? (
        <div className="border-t border-[var(--line)] px-4 py-5 sm:px-5">
          <p className="text-sm text-[var(--ink-muted)]">
            No coverage yet. A policy appears here once it is bound, and becomes claims-eligible
            after on-chain reconciliation.
          </p>
          <Link
            href="/coverage?tab=products"
            className="mt-3 inline-flex text-[0.8125rem] font-semibold text-[var(--accent-signal)] hover:text-[var(--accent)]"
          >
            Get coverage
          </Link>
        </div>
      ) : (
        <WorkList label="Policies">
          {portfolio.items.slice(0, 5).map((item) => {
            const pill = policyStatusPill(item.status);
            return (
              <WorkRow
                key={item.id}
                href={`/policies/${item.id}`}
                icon={<ShieldCheck size={18} weight="duotone" />}
                iconTone={item.claimsEligible ? 'accent' : 'neutral'}
                title={
                  <span className="flex items-center gap-2">
                    <span className="truncate">{item.label}</span>
                    {item.synthetic ? <TruthBadge label="Synthetic" tone="synthetic" /> : null}
                  </span>
                }
                meta={item.claimsEligible ? 'Claims eligible' : 'Not claims-eligible until reconciled'}
                status={<StatusBadge label={pill.label} tone={pill.tone} />}
              />
            );
          })}
        </WorkList>
      )}
    </Panel>
  );
}
