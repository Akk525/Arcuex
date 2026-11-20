type Tone =
  | 'neutral'
  | 'live'
  | 'synthetic'
  | 'ok'
  | 'warn'
  | 'danger'
  | 'pending'
  | 'ai'
  | 'human';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-inset)] text-[var(--ink-muted)] ring-[var(--line)]',
  live: 'bg-[var(--accent-soft)] text-[var(--live)] ring-[var(--accent)]/20',
  synthetic: 'bg-[var(--synthetic-soft)] text-[var(--synthetic)] ring-amber-200/80',
  ok: 'bg-[var(--ok-soft)] text-[var(--ok)] ring-emerald-200/80',
  warn: 'bg-[var(--warn-soft)] text-[var(--warn)] ring-amber-200/80',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)] ring-rose-200/80',
  pending: 'bg-[var(--pending-soft)] text-[var(--pending)] ring-sky-200/80',
  ai: 'bg-[var(--ai-soft)] text-[var(--ai)] ring-violet-200/70',
  human: 'bg-[var(--surface-inset)] text-[var(--ink-secondary)] ring-[var(--line-strong)]',
};

export function TruthBadge({
  label,
  tone = 'neutral',
  title,
}: {
  label: string;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase ring-1 ring-inset ${toneClass[tone]}`}
    >
      {label}
    </span>
  );
}
