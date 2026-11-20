'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Bank,
  ClockCounterClockwise,
  Code,
  FilePlus,
  Files,
  FileText,
  House,
  List,
  PlugsConnected,
  Robot,
  Scales,
  ShieldCheck,
  X,
  type Icon,
} from '@phosphor-icons/react';
import { useWorkspace } from '@/components/workspace-provider';
import { AccountBar } from '@/components/shell/account-bar';
import { MarketingMark } from '@/components/marketing/marketing-mark';
import { TruthBadge } from '@/components/ui/truth-badge';
import { useClaimsSession } from '@/hooks/use-claims-session';
import {
  activeNavHref,
  appNavGroups,
  workspaceForNavHref,
  type AppNavGroup,
  type AppNavIcon,
} from '@/lib/app-nav';
import { useFixtureMode } from '@/providers/source-mode';

type ProvenanceTone =
  | 'neutral'
  | 'live'
  | 'synthetic'
  | 'ai'
  | 'human'
  | 'warn'
  | 'ok'
  | 'pending'
  | 'danger';

const ICONS: Record<AppNavIcon, Icon> = {
  overview: House,
  coverage: ShieldCheck,
  policies: Files,
  claims: FileText,
  'file-claim': FilePlus,
  agents: Robot,
  integrations: PlugsConnected,
  review: Scales,
  capital: Bank,
  replay: ClockCounterClockwise,
};

export function AppShell({
  children,
  provenanceExtra,
}: {
  children: ReactNode;
  provenanceExtra?: Array<{ label: string; tone?: ProvenanceTone; title?: string }>;
}) {
  const fixtureMode = useFixtureMode();
  const pathname = usePathname();
  const { setWorkspace } = useWorkspace();
  const { session } = useClaimsSession();
  const opsSession =
    session?.role === 'reviewer' || session?.role === 'authority' || session?.role === 'system';
  const groups = appNavGroups(opsSession);
  const active = activeNavHref(pathname, groups);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  function onNavigate(href: string) {
    const workspace = workspaceForNavHref(href, groups);
    if (workspace) setWorkspace(workspace);
  }

  const environment = fixtureMode ? (
    <TruthBadge
      label="Synthetic fixture"
      tone="synthetic"
      title="Policy and reservation snapshots are fixtures. Live RPC and financial transactions are disabled."
    />
  ) : (
    <TruthBadge
      label="Arc Testnet"
      tone="live"
      title="Connected to Arc Testnet chain 5042002. Confirmations require wallet approval and reconciled receipts."
    />
  );

  return (
    <div className="app-frame">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <header className="app-topbar">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="app-icon-button lg:hidden"
            aria-expanded={drawerOpen}
            aria-controls="app-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            <List size={18} aria-hidden="true" />
            <span className="sr-only">Open navigation</span>
          </button>
          <Link href="/dashboard" className="app-wordmark" aria-label="Arcuex overview">
            <MarketingMark className="h-[22px] w-[22px]" />
            <span>ARCUEX</span>
          </Link>
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="hidden sm:inline-flex">{environment}</span>
          {provenanceExtra?.map((item) => (
            <span key={item.label} className="hidden md:inline-flex">
              <TruthBadge label={item.label} tone={item.tone} title={item.title} />
            </span>
          ))}
          <AccountBar />
        </div>
      </header>

      <aside className="app-sidebar" aria-label="Application">
        <SidebarContent
          groups={groups}
          active={active}
          pathname={pathname}
          fixtureMode={fixtureMode}
          onNavigate={onNavigate}
        />
      </aside>

      {drawerOpen ? (
        <div className="app-drawer-root lg:hidden">
          <button
            type="button"
            className="app-drawer-scrim"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <div id="app-drawer" role="dialog" aria-modal="true" aria-label="Navigation" className="app-drawer">
            <div className="flex h-[var(--topbar-h)] items-center justify-between border-b border-[var(--line)] px-4">
              <span className="app-wordmark">
                <MarketingMark className="h-[22px] w-[22px]" />
                <span>ARCUEX</span>
              </span>
              <button
                type="button"
                className="app-icon-button"
                onClick={() => setDrawerOpen(false)}
                autoFocus
              >
                <X size={18} aria-hidden="true" />
                <span className="sr-only">Close navigation</span>
              </button>
            </div>
            <div className="px-4 pt-3 sm:hidden">{environment}</div>
            <SidebarContent
              groups={groups}
              active={active}
              pathname={pathname}
              fixtureMode={fixtureMode}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      ) : null}

      <div className="app-main">
        <main id="main-content" tabIndex={-1} className="workspace-content app-content">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  groups,
  active,
  pathname,
  fixtureMode,
  onNavigate,
}: {
  groups: readonly AppNavGroup[];
  active: string | null;
  pathname: string;
  fixtureMode: boolean;
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.id} className="mb-4 last:mb-0">
            {group.label ? <p className="app-nav-heading">{group.label}</p> : null}
            <ul className="grid gap-0.5">
              {group.items.map((item) => {
                const Glyph = ICONS[item.icon];
                const selected = active === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => onNavigate(item.href)}
                      aria-current={selected ? (pathname === item.href ? 'page' : 'location') : undefined}
                      className="app-nav-link"
                    >
                      <Glyph size={17} weight={selected ? 'fill' : 'regular'} aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--line)] px-4 py-4 text-xs leading-relaxed text-[var(--ink-muted)]">
        <p>
          <strong className="font-semibold text-[var(--ink-secondary)]">Approval ≠ payment.</strong> A
          human decision does not reimburse until a verified settlement receipt exists.
        </p>
        {fixtureMode ? (
          <p className="mt-2">Live binding, reconciliation and settlement broadcasts are disabled.</p>
        ) : (
          <p className="mt-2">On-chain transfers always require your wallet approval.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          <Link href="/integrations" className="app-quiet-link">
            <Code size={13} aria-hidden="true" />
            Integration health
          </Link>
          <Link href="/" className="app-quiet-link">
            <ArrowUpRight size={13} aria-hidden="true" />
            Product site
          </Link>
        </div>
      </div>
    </div>
  );
}
