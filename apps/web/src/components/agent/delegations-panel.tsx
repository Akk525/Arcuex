'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
import { StatusBadge } from '@/components/status-badge';

export function DelegationsPanel() {
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

  const [premium, setPremium] = useState('1000000');
  const [limit, setLimit] = useState('10000000');
  const [beneficiary, setBeneficiary] = useState('');
  const [hours, setHours] = useState(24);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    generation.current++;
    setRows([]);
    setObservedAt(null);
    setAgents([]);
    setAgentId('');
    setBeneficiary('');
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
      return eligible.some((agent) => agent.id === previous) ? previous : (eligible[0]?.id ?? '');
    });
    setRows(result.delegations);
    setClock(performance.now());
    setObservedAt(start);
    setLoaded(true);
  }

  return (
    <div className="procurement space-y-8">
      <Callout kind="warn" title="Backend-only permission boundary">
        Revocation prevents future API preparation. Previously prepared transactions remain
        executable onchain. These permissions cannot protect a compromised EOA private key.
      </Callout>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Your agents</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Sign in from the header, then load agents owned by this wallet.
            </p>
          </div>
          <Button variant="secondary" disabled={busy} onClick={() => void run(load)}>
            {busy ? 'Loading…' : 'Refresh agents'}
          </Button>
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
              <Link href="/coverage" className="text-sm font-medium text-[var(--accent)] underline">
                Register agent in Coverage
              </Link>
            }
          />
        ) : null}
        {agents.length > 0 ? (
          <ul className="divide-y divide-[var(--line)] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
            {agents.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between"
              >
                <div>
                  <p className="font-medium text-[var(--ink)]">{a.label}</p>
                  <p className="font-mono text-xs text-[var(--ink-muted)]">{a.signer}</p>
                </div>
                <p className="text-sm text-[var(--ink-muted)]">{a.exposure.position}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-sm text-[var(--ink-muted)]">
          New agents are registered via the{' '}
          <Link href="/coverage" className="underline">
            Coverage
          </Link>{' '}
          wizard (Register exposure step).
        </p>
      </section>

      <section className="space-y-4 border-t border-[var(--line)] pt-8">
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
              Cumulative premium cap (USDC micros)
              <input
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              Per-policy limit cap (USDC micros)
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
                  premiumCapMicros: premium,
                  limitCapMicros: limit,
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
                    Agent {d.agentId} · premium cap {d.premiumCapMicros} · limit cap{' '}
                    {d.limitCapMicros}
                  </p>
                  <p className="mt-2 break-words text-[var(--ink-muted)]">
                    {d.productCode} · {d.position} · Beneficiary {d.beneficiary}
                  </p>
                  <p className="mt-1 text-[var(--ink-muted)]">
                    Expires {new Date(d.expiresAt * 1000).toLocaleString()}
                    {d.revokedAt !== null &&
                      d.revokedAt !== undefined &&
                      ` · Revoked ${new Date(d.revokedAt * 1000).toLocaleString()}`}
                    {d.remainingPremiumMicros !== undefined &&
                      ` · Remaining premium budget ${d.remainingPremiumMicros} micros`}
                  </p>
                  <p className="mt-1">{permission.detail}</p>
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

      <section className="space-y-3 border-t border-[var(--line)] pt-8">
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
