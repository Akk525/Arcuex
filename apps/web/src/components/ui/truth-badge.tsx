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
  live: 'bg-[var(--accent-soft)] text-[var(--live)] ring-[var(--accent-signal)]/20',
  synthetic: 'bg-[var(--synthetic-soft)] text-[var(--synthetic)] ring-[#e9d3a4]',
  ok: 'bg-[var(--ok-soft)] text-[var(--ok)] ring-[#bfe3d1]',
  warn: 'bg-[var(--warn-soft)] text-[var(--warn)] ring-[#e9d3a4]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)] ring-[#f3c4bf]',
  pending: 'bg-[var(--pending-soft)] text-[var(--pending)] ring-[#c7dbef]',
  ai: 'bg-[var(--ai-soft)] text-[var(--ai)] ring-[#cfdbe5]',
  human: 'bg-[var(--surface-inset)] text-[var(--ink-secondary)] ring-[var(--line-strong)]',
};

/**
 * Provenance / truth label (synthetic vs live, advisory vs verified).
 * Presentation only — never an authorization signal.
 */
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
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-[0.1875rem] text-[0.6875rem] leading-none font-semibold whitespace-nowrap ring-1 ring-inset ${toneClass[tone]}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
