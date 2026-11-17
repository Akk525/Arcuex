'use client';

import { useCallback, useEffect, useState } from 'react';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { claimsFetch } from '@/lib/claims/claims-api';
import {
  claimsNetworkFailure,
  parseLegacyClaimsLedgerPayload,
  readClaimsClientResponse,
  type LegacyClaimsLedger,
} from '@/lib/claims/claims-client-response';

/** Read-only legacy synthetic ledger. Mutations live under ClaimsCase APIs. */
export function ClaimsPanel() {
  const [data, setData] = useState<LegacyClaimsLedger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setAuthRequired(false);
    try {
      const res = await claimsFetch('any', '/api/claims');
      const result = await readClaimsClientResponse(res, parseLegacyClaimsLedgerPayload);
      if (!result.ok) {
        setData(null);
        if (result.kind === 'unauthorized' || result.kind === 'forbidden') {
          setAuthRequired(true);
          setError(result.message);
          return;
        }
        setError(result.message);
        return;
      }
      setData(result.data);
    } catch (e) {
      setData(null);
      setError(claimsNetworkFailure(e).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
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
        {authRequired ? (
          <p className="text-zinc-600">
            Sign in with a reviewer or authority session to load the legacy ledger. Authorization
            failures are not treated as an empty ledger.
          </p>
        ) : null}
        {!data && !error ? <p className="text-zinc-500">Loading claims ledger…</p> : null}
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
