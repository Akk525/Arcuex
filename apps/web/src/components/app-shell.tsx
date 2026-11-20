'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useWorkspace } from '@/components/workspace-provider';
import { AccountBar } from '@/components/shell/account-bar';
import { ProvenanceRail } from '@/components/shell/provenance-rail';
import { useClaimsSession } from '@/hooks/use-claims-session';
import {
  WORKSPACE_LABEL,
  WORKSPACE_NAV,
  activeWorkspaceLink,
  defaultHrefForWorkspace,
  workspaceForPath,
  type WorkspaceId,
} from '@/lib/workspace';
import { useFixtureMode } from '@/providers/source-mode';

export function AppShell({
  children,
  provenanceExtra,
}: {
  children: ReactNode;
  provenanceExtra?: Array<{
    label: string;
    tone?: 'neutral' | 'live' | 'synthetic' | 'ai' | 'human' | 'warn' | 'ok' | 'pending' | 'danger';
    title?: string;
  }>;
}) {
  const fixtureMode = useFixtureMode();
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, setWorkspace } = useWorkspace();
  const { session } = useClaimsSession();
  const opsSession =
    session?.role === 'reviewer' || session?.role === 'authority' || session?.role === 'system';
  const switcherIds: WorkspaceId[] = opsSession
    ? ['protect', 'claims', 'build', 'ops']
    : ['protect', 'claims', 'build'];
  const current = workspaceForPath(pathname, workspace, opsSession);
  const active = activeWorkspaceLink(pathname, current);

  function switchWorkspace(next: WorkspaceId) {
    setWorkspace(next);
    if (!activeWorkspaceLink(pathname, next)) router.push(defaultHrefForWorkspace(next));
  }

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="workspace-container">
          <div className="flex flex-col gap-2.5 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href="/dashboard"
                className="inline-flex min-h-9 items-center text-xl font-semibold tracking-tight text-[var(--ink)]"
              >
                Arcuex
              </Link>
              <span className="hidden text-xs text-[var(--ink-faint)] sm:inline">
                Agent-native insurance infrastructure
              </span>
              <Link
                href="/"
                className="hidden text-xs text-[var(--ink-faint)] hover:text-[var(--ink-muted)] md:inline"
              >
                Product
              </Link>
            </div>
            <AccountBar />
          </div>
          <div className="flex flex-col gap-y-2 border-t border-[var(--line)] py-2 sm:flex-row sm:items-center sm:gap-x-4">
            <div role="group" aria-label="Workspace" className="flex shrink-0 flex-wrap gap-0.5">
              {switcherIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => switchWorkspace(id)}
                  aria-pressed={current === id}
                  className={`workspace-switch ${current === id ? 'workspace-switch-active' : ''}`}
                >
                  {WORKSPACE_LABEL[id]}
                </button>
              ))}
            </div>
            <nav
              aria-label={`${WORKSPACE_LABEL[current]} navigation`}
              className="flex min-w-0 flex-wrap gap-x-0.5"
            >
              {WORKSPACE_NAV[current].map((item) => (
                <Link
                  key={`${current}-${item.href}-${item.label}`}
                  href={item.href}
                  aria-current={
                    active?.href === item.href
                      ? item.href === pathname
                        ? 'page'
                        : 'location'
                      : undefined
                  }
                  className="workspace-link"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
        <ProvenanceRail
          extra={[
            ...(fixtureMode
              ? []
              : [
                  {
                    label: 'Wallet approval required',
                    tone: 'live' as const,
                    title: 'On-chain transfers require explicit wallet confirmation.',
                  },
                ]),
            ...(provenanceExtra ?? []),
          ]}
        />
      </header>

      <div className="workspace-container flex flex-1 flex-col gap-5 py-5 sm:gap-6 sm:py-7">
        <main id="main-content" tabIndex={-1} className="workspace-content min-w-0 flex-1">
          {children}
        </main>
        <footer className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-muted)]">
          <span>Arcuex · Arc Testnet chain 5042002</span>
          <Link href="/integrations" className="inline-flex min-h-9 items-center underline">
            Integration health
          </Link>
        </footer>
      </div>
    </div>
  );
}
