import Link from 'next/link';
import type { DashboardOverview } from '@/lib/dashboard-overview-types';

/** Three counts from the session's own records, in one ruled strip. */
export function SummaryStrip({ data }: { data: DashboardOverview }) {
  const eligible = data.portfolio.items.filter((p) => p.claimsEligible).length;
  const activeDelegations = data.delegations.filter((d) => d.validity === 'active').length;
  const openRequests = data.evidenceRequests.length;

  const cells = [
    {
      href: '/policies',
      label: 'Policies',
      short: 'Policies',
      value: data.portfolio.total,
      note: data.portfolio.total === 0 ? 'None bound yet' : `${eligible} claims-eligible`,
    },
    {
      href: '/agent',
      label: 'Insured agents',
      short: 'Agents',
      value: data.agents.length,
      note: `${activeDelegations} active ${activeDelegations === 1 ? 'delegation' : 'delegations'}`,
    },
    {
      href: '/claims',
      label: 'Claims needing action',
      short: 'Claims to act on',
      value: data.claimsNeedingAttention.length,
      note:
        openRequests === 0
          ? 'No open evidence requests'
          : `${openRequests} open evidence ${openRequests === 1 ? 'request' : 'requests'}`,
    },
  ];

  return (
    <div className="grid overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-sm)] grid-cols-3">
      {cells.map((cell, i) => (
        <Link
          key={cell.href}
          href={cell.href}
          className={`group block px-3.5 py-3.5 transition-colors hover:bg-[var(--surface-inset)] sm:px-5 sm:py-4 ${
            i > 0 ? 'border-l border-[var(--line)]' : ''
          }`}
        >
          <dl>
            <dt className="text-xs text-[var(--ink-muted)] sm:text-[0.8125rem]">
              <span className="sm:hidden">{cell.short}</span>
              <span className="hidden sm:inline">{cell.label}</span>
            </dt>
            <dd className="mt-1.5 flex items-baseline gap-3">
              <span className="font-display text-[1.625rem] leading-none font-semibold tracking-[-0.03em] text-[var(--ink)] tabular-nums sm:text-[1.875rem]">
                {cell.value}
              </span>
              <span className="hidden text-xs text-[var(--ink-muted)] group-hover:text-[var(--ink-secondary)] md:inline">
                {cell.note}
              </span>
            </dd>
          </dl>
        </Link>
      ))}
    </div>
  );
}
