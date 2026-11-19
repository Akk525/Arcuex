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
    <header className="mb-6 flex min-w-0 flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between sm:pb-6">
      <div className="min-w-0 space-y-1">
        {eyebrow ? <p className="text-sm font-semibold text-[var(--accent)]">{eyebrow}</p> : null}
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-[var(--ink)] sm:text-[2.125rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
