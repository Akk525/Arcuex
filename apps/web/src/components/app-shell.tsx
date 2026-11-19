'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useWorkspace } from '@/components/workspace-provider';
import { AccountBar } from '@/components/shell/account-bar';
import { useClaimsSession } from '@/hooks/use-claims-session';
import {
  WORKSPACE_LABEL,
  WORKSPACE_NAV,
  activeWorkspaceLink,
  defaultHrefForWorkspace,
  workspaceForPath,
  type WorkspaceId,
} from '@/lib/workspace';
import { StatusBadge } from '@/components/status-badge';
import { useFixtureMode } from '@/providers/source-mode';

export function AppShell({ children }: { children: ReactNode }) {
  const fixtureMode = useFixtureMode();
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, setWorkspace } = useWorkspace();
  const { session } = useClaimsSession();
  const opsSession =
    session?.role === 'reviewer' || session?.role === 'authority' || session?.role === 'system';
  const switcherIds: WorkspaceId[] = opsSession
    ? ['protect', 'build', 'ops']
    : ['protect', 'build'];
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
          <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href="/"
                className="inline-flex min-h-11 items-center text-2xl font-semibold tracking-tight"
              >
                Arcuex
              </Link>
              <StatusBadge
                label={fixtureMode ? 'SYNTHETIC FIXTURE' : 'Arc Testnet'}
                tone={fixtureMode ? 'synthetic' : 'live'}
              />
            </div>
            <AccountBar />
          </div>
          <div className="flex flex-col gap-y-2 border-t border-[var(--line)] py-2 sm:flex-row sm:items-center sm:gap-x-5">
            <div role="group" aria-label="Workspace" className="flex shrink-0 flex-wrap gap-1">
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
              className="flex min-w-0 flex-wrap gap-x-1"
            >
              {WORKSPACE_NAV[current].map((item) => (
                <Link
                  key={item.href}
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
      </header>

      <div className="workspace-container flex flex-1 flex-col gap-6 py-6 sm:gap-7 sm:py-8">
        {fixtureMode && (
          <aside
            aria-label="Environment"
            className="rounded-[var(--radius)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          >
            <strong className="font-semibold">Synthetic rehearsal.</strong> Policy and reservation
            snapshots use fixture data. Live RPC and financial transactions are disabled.
          </aside>
        )}
        <main id="main-content" tabIndex={-1} className="workspace-content min-w-0 flex-1">
          {children}
        </main>
        <footer className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-[var(--line)] pt-4 text-xs text-[var(--ink-muted)]">
          <span>Arcuex · Arc Testnet chain 5042002</span>
          <Link href="/integrations" className="inline-flex min-h-11 items-center underline">
            Integration health
          </Link>
        </footer>
      </div>
    </div>
  );
}
