'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';

type Tool = {
  name: string;
  title: string;
  scope: string;
  readOnly: boolean;
  supported: boolean;
  description: string;
};
type Diagnostics = {
  server: { name: string; version: string; sdk: string };
  endpoint: string;
  transport: string;
  localTransport: string;
  authentication: {
    scheme: string;
    issuance: string;
    protectedResourceMetadata: string;
    oauthAuthorizationServer: string;
  };
  scopes: Record<string, string>;
  chainSource: string;
  checks: { tokenStore: boolean };
  hostedAcceptance: string;
  tools: Tool[];
};

const ONBOARDING = [
  'Agent wallet requests a challenge at /api/mcp/auth/challenge and signs it in its own wallet (keys never reach Arcuex).',
  'Exchange the signature at /api/mcp/auth/token for a scoped bearer token (optionally bound to a registered agent).',
  'Agent calls arcuex_register_agent; the owner completes registration from the Agents page with their own wallet session.',
  'Agent calls arcuex_request_delegation; the owner creates (and can revoke) a capped delegation.',
  'Agent quotes, accepts the exact digest and prepares unsigned transactions; the payer wallet signs outside MCP.',
  'Agent submits receipts for reconciliation, files claims and answers reviewer evidence requests.',
];

const SAFETY = [
  'Authentication proves wallet control only; ownership, delegation, payer, beneficiary and caps are re-checked by the backend on every call.',
  'No tool signs transactions, holds keys, grants or revokes delegations, adjudicates, or prepares, signs or confirms settlement.',
  'Synthetic products are labeled and can never produce a USDC reimbursement.',
  'REIMBURSED is reported only after the backend verifies a canonical USDC settlement receipt.',
  'Evidence and AI examiner output are untrusted data; the examiner is advisory only.',
];

export function McpPanel() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setDiag(null);
    setError('');
    try {
      const res = await fetch('/api/mcp/health', { cache: 'no-store' });
      if (!res.ok) throw new Error(`MCP diagnostics failed (${res.status})`);
      setDiag((await res.json()) as Diagnostics);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MCP diagnostics failed.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const config = useMemo(
    () =>
      diag
        ? JSON.stringify(
            {
              mcpServers: {
                arcuex: {
                  type: 'http',
                  url: diag.endpoint,
                  headers: { Authorization: 'Bearer ${ARCUEX_MCP_TOKEN}' },
                },
              },
            },
            null,
            2,
          )
        : '',
    [diag],
  );
  const supported = diag?.tools.filter((t) => t.supported) ?? [];
  const unsupported = diag?.tools.filter((t) => !t.supported) ?? [];

  return (
    <section id="mcp" className="mt-4 space-y-4" aria-labelledby="mcp-heading">
      <Panel
        title="Agent MCP server"
        description="Model Context Protocol access to the same policyholder workflows, for compatible autonomous agents."
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={!diag && !error}
            onClick={() => void load()}
          >
            {error ? 'Retry diagnostics' : 'Refresh diagnostics'}
          </Button>
        }
      >
        <h2 id="mcp-heading" className="sr-only">
          Agent MCP server
        </h2>
        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        {!error && !diag && (
          <p role="status" className="text-sm text-[var(--ink-muted)]">
            Loading MCP diagnostics…
          </p>
        )}
        {diag && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge label="Source implemented" tone="ok" />
              <StatusBadge
                label={
                  diag.hostedAcceptance === 'passed'
                    ? 'Hosted acceptance passed'
                    : 'Hosted acceptance not performed'
                }
                tone={diag.hostedAcceptance === 'passed' ? 'ok' : 'pending'}
              />
              <StatusBadge
                label={diag.checks.tokenStore ? 'Token store ready' : 'Token store missing'}
                tone={diag.checks.tokenStore ? 'ok' : 'error'}
              />
              <StatusBadge
                label={
                  diag.chainSource === 'fixture' ? 'Synthetic fixture source' : 'Arc Testnet source'
                }
                tone={diag.chainSource === 'fixture' ? 'synthetic' : 'live'}
              />
            </div>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr]">
              <dt className="text-[var(--ink-muted)]">Connection URL</dt>
              <dd className="min-w-0 break-all">
                <code>{diag.endpoint}</code>
              </dd>
              <dt className="text-[var(--ink-muted)]">Transport</dt>
              <dd>{diag.transport}</dd>
              <dt className="text-[var(--ink-muted)]">Authentication</dt>
              <dd className="min-w-0 break-words">
                {diag.authentication.scheme} token. {diag.authentication.issuance}
              </dd>
              <dt className="text-[var(--ink-muted)]">OAuth server</dt>
              <dd>Not implemented; wallet-signature issuance only.</dd>
              <dt className="text-[var(--ink-muted)]">Local development</dt>
              <dd className="min-w-0 break-words">
                <code>{diag.localTransport}</code>
              </dd>
              <dt className="text-[var(--ink-muted)]">Server</dt>
              <dd>
                {diag.server.name} {diag.server.version} · {diag.server.sdk}
              </dd>
            </dl>
            {diag.hostedAcceptance !== 'passed' && (
              <Callout kind="warn" title="Remote MCP is not yet accepted on a hosted environment">
                The endpoint is implemented in source and covered by local MCP-client integration
                tests. Do not rely on it from a hosted deployment until hosted acceptance is
                recorded.
              </Callout>
            )}
          </div>
        )}
      </Panel>

      {diag && (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <Panel title="Permissions (token scopes)">
            <ul className="space-y-2 text-sm">
              {Object.entries(diag.scopes).map(([scope, description]) => (
                <li key={scope}>
                  <code>{scope}</code>
                  <p className="text-[var(--ink-muted)]">{description}</p>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Example client configuration">
            <pre className="overflow-x-auto rounded-[var(--radius)] bg-[var(--surface-inset)] p-3 text-xs">
              <code>{config}</code>
            </pre>
            <p className="mt-2 text-xs text-[var(--ink-muted)]">
              Keep the token in your client&apos;s secret store. Revoke it at{' '}
              <code>/api/mcp/auth/revoke</code>.
            </p>
          </Panel>
          <Panel title="Registration and onboarding">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              {ONBOARDING.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Panel>
          <Panel title="Safety boundaries">
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {SAFETY.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {diag && (
        <Panel
          title={`Tool catalog (${supported.length} available, ${unsupported.length} unsupported)`}
          flush
        >
          <ul className="divide-y divide-[var(--line)]">
            {[...supported, ...unsupported].map((tool) => (
              <li key={tool.name} className="space-y-1 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="text-sm">{tool.name}</code>
                  <span className="flex flex-wrap gap-1.5">
                    <StatusBadge label={tool.scope} />
                    <StatusBadge
                      label={tool.readOnly ? 'Read' : 'Mutation'}
                      tone={tool.readOnly ? 'neutral' : 'pending'}
                    />
                    {!tool.supported && <StatusBadge label="Backend unsupported" tone="warn" />}
                  </span>
                </div>
                <p className="text-sm text-[var(--ink-muted)]">{tool.description}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </section>
  );
}
