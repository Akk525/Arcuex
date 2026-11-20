'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowsLeftRight,
  Bank,
  Brain,
  CurrencyCircleDollar,
  Gear,
  FileText,
  House,
  Question,
  List,
  PlugsConnected,
  Robot,
  Scales,
  ShieldCheck,
  X,
  type Icon,
} from '@phosphor-icons/react';
import { AccountBar } from '@/components/shell/account-bar';
import { MarketingMark } from '@/components/marketing/marketing-mark';
import { TruthBadge } from '@/components/ui/truth-badge';
import { useClaimsSession } from '@/hooks/use-claims-session';
import {
  activeNavHref,
  appNavGroups,
  canUseInsurerWorkspace,
  isInsurerRoute,
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
  claims: FileText,
  agents: Robot,
  integrations: PlugsConnected,
  review: Scales,
  capital: Bank,
  investigations: Brain,
  settlements: CurrencyCircleDollar,
  settings: Gear,
  help: Question,
  switch: ArrowsLeftRight,
};

export function AppShell({
  children,
  provenanceExtra,
  claimQueue,
}: {
  children: ReactNode;
  claimQueue?: string;
  provenanceExtra?: Array<{ label: string; tone?: ProvenanceTone; title?: string }>;
}) {
  const fixtureMode = useFixtureMode();
  const pathname = usePathname();
  const { session } = useClaimsSession();
  const canUseInsurer = canUseInsurerWorkspace(session?.role);
  const inInsurer = canUseInsurer && (isInsurerRoute(pathname) || Boolean(claimQueue));
  const groups = appNavGroups(canUseInsurer, inInsurer);
  const active = activeNavHref(pathname, groups, claimQueue);
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
          inInsurer={inInsurer}
          onNavigate={() => setDrawerOpen(false)}
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
              inInsurer={inInsurer}
              onNavigate={() => setDrawerOpen(false)}
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
  inInsurer,
  onNavigate,
}: {
  groups: readonly AppNavGroup[];
  active: string | null;
  pathname: string;
  inInsurer: boolean;
  onNavigate: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <nav aria-label={inInsurer ? 'Insurer navigation' : 'Primary'} className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label ?? 'customer'} className="mb-4 last:mb-0">
            {group.label ? <p className="app-nav-heading">{group.label}</p> : null}
            {inInsurer ? (
              <p className="px-2.5 pb-3 text-xs text-[var(--ink-muted)]">Authorized risk provider</p>
            ) : null}
            <ul className="grid gap-0.5">
              {group.items.map((item) => {
                const Glyph = ICONS[item.icon];
                const selected = active === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
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
        {inInsurer ? (
          <Link href="/dashboard" onClick={onNavigate} className="app-nav-link mt-4 border-t border-[var(--line)]">
            <ArrowsLeftRight size={17} aria-hidden="true" />
            Customer workspace
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
