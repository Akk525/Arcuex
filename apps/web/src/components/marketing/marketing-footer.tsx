import Link from 'next/link';

const links = [
  { href: '/coverage', label: 'Coverage' },
  { href: '/agent', label: 'Agents' },
  { href: '/dashboard', label: 'Dashboard' },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--line-strong)] bg-[var(--paper)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-sm">
          <p className="text-base font-semibold tracking-tight text-[var(--ink)]">Arcuex</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
            Synthetic underwriting on Arc Testnet. Every on-chain transfer waits for an explicit
            wallet approval.
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--ink-secondary)]">
          {links.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="hover:text-[var(--ink)]">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="font-mono text-xs text-[var(--ink-muted)]">Arc Testnet, chain 5042002</p>
      </div>
    </footer>
  );
}
