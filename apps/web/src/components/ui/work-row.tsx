import Link from 'next/link';
import type { ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react/ssr';

type IconTone = 'accent' | 'warn' | 'pending' | 'neutral';

const iconToneClass: Record<IconTone, string> = {
  accent: 'bg-[var(--accent-soft)] text-[var(--accent-signal)]',
  warn: 'bg-[var(--warn-soft)] text-[var(--warn)]',
  pending: 'bg-[var(--pending-soft)] text-[var(--pending)]',
  neutral: 'bg-[var(--surface-inset)] text-[var(--ink-muted)]',
};

/** A whole-row link for queues and portfolios: icon, title, supporting line, status, chevron. */
export function WorkRow({
  href,
  icon,
  iconTone = 'neutral',
  title,
  meta,
  status,
  aside,
}: {
  href: string;
  icon?: ReactNode;
  iconTone?: IconTone;
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="work-row group">
        {icon ? (
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] ${iconToneClass[iconTone]}`}>
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--ink)] sm:truncate">{title}</span>
          {meta ? <span className="mt-0.5 block text-[0.8125rem] text-[var(--ink-muted)] sm:truncate">{meta}</span> : null}
          {status ? <span className="mt-1.5 flex sm:hidden">{status}</span> : null}
        </span>
        {aside ? <span className="hidden shrink-0 sm:block">{aside}</span> : null}
        {status ? <span className="hidden shrink-0 sm:block">{status}</span> : null}
        <CaretRight
          size={15}
          weight="bold"
          aria-hidden="true"
          className="shrink-0 text-[var(--ink-faint)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--ink-muted)]"
        />
      </Link>
    </li>
  );
}

export function WorkList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
      {children}
    </ul>
  );
}
