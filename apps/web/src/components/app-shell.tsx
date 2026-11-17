'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/coverage', label: 'Coverage' },
  { href: '/policies', label: 'Policies' },
  { href: '/capital', label: 'Capital' },
  { href: '/claims', label: 'Claims' },
  { href: '/agent', label: 'Agent Activity' },
  { href: '/integrations', label: 'Integrations' },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="space-y-4 border-b border-zinc-200 pb-5">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Arcuex · Arc Testnet
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Arcuex</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-600">
            Programmable financial protection for agents. Live panels use Arc Testnet data;
            synthetic insurance steps are labeled separately from confirmed USDC transfers.
          </p>
        </div>
        <nav className="flex flex-wrap gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? 'rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white'
                    : 'rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100'
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-zinc-200 pt-4 text-xs text-zinc-500">
        Chain ID 5042002 · Never paste private keys · Streams webhook ≠ payout authority
      </footer>
    </div>
  );
}
