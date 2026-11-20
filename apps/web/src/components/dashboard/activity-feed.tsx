'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DashboardOverview } from '@/lib/dashboard-overview-types';
import { claimStatusLabel } from '@/lib/claims/settlement-presentation';
import { relativeTime } from '@/lib/format';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { activityPresentation } from '@/components/dashboard/dashboard-presentation';

const label = (status: string) => (status === 'DRAFT' ? 'Draft' : claimStatusLabel(status));

export function ActivityFeed({
  items,
  title = 'Recent activity',
}: {
  items: DashboardOverview['recentActivity'];
  title?: string;
}) {
  // Relative times render after mount to avoid server/client clock mismatches.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  return (
    <Panel title={title} flush>
      {items.length === 0 ? (
        <p className="border-t border-[var(--line)] px-4 py-5 text-sm text-[var(--ink-muted)] sm:px-5">
          Policy and claim updates will appear here.
        </p>
      ) : (
        <ol className="relative border-t border-[var(--line)] px-4 py-3 sm:px-5">
          {items.slice(0, 8).map((item, index) => {
            const view = activityPresentation(item.kind, item.summary, label);
            const when = now ? relativeTime(item.at, now) : null;
            const body = (
              <>
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ring-4 ring-[var(--surface)] ${
                    item.kind === 'claim' ? 'bg-[var(--accent-signal)]' : 'bg-[var(--ink-faint)]'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[var(--ink)]">{view.title}</span>
                  <time dateTime={item.at} className="block text-xs text-[var(--ink-muted)] tabular-nums">
                    {when ?? new Date(item.at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'}
                  </time>
                </span>
                {view.status ? <StatusBadge label={view.status.label} tone={view.status.tone} /> : null}
              </>
            );
            return (
              <li key={`${item.kind}-${item.at}-${index}`} className="relative">
                {index < Math.min(items.length, 8) - 1 ? (
                  <span aria-hidden="true" className="absolute top-5 bottom-0 left-[3px] w-px bg-[var(--line-strong)]" />
                ) : null}
                {item.href ? (
                  <Link href={item.href} className="-mx-2 flex items-start gap-3 rounded-[var(--radius)] px-2 py-2 hover:bg-[var(--surface-inset)]">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
