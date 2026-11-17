'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Panel } from '@/components/panel';
import { TestTransactionPanel } from '@/components/transactions/test-transaction';

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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Integration health">
          {error && <p className="text-sm text-red-700">{error}</p>}
          <ul className="space-y-3">
            {checks.map((c) => (
              <li key={c.name} className="rounded-md border border-zinc-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className={c.ok ? 'text-emerald-700' : 'text-amber-700'}>
                    {c.ok ? 'ok' : 'blocked'}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-zinc-600">{c.detail}</p>
                <p className="text-[10px] uppercase tracking-wide text-zinc-400">{c.kind}</p>
              </li>
            ))}
          </ul>
          {note && <p className="mt-3 text-xs text-zinc-500">{note}</p>}
          <p className="mt-2 text-xs text-zinc-500">
            Streams webhook: <code>/api/webhooks/quicknode-streams</code>
          </p>
        </Panel>
        <TestTransactionPanel />
      </div>
    </AppShell>
  );
}
