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
    <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-[var(--ink)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
