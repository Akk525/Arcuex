'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Key, User, Users } from '@phosphor-icons/react';
import { StatContent } from '@/components/ui/stat-content';
import {
  PROCUREMENT_PRODUCT as PRODUCT,
  type ProcurementAgent as Agent,
  type ProcurementDelegationView as Delegation,
} from '@arcuex/domain/procurement';
import { useClaimsSession } from '@/hooks/use-claims-session';
import { delegationPresentation } from '@/lib/delegation-presentation';
import { useProcurement } from '@/hooks/use-procurement';
import { Callout } from '@/components/ui/callout';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/panel';
import { displayDate, usdc, usdToMicros } from '@/lib/procurement/presentation';
import { StatusBadge } from '@/components/status-badge';

export function DelegationsPanel({ initialAgentId }: { initialAgentId?: string }) {
  const { api, run, busy, error, wallet } = useProcurement();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const { session } = useClaimsSession();
  const [rows, setRows] = useState<Delegation[]>([]);
  const [observedAt, setObservedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(0);
  const generation = useRef(0);
  const walletAddress = wallet.address?.toLowerCase();
  const authenticated =
    wallet.uiStatus === 'ready' &&
    session?.role === 'claimant' &&
    session.wallet?.toLowerCase() === walletAddress;
  const eligibleAgents = agents.filter(
    (agent) =>
      agent.owner === walletAddress &&
      agent.exposure.chainId === 5042002 &&
      agent.exposure.protocol === PRODUCT.protocol,
  );
  const canGrant = authenticated && eligibleAgents.some((agent) => agent.id === agentId);

  const [premium, setPremium] = useState('1');
  const [limit, setLimit] = useState('10');
  const [beneficiary, setBeneficiary] = useState('');
  const [hours, setHours] = useState(24);
  const [loaded, setLoaded] = useState(false);
  const [handoff, setHandoff] = useState('');

  useEffect(() => {
    generation.current++;
    setRows([]);
    setObservedAt(null);
    setAgents([]);
    setAgentId('');
    setBeneficiary(walletAddress ?? '');
    setLoaded(false);
  }, [walletAddress, wallet.chainId]);

  useEffect(() => {
    if (observedAt === null) return;
    const tick = () => setClock(performance.now());
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [observedAt]);

  function elapsed() {
    return observedAt === null ? Number.POSITIVE_INFINITY : Math.max(0, clock - observedAt) / 1000;
  }

  async function load() {
    const request = ++generation.current;
    const start = performance.now();
    setObservedAt(null);
    const result = await api<{ agents: Agent[]; delegations: Delegation[] }>('list');
    if (request !== generation.current) return;
    setAgents(result.agents);
    setAgentId((previous) => {
      const eligible = result.agents.filter(
        (agent) => agent.owner === walletAddress && agent.exposure.protocol === PRODUCT.protocol,
      );
      return eligible.some((agent) => agent.id === previous)
        ? previous
        : (eligible.find((agent) => agent.id === initialAgentId)?.id ?? eligible[0]?.id ?? '');
    });
    setRows(result.delegations);
    setClock(performance.now());
    setObservedAt(start);
    setLoaded(true);
  }

  return (
    <div className="procurement grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)] lg:items-start">
      {authenticated && loaded ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-2">
          <div className="arc-stat"><StatContent icon={<Users size={18} />} label="Registered agents" count={agents.length} /></div>
          <div className="arc-stat"><StatContent icon={<Key size={18} />} label="Active delegations" count={rows.filter((row) => delegationPresentation(row, elapsed(), authenticated).active).length} /></div>
          <div className="arc-stat"><StatContent icon={<User size={18} />} label="Owned oracle exposures" count={eligibleAgents.length} /></div>
        </div>
      ) : null}
      <div className="lg:col-span-2">
      <Callout kind="warn" title="Backend-only permission boundary">
        Revocation prevents future API preparation. Previously prepared transactions remain
        executable onchain. These permissions cannot protect a compromised EOA private key.
      </Callout>
      </div>

      <section className="arc-panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Your agents</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Load agents you own and exposures assigned to your connected signer.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/coverage?from=build"
              className="inline-flex min-h-11 items-center underline"
            >
              Register an agent
            </Link>
            <Button variant="secondary" disabled={busy} onClick={() => void run(load)}>
              {busy ? 'Loading…' : 'Refresh agents'}
            </Button>
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-[var(--radius)] bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </p>
        )}
        {loaded && agents.length === 0 ? (
          <EmptyState
            title="No agents registered"
            description="Register a synthetic exposure in Coverage, then return here to configure delegation."
            action={
              <Link
                href="/coverage?from=build"
                className="text-sm font-medium text-[var(--accent)] underline"
              >
                Register agent in Coverage
              </Link>
            }
          />
        ) : null}
        {authenticated && agents.length > 0 ? (
          <ul className="divide-y divide-[var(--line)] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
            {agents.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between"
              >
                <div>
                  {eligibleAgents.some((eligible) => eligible.id === a.id) ? (
                    <button type="button" className="inline-flex items-center gap-2 rounded text-left font-semibold text-[var(--accent)] hover:underline" aria-pressed={agentId === a.id} onClick={() => setAgentId(a.id)}>
                      <User size={15} aria-hidden="true" /> {a.label}
                    </button>
                  ) : <p className="font-medium text-[var(--ink)]">{a.label}</p>}
                  <p className="break-all font-mono text-xs text-[var(--ink-muted)]">
                    Signer {a.signer}
                  </p>
                  <p className="break-all text-xs text-[var(--ink-muted)]">
                    Policyholder {a.owner}
                  </p>
                </div>
                <p className="min-w-0 break-all text-sm text-[var(--ink-muted)]">
                  {a.exposure.position} · {usdc(a.exposure.notionalMicros)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        {initialAgentId && !loaded && (
          <p role="status" className="text-sm">
            Refresh agents to select the position just registered.
          </p>
        )}
      </section>

      <section className="arc-panel space-y-4 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Delegation configuration</h2>
        <p className="text-sm text-[var(--ink-muted)]">
          Authorize a registered agent to prepare this product within a cumulative premium budget
          and per-policy limit. The agent pays from its own authenticated wallet.
        </p>
        <fieldset
          disabled={busy || !authenticated || eligibleAgents.length === 0}
          className="space-y-4"
        >
          <label>
            Agent & exposure
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {eligibleAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} · {a.exposure.position} · {a.signer}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm">
            Allowed product: <StatusBadge label={PRODUCT.code} tone="synthetic" />
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Cumulative premium cap (USDC)
              <input
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              Per-policy limit cap (USDC)
              <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" />
            </label>
            <label>
              Only allowed beneficiary
              <input
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
                placeholder={wallet.address ?? '0x…'}
              />
            </label>
            <label>
              Permission lifetime (hours)
              <input
                type="number"
                min={1}
                max={168}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              />
            </label>
          </div>
          <Callout kind="warn" title="Near this action">
            Backend enforcement only. Revocation does not cancel already-prepared onchain calldata.
          </Callout>
          <Button
            disabled={busy || !canGrant || !beneficiary}
            onClick={() =>
              void run(async () => {
                await api('delegations', {
                  agentId,
                  premiumCapMicros: usdToMicros(premium),
                  limitCapMicros: usdToMicros(limit),
                  beneficiary: beneficiary || wallet.address,
                  expiresAt: Math.floor(Date.now() / 1000) + hours * 3600,
                });
                await load();
              })
            }
          >
            Grant delegation
          </Button>
        </fieldset>

        {handoff && authenticated && (
          <p role="status" className="text-sm">
            {handoff}
          </p>
        )}
        {loaded && authenticated && rows.length === 0 && (
          <p role="status" className="text-sm text-[var(--ink-muted)]">
            No delegation grants found.
          </p>
        )}
        {rows.length > 0 && authenticated ? (
          <ul className="space-y-3">
            {rows.map((d) => {
              const permission = delegationPresentation(d, elapsed(), authenticated);
              const canRevoke = permission.active && d.owner === walletAddress;
              const agent = agents.find((row) => row.id === d.agentId);
              const quotePath = `/coverage?agentId=${d.agentId}&delegationId=${d.id}`;
              return (
                <li
                  key={d.id}
                  className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={permission.label}
                      tone={permission.label === 'Active permission' ? 'ok' : 'warn'}
                    />
                    <span className="break-all font-mono text-xs">{d.id}</span>
                  </div>
                  <p className="mt-2 text-[var(--ink-muted)]">
                    {agent?.label ?? 'Registered agent'} · Premium cap {usdc(d.premiumCapMicros)} ·
                    Limit cap {usdc(d.limitCapMicros)}
                  </p>
                  <p className="mt-2 break-words text-[var(--ink-muted)]">
                    {d.productCode} · {d.position} · Beneficiary {d.beneficiary}
                  </p>
                  <p className="mt-1 text-[var(--ink-muted)]">
                    Expires {displayDate(d.expiresAt)}
                    {d.revokedAt !== null &&
                      d.revokedAt !== undefined &&
                      ` · Revoked ${displayDate(d.revokedAt)}`}
                    {d.remainingPremiumMicros !== undefined &&
                      ` · Remaining premium budget ${usdc(d.remainingPremiumMicros)}`}
                  </p>
                  <p className="mt-1">{permission.detail}</p>
                  {permission.active && d.limitation !== 'budget_exhausted' && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {agent?.signer === walletAddress && d.owner !== walletAddress && (
                        <Link
                          href={quotePath}
                          className="inline-flex min-h-11 items-center underline"
                        >
                          Start a delegated quote
                        </Link>
                      )}
                      {d.owner === walletAddress && agent?.signer !== walletAddress && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            void run(async () => {
                              await navigator.clipboard.writeText(
                                new URL(quotePath, window.location.origin).href,
                              );
                              setHandoff(
                                'Copied the quote link. Share it with the registered agent signer.',
                              );
                            })
                          }
                        >
                          Copy agent quote link
                        </Button>
                      )}
                    </div>
                  )}
                  {canRevoke ? (
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (
                            !delegationPresentation(
                              d,
                              (performance.now() - (observedAt ?? -Infinity)) / 1000,
                              authenticated,
                            ).active
                          )
                            throw new Error('Refresh current delegation status before acting.');
                          await api('delegations/revoke', { id: d.id });
                          await load();
                        })
                      }
                    >
                      Revoke future preparation
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section className="space-y-3 lg:col-span-2">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Developer SDK workflow</h2>
        <Panel title="Integrate with the same records">
          <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
            Use <code>ProcurementApiClient</code> from <code>@arcuex/agent-sdk</code>. Authenticate
            with an external signer, discover products, inspect authority, request a quote, accept
            its exact digest, prepare, then submit approve/bind through your authorized wallet.
            Confirm the receipt. The API never signs or broadcasts.
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--ink-muted)]">
            <li>Header Sign in establishes the shared session used by Protect.</li>
            <li>Register agent/exposure via Coverage or agent APIs.</li>
            <li>Grant delegation with beneficiary and premium caps.</li>
            <li>
              Confirm policies, then inspect under{' '}
              <Link href="/policies" className="underline">
                Policies
              </Link>{' '}
              or{' '}
              <Link href="/integrations" className="underline">
                Integrations
              </Link>
              .
            </li>
          </ol>
        </Panel>
      </section>
    </div>
  );
}
