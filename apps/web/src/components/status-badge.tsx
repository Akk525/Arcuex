type Tone = 'neutral' | 'ok' | 'warn' | 'error' | 'pending' | 'live' | 'synthetic';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-inset)] text-[var(--ink-muted)] ring-[var(--line)]',
  ok: 'bg-emerald-50 text-[var(--ok)] ring-emerald-200',
  warn: 'bg-amber-50 text-[var(--warn)] ring-amber-200',
  error: 'bg-rose-50 text-[var(--danger)] ring-rose-200',
  pending: 'bg-sky-50 text-[var(--pending)] ring-sky-200',
  live: 'bg-[var(--accent-soft)] text-[var(--live)] ring-[var(--accent)]/25',
  synthetic: 'bg-amber-50 text-[var(--synthetic)] ring-amber-200',
};

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClass[tone]}`}
    >
      {label}
    </span>
  );
}
