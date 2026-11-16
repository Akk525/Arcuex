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
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
