import type { ReactNode } from 'react';

type Kind = 'info' | 'live' | 'synthetic' | 'warn' | 'danger';

const styles: Record<Kind, string> = {
  info: 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]',
  live: 'border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--ink)]',
  synthetic: 'border-amber-300/80 bg-amber-50 text-amber-950',
  warn: 'border-amber-300/80 bg-amber-50 text-amber-950',
  danger: 'border-rose-300/80 bg-rose-50 text-rose-950',
};

export function Callout({
  kind = 'info',
  title,
  children,
}: {
  kind?: Kind;
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className={`rounded-[var(--radius)] border px-3 py-2.5 text-sm ${styles[kind]}`}>
      {title ? <p className="font-medium">{title}</p> : null}
      <div className={title ? 'mt-1 text-[0.925em] opacity-90' : ''}>{children}</div>
    </aside>
  );
}
