'use client';

import { TruthBadge } from '@/components/ui/truth-badge';
import { useFixtureMode } from '@/providers/source-mode';

/**
 * Quiet always-on truth strip: environment source and financial truth rules.
 * Does not authorize anything — presentation only.
 */
export function ProvenanceRail({
  extra,
}: {
  extra?: Array<{ label: string; tone?: 'neutral' | 'live' | 'synthetic' | 'ai' | 'human' | 'warn' | 'ok' | 'pending' | 'danger'; title?: string }>;
}) {
  const fixtureMode = useFixtureMode();

  return (
    <aside className="provenance-rail workspace-container" aria-label="Data provenance">
      <TruthBadge
        label={fixtureMode ? 'Synthetic fixture' : 'Arc Testnet'}
        tone={fixtureMode ? 'synthetic' : 'live'}
        title={
          fixtureMode
            ? 'Policy and reservation snapshots are fixtures. Live RPC and financial transactions are disabled.'
            : 'Connected to Arc Testnet chain 5042002. Confirmations require wallet approval and reconciled receipts.'
        }
      />
      <span>
        <strong>Approval ≠ payment.</strong> A human decision does not reimburse until a verified
        settlement receipt exists.
      </span>
      {fixtureMode ? (
        <span>Live binding, reconciliation and settlement broadcasts are disabled in fixture mode.</span>
      ) : null}
      {extra?.map((item) => (
        <TruthBadge key={item.label} label={item.label} tone={item.tone} title={item.title} />
      ))}
    </aside>
  );
}
