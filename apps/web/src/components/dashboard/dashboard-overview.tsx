'use client';

import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react';
import { AttentionRail } from '@/components/dashboard/attention-rail';
import { AgentsPanel } from '@/components/dashboard/agents-panel';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { Onboarding } from '@/components/dashboard/onboarding';
import { PortfolioSummary } from '@/components/dashboard/portfolio-summary';
import { SummaryStrip } from '@/components/dashboard/summary-strip';
import { useDashboardOverview } from '@/components/dashboard/use-dashboard-overview';
import { PageHeader } from '@/components/ui/page-header';
import { Button, ButtonLink } from '@/components/ui/button';

export function DashboardOverview() {
  const { data, error, loading, refresh } = useDashboardOverview();

  if (loading && !data) return <OverviewSkeleton />;

  if (!data) {
    return (
      <>
        <PageHeader title="Mission Control" />
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-[#f3c4bf] bg-[var(--danger-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex gap-3">
            <WarningCircle size={20} className="mt-0.5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">The overview could not be loaded</p>
              <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-secondary)]">
                {error ?? 'No response from the overview service.'} Your records are unchanged.
              </p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void refresh()}>
            <ArrowClockwise size={14} aria-hidden="true" />
            Try again
          </Button>
        </div>
      </>
    );
  }

  const anonymous = data.state === 'anonymous';
  const next = anonymous ? null : data.nextAction;

  return (
    <>
      <PageHeader
        title="Mission Control"
        description={
          anonymous
            ? 'Your insurance workspace. Sign in to see the policies, agents and claims tied to your wallet.'
            : next
              ? next.reason
              : 'Everything tied to your wallet is up to date.'
        }
        action={
          <>
            {!anonymous ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void refresh()}
                disabled={loading}
                aria-label="Refresh overview"
              >
                <ArrowClockwise size={15} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
              </Button>
            ) : null}
            {next ? (
              <ButtonLink href={next.href}>{next.label}</ButtonLink>
            ) : (
              <ButtonLink href="/coverage">Buy coverage</ButtonLink>
            )}
          </>
        }
      />

      {error ? (
        <p role="status" className="mb-4 flex items-center gap-2 text-[0.8125rem] text-[var(--warn)]">
          <WarningCircle size={15} aria-hidden="true" />
          Showing the last loaded snapshot. {error}
        </p>
      ) : null}

      {anonymous ? (
        <Onboarding />
      ) : (
        <div className="grid gap-4">
          <SummaryStrip data={data} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
            <div className="grid gap-4">
              <AttentionRail
                claims={data.claimsNeedingAttention}
                evidence={data.evidenceRequests}
                reconciliation={data.pendingReconciliation}
              />
              <ActivityFeed items={data.recentActivity} />
            </div>
            <div className="grid gap-4">
              <PortfolioSummary portfolio={data.portfolio} />
              <AgentsPanel agents={data.agents} delegations={data.delegations} />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
            {data.labels.synthetic}. {data.labels.live}.
          </p>
        </div>
      )}
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div role="status" aria-label="Loading overview" className="animate-pulse motion-reduce:animate-none">
      <div className="mb-7 h-8 w-40 rounded-[var(--radius)] bg-[var(--surface-sunken)]" />
      <div className="mb-4 h-[5.5rem] rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]/70" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="h-64 rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]/70" />
        <div className="h-64 rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]/70" />
      </div>
      <span className="sr-only">Loading overview…</span>
    </div>
  );
}
