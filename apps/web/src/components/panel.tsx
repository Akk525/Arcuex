import type { ReactNode } from 'react';

export function Panel({
  title,
  description,
  action,
  children,
  className = '',
  flush = false,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Remove body padding so lists/tables can run edge to edge. */
  flush?: boolean;
}) {
  const hasHeader = Boolean(title || action);
  return (
    <section
      className={`min-w-0 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-sm)] ${className}`}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-4 sm:px-5">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-[var(--ink)]">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-muted)]">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={flush ? (hasHeader ? 'pt-3' : '') : `px-4 pb-4 sm:px-5 sm:pb-5 ${hasHeader ? 'pt-3' : 'pt-4 sm:pt-5'}`}>
        {children}
      </div>
    </section>
  );
}
