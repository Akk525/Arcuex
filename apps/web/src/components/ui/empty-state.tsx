import type { ReactNode } from 'react';

/**
 * Quiet guidance for an empty collection: what will appear here and the one
 * action that fills it. No dashed placeholder boxes.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  align = 'center',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  align?: 'center' | 'start';
}) {
  const centered = align === 'center';
  return (
    <div
      className={`flex flex-col gap-1 rounded-[var(--radius)] bg-[var(--surface-inset)]/60 px-4 py-6 ${
        centered ? 'items-center text-center' : 'items-start text-left'
      }`}
    >
      {icon ? (
        <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-[var(--surface)] text-[var(--accent-signal)] shadow-[var(--shadow-sm)]">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
      {description ? (
        <p className={`max-w-md text-[0.8125rem] leading-relaxed text-[var(--ink-muted)] ${centered ? 'mx-auto' : ''}`}>
          {description}
        </p>
      ) : null}
      {action ? <div className={`mt-3 flex flex-wrap gap-2 ${centered ? 'justify-center' : ''}`}>{action}</div> : null}
    </div>
  );
}
