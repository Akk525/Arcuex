'use client';

import { ProtectOverview } from '@/components/protect/protect-overview';
import { useWorkspace } from '@/components/workspace-provider';

/**
 * `/` is always the Protect overview once the workspace preference hydrates.
 * Marketing landing is no longer shown on this route — Protect owns `/`.
 */
export function HomeEntry() {
  const { hydrated } = useWorkspace();

  if (!hydrated) {
    return (
      <p role="status" className="text-sm text-[var(--ink-muted)]">
        Loading workspace…
      </p>
    );
  }

  return <ProtectOverview />;
}
