import Link from 'next/link';
import type { DashboardOverview } from '@/lib/server/dashboard-overview';
import { Panel } from '@/components/panel';
import { EmptyState } from '@/components/ui/empty-state';
import { TruthBadge } from '@/components/ui/truth-badge';
import { ButtonLink } from '@/components/ui/button';

export function PortfolioSummary({ portfolio }: { portfolio: DashboardOverview['portfolio'] }) {
  if (portfolio.total === 0) {
    return (
      <Panel title="Policy portfolio">
        <EmptyState
          title="No coverage yet"
          description="Quote and bind a policy to populate this portfolio. Status stays literal until reconciliation confirms eligibility."
          action={<ButtonLink href="/coverage">Obtain coverage</ButtonLink>}
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Policy portfolio"
      action={<span className="text-xs text-[var(--ink-muted)]">{portfolio.total} total</span>}
    >
      <ul className="divide-y divide-[var(--line)]">
        {portfolio.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/policies/${item.id}`}
                  className="text-sm font-medium text-[var(--ink)] underline-offset-2 hover:underline"
                >
                  {item.label}
                </Link>
                {item.synthetic ? <TruthBadge label="Synthetic" tone="synthetic" /> : null}
                {item.claimsEligible ? (
                  <TruthBadge label="Claims eligible" tone="ok" />
                ) : (
                  <TruthBadge label="Not claims-eligible yet" tone="pending" />
                )}
              </div>
              <p className="font-mono text-xs text-[var(--ink-faint)]">
                {item.status} · {item.id.slice(0, 8)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
