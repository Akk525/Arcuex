'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Panel } from '@/components/panel';

type PolicyRow = {
  id: string;
  status: string;
  synthetic: boolean;
  premiumMicros: string;
  limitMicros: string;
  policyIdBytes32: string;
  termsHash: string;
  onchainLink: { boundTxHash: string | null; lastReconcileOk: boolean | null } | null;
};

export default function PoliciesPage() {
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [pool, setPool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/policies')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        setRows(json.policies ?? []);
        setPool(json.poolAddress ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'));
  }, []);

  return (
    <AppShell>
      <Panel title="Policies">
        <p className="mb-3 text-sm text-zinc-600">
          On-chain identity hashes are shown even before deploy. Pool:{' '}
          <span className="font-mono text-xs">{pool ?? 'not configured'}</span>
        </p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {rows.length === 0 && !error && (
          <p className="text-sm text-zinc-500">No policies in the local ledger yet.</p>
        )}
        <ul className="space-y-3">
          {rows.map((p) => (
            <li key={p.id} className="rounded-md border border-zinc-200 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{p.id}</span>
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs">{p.status}</span>
              </div>
              <p className="mt-1 text-xs text-amber-800">
                {p.synthetic ? 'SYNTHETIC terms' : 'Non-synthetic'}
              </p>
              <dl className="mt-2 grid gap-1 font-mono text-[11px] text-zinc-600">
                <div>policyIdBytes32: {p.policyIdBytes32}</div>
                <div>termsHash: {p.termsHash}</div>
                <div>
                  premium={p.premiumMicros} limit={p.limitMicros} (micros)
                </div>
                <div>
                  reconcile:{' '}
                  {p.onchainLink?.lastReconcileOk === null
                    ? 'n/a'
                    : p.onchainLink?.lastReconcileOk
                      ? 'ok'
                      : 'mismatch'}
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </Panel>
    </AppShell>
  );
}
