import type { ReactNode } from 'react';

export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] sm:p-5 ${className}`}
    >
      {title || action ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          {title ? (
            <h2 className="text-[0.9375rem] font-semibold tracking-tight text-[var(--ink)]">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
