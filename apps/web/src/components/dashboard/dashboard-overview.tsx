'use client';

import { AttentionRail } from '@/components/dashboard/attention-rail';
import { AgentsPanel } from '@/components/dashboard/agents-panel';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { PortfolioSummary } from '@/components/dashboard/portfolio-summary';
import { useDashboardOverview } from '@/components/dashboard/use-dashboard-overview';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Callout } from '@/components/ui/callout';

export function DashboardOverview() {
  const { data, error, loading, refresh } = useDashboardOverview();

  if (loading && !data) {
    return (
      <p role="status" className="text-sm text-[var(--ink-muted)]">
        Loading overview…
      </p>
    );
  }

  if (error && !data) {
    return (
      <EmptyState
        title="Overview unavailable"
        description={error}
        action={
          <button type="button" className="text-sm font-medium text-[var(--accent)]" onClick={() => void refresh()}>
            Retry
          </button>
        }
      />
    );
  }

  if (!data) return null;

  const next = data.nextAction;

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          data.state === 'anonymous'
            ? 'Connect a wallet and sign in from the account bar to load your portfolio. You can still explore coverage and agents.'
            : 'Policies, agents, claims needing attention, and pending reconciliation for this session.'
        }
        action={
          next ? (
            <ButtonLink href={next.href}>{next.label}</ButtonLink>
          ) : (
            <ButtonLink href="/coverage" variant="secondary">
              Obtain coverage
            </ButtonLink>
          )
        }
      />

      {data.state === 'anonymous' ? (
        <div className="mb-5">
          <EmptyState
            title="Sign in to see your portfolio"
            description="Wallet connection and claims session unlock policies, agents, and claims for this account. Until then, nothing here is invented."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/coverage">Explore coverage</ButtonLink>
                <ButtonLink href="/agent" variant="secondary">
                  Connect an agent
                </ButtonLink>
              </div>
            }
          />
        </div>
      ) : null}

      {next && data.state === 'authenticated' ? (
        <div className="mb-5">
          <Callout kind="info" title={next.label}>
            {next.reason}
          </Callout>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <AttentionRail
          claims={data.claimsNeedingAttention}
          evidence={data.evidenceRequests}
          reconciliation={data.pendingReconciliation}
        />
        <PortfolioSummary portfolio={data.portfolio} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <AgentsPanel agents={data.agents} delegations={data.delegations} />
        <ActivityFeed items={data.recentActivity} />
      </div>

      <p className="mt-6 text-xs text-[var(--ink-faint)]">
        {data.labels.synthetic} · {data.labels.live}
      </p>
    </>
  );
}
