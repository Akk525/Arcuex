'use client';

import { explorerBlockUrl } from '@arcuex/chain';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { useQuickNodeStatus } from '@/hooks/use-quicknode-status';
import { formatLatency, shortHash } from '@/lib/format';

export function QuickNodeStatusPanel() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuickNodeStatus();

  let tone: 'ok' | 'error' | 'pending' | 'neutral' = 'neutral';
  let label = 'Unknown';
  if (isLoading) {
    tone = 'pending';
    label = 'Loading';
  } else if (isError || data?.status.ok === false) {
    tone = 'error';
    label = 'Unhealthy';
  } else if (data?.status.ok) {
    tone = 'ok';
    label = 'Connected';
  }

  return (
    <Panel
      title="QuickNode RPC"
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
          {data ? (
            <span className="text-xs text-zinc-500">{formatLatency(data.status.latencyMs)}</span>
          ) : null}
        </div>

        {isLoading ? <p className="text-zinc-500">Querying QuickNode Arc endpoint…</p> : null}

        {isError ? (
          <p className="text-rose-700">
            {error instanceof Error ? error.message : 'Failed to reach QuickNode'}
          </p>
        ) : null}

        {!isLoading && !data ? (
          <p className="text-zinc-500">No QuickNode data yet.</p>
        ) : null}

        {data ? (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Chain ID</dt>
              <dd className="font-mono text-sm">{data.status.chainId || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Block</dt>
              <dd className="font-mono text-sm">
                {data.block ? (
                  <a
                    className="text-sky-700 underline-offset-2 hover:underline"
                    href={explorerBlockUrl(data.block.number)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {data.block.number.toString()}
                  </a>
                ) : data.status.blockNumber !== null ? (
                  data.status.blockNumber.toString()
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Block hash</dt>
              <dd className="font-mono text-xs">
                {data.block?.hash ? shortHash(data.block.hash) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Tx count</dt>
              <dd className="font-mono text-sm">
                {data.block ? data.block.transactionCount : '—'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">RPC</dt>
              <dd className="break-all font-mono text-xs text-zinc-600">{data.status.rpcUrl}</dd>
            </div>
            {data.status.error ? (
              <div className="sm:col-span-2 text-rose-700">{data.status.error}</div>
            ) : null}
          </dl>
        ) : null}

        <p className="text-xs text-zinc-500">
          Streams/webhooks are not enabled in this foundation. See{' '}
          <code className="rounded bg-zinc-100 px-1">docs/integrations/quicknode.md</code>.
        </p>
      </div>
    </Panel>
  );
}
