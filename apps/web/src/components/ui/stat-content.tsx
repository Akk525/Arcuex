import type { ReactNode } from 'react';

export function StatContent({
  icon,
  label,
  count,
  detail,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  detail?: string;
}) {
  return (
    <>
      <span className="arc-stat-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[0.8125rem] font-semibold text-[var(--ink-secondary)]">
          {label}
        </span>
        <span className="block font-display text-2xl font-semibold text-[var(--ink)] tabular-nums sm:text-[1.85rem]">
          {count}
        </span>
        {detail ? <span className="block text-xs text-[var(--ink-muted)]">{detail}</span> : null}
      </span>
    </>
  );
}
