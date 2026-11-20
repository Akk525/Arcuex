import Link from 'next/link';
import { MarketingMark } from '@/components/marketing/marketing-mark';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/coverage', label: 'Coverage' },
      { href: '/policies', label: 'Policies' },
      { href: '/claims', label: 'Claims' },
      { href: '/dashboard', label: 'Dashboard' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { href: '/integrations', label: 'Integrations' },
      { href: '/agent', label: 'Agents' },
      { href: '/#developers', label: 'SDK' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { href: '/#oversight', label: 'Human oversight' },
      { href: '/#trust', label: 'Security model' },
    ],
  },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--line)] bg-white">
      <div className="marketing-wrap grid gap-10 py-14 md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.6fr))]">
        <div className="max-w-xs">
          <Link href="/" className="inline-flex items-center gap-2 font-display text-[var(--ink)]" aria-label="Arcuex home">
            <MarketingMark className="h-[22px] w-[22px]" />
            <span className="text-[13px] font-bold tracking-[0.16em]">ARCUEX</span>
          </Link>
          <p className="mt-4 text-sm leading-relaxed text-[var(--ink-muted)]">
            Insurance infrastructure for autonomous agents. Synthetic underwriting on Arc Testnet;
            every on-chain transfer waits for your wallet approval.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h2 className="text-[0.8125rem] font-semibold text-[var(--ink)]">{col.title}</h2>
            <ul className="mt-3 grid gap-2">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-[var(--ink-muted)] transition-colors hover:text-[var(--accent)]">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="marketing-wrap flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] py-5 text-xs text-[var(--ink-muted)]">
        <span>Arcuex testnet build. Not a licensed insurance product.</span>
        <span className="font-mono">Arc Testnet, chain 5042002</span>
      </div>
    </footer>
  );
}
