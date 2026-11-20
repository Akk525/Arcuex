import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  badges,
  appearance = 'plain',
  serif = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Quiet context line above the title (breadcrumb-like), sentence case. */
  eyebrow?: ReactNode;
  /** Status / provenance badges shown beside the title. */
  badges?: ReactNode;
  appearance?: 'plain' | 'light' | 'dark';
  serif?: boolean;
}) {
  const hasArc = appearance !== 'plain';
  const dark = appearance === 'dark';
  return (
    <header
      className={`mb-6 flex min-w-0 flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between ${hasArc ? 'arc-header' : ''}`}
      data-appearance={appearance}
    >
      {hasArc ? (
        <span className="arc-header-art" aria-hidden="true">
          <span />
        </span>
      ) : null}
      <div className="relative min-w-0 space-y-1.5">
        {eyebrow ? (
          <div
            className={`text-[0.8125rem] font-semibold ${dark ? 'text-[#b5ede6]' : 'text-[var(--ink-muted)]'}`}
          >
            {eyebrow}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1
            className={`text-balance text-[1.75rem] leading-[1.06] font-semibold tracking-[-0.025em] ${hasArc ? 'sm:text-[2.6rem]' : 'sm:text-[2rem]'} ${serif ? 'arc-serif' : 'font-display'} ${dark ? 'text-white' : 'text-[var(--ink)]'}`}
          >
            {title}
          </h1>
          {badges}
        </div>
        {description ? (
          <p
            className={`max-w-2xl text-pretty text-sm leading-relaxed ${dark ? 'text-[#e1f4f3]' : 'text-[var(--ink-muted)]'}`}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="arc-header-actions relative flex flex-wrap items-center gap-2 sm:shrink-0">
          {action}
        </div>
      ) : null}
    </header>
  );
}
