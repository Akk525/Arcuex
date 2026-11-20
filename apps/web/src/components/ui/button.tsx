import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--accent)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(8,36,42,0.25)] hover:bg-[var(--accent-hover)] disabled:opacity-45',
  secondary:
    'border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_2px_rgba(14,26,32,0.04)] hover:border-[var(--line-emphasis)] hover:bg-[var(--surface-inset)] disabled:opacity-45',
  ghost: 'text-[var(--ink-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--ink)]',
  danger: 'bg-[var(--danger)] text-white hover:opacity-90 disabled:opacity-45',
};

const base =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius)] font-semibold transition-[background,color,transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100';

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[0.8125rem] min-h-8',
  md: 'px-4 py-2 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  children,
  className = '',
}: {
  href: string;
  variant?: Exclude<Variant, 'danger'>;
  size?: Size;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </Link>
  );
}
