'use client';

import { useCallback, useEffect, useState } from 'react';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';

type ClaimsResponse = {
  notice: string;
  mutationsEnabled?: boolean;
  incidents: Array<{ id: string; status: string; observedEventRef: string }>;
  claims: Array<{
    id: string;
    status: string;
    requestedUsdc: string;
    authorizedUsdc: string | null;
  }>;
  settlements: Array<{ id: string; status: string; amountUsdc: string }>;
};

/** Read-only legacy synthetic ledger. Mutations live under ClaimsCase APIs. */
export function ClaimsPanel() {
  const [data, setData] = useState<ClaimsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/claims');
    setData((await res.json()) as ClaimsResponse);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [refresh]);

  return (
    <Panel
      title="Legacy ledger (read-only)"
      action={<StatusBadge label="MUTATIONS OFF" tone="warn" />}
    >
      <div className="space-y-3 text-sm text-zinc-700">
        <p className="text-xs text-amber-800">
          {data?.notice ??
            'Read-only synthetic ledger. Use /claims Cases with wallet session for adjudication.'}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700"
        >
          Refresh
        </button>
        {error ? <p className="text-rose-700">{error}</p> : null}
        {!data ? <p className="text-zinc-500">Loading claims ledger…</p> : null}
        {data &&
        data.incidents.length === 0 &&
        data.claims.length === 0 &&
        data.settlements.length === 0 ? (
          <p className="text-zinc-500">No legacy incidents/claims yet.</p>
        ) : null}
        {data?.incidents.slice(0, 3).map((i) => (
          <div key={i.id} className="rounded-lg bg-zinc-50 p-2 font-mono text-xs">
            incident {i.id.slice(0, 8)}… · {i.status} · {i.observedEventRef}
          </div>
        ))}
        {data?.claims.slice(0, 3).map((c) => (
          <div key={c.id} className="rounded-lg bg-sky-50 p-2 font-mono text-xs">
            claim {c.id.slice(0, 8)}… · {c.status} · req {c.requestedUsdc}
            {c.authorizedUsdc ? ` · auth ${c.authorizedUsdc}` : ''}
          </div>
        ))}
        {data?.settlements.slice(0, 3).map((s) => (
          <div key={s.id} className="rounded-lg bg-violet-50 p-2 font-mono text-xs">
            settlement {s.id.slice(0, 8)}… · {s.status} · {s.amountUsdc}
          </div>
        ))}
      </div>
    </Panel>
  );
}
