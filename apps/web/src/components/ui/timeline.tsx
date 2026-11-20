import type { ReactNode } from 'react';

export function Timeline({ children, ariaLabel = 'Timeline' }: { children: ReactNode; ariaLabel?: string }) {
  return (
    <ol aria-label={ariaLabel} className="relative space-y-0 border-l border-[var(--line-strong)] ml-2">
      {children}
    </ol>
  );
}

export function TimelineItem({
  id,
  title,
  meta,
  badge,
  children,
  tone = 'neutral',
}: {
  id?: string;
  title: string;
  meta?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  tone?: 'neutral' | 'ai' | 'human' | 'ok' | 'warn';
}) {
  const dot =
    tone === 'ai'
      ? 'bg-[var(--ai)]'
      : tone === 'human'
        ? 'bg-[var(--ink)]'
        : tone === 'ok'
          ? 'bg-[var(--ok)]'
          : tone === 'warn'
            ? 'bg-[var(--warn)]'
            : 'bg-[var(--ink-muted)]';
  return (
    <li id={id} className="relative pl-5 pb-5 last:pb-0 scroll-mt-24">
      <span
        aria-hidden
        className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--paper)] ${dot}`}
      />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
        {badge}
      </div>
      {meta ? <div className="mt-0.5 text-xs text-[var(--ink-muted)]">{meta}</div> : null}
      {children ? <div className="mt-2 text-sm text-[var(--ink-secondary)]">{children}</div> : null}
    </li>
  );
}
