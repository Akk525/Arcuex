type Tone = 'neutral' | 'ok' | 'warn' | 'error' | 'pending' | 'live' | 'synthetic';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-inset)] text-[var(--ink-muted)] ring-[var(--line)]',
  ok: 'bg-[var(--ok-soft)] text-[var(--ok)] ring-emerald-200/80',
  warn: 'bg-[var(--warn-soft)] text-[var(--warn)] ring-amber-200/80',
  error: 'bg-[var(--danger-soft)] text-[var(--danger)] ring-rose-200/80',
  pending: 'bg-[var(--pending-soft)] text-[var(--pending)] ring-sky-200/80',
  live: 'bg-[var(--accent-soft)] text-[var(--live)] ring-[var(--accent)]/20',
  synthetic: 'bg-[var(--synthetic-soft)] text-[var(--synthetic)] ring-amber-200/80',
};

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClass[tone]}`}
    >
      {label}
    </span>
  );
}
