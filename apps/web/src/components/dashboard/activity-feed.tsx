import Link from 'next/link';
import type { DashboardOverview } from '@/lib/server/dashboard-overview';
import { Panel } from '@/components/panel';
import { EmptyState } from '@/components/ui/empty-state';

export function ActivityFeed({ items }: { items: DashboardOverview['recentActivity'] }) {
  return (
    <Panel title="Recent activity">
      {items.length === 0 ? (
        <EmptyState
          title="No recent activity"
          description="Policy and claim updates for this session will list here."
        />
      ) : (
        <ol className="divide-y divide-[var(--line)]">
          {items.map((item, index) => (
            <li key={`${item.kind}-${item.at}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm text-[var(--ink)]">{item.summary}</p>
                <p className="mt-0.5 font-mono text-xs text-[var(--ink-faint)]">
                  {item.kind} · {item.at}
                </p>
              </div>
              {item.href ? (
                <Link
                  href={item.href}
                  className="text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  View
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
