'use client';

import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  CalendarX,
  CaretRight,
  Hourglass,
  MagnifyingGlass,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react';
import { Button, ButtonLink } from '@/components/ui/button';
import { AuthRequired } from '@/components/ui/auth-required';
import { EmptyState } from '@/components/ui/empty-state';
import { Callout } from '@/components/ui/callout';
import { StatusBadge } from '@/components/status-badge';
import { TruthBadge } from '@/components/ui/truth-badge';
import { usdc } from '@/lib/procurement/presentation';
import { dayDate, endsSoon, shortId, type PortfolioCategory } from '@/lib/procurement/checkout-presentation';
import { usePolicyRecords, type PolicyView } from './use-policy-records';

type Filter = 'all' | PortfolioCategory;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'action', label: 'Needs action' },
  { id: 'pending', label: 'Awaiting confirmation' },
  { id: 'in_force', label: 'In force' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'ended', label: 'Ended' },
];

function matches(v: PolicyView, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [
    v.productName,
    v.policy.terms.policyId,
    v.agent?.label ?? '',
    v.policy.terms.agentId,
    v.policy.terms.exposure.position,
  ].some((field) => field.toLowerCase().includes(q));
}

export function PolicyPortfolio() {
  const { wallet, run, busy, error, fixtureMode, load, views, pending, nowSeconds } = usePolicyRecords();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, action: 0, pending: 0, in_force: 0, scheduled: 0, ended: 0 };
    for (const v of views ?? []) {
      c.all++;
      c[v.category]++;
    }
    return c;
  }, [views]);

  const visible = (views ?? []).filter((v) => (filter === 'all' || v.category === filter) && matches(v, query.trim()));
  const attention = (views ?? []).filter((v) => v.category === 'action' || v.canResume);
  const expiring = (views ?? []).filter(
    (v) => (v.category === 'in_force' || v.category === 'scheduled') && endsSoon(v.policy.terms.expiresAt, nowSeconds),
  );
  const ready = wallet.uiStatus === 'ready';

  if (!ready)
    return (
      <AuthRequired
        title="Connect a wallet on Arc Testnet"
        description="Use the wallet controls in the header. The portfolio lists policies this wallet owns or paid for."
      />
    );

  return (
    <div className="space-y-6">
      {error && (
        <Callout kind="danger" title="Policies could not be loaded">
          <p role="alert">{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" disabled={busy} onClick={() => void run(load)}>
            Try again
          </Button>
        </Callout>
      )}

      {views === null && !busy && !error && (
        <EmptyState
          icon={<ShieldCheck size={18} weight="duotone" />}
          title="Load your policies"
          description="Loading may ask your wallet to sign in. Arcuex then reads each policy's confirmation status from Arc Testnet."
          action={
            <Button onClick={() => void run(load)}>
              <ArrowsClockwise size={16} aria-hidden="true" />
              Load policies
            </Button>
          }
        />
      )}

      {views === null && busy && (
        <div role="status" aria-label="Loading policies" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius)] bg-[var(--surface-inset)]" />
          ))}
        </div>
      )}

      {views?.length === 0 && (
        <EmptyState
          icon={<ShieldCheck size={18} weight="duotone" />}
          title="No policies for this wallet"
          description={
            fixtureMode
              ? 'Use the wallet assigned to the seeded policy to continue the rehearsal.'
              : 'Policies you buy, or pay for on behalf of an agent, appear here with their confirmation status.'
          }
          action={<ButtonLink href="/coverage">Buy coverage</ButtonLink>}
        />
      )}

      {views && views.length > 0 && (attention.length > 0 || pending.length > 0 || expiring.length > 0) && (
        <section aria-labelledby="portfolio-attention" className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]">
          <h2 id="portfolio-attention" className="border-b border-[var(--line)] px-5 py-3 text-sm font-semibold text-[var(--ink)]">
            Needs your attention
          </h2>
          <ul className="divide-y divide-[var(--line)]">
            {attention.map((v) => (
              <AttentionItem
                key={`a-${v.policy.terms.policyId}`}
                href={v.canResume ? `/coverage?policyId=${v.policy.terms.policyId}` : `/policies/${v.policy.terms.policyId}`}
                icon={v.tone === 'error' || v.phase === 'uncertain' ? <WarningCircle size={18} weight="duotone" /> : <ArrowCounterClockwise size={18} />}
                tone={v.tone === 'error' || v.phase === 'uncertain' ? 'warn' : 'pending'}
                title={
                  v.canResume
                    ? v.attempt
                      ? 'Check a submitted purchase'
                      : 'Finish an accepted purchase'
                    : v.label
                }
                meta={`${v.productName} for ${v.agent?.label ?? shortId(v.policy.terms.agentId)}${
                  v.canResume && !v.attempt ? `, quote open until ${dayDate(v.policy.terms.quoteExpiresAt)}` : ''
                }`}
                action={v.canResume ? (v.attempt ? 'Check status' : 'Resume checkout') : 'Review'}
              />
            ))}
            {expiring.map((v) => (
              <AttentionItem
                key={`e-${v.policy.terms.policyId}`}
                href={`/policies/${v.policy.terms.policyId}`}
                icon={<CalendarX size={18} weight="duotone" />}
                tone="neutral"
                title={`Coverage ends ${dayDate(v.policy.terms.expiresAt)}`}
                meta={`${v.productName} for ${v.agent?.label ?? shortId(v.policy.terms.agentId)}`}
                action="View policy"
              />
            ))}
            {pending.map((r) => (
              <li key={`r-${r.onchainPolicyId}`} className="flex items-start gap-3 px-5 py-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] bg-[var(--pending-soft)] text-[var(--pending)]">
                  <Hourglass size={18} weight="duotone" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--ink)]">Onchain bind not yet reconciled</span>
                  <span className="mt-0.5 block break-all font-mono text-xs text-[var(--ink-muted)]">{r.onchainPolicyId}</span>
                  <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">
                    Status {r.completeness.toLowerCase().replace(/_/g, ' ')}. Claims stay disabled until it is linked.
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {views && views.length > 0 && (
        <section aria-labelledby="portfolio-list" className="space-y-3">
          <h2 id="portfolio-list" className="sr-only">
            Policies
          </h2>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div role="group" aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:pb-0">
              {FILTERS.filter((f) => f.id === 'all' || counts[f.id] > 0).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface-inset)] hover:text-[var(--ink)] aria-pressed:bg-[var(--ink)] aria-pressed:text-white"
                >
                  {f.label}
                  <span className="tabular-nums opacity-60">{counts[f.id]}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="relative block min-w-0 flex-1 lg:w-72 lg:flex-none">
                <span className="sr-only">Search policies</span>
                <MagnifyingGlass
                  size={15}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-faint)]"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Product, agent, position or ID"
                  className="field-control h-9 w-full !pl-9 text-[0.8125rem]"
                />
              </label>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run(load)} aria-label="Refresh policies">
                <ArrowsClockwise size={15} aria-hidden="true" className={busy ? 'motion-safe:animate-spin' : ''} />
                <span className="max-sm:sr-only">Refresh</span>
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]">
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1fr)_7rem_minmax(0,1.15fr)_1rem] gap-4 border-b border-[var(--line)] bg-[var(--paper)] px-5 py-2.5 text-xs font-medium text-[var(--ink-muted)] md:grid"
            >
              <span>Policy</span>
              <span>Insured agent</span>
              <span>Coverage window</span>
              <span className="text-right">Limit</span>
              <span>Status</span>
              <span />
            </div>
            {visible.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-semibold text-[var(--ink)]">No policies match</p>
                <p className="mt-1 text-[0.8125rem] text-[var(--ink-muted)]">Try another search or status.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {visible.map((v) => (
                  <PolicyRow key={v.policy.terms.policyId} v={v} />
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-[var(--ink-muted)]">
            Status comes from Arc Testnet reconciliation. A bound policy is not in force until its
            bind is verified and the window has started.
          </p>
        </section>
      )}
    </div>
  );
}

