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
  defaultHrefForWorkspace,
  type WorkspaceId,
} from '@/lib/workspace';
import { StatusBadge } from '@/components/status-badge';

function navActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, hydrated, setWorkspace } = useWorkspace();
  const { session } = useClaimsSession();
  const opsSession =
    session?.role === 'reviewer' ||
    session?.role === 'authority' ||
    session?.role === 'system';
  const switcherIds: WorkspaceId[] = opsSession
    ? ['protect', 'build', 'ops']
    : ['protect', 'build'];
  const items = workspace ? WORKSPACE_NAV[workspace] : [];

  function switchWorkspace(next: WorkspaceId) {
    setWorkspace(next);
    const stillValid = WORKSPACE_NAV[next].some(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    );
    if (!stillValid) router.push(defaultHrefForWorkspace(next));
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="space-y-4 border-b border-[var(--line)] pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <Link href="/" className="inline-flex items-baseline gap-2">
              <span className="text-xl font-semibold tracking-tight text-[var(--ink)]">Arcuex</span>
              <StatusBadge label="Arc Testnet" tone="live" />
            </Link>
            <p className="max-w-xl text-sm text-[var(--ink-muted)]">
              Insurance-style protection for autonomous agents — bind coverage, manage policies,
              investigate claims.
            </p>
          </div>
          <AccountBar />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="group"
            aria-label="Workspace"
            className="inline-flex rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface)] p-0.5"
          >
            {switcherIds.map((id) => {
              const selected = hydrated && workspace === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => switchWorkspace(id)}
                  aria-pressed={selected}
                  className={
                    selected
                      ? 'rounded-[calc(var(--radius)-2px)] bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-white'
                      : 'rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }
                >
                  {WORKSPACE_LABEL[id]}
                </button>
              );
            })}
          </div>
          {!opsSession ? (
            <p className="text-xs text-[var(--ink-muted)]">
              Ops tools appear after a provisioned reviewer/authority session. URLs are still
              server-authorized.
            </p>
          ) : null}
        </div>

        {workspace ? (
          <nav aria-label={`${WORKSPACE_LABEL[workspace]} navigation`} className="flex flex-wrap gap-1">
            {items.map((item) => {
              const active = navActive(pathname, item.href);
              return (
                <Link
                  key={`${workspace}:${item.href}:${item.label}`}
                  href={item.href}
                  className={
                    active
                      ? 'rounded-[var(--radius)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white'
                      : 'rounded-[var(--radius)] px-3 py-1.5 text-sm font-medium text-[var(--ink-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--ink)]'
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : (
          <p className="text-xs text-[var(--ink-muted)]">
            Choose Protect or Build to open a workspace. Privileges are never granted by the UI
            alone.
          </p>
        )}

        {workspace === 'ops' ? (
          <p className="text-xs text-[var(--ink-muted)]">
            Ops workspace frames privileged tools. Server authentication still decides what succeeds.
          </p>
        ) : null}
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-[var(--line)] pt-4 text-xs text-[var(--ink-muted)]">
        Chain ID 5042002 · Never paste private keys · Synthetic demo steps are labeled · Streams
        webhook ≠ payout authority
      </footer>
    </div>
  );
}
