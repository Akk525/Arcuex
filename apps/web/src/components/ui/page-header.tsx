import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  badges,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Quiet context line above the title (breadcrumb-like), sentence case. */
  eyebrow?: ReactNode;
  /** Status / provenance badges shown beside the title. */
  badges?: ReactNode;
}) {
  return (
    <header className="mb-6 flex min-w-0 flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? <div className="text-[0.8125rem] text-[var(--ink-muted)]">{eyebrow}</div> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-balance text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.025em] text-[var(--ink)] sm:text-[2rem]">
            {title}
          </h1>
          {badges}
        </div>
        {description ? (
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-[var(--ink-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
