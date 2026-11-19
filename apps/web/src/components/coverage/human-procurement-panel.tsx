'use client';

import Link from 'next/link';
import type { PolicyLifecycle } from '@arcuex/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Callout } from '@/components/ui/callout';
import { Stepper, type StepItem } from '@/components/ui/stepper';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { useFixtureMode } from '@/providers/source-mode';

const usdc = (value: string) => `${formatUnits(BigInt(value), 6)} USDC`;

type Preparation = {
  policy: Policy;
  transactions: { to: Address; data: Hex; account: Address; description: string }[];
  chainId: number;
};

type WizardStage = 1 | 2 | 3 | 4;

/**
 * Progressive four-stage coverage wizard.
 * Stages: (1) exposure (2) quote (3) immutable terms (4) allowance → bind → confirm.
 * Business/API behavior unchanged from prior panel.
 */
export function HumanProcurementPanel() {
  const fixtureMode = useFixtureMode();
  const { wallet, api, run, busy, error } = useProcurement();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [stage, setStage] = useState<WizardStage>(1);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [label, setLabel] = useState('');
  const [position, setPosition] = useState('');
  const [signer, setSigner] = useState('');
  const [exposure, setExposure] = useState('100000000');
  const [limit, setLimit] = useState('1000000');
  const [days, setDays] = useState(7);
  const [beneficiary, setBeneficiary] = useState('');
  const [checks, setChecks] = useState([false, false, false, false]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [prep, setPrep] = useState<Preparation | null>(null);
  const [approved, setApproved] = useState(false);
  const [hash, setHash] = useState<Hex | null>(null);
  const identityRevision = useRef(0);
  const [lifecycle, setLifecycle] = useState<PolicyLifecycle | null>(null);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const confirmed =
    lifecycle?.state === 'confirmed' &&
    lifecycle.completeness === 'VERIFIED_LINKED' &&
    lifecycle.checkedAt !== null &&
    now / 1000 <= lifecycle.checkedAt + 300
      ? prep?.policy
      : null;
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    const reset = () => {
      identityRevision.current++;
      setLifecycle(null);
    };
    window.addEventListener('arcuex-session-changed', reset);
    return () => window.removeEventListener('arcuex-session-changed', reset);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    identityRevision.current++;
    setAgents([]);
    setAgentId('');
    setQuote(null);
    setPrep(null);
    setHash(null);
    setLifecycle(null);
    setAccepted(false);
    setApproved(false);
    setStage(1);
    setBeneficiary(wallet.address ?? '');
    setSigner(wallet.address ?? '');
  }, [wallet.address, wallet.chainId]);

  useEffect(() => {
    if (stage <= 2) {
      setQuote(null);
      setAccepted(false);
      setPrep(null);
      setApproved(false);
      setHash(null);
    }
  }, [agentId, limit, days, beneficiary, checks, stage]);

  const expired = !!quote && now / 1000 >= quote.terms.quoteExpiresAt;

  const steps: StepItem[] = useMemo(() => {
    const mark = (n: WizardStage, complete: boolean): StepItem['state'] => {
      if (complete) return 'complete';
      if (stage === n) return confirmed ? 'complete' : error && stage === 4 ? 'error' : 'current';
      return stage > n ? 'complete' : 'upcoming';
    };
    return [
      { id: '1', label: 'Exposure', state: mark(1, !!agentId && agents.length > 0) },
      { id: '2', label: 'Quote', state: mark(2, !!quote) },
      { id: '3', label: 'Accept terms', state: mark(3, !!prep) },
      {
        id: '4',
        label: 'Pay & bind',
        state: confirmed ? 'complete' : stage === 4 && error ? 'error' : mark(4, false),
      },
    ];
  }, [stage, agentId, agents.length, quote, prep, confirmed, error]);

  async function refreshLifecycle(policyId: string) {
    const revision = identityRevision.current;
    setLifecycle(null);
    const response = await fetch(`/api/policies/${policyId}/lifecycle`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.status === 401) window.dispatchEvent(new Event('arcuex-session-changed'));
    if (!response.ok) throw new Error('Policy verification unavailable; no coverage confirmed.');
    const result = (await response.json()) as PolicyLifecycle;
    if (result.version !== 1 || result.policyId !== policyId)
      throw new Error('Invalid lifecycle response');
    if (revision === identityRevision.current) setLifecycle(result);
  }

  async function loadAgents() {
    const rows = await api<Agent[]>('agents');
    setAgents(rows);
    if (rows[0]) setAgentId(rows[0].id);
  }

  async function payment(kind: 'approve' | 'bind') {
    if (fixtureMode) throw new Error('Wallet transactions disabled in synthetic fixture mode');
    if (!prep || !quote || !publicClient || !walletClient) throw new Error('Wallet not ready');
    if (wallet.uiStatus !== 'ready' || wallet.address?.toLowerCase() !== prep.policy.payer)
      throw new Error('Wrong account or network; reconnect the policy payer.');
    if (Date.now() / 1000 >= quote.terms.quoteExpiresAt)
      throw new Error('Quote expired. Request a new quote.');
    if ((await walletClient.getChainId()) !== 5042002) throw new Error('Switch to Arc Testnet.');
    const fresh = await api<Preparation>('procure', {
      quoteId: quote.terms.quoteId,
      acceptedDigest: quote.digest,
    });
    if (fresh.policy.state === 'confirmed') {
      await refreshLifecycle(fresh.policy.terms.policyId);
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
      await api<Policy>('confirm', { policyId: prep.policy.terms.policyId, hash: txHash });
      await refreshLifecycle(prep.policy.terms.policyId);
      setNotice(
        'Bind receipt checked. Canonical reconciliation must verify the policy before coverage is confirmed.',
      );
    } else {
      await api('approvals', { policyId: prep.policy.terms.policyId, hash: txHash });
      setApproved(true);
      setNotice(
        'Premium approval confirmed. Continue to bind; approval alone provides no coverage.',
      );
    }
  }

  function goBack() {
    setStepError(null);
    setStage((s) => (s > 1 ? ((s - 1) as WizardStage) : s));
  }

  async function continueFromStage() {
    setStepError(null);
    if (stage === 1) {
      if (!agentId) {
        setStepError('Select or register an agent exposure before continuing.');
        return;
      }
      setStage(2);
      return;
    }
    if (stage === 2) {
      if (!checks.every(Boolean)) {
        setStepError('Confirm every eligibility attestation before generating a quote.');
        return;
      }
      await run(async () => {
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
        setNotice('Quote created. Review immutable terms before accepting.');
        setStage(3);
      });
      return;
    }
    if (stage === 3) {
      if (!quote || !accepted) {
        setStepError('Accept the exact synthetic terms to prepare payment.');
        return;
      }
      if (expired) {
        setStepError('Quote expired. Go back and generate a new quote.');
        return;
      }
      await run(async () => {
        setPrep(
          await api<Preparation>('procure', {
            quoteId: quote.terms.quoteId,
            acceptedDigest: quote.digest,
          }),
        );
        setNotice('Terms accepted and payment prepared. Approve USDC, then bind.');
        setStage(4);
      });
    }
  }

  return (
    <div className="procurement space-y-6">
      <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap gap-2">
          <StatusBadge label="SYNTHETIC PRODUCT" tone="synthetic" />
          <StatusBadge label="REAL TESTNET TRANSFERS" tone="live" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">{PRODUCT.name}</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">{PRODUCT.event}</p>
        <p className="text-sm text-[var(--ink)]">{PRODUCT.pricing}</p>
      </div>

      <Stepper steps={steps} ariaLabel="Coverage wizard progress" />

      <div className="flex flex-wrap gap-2" aria-live="polite">
        {quote && !prep ? <StatusBadge label="Quote created" tone="pending" /> : null}
        {prep && !approved && !confirmed ? (
          <StatusBadge label="Wallet approval pending" tone="pending" />
        ) : null}
        {approved && !confirmed ? (
          <StatusBadge label="Allowance confirmed · bind required" tone="pending" />
        ) : null}
        {hash && !confirmed ? (
          <StatusBadge label="Reconciliation pending — no coverage confirmed" tone="pending" />
        ) : null}
        {confirmed ? <StatusBadge label="Policy confirmed on Arc Testnet" tone="ok" /> : null}
      </div>

      {(error || stepError) && (
        <Callout kind="danger" title="Action needed">
          <p role="alert">{stepError ?? error}</p>
        </Callout>
      )}
      {notice && (
        <Callout kind={confirmed ? 'live' : 'info'} title="Status">
          <p role="status">{notice}</p>
        </Callout>
      )}

      {stage === 1 && (
        <section className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h3 className="text-lg font-semibold">1. Register exposure</h3>
          <p className="text-sm text-[var(--ink-muted)]">
            Use the header Sign in control, then load agents owned by this wallet. Connect status is
            shown in the shell — not duplicated here.
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => void run(loadAgents)}>
            Load my agents
          </Button>
          {agents.length > 0 ? (
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
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">No agents loaded yet.</p>
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
            <p className="mt-3 text-xs text-[var(--ink-muted)]">
              Registration attests ownership of a synthetic position. No external protocol ownership
              verification is integrated.
            </p>
          </details>
        </section>
      )}

      {stage === 2 && (
        <section className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h3 className="text-lg font-semibold">2. Configure coverage & generate quote</h3>
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
          <Callout kind="synthetic" title="Quote generation">
            Continuing generates a demo quote from these exact attestations. It is not risk pricing.
          </Callout>
        </section>
      )}

      {stage === 3 && quote && (
        <section className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h3 className="text-lg font-semibold">3. Accept immutable terms</h3>
          <dl className="grid gap-4 rounded-[var(--radius)] bg-[var(--surface-inset)] p-5 sm:grid-cols-3">
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
                <dt className="text-xs text-[var(--ink-muted)]">{k}</dt>
                <dd className="mt-1 text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="break-all text-sm">Beneficiary: {quote.terms.beneficiary}</p>
          <p className="text-sm leading-6">{quote.terms.insuredEvent}</p>
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">Exclusions</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--ink-muted)]">
              {quote.terms.exclusions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <Callout kind="warn" title="Limitations">
            {PRODUCT.limitations} Coverage begins only after canonical reconciliation verifies a
            matching bind and the scheduled start. Late binds are ineligible.
          </Callout>
          <details>
            <summary className="cursor-pointer text-sm">Full versioned terms & digest</summary>
            <pre className="mt-3 overflow-auto rounded-lg bg-[var(--surface-inset)] p-4 font-mono text-xs">
              {JSON.stringify(quote, null, 2)}
            </pre>
          </details>
          <label className="proc-check text-sm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            I accept these exact synthetic terms and the testnet premium.
          </label>
          {expired && (
            <p role="alert" className="text-sm text-amber-800">
              Quote expired. Go back and generate a new quote.
            </p>
          )}
        </section>
      )}

      {stage === 4 && prep && (
        <section className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h3 className="text-lg font-semibold">4. USDC allowance, bind & confirmation</h3>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--ink-muted)]">
            <li>
              <strong className="text-[var(--ink)]">Allowance:</strong> approve the exact premium.
              Approval alone is not coverage.
            </li>
            <li>
              <strong className="text-[var(--ink)]">Bind:</strong> pay premium and submit the bind
              transaction.
            </li>
            <li>
              <strong className="text-[var(--ink)]">Confirm:</strong> verify the Arc Testnet receipt
              and canonical reconciliation before treating the policy as confirmed.
            </li>
          </ol>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={busy || expired || !!confirmed}
              onClick={() => void run(() => payment('approve'))}
            >
              Approve exact USDC premium
            </Button>
            <Button
              disabled={busy || expired || !!confirmed}
              onClick={() => void run(() => payment('bind'))}
            >
              Pay premium & bind policy
            </Button>
            {hash && !confirmed ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api<Policy>('confirm', { policyId: prep.policy.terms.policyId, hash });
                    await refreshLifecycle(prep.policy.terms.policyId);
                  })
                }
              >
                Re-check bind confirmation
              </Button>
            ) : null}
          </div>
          {hash && (
            <a
              className="break-all text-sm underline"
              href={`https://explorer.testnet.arc.io/tx/${hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View submitted bind transaction
            </a>
          )}
          {confirmed && (
            <Callout kind="live" title="Policy confirmed">
              <p>
                Confirmed on Arc Testnet. Coverage follows the scheduled effective window — not
                merely this UI state.{' '}
                <Link className="underline" href={`/policies/${confirmed.terms.policyId}`}>
                  Open policy
                </Link>
              </p>
            </Callout>
          )}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setPrep(null);
              setQuote(null);
              setAccepted(false);
              setApproved(false);
              setHash(null);
              setLifecycle(null);
              setStage(2);
            }}
          >
            Start a fresh quote
          </Button>
        </section>
      )}

      {!confirmed && (
        <div className="flex flex-wrap gap-3 border-t border-[var(--line)] pt-4">
          <Button variant="secondary" disabled={busy || stage === 1} onClick={goBack}>
            Back
          </Button>
          {stage < 4 ? (
            <Button disabled={busy} onClick={() => void continueFromStage()}>
              {stage === 1 && 'Continue'}
              {stage === 2 && (busy ? 'Generating quote…' : 'Generate quote & continue')}
              {stage === 3 && (busy ? 'Preparing…' : 'Accept & prepare payment')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
