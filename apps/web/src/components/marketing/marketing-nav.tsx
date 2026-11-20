import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';

const anchors = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#trust', label: 'Trust' },
] as const;

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--paper)]">
      <nav
        aria-label="Product"
        className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3 sm:px-8"
      >
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-[var(--ink)]"
        >
          Arcuex
        </Link>
        <ul className="flex items-center gap-4 text-sm text-[var(--ink-secondary)] sm:gap-5">
          {anchors.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="hover:text-[var(--ink)]">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:ml-auto md:w-auto">
          <ButtonLink href="/coverage">Explore coverage</ButtonLink>
          <ButtonLink href="/agent" variant="secondary">
            Connect an agent
          </ButtonLink>
          <ButtonLink href="/dashboard" variant="ghost">
            Open dashboard
          </ButtonLink>
        </div>
      </nav>
    </header>
  );
}
