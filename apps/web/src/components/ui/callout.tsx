import type { ReactNode } from 'react';

type Kind = 'info' | 'live' | 'synthetic' | 'warn' | 'danger';

const styles: Record<Kind, { box: string; bar: string }> = {
  info: { box: 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]', bar: 'bg-[var(--ink-faint)]' },
  live: { box: 'border-[#bfe0dd] bg-[var(--accent-soft)] text-[var(--ink)]', bar: 'bg-[var(--accent-signal)]' },
  synthetic: { box: 'border-[#ecd9b0] bg-[var(--synthetic-soft)] text-[#4a3300]', bar: 'bg-[var(--synthetic)]' },
  warn: { box: 'border-[#ecd9b0] bg-[var(--warn-soft)] text-[#4a3300]', bar: 'bg-[var(--warn)]' },
  danger: { box: 'border-[#f3c4bf] bg-[var(--danger-soft)] text-[#5c120c]', bar: 'bg-[var(--danger)]' },
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
  const s = styles[kind];
  return (
    <aside className={`relative overflow-hidden rounded-[var(--radius)] border py-3 pr-4 pl-5 text-sm ${s.box}`}>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${s.bar}`} />
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1 leading-relaxed opacity-90' : 'leading-relaxed'}>{children}</div>
    </aside>
  );
}
