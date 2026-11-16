'use client';

import { explorerBlockUrl } from '@arcuex/chain';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { useArcHealth } from '@/hooks/use-arc-health';
import { formatLatency } from '@/lib/format';

export function ArcStatus() {
  const { data, isLoading, isError, error, refetch, isFetching } = useArcHealth();

  let tone: 'ok' | 'error' | 'pending' | 'neutral' = 'neutral';
  let label = 'Unknown';
  if (isLoading) {
    tone = 'pending';
    label = 'Loading';
  } else if (isError || data?.ok === false) {
    tone = 'error';
    label = 'Unhealthy';
  } else if (data?.ok) {
    tone = 'ok';
    label = 'Connected';
  }

  return (
    <Panel
      title="Arc Testnet"
      action={
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-xs font-medium text-zinc-600 underline-offset-2 hover:underline"
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      <div className="space-y-3 text-sm text-zinc-700">
        <div className="flex items-center gap-2">
          <StatusBadge label={label} tone={tone} />
          {data ? <span className="text-xs text-zinc-500">{formatLatency(data.latencyMs)}</span> : null}
        </div>

        {isLoading ? <p className="text-zinc-500">Querying public Arc RPC…</p> : null}

        {isError ? (
          <p className="text-rose-700">
            {error instanceof Error ? error.message : 'Failed to reach Arc RPC'}
          </p>
        ) : null}

        {data ? (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Chain ID</dt>
              <dd className="font-mono text-sm">
                {data.chainId || '—'}{' '}
                <span className="text-zinc-400">(expect {data.expectedChainId})</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Latest block</dt>
              <dd className="font-mono text-sm">
                {data.blockNumber !== null ? (
                  <a
                    className="text-sky-700 underline-offset-2 hover:underline"
                    href={explorerBlockUrl(data.blockNumber)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {data.blockNumber.toString()}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">RPC</dt>
              <dd className="break-all font-mono text-xs text-zinc-600">{data.rpcUrl}</dd>
            </div>
            {data.error ? (
              <div className="sm:col-span-2 text-rose-700">{data.error}</div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </Panel>
  );
}
