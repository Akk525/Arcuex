'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PROCUREMENT_PRODUCT as PRODUCT,
  type ProcurementAgent as Agent,
  type ProcurementDelegation as Delegation,
} from '@arcuex/domain/procurement';
import { useProcurement } from '@/hooks/use-procurement';
import { WalletPanel } from '@/components/wallet/wallet-panel';
export function DelegationsPanel() {
  const { api, run, busy, error, wallet } = useProcurement();
  const [agents, setAgents] = useState<Agent[]>([]),
    [rows, setRows] = useState<(Delegation & { revoked: boolean })[]>([]),
    [agentId, setAgentId] = useState(''),
    [premium, setPremium] = useState('1000000'),
    [limit, setLimit] = useState('10000000'),
    [beneficiary, setBeneficiary] = useState(''),
    [hours, setHours] = useState(24);
  useEffect(() => {
    setRows([]);
    setAgents([]);
    setAgentId('');
    setBeneficiary('');
  }, [wallet.address]);
  async function load() {
    const a = await api<Agent[]>('agents');
    setAgents(a);
    if (a[0]) setAgentId(a[0].id);
    setRows(await api('delegations'));
  }
  return (
    <div className="procurement space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="text-3xl font-semibold">Delegate policy procurement</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Authorize a registered agent to prepare this product within a cumulative premium budget
            and a per-policy limit. The agent uses its own authenticated wallet and pays from that
            wallet.
          </p>
          <p className="mt-3 text-sm leading-6 text-amber-900">
            Backend enforcement only. Revocation prevents future API preparation. Previously
            prepared transactions remain executable onchain. These permissions cannot protect a
            compromised EOA private key.
          </p>
        </div>
        <WalletPanel />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </p>
      )}
      <button className="proc-btn-secondary" disabled={busy} onClick={() => void run(load)}>
        Sign in & load permissions
      </button>
      <fieldset disabled={busy} className="space-y-4">
        <legend className="text-xl font-semibold">Owner permissions</legend>
        {agents.length === 0 ? (
          <p className="text-sm text-zinc-500">
            <Link className="underline" href="/coverage">
              Register an agent and exposure
            </Link>
            , then load your permissions.
          </p>
        ) : (
          <>
            <label>
              Agent & exposure
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {a.exposure.position} · {a.signer}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm">Allowed product: {PRODUCT.code}</p>
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
                <input
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  inputMode="numeric"
                />
              </label>
              <label>
                Only allowed beneficiary
                <input
                  value={beneficiary}
                  placeholder={wallet.address}
                  onChange={(e) => setBeneficiary(e.target.value)}
                />
              </label>
              <label>
                Permission duration
                <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                  {[1, 24, 168, 720].map((v) => (
                    <option key={v} value={v}>
                      {v} hours
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-zinc-500">
              1 USDC = 1,000,000 micros. Prepared policies consume budget, even if abandoned. No
              automatic budget release.
            </p>
            <button
              className="proc-btn"
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
              Authorize these backend permissions
            </button>
          </>
        )}
      </fieldset>
      <div className="space-y-3">
        {rows.map((d) => (
          <article className="rounded-xl border border-zinc-200 p-4 text-sm" key={d.id}>
            <p className="break-all font-mono">Delegation {d.id}</p>
            <p className="mt-2 break-all">
              Agent {d.agentId} · exposure {d.position}
            </p>
            <p className="mt-1">
              Premium budget {d.premiumCapMicros} micros · policy limit cap {d.limitCapMicros}{' '}
              micros
            </p>
            <p className="mt-1 break-all">
              Beneficiary {d.beneficiary} · expires {new Date(d.expiresAt * 1000).toLocaleString()}
            </p>
            <p className="mt-2">
              {d.revoked
                ? 'Revoked'
                : d.expiresAt < Date.now() / 1000
                  ? 'Expired'
                  : 'Backend permission recorded'}
            </p>
            {!d.revoked && (
              <button
                className="proc-btn-secondary mt-3"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api('delegations/revoke', { id: d.id });
                    await load();
                  })
                }
              >
                Revoke future preparation
              </button>
            )}
          </article>
        ))}
      </div>
      <details className="border-t border-zinc-200 pt-5">
        <summary className="cursor-pointer font-medium">Agent SDK workflow</summary>
        <p className="mt-3 text-sm leading-6">
          Use ProcurementApiClient from @arcuex/agent-sdk. Authenticate with an external signer,
          discover products, inspect authority, request a quote, accept its exact digest, prepare,
          then submit the returned approve and bind transactions through your external authorized
          wallet. Confirm the receipt and retrieve policy status. The API never signs or broadcasts.
        </p>
        <pre className="mt-3 overflow-auto rounded-lg bg-zinc-100 p-4 text-xs">{`const api = new ProcurementApiClient({ baseUrl });
await api.authenticate(agentAddress, signMessage);
const products = await api.products();
const authority = await api.authority({ agentId, delegationId });
const quote = await api.quote({
  idempotencyKey, agentId, delegationId,
  beneficiary: authority.delegation.beneficiary,
  limitMicros: '10000000', durationDays: 7,
  eligibility: { positionHealthy: true, noKnownIncident: true,
    syntheticOnly: true, ownerAttestsControl: true }
});
const prepared = await api.procure({ quoteId: quote.terms.quoteId,
  delegationId, acceptedDigest: quote.digest });
// External authorized wallet approves and binds, then:
await api.confirm({ policyId: prepared.policy.terms.policyId, hash });
await api.policy(prepared.policy.terms.policyId);`}</pre>
      </details>
    </div>
  );
}
