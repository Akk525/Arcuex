'use client';

import { useState } from 'react';
import { Panel } from '@/components/panel';

export function AgentProcurePanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  async function runAgent() {
    setBusy(true);
    setError(null);
    setResult('');
    try {
      const res = await fetch('/api/agent/procure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: `ui-agent-${Date.now()}`,
          displayName: 'Dashboard Bounded Agent',
          agentRef: 'agent://dashboard-procure',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(JSON.stringify(json, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agent procure failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Bounded agent procurement">
      <p className="mb-3 text-sm text-zinc-600">
        Runs <code>@arcuex/agent-sdk</code> server-side: request quote → inspect terms → accept →
        prepare approve/bind. Does not collect private keys. Live bind needs a deployed pool +
        wallet signature.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void runAgent()}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Running agent…' : 'Run autonomous procure'}
      </button>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {result && (
        <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-800">
          {result}
        </pre>
      )}
    </Panel>
  );
}
