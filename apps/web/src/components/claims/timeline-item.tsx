import type { ReactNode } from 'react';

export type TimelineTone = 'neutral' | 'human' | 'ai' | 'proof' | 'verify' | 'warn' | 'request';

const dotTone: Record<TimelineTone, string> = {
  neutral: 'bg-[var(--surface)] text-[var(--ink-muted)] ring-1 ring-[var(--line-strong)]',
  human: 'bg-[var(--ink)] text-white',
  ai: 'bg-[var(--ai-soft)] text-[var(--ai)] ring-1 ring-[#cfdbe5]',
  proof: 'bg-[var(--surface)] text-[var(--accent-signal)] ring-1 ring-[#bfe0dd]',
  verify: 'bg-[var(--accent-signal)] text-white',
  warn: 'bg-[var(--warn-soft)] text-[var(--warn)] ring-1 ring-[#e9d3a4]',
  request: 'bg-[var(--warn)] text-white',
};

/** One entry on the investigation rail. The rail line is drawn by the parent list. */
export function TimelineItem({
  id,
  icon,
  tone,
  kind,
  children,
  emphasis,
}: {
  id?: string;
  icon: ReactNode;
  tone: TimelineTone;
  kind?: string;
  children: ReactNode;
  emphasis?: 'ai' | 'request';
}) {
  return (
    <li
      id={id}
      tabIndex={id ? -1 : undefined}
      data-entry-kind={kind}
      className="timeline-item group relative grid scroll-mt-24 grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0 focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className={`relative z-[1] mt-0.5 grid h-7 w-7 place-items-center rounded-full ${dotTone[tone]}`}
      >
        {icon}
      </span>
      <div
        className={`min-w-0 rounded-[var(--radius)] transition-shadow group-focus:shadow-[0_0_0_2px_var(--accent-ring)] ${
          emphasis === 'ai'
            ? 'border border-[#d6e0e9] bg-[color-mix(in_srgb,var(--ai-soft)_45%,var(--surface))] p-3.5'
            : emphasis === 'request'
              ? 'border border-[#ecd9b0] bg-[color-mix(in_srgb,var(--warn-soft)_55%,var(--surface))] p-3.5'
              : 'pt-0.5'
        }`}
      >
        {children}
      </div>
    </li>
  );
}
