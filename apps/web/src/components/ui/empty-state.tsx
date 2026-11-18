import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-4 py-8 text-center">
      <p className="text-sm font-medium text-[var(--ink)]">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--ink-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
