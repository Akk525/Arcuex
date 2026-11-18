'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, type Hex, type Address } from 'viem';
import {
  PROCUREMENT_PRODUCT as PRODUCT,
  type ProcurementAgent as Agent,
  type ProcurementQuote as Quote,
  type ProcurementPolicy as Policy,
} from '@arcuex/domain/procurement';
import { ARC_MIN_MAX_FEE_PER_GAS } from '@arcuex/chain';
import { useProcurement } from '@/hooks/use-procurement';
import { WalletPanel } from '@/components/wallet/wallet-panel';
import { Callout } from '@/components/ui/callout';
import { Stepper, type StepItem } from '@/components/ui/stepper';
import { StatusBadge } from '@/components/status-badge';
const usdc = (value: string) => `${formatUnits(BigInt(value), 6)} USDC`;
type Preparation = {
  policy: Policy;
  transactions: { to: Address; data: Hex; account: Address; description: string }[];
  chainId: number;
};
export function HumanProcurementPanel() {
  const { wallet, api, run, busy, error } = useProcurement();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [agents, setAgents] = useState<Agent[]>([]),
    [agentId, setAgentId] = useState(''),
    [label, setLabel] = useState(''),
    [position, setPosition] = useState(''),
    [signer, setSigner] = useState(''),
    [exposure, setExposure] = useState('100000000');
  const [limit, setLimit] = useState('1000000'),
    [days, setDays] = useState(7),
    [beneficiary, setBeneficiary] = useState('');
  const [checks, setChecks] = useState([false, false, false, false]),
    [quote, setQuote] = useState<Quote | null>(null),
    [accepted, setAccepted] = useState(false),
    [prep, setPrep] = useState<Preparation | null>(null),
    [hash, setHash] = useState<Hex | null>(null),
    [confirmed, setConfirmed] = useState<Policy | null>(null),
    [notice, setNotice] = useState(''),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setAgents([]);
    setAgentId('');
    setQuote(null);
    setPrep(null);
    setHash(null);
    setConfirmed(null);
    setAccepted(false);
    setBeneficiary(wallet.address ?? '');
    setSigner(wallet.address ?? '');
  }, [wallet.address]);
  useEffect(() => {
    setQuote(null);
    setAccepted(false);
  }, [agentId, limit, days, beneficiary, checks]);
  const expired = !!quote && now / 1000 >= quote.terms.quoteExpiresAt;
  const txPhase = useMemo(() => {
    if (confirmed) return 'confirmed' as const;
    if (error && (prep || hash)) return 'failed' as const;
    if (hash || notice.includes('Transaction submitted')) return 'submitted' as const;
    if (prep && notice.toLowerCase().includes('approve')) return 'approval_pending' as const;
    if (prep) return 'prepared' as const;
    if (accepted && quote) return 'quote_accepted' as const;
    if (quote) return 'quote_created' as const;
    return 'idle' as const;
  }, [confirmed, error, prep, hash, notice, accepted, quote]);
  const steps: StepItem[] = useMemo(() => {
    const registered = agents.length > 0 && !!agentId;
    const quoted = !!quote;
    const termsAccepted = accepted && !!quote;
    const done = !!confirmed;
    const failed = txPhase === 'failed';
    return [
      {
        id: 'register',
        label: 'Register exposure',
        state: registered ? 'complete' : 'current',
      },
      {
        id: 'quote',
        label: 'Build quote',
        state: quoted ? 'complete' : registered ? 'current' : 'upcoming',
      },
      {
        id: 'accept',
        label: 'Accept terms',
        state: termsAccepted ? 'complete' : quoted ? 'current' : 'upcoming',
      },
      {
        id: 'bind',
        label: 'Approve & bind',
        state: done ? 'complete' : failed ? 'error' : termsAccepted ? 'current' : 'upcoming',
      },
    ];
  }, [agents.length, agentId, quote, accepted, confirmed, txPhase]);
  async function loadAgents() {
    const rows = await api<Agent[]>('agents');
    setAgents(rows);
    if (rows[0]) setAgentId(rows[0].id);
  }
  async function payment(kind: 'approve' | 'bind') {
    if (!prep || !quote || !publicClient || !walletClient) throw new Error('Wallet not ready');
    if (wallet.uiStatus !== 'ready' || wallet.address?.toLowerCase() !== prep.policy.payer)
      throw new Error('Wrong account or network; reconnect the policy payer.');
    if (Date.now() / 1000 >= quote.terms.quoteExpiresAt)
      throw new Error('Quote expired. Request a new quote.');
    if ((await walletClient.getChainId()) !== 5042002) throw new Error('Switch to Arc Testnet.');
    // Revalidate backend permission/caps/revocation immediately before each authorization.
    const fresh = await api<Preparation>('procure', {
      quoteId: quote.terms.quoteId,
      acceptedDigest: quote.digest,
    });
    if (fresh.policy.state === 'confirmed') {
      setConfirmed(fresh.policy);
      return;
    }
    const tx = fresh.transactions[kind === 'approve' ? 0 : 1];
    if (!tx) throw new Error('No transaction available. Refresh policy status.');
    await publicClient.call({ account: wallet.address, to: tx.to, data: tx.data });
    setNotice(
      kind === 'approve'
        ? 'Approve the exact premium in your wallet.'
        : 'Confirm the policy bind in your wallet.',
    );
    const currentAddresses = await walletClient.getAddresses();
    if (
      currentAddresses[0]?.toLowerCase() !== prep.policy.payer ||
      (await walletClient.getChainId()) !== 5042002
    )
      throw new Error('Wallet account or network changed. Reconnect before authorizing.');
    const txHash = await walletClient.sendTransaction({
      account: wallet.address,
      chain: walletClient.chain,
      to: tx.to,
      data: tx.data,
      maxFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
    });
    if (kind === 'bind') {
      setHash(txHash);
      sessionStorage.setItem(`arcuex-bind:${prep.policy.terms.policyId}`, txHash);
    }
    setNotice('Transaction submitted. Waiting for confirmation…');
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });
    if (receipt.status !== 'success')
      throw new Error('Transaction reverted. No coverage confirmed.');
    if (kind === 'bind') {
      setConfirmed(
        await api<Policy>('confirm', { policyId: prep.policy.terms.policyId, hash: txHash }),
      );
      setNotice('Bind receipt verified. Coverage begins at the scheduled effective time.');
    } else {
      await api('approvals', { policyId: prep.policy.terms.policyId, hash: txHash });
      setNotice(
        'Premium approval confirmed. Continue to bind; approval alone provides no coverage.',
      );
    }
  }
  return (
    <div className="procurement space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          <div className="flex flex-wrap gap-2">
            <StatusBadge label="SYNTHETIC PRODUCT" tone="synthetic" />
            <StatusBadge label="REAL TESTNET TRANSFERS" tone="live" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
            Protection for an oracle adapter failure
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--ink-muted)]">
            Cover a registered demo lending position against wrongful liquidation caused by an
            oracle adapter. Arc Testnet only. No legal insurance or external loss oracle. A policy
            is not active until bind confirmation succeeds on chain.
          </p>
          <p className="text-sm text-[var(--ink)]">{PRODUCT.pricing}</p>
        </section>
        <WalletPanel />
      </div>
      <Stepper steps={steps} ariaLabel="Coverage procurement progress" />
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {txPhase === 'quote_created' ? <StatusBadge label="Quote created" tone="pending" /> : null}
        {txPhase === 'quote_accepted' ? (
          <StatusBadge label="Terms accepted — not yet coverage" tone="pending" />
        ) : null}
        {txPhase === 'prepared' ? (
          <StatusBadge label="Wallet approval pending" tone="pending" />
        ) : null}
        {txPhase === 'approval_pending' ? (
          <StatusBadge label="Wallet approval pending" tone="pending" />
        ) : null}
        {txPhase === 'submitted' ? (
          <StatusBadge label="Transaction submitted" tone="pending" />
        ) : null}
        {txPhase === 'confirmed' ? (
          <StatusBadge label="Policy confirmed on Arc Testnet" tone="ok" />
        ) : null}
        {txPhase === 'failed' ? <StatusBadge label="Transaction failed" tone="error" /> : null}
      </div>
      {error && (
        <Callout kind="danger" title="Transaction or request failed">
          <p role="alert">
            {error} You can retry the same step. No coverage is confirmed after a failed bind.
          </p>
        </Callout>
      )}
      {notice && (
        <Callout kind={confirmed ? 'live' : 'info'} title="Status">
          <p role="status">{notice}</p>
        </Callout>
      )}
      <fieldset disabled={busy || !!prep} className="space-y-5">
        <legend className="text-xl font-semibold">1. Agent & exposure</legend>
        <button className="proc-btn-secondary" onClick={() => void run(loadAgents)}>
          Sign in & load my agents
        </button>
        {agents.length > 0 && (
          <label>
            Registered agent
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} · {a.exposure.position}
                </option>
              ))}
            </select>
          </label>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Register a new synthetic position
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              Agent label
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="treasury-agent"
              />
            </label>
            <label>
              Agent wallet
              <input value={signer} onChange={(e) => setSigner(e.target.value)} />
            </label>
            <label>
              Position identifier
              <input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="demo-position-01"
              />
            </label>
            <label>
              Exposure value (USDC micros)
              <input
                value={exposure}
                onChange={(e) => setExposure(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <div className="self-end">
              <button
                className="proc-btn-secondary"
                onClick={() =>
                  void run(async () => {
                    const a = await api<Agent>('agents', {
                      label,
                      signer,
                      position,
                      exposureMicros: exposure,
                      ownerAttestsControl: true,
                      chainId: 5042002,
                      protocol: PRODUCT.protocol,
                    });
                    setAgents((prev) => [...prev, a]);
                    setAgentId(a.id);
                  })
                }
              >
                Register position I control
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Registration attests ownership of a synthetic position. No external protocol ownership
            verification is integrated.
          </p>
        </details>
        <h3 className="text-xl font-semibold">2. Coverage configuration</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <label>
            Limit
            <select value={limit} onChange={(e) => setLimit(e.target.value)}>
              {['1000000', '10000000', '50000000', '100000000'].map((v) => (
                <option key={v} value={v}>
                  {usdc(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Duration
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 7, 30].map((v) => (
                <option key={v} value={v}>
                  {v} days
                </option>
              ))}
            </select>
          </label>
          <label>
            Beneficiary
            <input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} />
          </label>
        </div>
        <div className="grid gap-3 text-sm">
          {[
            'This registered position is healthy under the canonical collateral ratio.',
            'I know of no existing incident or liquidation affecting this position.',
            'This exposure and its evidence are synthetic demo data only.',
            'I control this position and attest that its registration is accurate.',
          ].map((s, i) => (
            <label className="proc-check" key={s}>
              <input
                type="checkbox"
                checked={checks[i]}
                onChange={(e) =>
                  setChecks((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                }
              />
              {s}
            </label>
          ))}
        </div>
        <button
          className="proc-btn"
          disabled={!agentId || !checks.every(Boolean)}
          onClick={() =>
            void run(async () => {
              setAccepted(false);
              setQuote(
                await api<Quote>('quotes', {
                  agentId,
                  limitMicros: limit,
                  durationDays: days,
                  beneficiary,
                  eligibility: {
                    positionHealthy: checks[0],
                    noKnownIncident: checks[1],
                    syntheticOnly: checks[2],
                    ownerAttestsControl: checks[3],
                  },
                }),
              );
            })
          }
        >
          {busy ? 'Working…' : 'Generate demo quote'}
        </button>
      </fieldset>
      {quote && (
        <section className="space-y-4 border-t border-zinc-200 pt-6">
          <h3 className="text-xl font-semibold">3. Review immutable terms</h3>
          <dl className="grid gap-4 rounded-xl bg-zinc-100 p-5 sm:grid-cols-3">
            {[
              ['Premium', usdc(quote.terms.premiumMicros)],
              ['Limit', usdc(quote.terms.limitMicros)],
              ['Deductible', usdc(quote.terms.deductibleMicros)],
              [
                'Effective after binding',
                new Date(quote.terms.effectiveAt * 1000).toLocaleString(),
              ],
              ['Coverage expiry', new Date(quote.terms.expiresAt * 1000).toLocaleString()],
              ['Quote expires', new Date(quote.terms.quoteExpiresAt * 1000).toLocaleString()],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-zinc-500">{k}</dt>
                <dd className="mt-1 text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="break-all text-sm">Beneficiary: {quote.terms.beneficiary}</p>
          <p className="text-sm leading-6">{quote.terms.insuredEvent}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600">
            {quote.terms.exclusions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="text-sm leading-6 text-amber-900">
            {PRODUCT.limitations} Coverage begins only after a matching successful receipt and the
            scheduled start. Late binds are ineligible.
          </p>
          <details>
            <summary className="cursor-pointer text-sm">Full versioned terms & digest</summary>
            <pre className="mt-3 overflow-auto rounded-lg bg-zinc-100 p-4 text-xs">
              {JSON.stringify(quote, null, 2)}
            </pre>
          </details>
          {!prep && (
            <>
              <label className="proc-check text-sm">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                I accept these exact synthetic terms and the testnet premium.
              </label>
              <button
                className="proc-btn"
                disabled={busy || !accepted || expired}
                onClick={() =>
                  void run(async () => {
                    setPrep(
                      await api<Preparation>('procure', {
                        quoteId: quote.terms.quoteId,
                        acceptedDigest: quote.digest,
                      }),
                    );
                  })
                }
              >
                Accept terms & prepare payment
              </button>
            </>
          )}
          {expired && !confirmed && (
            <p role="alert" className="text-sm text-amber-800">
              Quote expired. Generate a new quote. Existing approval does not activate coverage.
            </p>
          )}
        </section>
      )}
      {prep && !confirmed && (
        <section className="space-y-4 border-t border-zinc-200 pt-6">
          <h3 className="text-xl font-semibold">4. Authorize payment & bind</h3>
          <p className="text-sm text-zinc-600">
            Two separate wallet approvals. The pool pulls the premium during bind and reserves the
            limit. No coverage is confirmed yet.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="proc-btn-secondary"
              disabled={busy || expired}
              onClick={() => void run(() => payment('approve'))}
            >
              Approve exact USDC premium
            </button>
            <button
              className="proc-btn"
              disabled={busy || expired}
              onClick={() => void run(() => payment('bind'))}
            >
              Pay premium & bind policy
            </button>
            <button
              className="proc-btn-secondary"
              disabled={busy}
              onClick={() => {
                setPrep(null);
                setQuote(null);
                setAccepted(false);
              }}
            >
              Start a fresh quote
            </button>
          </div>
          {hash && (
            <div className="space-y-2 text-sm">
              <a
                className="break-all underline"
                href={`https://explorer.testnet.arc.io/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View submitted bind transaction
              </a>
              <button
                className="proc-btn-secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    setConfirmed(
                      await api<Policy>('confirm', { policyId: prep.policy.terms.policyId, hash }),
                    ),
                  )
                }
              >
                Retry receipt verification
              </button>
            </div>
          )}
        </section>
      )}
      {confirmed && (
        <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-6">
          <h3 className="text-xl font-semibold text-emerald-950">Policy bind confirmed</h3>
          <p className="mt-2 text-sm">
            Synthetic protection starts{' '}
            {new Date(confirmed.terms.effectiveAt * 1000).toLocaleString()}. The USDC bind is
            confirmed on Arc Testnet.
          </p>
          <Link
            className="mt-4 inline-block underline"
            href={`/policies/${confirmed.terms.policyId}`}
          >
            View policy & live reconciliation →
          </Link>
        </section>
      )}
    </div>
  );
}
