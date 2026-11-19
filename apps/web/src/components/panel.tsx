import type { ReactNode } from 'react';

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
