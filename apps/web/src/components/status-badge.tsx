type Tone = 'neutral' | 'ok' | 'warn' | 'error' | 'pending' | 'live' | 'synthetic';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-inset)] text-[var(--ink-muted)]',
  ok: 'bg-[var(--ok-soft)] text-[var(--ok)]',
  warn: 'bg-[var(--warn-soft)] text-[var(--warn)]',
  error: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  pending: 'bg-[var(--pending-soft)] text-[var(--pending)]',
  live: 'bg-[var(--accent-soft)] text-[var(--live)]',
  synthetic: 'bg-[var(--synthetic-soft)] text-[var(--synthetic)]',
};

/** Lifecycle status pill (Active, Pending, In review…). */
export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs leading-none font-medium whitespace-nowrap ${toneClass[tone]}`}
    >
      {label}
    </span>
  );
}
