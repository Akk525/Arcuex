'use client';

import Link from 'next/link';
import type { PolicyLifecycle } from '@arcuex/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, type Hex, type Address } from 'viem';
import {
  type ProcurementCatalog,
  type ProcurementCapacity,
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

type Acceptance = { policy: Policy; state: 'accepted_offchain' };
type Payment = {
  policy: Policy;
  transaction: { to: Address; data: Hex; account: Address; description: string } | null;
  chainId: number;
};

type WizardStage = 1 | 2 | 3 | 4;

export function HumanProcurementPanel({ resumePolicyId }: { resumePolicyId?: string }) {
  const fixtureMode = useFixtureMode();
  const { wallet, api, run, busy, error } = useProcurement();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [catalog, setCatalog] = useState<ProcurementCatalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [productCode, setProductCode] = useState('');
  const [capacity, setCapacity] = useState<ProcurementCapacity | null>(null);
  const product = catalog?.products.find((p) => p.code === productCode);
  const offline = fixtureMode || catalog?.paymentMode === 'fixture_offline';
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
  const [prep, setPrep] = useState<Acceptance | null>(null);
  const [approved, setApproved] = useState(false);
  const [hash, setHash] = useState<Hex | null>(null);
  const [approvalHash, setApprovalHash] = useState<Hex | null>(null);
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
    const controller = new AbortController();
    const options = { signal: controller.signal, cache: 'no-store' as const };
    void fetch('/api/procurement/products', options)
      .then(async (r) => {
        if (!r.ok) throw new Error('Product catalog unavailable');
        const data = (await r.json()) as ProcurementCatalog;
        setCatalog(data);
        setProductCode(data.products[0]?.code ?? '');
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogError(true);
      });
    void fetch('/api/procurement/capacity', options)
      .then(async (r) => {
        if (r.ok) setCapacity(await r.json());
      })
      .catch(() => {
        /* A quote can still be created. */
      });
    return () => controller.abort();
  }, []);

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
    setApprovalHash(null);
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
      setApprovalHash(null);
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
    setAgentId(
      rows.find(
        (row) =>
          row.owner === wallet.address?.toLowerCase() &&
          row.exposure.protocol === product?.protocol,
      )?.id ?? '',
    );
  }

  async function confirmPayment(kind: 'approve' | 'bind', txHash: Hex, policyId: string) {
    if (!publicClient) throw new Error('Connect to Arc Testnet to check this receipt.');
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      timeout: 20_000,
    });
    if (receipt.status !== 'success') {
      sessionStorage.removeItem(`arcuex-${kind}:${policyId}`);
      if (kind === 'bind') setHash(null);
      else setApprovalHash(null);
      throw new Error('Transaction reverted. You can retry while the quote is open.');
    }
    if (kind === 'bind') {
      await api<Policy>('confirm', { policyId, hash: txHash });
      await refreshLifecycle(policyId);
      setNotice(
        'Receipt checked. Coverage follows canonical reconciliation and the effective window.',
      );
    } else {
      await api('approvals', { policyId, hash: txHash });
      setApproved(true);
      setNotice('Premium allowance confirmed. Continue to authorize the bind.');
    }
  }

  async function payment(kind: 'approve' | 'bind') {
    if (offline) throw new Error('Wallet transactions disabled in synthetic fixture mode');
    if (!prep || !quote || !publicClient || !walletClient) throw new Error('Wallet not ready');
    const policyId = prep.policy.terms.policyId;
    if (wallet.uiStatus !== 'ready' || wallet.address?.toLowerCase() !== prep.policy.payer)
      throw new Error('Wrong account or network; reconnect the accepted payer.');
    if ((await walletClient.getChainId()) !== 5042002) throw new Error('Switch to Arc Testnet.');
    const pendingHash = kind === 'bind' ? hash : approvalHash;
    if (pendingHash) {
      await confirmPayment(kind, pendingHash, policyId);
      return;
    }
    if (Date.now() / 1000 >= quote.terms.quoteExpiresAt)
      throw new Error('Quote expired. Request a new quote.');
    const fresh = await api<Payment>('payment', {
      policyId,
      acceptedDigest: quote.digest,
      stage: kind,
    });
    if (fresh.policy.state === 'confirmed') {
      await refreshLifecycle(policyId);
      return;
    }
    const tx = fresh.transaction;
    if (
      !tx ||
      fresh.chainId !== 5042002 ||
      fresh.policy.digest !== quote.digest ||
      tx.account.toLowerCase() !== prep.policy.payer
    )
      throw new Error('Payment details changed. Refresh the policy.');
    await publicClient.call({ account: wallet.address, to: tx.to, data: tx.data });
    const currentAddresses = await walletClient.getAddresses();
    if (
      currentAddresses[0]?.toLowerCase() !== prep.policy.payer ||
      (await walletClient.getChainId()) !== 5042002
    )
      throw new Error('Wallet account or network changed. Reconnect before authorizing.');
    if (Date.now() / 1000 >= quote.terms.quoteExpiresAt)
      throw new Error('Quote expired before wallet authorization.');
    setNotice(
      kind === 'approve'
        ? 'Review the exact premium allowance in your wallet.'
        : 'Review the premium and policy bind in your wallet.',
    );
    const txHash = await walletClient.sendTransaction({
      account: wallet.address,
      chain: walletClient.chain,
      to: tx.to,
      data: tx.data,
      maxFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
    });
    if (kind === 'bind') setHash(txHash);
    else setApprovalHash(txHash);
    sessionStorage.setItem(`arcuex-${kind}:${policyId}`, txHash);
    setNotice('Transaction submitted. Check the receipt before retrying.');
    await confirmPayment(kind, txHash, policyId);
  }

  function openPayment(acceptance: Acceptance) {
    const id = acceptance.policy.terms.policyId;
    setPrep(acceptance);
    setHash(sessionStorage.getItem(`arcuex-bind:${id}`) as Hex | null);
    setApprovalHash(sessionStorage.getItem(`arcuex-approve:${id}`) as Hex | null);
    setApproved(false);
    setStage(4);
  }

  async function resumePayment() {
    if (!resumePolicyId || offline) return;
    const { policy } = await api<{ policy: Policy }>(
      `policies/${encodeURIComponent(resumePolicyId)}`,
    );
    if (policy.payer !== wallet.address?.toLowerCase())
      throw new Error('Connect the accepted payer to resume this purchase.');
    if (!catalog?.products.some((p) => p.code === policy.terms.productCode))
      throw new Error('This product is currently unavailable for payment.');
    const hadSubmission = sessionStorage.getItem(`arcuex-bind:${policy.terms.policyId}`);
    if (
      !hadSubmission &&
      policy.state !== 'confirmed' &&
      Date.now() / 1000 >= policy.terms.quoteExpiresAt
    )
      throw new Error('This quote expired. Start a fresh quote.');
    setProductCode(policy.terms.productCode);
    setQuote({ terms: policy.terms, digest: policy.digest });
    openPayment({ policy, state: 'accepted_offchain' });
    if (policy.state === 'confirmed') await refreshLifecycle(policy.terms.policyId);
  }

  function goBack() {
    setStepError(null);
    setStage((s) => (s > 1 ? ((s - 1) as WizardStage) : s));
  }

  async function continueFromStage() {
    setStepError(null);
    if (stage === 1) {
      if (!product || !agentId) {
        setStepError('Select or register an agent exposure before continuing.');
        return;
      }
      setStage(2);
      return;
    }
    if (stage === 2) {
      if (!product || !checks.every(Boolean)) {
        setStepError('Confirm every eligibility attestation before generating a quote.');
        return;
      }
      await run(async () => {
        setAccepted(false);
        setQuote(
          await api<Quote>('quotes', {
            agentId,
            productCode: product.code,
            productVersion: product.version,
            limitMicros: limit,
            durationDays: days,
            beneficiary,
            eligibility: {
              positionHealthy: checks[0],
              noKnownIncident: checks[1],
              syntheticOnly: product.synthetic,
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
      if (offline || !quote || !accepted) {
        setStepError('Review and accept the exact quote for Arc Testnet payment.');
        return;
      }
      if (expired) {
        setStepError('Quote expired. Go back and generate a new quote.');
        return;
      }
      await run(async () => {
        const acceptance = await api<Acceptance>('accept', {
          quoteId: quote.terms.quoteId,
          acceptedDigest: quote.digest,
        });
        openPayment(acceptance);
        setNotice('Terms accepted offchain. Authorize each payment step separately.');
        if (acceptance.policy.state === 'confirmed')
          await refreshLifecycle(acceptance.policy.terms.policyId);
      });
    }
  }

  return (
    <div className="procurement space-y-6">
      <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap gap-2">
          {product && (
            <StatusBadge
              label={product.synthetic ? 'SYNTHETIC PRODUCT' : 'INDEPENDENT-EVIDENCE PILOT'}
              tone={product.synthetic ? 'synthetic' : 'pending'}
            />
          )}
          {catalog && (
            <StatusBadge
              label={offline ? 'OFFLINE QUOTES ONLY' : 'ARC TESTNET · PAYMENT PREFLIGHT REQUIRED'}
              tone="pending"
            />
          )}
        </div>
        {catalogError && <p role="alert">Product catalog unavailable. Reload to retry.</p>}
        {!catalog && !catalogError && <p role="status">Loading approved products…</p>}
        {product && (
          <>
            <label>
              Approved coverage product
              <select
                value={productCode}
                disabled={stage !== 1 || busy}
                onChange={(e) => {
                  const selected = catalog?.products.find(
                    (option) => option.code === e.target.value,
                  );
                  if (!selected) return;
                  setProductCode(selected.code);
                  setAgentId('');
                  setPosition('');
                  setLimit(selected.limitsMicros[0]);
                  setDays(7);
                  setBeneficiary(wallet.address ?? '');
                  setChecks([false, false, false, false]);
                }}
              >
                {catalog?.products.map((p) => (
                  <option value={p.code} key={p.code}>
                    {p.name} · v{p.version}
                  </option>
                ))}
              </select>
            </label>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">
              {product.event}
            </p>
            <p className="text-sm text-[var(--ink)]">{product.pricing}</p>
            <p className="text-xs text-[var(--ink-muted)]">
              {capacity?.status === 'verified'
                ? `Available pool capacity at last check: ${usdc(capacity.availableMicros!)}. Quotes do not reserve capital.`
                : offline
                  ? 'Fixture source. No onchain capacity or payment available.'
                  : 'Current pool capacity is unverified.'}
            </p>
          </>
        )}
      </div>

      {resumePolicyId && catalog && !offline && stage === 1 && (
        <Button variant="secondary" disabled={busy} onClick={() => void run(resumePayment)}>
          Resume accepted purchase
        </Button>
      )}

      <Stepper steps={steps} ariaLabel="Coverage wizard progress" />

      <div className="flex flex-wrap gap-2" aria-live="polite">
        {quote && !prep ? (
          <StatusBadge label={expired ? 'Quote expired' : 'Offchain quote'} tone="pending" />
        ) : null}
        {prep && !approved && !hash && !expired && !confirmed ? (
          <StatusBadge label="Wallet approval pending" tone="pending" />
        ) : null}
        {approved && !hash && !expired && !confirmed ? (
          <StatusBadge label="Allowance confirmed · bind required" tone="pending" />
        ) : null}
        {prep && expired && !hash && !confirmed ? (
          <StatusBadge label="Quote expired · start a fresh quote" tone="warn" />
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

      {stage === 1 && product && (
        <section className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h3 className="text-lg font-semibold">1. Register exposure</h3>
          <p className="text-sm text-[var(--ink-muted)]">
            Use the header Sign in control, then load agents owned by this wallet. Connect status is
            shown in the shell — not duplicated here.
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => void run(loadAgents)}>
            Load my agents
          </Button>
          {agents.some(
            (a) =>
              a.owner === wallet.address?.toLowerCase() && a.exposure.protocol === product.protocol,
          ) ? (
            <label>
              Registered agent
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                {agents
                  .filter(
                    (a) =>
                      a.owner === wallet.address?.toLowerCase() &&
                      a.exposure.protocol === product.protocol,
                  )
                  .map((a) => (
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
              {product.synthetic
                ? 'Register a new synthetic position'
                : 'Register a reviewed position'}
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
                  placeholder={product.synthetic ? 'demo-position-01' : '0x… (32-byte position ID)'}
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
                        protocol: product.protocol,
                        productCode: product.code,
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
              {product.synthetic
                ? 'Registration records an attestation for a synthetic position.'
                : 'Register the reviewed position you control. Claims require independent verification.'}
            </p>
          </details>
        </section>
      )}

      {stage === 2 && product && (
        <section className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h3 className="text-lg font-semibold">2. Configure coverage & generate quote</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <label>
              Limit
              <select value={limit} onChange={(e) => setLimit(e.target.value)}>
                {product.limitsMicros.map((v) => (
                  <option key={v} value={v}>
                    {usdc(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duration
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {product.durationsDays.map((v) => (
                  <option key={v} value={v}>
                    {v} days
                  </option>
                ))}
              </select>
            </label>
            <label>
              Beneficiary
              <input
                value={beneficiary}
                readOnly={!product.synthetic}
                onChange={(e) => setBeneficiary(e.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-3 text-sm">
            {[
              'This registered position is healthy under the canonical collateral ratio.',
              'I know of no existing incident or liquidation affecting this position.',
              product.synthetic
                ? 'This exposure and its evidence are synthetic demo data only.'
                : 'I will provide independent liquidation, replay and recovery evidence for any claim.',
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
          <Callout kind={product.synthetic ? 'synthetic' : 'info'} title="Quote generation">
            Premium and deductible follow the testnet schedule. A quote is offchain and does not
            reserve capital.
          </Callout>
        </section>
      )}

      {stage === 3 && quote && product && (
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
            {product.limitations} Coverage begins only after canonical reconciliation verifies a
            matching bind and the scheduled start. Late binds are ineligible.
          </Callout>
          <details>
            <summary className="cursor-pointer text-sm">Full versioned terms & digest</summary>
            <pre className="mt-3 overflow-auto rounded-lg bg-[var(--surface-inset)] p-4 font-mono text-xs">
              {JSON.stringify(quote, null, 2)}
            </pre>
          </details>
          {offline ? (
            <Callout kind="synthetic" title="Offline quote">
              This fixture deployment cannot accept quotes for payment or bind a new policy.
            </Callout>
          ) : (
            <label className="proc-check text-sm">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              I accept these exact terms and the Arc Testnet premium.
            </label>
          )}
          {expired && (
            <p role="alert" className="text-sm text-amber-800">
              Quote expired. Go back and generate a new quote.
            </p>
          )}
        </section>
      )}

      {stage === 4 && prep && !offline && (
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
              disabled={busy || (expired && !approvalHash) || approved || !!hash || !!confirmed}
              onClick={() => void run(() => payment('approve'))}
            >
              {approvalHash && !approved
                ? 'Re-check premium approval'
                : 'Approve exact USDC premium'}
            </Button>
            <Button
              disabled={busy || (expired && !hash) || !!confirmed}
              onClick={() => void run(() => payment('bind'))}
            >
              {hash ? 'Re-check bind confirmation' : 'Pay premium & bind policy'}
            </Button>
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
              setApprovalHash(null);
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
          {stage < 4 && !(stage === 3 && offline) ? (
            <Button
              disabled={busy || !product || (stage === 3 && expired)}
              onClick={() => void continueFromStage()}
            >
              {stage === 1 && 'Continue'}
              {stage === 2 && (busy ? 'Generating quote…' : 'Generate quote & continue')}
              {stage === 3 && (busy ? 'Accepting…' : 'Accept terms')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
