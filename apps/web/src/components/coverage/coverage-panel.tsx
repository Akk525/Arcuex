'use client';

import { useCallback, useEffect, useState } from 'react';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';

type CoverageResponse = {
  dataClass: string;
  notice: string;
  quotes: Array<{
    id: string;
    status: string;
    expiresAt: string;
    terms: { premiumUsdc: string; limitUsdc: string; synthetic: boolean };
  }>;
  policies: Array<{
    id: string;
    status: string;
    quoteId: string;
    terms: { premiumUsdc: string; limitUsdc: string; synthetic: boolean };
  }>;
};

export function CoveragePanel() {
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastQuoteId, setLastQuoteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/coverage');
    const json = (await res.json()) as CoverageResponse;
    setData(json);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [refresh]);

  async function requestQuote() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/coverage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'request_quote',
          idempotencyKey: `dash-quote-${Date.now()}`,
          displayName: 'Dashboard Policyholder',
          agentRef: 'dashboard-agent',
          agentLabel: 'Dashboard Agent',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Quote failed');
      setLastQuoteId(json.quote.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quote failed');
    } finally {
      setBusy(false);
    }
  }

  async function acceptBind() {
    if (!lastQuoteId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/coverage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'accept_bind',
          quoteId: lastQuoteId,
          idempotencyKey: `dash-bind-${Date.now()}`,
          fundingVerified: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Bind failed');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bind failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Coverage (synthetic)"
      action={<StatusBadge label="SYNTHETIC" tone="warn" />}
    >
      <div className="space-y-3 text-sm text-zinc-700">
        <p className="text-xs text-amber-800">
          {data?.notice ??
            'Demo underwriting product only — not real insurance issuance.'}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void requestQuote()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Request synthetic quote
          </button>
          <button
            type="button"
            disabled={busy || !lastQuoteId}
            onClick={() => void acceptBind()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:opacity-50"
          >
            Accept + bind (funding verified)
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700"
          >
            Refresh
          </button>
        </div>

        {error ? <p className="text-rose-700">{error}</p> : null}

        {!data ? <p className="text-zinc-500">Loading coverage ledger…</p> : null}

        {data && data.quotes.length === 0 && data.policies.length === 0 ? (
          <p className="text-zinc-500">No quotes or policies yet.</p>
        ) : null}

        {data?.quotes.slice(0, 3).map((q) => (
          <div key={q.id} className="rounded-lg bg-zinc-50 p-2 font-mono text-xs">
            quote {q.id.slice(0, 8)}… · {q.status} · prem {q.terms.premiumUsdc} · lim{' '}
            {q.terms.limitUsdc}
          </div>
        ))}
        {data?.policies.slice(0, 3).map((p) => (
          <div key={p.id} className="rounded-lg bg-emerald-50 p-2 font-mono text-xs">
            policy {p.id.slice(0, 8)}… · {p.status} · lim {p.terms.limitUsdc}
          </div>
        ))}
      </div>
    </Panel>
  );
}