function PolicyRow({ v }: { v: PolicyView }) {
  const t = v.policy.terms;
  return (
    <li className="group relative grid gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-[#fafcfc] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1fr)_7rem_minmax(0,1.15fr)_1rem] md:items-center">
      <div className="min-w-0">
        <Link
          href={`/policies/${t.policyId}`}
          className="font-semibold text-[var(--ink)] after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-[var(--radius)] focus-visible:after:ring-2 focus-visible:after:ring-[var(--accent-ring)] focus-visible:after:ring-inset"
        >
          {v.productName}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
          <span className="font-mono">{shortId(t.policyId)}</span>
          {t.synthetic ? <TruthBadge label="Synthetic" tone="synthetic" /> : <TruthBadge label="Pilot" tone="pending" />}
        </p>
      </div>
      <div className="min-w-0 text-sm">
        <p className="truncate text-[var(--ink)]">
          <span className="text-[var(--ink-muted)] md:hidden">Agent </span>
          {v.agent?.label ?? shortId(t.agentId)}
        </p>
        <p className="truncate font-mono text-xs text-[var(--ink-muted)]">{t.exposure.position}</p>
      </div>
      <p className="text-sm tabular-nums text-[var(--ink-secondary)]">
        {dayDate(t.effectiveAt)} to {dayDate(t.expiresAt)}
      </p>
      <p className="text-sm font-medium tabular-nums text-[var(--ink)] md:text-right">
        <span className="font-normal text-[var(--ink-muted)] md:hidden">Limit </span>
        {usdc(t.limitMicros)}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span title={v.label}>
          <StatusBadge label={v.shortLabel} tone={v.tone} />
        </span>
        <span className="sr-only">{v.label}</span>
        {v.canClaim ? <span className="text-xs font-medium text-[var(--ok)]">Claim eligible</span> : null}
      </div>
      <CaretRight
        size={15}
        weight="bold"
        aria-hidden="true"
        className="hidden text-[var(--ink-faint)] transition-transform group-hover:translate-x-0.5 md:block"
      />
    </li>
  );
}

function AttentionItem({
  href,
  icon,
  tone,
  title,
  meta,
  action,
}: {
  href: string;
  icon: ReactNode;
  tone: 'warn' | 'pending' | 'neutral';
  title: string;
  meta: string;
  action: string;
}) {
  const toneClass =
    tone === 'warn'
      ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
      : tone === 'pending'
        ? 'bg-[var(--pending-soft)] text-[var(--pending)]'
        : 'bg-[var(--surface-inset)] text-[var(--ink-muted)]';
  return (
    <li>
      <Link href={href} className="work-row group px-5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] ${toneClass}`} aria-hidden="true">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--ink)]">{title}</span>
          <span className="mt-0.5 block text-[0.8125rem] text-[var(--ink-muted)] sm:truncate">{meta}</span>
        </span>
        <span className="hidden shrink-0 text-[0.8125rem] font-medium text-[var(--accent)] sm:inline">{action}</span>
        <CaretRight size={15} weight="bold" aria-hidden="true" className="shrink-0 text-[var(--ink-faint)]" />
      </Link>
    </li>
  );
}
