'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Panel } from '@/components/panel';
import { TestTransactionPanel } from '@/components/transactions/test-transaction';
import { PageHeader } from '@/components/ui/page-header';
import { Callout } from '@/components/ui/callout';
import { StatusBadge } from '@/components/status-badge';

type Check = { name: string; ok: boolean; detail: string; kind: string };

export default function IntegrationsPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/integrations/health')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        setChecks(json.checks ?? []);
        setNote(json.note ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'));
  }, []);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Build workspace"
        title="Integrations"
        description="Live connectivity checks for Arc Testnet RPC and related services. Health rows are reported by this host — not fabricated."
      />
      <Callout kind="live" title="Developer tools">
        Test transactions still require explicit wallet approval. Streams webhooks are not payout
        authority.
      </Callout>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Integration health">
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          {!error && checks.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">Loading health checks…</p>
          ) : null}
          <ul className="space-y-3">
            {checks.map((c) => (
              <li
                key={c.name}
                className="rounded-[var(--radius)] border border-[var(--line)] p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <StatusBadge label={c.ok ? 'ok' : 'blocked'} tone={c.ok ? 'ok' : 'warn'} />
                </div>
                <p className="mt-1 font-mono text-[11px] text-[var(--ink-muted)]">{c.detail}</p>
                <p className="text-[10px] text-[var(--ink-muted)]">{c.kind}</p>
              </li>
            ))}
          </ul>
          {note && <p className="mt-3 text-xs text-[var(--ink-muted)]">{note}</p>}
          <p className="mt-2 text-xs text-[var(--ink-muted)]">
            Streams webhook: <code>/api/webhooks/quicknode-streams</code>
          </p>
        </Panel>
        <TestTransactionPanel />
      </div>
    </AppShell>
  );
}
