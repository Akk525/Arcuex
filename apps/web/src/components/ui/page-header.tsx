import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="mb-5 flex min-w-0 flex-col gap-3 border-b border-[var(--line)] pb-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:pb-5">
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-[0.6875rem] font-semibold tracking-wide text-[var(--accent)] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-balance text-[1.625rem] leading-tight font-semibold tracking-tight text-[var(--ink)] sm:text-[1.875rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-[var(--ink-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
