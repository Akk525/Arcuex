'use client';

import { ProductLanding } from '@/components/landing/product-landing';
import { ProtectOverview } from '@/components/protect/protect-overview';
import { useWorkspace } from '@/components/workspace-provider';

/**
 * `/` is public landing until Protect workspace is selected.
 * Build/Ops landings live at their default hrefs; Protect uses `/` as overview.
 */
export function HomeEntry() {
  const { workspace, hydrated } = useWorkspace();

  if (!hydrated) {
    return <p className="text-sm text-[var(--ink-muted)]">Loading workspace…</p>;
  }

  if (workspace === 'protect') return <ProtectOverview />;
  return <ProductLanding />;
}
