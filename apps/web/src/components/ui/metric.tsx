import type { ReactNode } from 'react';

export function Metric({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
        {label}
      </p>
      <p
        className={`mt-0.5 tabular font-semibold tracking-tight ${
          accent ? 'text-xl text-[var(--ink)] sm:text-2xl' : 'text-sm text-[var(--ink)]'
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{hint}</p> : null}
    </div>
  );
}
