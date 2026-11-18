import type { ReactNode } from 'react';

export function AuthRequired({
  title = 'Sign in required',
  description,
  children,
}: {
  title?: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--ink)]"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-[var(--ink-muted)]">{description}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
