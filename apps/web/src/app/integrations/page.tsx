'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Panel } from '@/components/panel';
import { TestTransactionPanel } from '@/components/transactions/test-transaction';
import { PageHeader } from '@/components/ui/page-header';
import { Button, ButtonLink } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { useFixtureMode } from '@/providers/source-mode';

type Check = { name: string; ok: boolean; detail: string; kind: string };

export default function IntegrationsPage() {
  const fixtureMode = useFixtureMode();
  const [result, setResult] = useState<{ checks: Check[]; note?: string } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/integrations/health', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Health request failed (${res.status})`);
      const payload = await res.json();
      if (!Array.isArray(payload.checks)) throw new Error('Health response was unavailable.');
      setResult(payload);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Health request failed.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell>
      <PageHeader
        title="Integrations & API"
        description={
          fixtureMode
            ? 'Inspect the integrations available in this synthetic environment.'
            : 'Check this host’s Arc Testnet and service connectivity.'
        }
        action={
          <ButtonLink href="/agent/new">
            Connect an agent
          </ButtonLink>
        }
      />
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="TypeScript SDK" description="Register a signer and position, then use the SDK to connect within a delegation you grant.">
          <ButtonLink href="/#developers" variant="secondary">View SDK examples</ButtonLink>
        </Panel>
        <Panel title="API access" description="Agent requests use a signed wallet session. Delegations define the positions and premium limits an agent can use.">
          <p className="text-sm text-[var(--ink-muted)]">API key management and MCP connections are unavailable in this build.</p>
        </Panel>
      </div>
      <div id="diagnostics" className="scroll-mt-20 grid gap-4 lg:grid-cols-2 lg:items-start">
        <Panel
          title="Diagnostics"
          action={
            <Button
              variant="secondary"
              size="sm"
              disabled={!error && !result}
              onClick={() => void load()}
            >
              {error ? 'Retry checks' : 'Refresh checks'}
            </Button>
          }
        >
          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          {!error && !result && (
            <p role="status" className="text-sm text-[var(--ink-muted)]">
              Loading health checks…
            </p>
          )}
          {result?.checks.length === 0 && (
            <EmptyState
              title="No checks reported"
              description="Refresh to request health from this host."
            />
          )}
          {!!result?.checks.length && (
            <ul className="divide-y divide-[var(--line)]">
              {result.checks.map((check) => (
                <li key={check.name} className="space-y-1.5 py-3 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{check.name}</span>
                    <StatusBadge
                      label={check.ok ? 'Available' : 'Unavailable'}
                      tone={check.ok ? 'ok' : 'warn'}
                    />
                  </div>
                  <p className="text-sm text-[var(--ink-muted)]">{check.detail}</p>
                  <p className="text-xs text-[var(--ink-muted)]">{check.kind}</p>
                </li>
              ))}
            </ul>
          )}
          {result?.note && <p className="mt-3 text-sm text-[var(--ink-muted)]">{result.note}</p>}
          <details className="mt-3 border-t border-[var(--line)] pt-2 text-sm">
            <summary className="py-3 font-medium">Webhook endpoint</summary>
            <p>
              <code>/api/webhooks/quicknode-streams</code>
            </p>
            <p className="mt-1 text-[var(--ink-muted)]">
              Settlement requires a separate authority session and a matching receipt.
            </p>
          </details>
        </Panel>
        {fixtureMode ? (
          <Callout kind="synthetic" title="Test transactions disabled">
            This fixture environment has no live RPC or wallet transactions.
          </Callout>
        ) : (
          <TestTransactionPanel />
        )}
      </div>
    </AppShell>
  );
}
