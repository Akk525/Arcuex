'use client';

import type { ReactNode } from 'react';
import { ClaimsAuthPanel } from '@/components/claims/claims-auth-panel';
import { useClaimsSession } from '@/hooks/use-claims-session';
import { canUseInsurerWorkspace } from '@/lib/app-nav';

export function InsurerAccess({ children }: { children: ReactNode }) {
  const { session, loading } = useClaimsSession();

  if (loading) return <p role="status" className="text-sm text-[var(--ink-muted)]">Checking session…</p>;
  if (!canUseInsurerWorkspace(session?.role)) return <ClaimsAuthPanel />;

  return children;
}
