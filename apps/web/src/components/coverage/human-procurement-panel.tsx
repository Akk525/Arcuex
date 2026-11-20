'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PolicyLifecycle, ProcurementDelegationView } from '@arcuex/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePublicClient, useWalletClient } from 'wagmi';
import { type Hex, type Address } from 'viem';
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
import { Metric } from '@/components/ui/metric';
import { TruthBadge } from '@/components/ui/truth-badge';
import { useFixtureMode } from '@/providers/source-mode';

import {
  displayDate,
  eligibleLimits,
  isBindHash,
  isWalletRejection,
  policyPhase,
  usdc,
  usdToMicros,
} from '@/lib/procurement/presentation';
import {
  bindAttemptKey,
  clearBindAttempt,
  readBindAttempt,
  saveBindAttempt,
} from '@/lib/procurement/bind-attempt';
import { delegationPresentation } from '@/lib/delegation-presentation';

type Acceptance = { policy: Policy; state: 'accepted_offchain' };
type Payment = {
  policy: Policy;
  transaction: { to: Address; data: Hex; account: Address; description: string } | null;
  chainId: number;
};

type WizardStage = 1 | 2 | 3 | 4;

export function HumanProcurementPanel({
  resumePolicyId,
  requestedAgentId,
  requestedGrantId,
  fromBuild,
}: {
  resumePolicyId?: string;
  requestedAgentId?: string;
  requestedGrantId?: string;
  fromBuild?: boolean;
}) {
  const router = useRouter();
  const delegated = Boolean(requestedGrantId);
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
  const [loaded, setLoaded] = useState(false);
  const [grant, setGrant] = useState<ProcurementDelegationView>();
  const [grantLoadedAt, setGrantLoadedAt] = useState(0);
  const [bindUncertain, setBindUncertain] = useState(false);
  const [recoveryHash, setRecoveryHash] = useState('');
  const [allowanceChecking, setAllowanceChecking] = useState(false);
  const [label, setLabel] = useState('');
  const [position, setPosition] = useState('');
  const [signer, setSigner] = useState('');
  const [exposure, setExposure] = useState('100');
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
  const phase = prep
    ? policyPhase(
        prep.policy,
        lifecycle,
        Math.floor(now / 1000),
        hash ? 'submitted' : bindUncertain ? 'uncertain' : undefined,
      )
    : undefined;
  const confirmed = phase === 'scheduled' || phase === 'effective' ? prep?.policy : null;
  const selectedAgent = agents.find((a) => a.id === agentId);
  const grantStatus = grant
    ? delegationPresentation(
        grant,
        Math.max(0, now - grantLoadedAt) / 1000,
        wallet.uiStatus === 'ready',
      )
    : undefined;
  const grantCanQuote =
    !delegated || (grantStatus?.active && grant?.limitation !== 'budget_exhausted');
  const limitChoices =
    product && selectedAgent
      ? eligibleLimits(product.limitsMicros, selectedAgent.exposure.notionalMicros, grant)
      : [];
  const selectedLimit = limitChoices.includes(limit) ? limit : limitChoices[0];
  const submitted = Boolean(hash || bindUncertain || prep?.policy.bindTx);
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal, cache: 'no-store' as const };
    void fetch('/api/procurement/products', options)
      .then(async (r) => {
        if (!r.ok) throw new Error('Product catalog unavailable');
        const data = (await r.json()) as ProcurementCatalog;
        setCatalog(data);
        setProductCode(
          (delegated ? data.products.find((row) => row.synthetic) : data.products[0])?.code ?? '',
        );
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
  }, [delegated]);

  useEffect(() => {
    const reset = () => {
      identityRevision.current++;
      setLifecycle(null);
      setGrant(undefined);
      setAgents([]);
      setAgentId('');
      setLoaded(false);
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
    setLoaded(false);
    setGrant(undefined);
    setBindUncertain(false);
    setRecoveryHash('');
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

  async function refreshCapacity() {
    const response = await fetch('/api/procurement/capacity', { cache: 'no-store' });
    if (!response.ok) throw new Error('Capacity check unavailable. Try again before paying.');
    setCapacity(await response.json());
  }

  async function loadAgents() {
    const start = Date.now();
    const result = await api<{ agents: Agent[]; delegations: ProcurementDelegationView[] }>('list');
    const signerAddress = wallet.address?.toLowerCase();
    setLoaded(true);
    if (delegated) {
      const scopedGrant = result.delegations.find(
        (row) => row.id === requestedGrantId && row.agentId === requestedAgentId,
      );
      const agent = result.agents.find(
        (row) =>
          row.id === scopedGrant?.agentId &&
          row.signer === signerAddress &&
          row.owner !== signerAddress,
      );
      if (!scopedGrant || !agent) {
        setGrant(undefined);
        setAgentId('');
        setAgents([]);
        throw new Error(
          'This grant is unavailable to the connected wallet. Connect the registered agent signer or ask the policyholder for the correct grant.',
        );
      }
      setAgents([agent]);
      setGrant(scopedGrant);
      setGrantLoadedAt(start);
      setAgentId(agent.id);
      setBeneficiary(scopedGrant.beneficiary);
      return;
    }
    const owned = result.agents.filter((row) => row.owner === signerAddress);
    setAgents(owned);
    setAgentId(
      owned.find(
        (row) => row.id === requestedAgentId && row.exposure.protocol === product?.protocol,
      )?.id ??
        owned.find((row) => row.exposure.protocol === product?.protocol)?.id ??
        '',
    );
  }

  useEffect(() => {
    if (!prep) return;
    const policyId = prep.policy.terms.policyId;
    const sync = (event: StorageEvent) => {
      if (event.key !== bindAttemptKey(policyId)) return;
      const attempt = readBindAttempt(policyId);
      setHash(attempt?.state === 'submitted' ? attempt.hash : null);
      setBindUncertain(attempt?.state === 'uncertain');
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [prep]);

  async function confirmPayment(kind: 'approve' | 'bind', txHash: Hex, policyId: string) {
    if (!publicClient) throw new Error('Connect to Arc Testnet to check this receipt.');
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      timeout: 20_000,
    });
    if (receipt.status !== 'success') {
      if (kind === 'bind') {
        clearBindAttempt(policyId);
        setBindUncertain(false);
        setHash(null);
      } else {
        sessionStorage.removeItem(`arcuex-${kind}:${policyId}`);
        setApprovalHash(null);
      }
      throw new Error('Transaction reverted. You can retry while the quote is open.');
    }
    if (kind === 'bind') {
      const policy = await api<Policy>('confirm', { policyId, hash: txHash });
      setPrep({ policy, state: 'accepted_offchain' });
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
    const bindAttempt = readBindAttempt(policyId);
    if (kind === 'bind' && bindAttempt?.state === 'uncertain')
      throw new Error('Check your wallet activity and enter the bind hash before trying again.');
    const pendingHash =
      kind === 'bind'
        ? (hash ?? (bindAttempt?.state === 'submitted' ? bindAttempt.hash : null))
        : approvalHash;
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
    const send = async () => {
      if (kind === 'bind') {
        if (readBindAttempt(policyId))
          throw new Error('A bind attempt already exists. Check its status before paying again.');
        saveBindAttempt(policyId, { state: 'uncertain' });
        setBindUncertain(true);
      }
      let txHash: Hex;
      try {
        txHash = await walletClient.sendTransaction({
          account: wallet.address,
          chain: walletClient.chain,
          to: tx.to,
          data: tx.data,
          maxFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
          maxPriorityFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
        });
      } catch (cause) {
        if (isWalletRejection(cause)) {
          if (kind === 'bind') {
            clearBindAttempt(policyId);
            setBindUncertain(false);
          }
          throw new Error(
            'You declined the wallet request. You can retry while the quote is open.',
          );
        }
        throw new Error(
          kind === 'bind'
            ? 'Wallet response interrupted. Check wallet activity and recover the submitted bind before trying again.'
            : 'Wallet response interrupted. Check wallet activity or your existing allowance before retrying.',
        );
      }
      if (kind === 'bind') {
        setHash(txHash);
        setBindUncertain(false);
        saveBindAttempt(policyId, { state: 'submitted', hash: txHash });
      } else {
        setApprovalHash(txHash);
        sessionStorage.setItem(`arcuex-approve:${policyId}`, txHash);
      }
      setNotice('Transaction submitted. Check the receipt before retrying.');
      await confirmPayment(kind, txHash, policyId);
    };
    if (kind === 'bind' && navigator.locks) {
      await navigator.locks.request(
        bindAttemptKey(policyId),
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw new Error('This purchase is open in another tab. Check the existing bind there.');
          await send();
        },
      );
    } else await send();
  }

  function openPayment(acceptance: Acceptance) {
    const id = acceptance.policy.terms.policyId;
    setPrep(acceptance);
    const attempt = readBindAttempt(id);
    setHash(attempt?.state === 'submitted' ? attempt.hash : null);
    setBindUncertain(attempt?.state === 'uncertain');
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
    const hadSubmission = readBindAttempt(policy.terms.policyId);
    if (
      !hadSubmission &&
      policy.state !== 'confirmed' &&
      Date.now() / 1000 >= policy.terms.quoteExpiresAt
    )
      throw new Error('This quote expired. Start a fresh quote.');
    setProductCode(policy.terms.productCode);
    setQuote({ terms: policy.terms, digest: policy.digest });
    openPayment({ policy, state: 'accepted_offchain' });
    await refreshLifecycle(policy.terms.policyId);
  }

  function goBack() {
    setStepError(null);
    setStage((s) => (s > 1 ? ((s - 1) as WizardStage) : s));
  }

  async function continueFromStage() {
    setStepError(null);
    if (stage === 1) {
      if (delegated && !grantCanQuote) {
        setStepError('Check the current delegation before starting a quote.');
        return;
      }
      if (!product || !agentId) {
        setStepError('Select or register an agent exposure before continuing.');
        return;
      }
      setStage(2);
      return;
    }
    if (stage === 2) {
      if (!product || !selectedLimit || !checks.every(Boolean)) {
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
            limitMicros: selectedLimit,
            ...(grant ? { delegationId: grant.id } : {}),
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
          ...(grant ? { delegationId: grant.id } : {}),
          acceptedDigest: quote.digest,
        });
        openPayment(acceptance);
        setNotice('Terms accepted offchain. Authorize each payment step separately.');
        if (acceptance.policy.state === 'confirmed')
          await refreshLifecycle(acceptance.policy.terms.policyId);
      });
    }
  }

  const terms = quote?.terms ?? prep?.policy.terms;
  const summaryPremium = terms ? usdc(terms.premiumMicros) : '—';
  const summaryLimit = terms ? usdc(terms.limitMicros) : product ? usdc(limit) : '—';
  const summaryDeductible = terms ? usdc(terms.deductibleMicros) : '—';

  return (
    <div className="procurement lg:grid lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start lg:gap-6">
      <div className="min-w-0 space-y-5">
      <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <div className="flex flex-wrap gap-2">
          {product && (
            <TruthBadge
              label={product.synthetic ? 'Synthetic product' : 'Independent-evidence pilot'}
              tone={product.synthetic ? 'synthetic' : 'pending'}
            />
          )}
          {catalog && (
            <TruthBadge
              label={offline ? 'Offline quotes only' : 'Testnet payment preflight'}
              tone={offline ? 'synthetic' : 'live'}
            />
          )}
          {delegated ? <TruthBadge label="Delegated procurement" tone="human" /> : null}
        </div>
        {catalogError && <p role="alert">Product catalog unavailable. Reload to retry.</p>}
        {!catalog && !catalogError && <p role="status">Loading approved products…</p>}
        {product && (
          <>
            <label>
              Approved coverage product
              <select
                value={productCode}
                disabled={stage !== 1 || busy || delegated}
                onChange={(e) => {
                  const selected = catalog?.products.find(
                    (option) => option.code === e.target.value,
                  );
                  if (!selected) return;
                  setProductCode(selected.code);
                  setAgentId(
                    agents.find((a) => a.exposure.protocol === selected.protocol)?.id ?? '',
                  );
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
            <p className="text-sm text-[var(--ink-secondary)]">{product.pricing}</p>
            <details className="text-sm">
              <summary className="cursor-pointer py-2 font-medium">
                Eligibility, limits and exclusions
              </summary>
              <p className="mt-2 text-[var(--ink-muted)]">
                Limits {product.limitsMicros.map(usdc).join(', ')} · Durations{' '}
                {product.durationsDays.join(', ')} days.
              </p>
              <p className="mt-2">
                Use a registered position, attest its health and control, and disclose any known
                incident.
              </p>
              <ul className="ml-5 mt-2 list-disc text-[var(--ink-muted)]">
                {product.exclusions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
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
          Resume interrupted checkout
        </Button>
      )}

      <Stepper steps={steps} ariaLabel="Coverage wizard progress" />

      <div className="flex flex-wrap gap-2" aria-live="polite">
        {quote && !prep ? (
          <StatusBadge label={expired ? 'Quote expired' : 'Offchain quote'} tone="pending" />
        ) : null}
        {prep && !approved && !submitted && !expired && !confirmed ? (
          <StatusBadge label="Wallet approval pending" tone="pending" />
        ) : null}
        {approved && !submitted && !expired && !confirmed ? (
          <StatusBadge label="Allowance confirmed · bind required" tone="pending" />
        ) : null}
        {prep && expired && !submitted && !confirmed ? (
          <StatusBadge label="Quote expired · start a fresh quote" tone="warn" />
        ) : null}
        {bindUncertain && !hash && !confirmed && (
          <StatusBadge label="Bind status unknown · check your wallet" tone="warn" />
        )}
        {(hash || prep?.policy.bindTx) && !confirmed ? (
          <StatusBadge
            label={
              phase === 'submitted'
                ? 'Bind submitted · receipt pending'
                : 'Reconciliation pending — no coverage confirmed'
            }
            tone="pending"
          />
        ) : null}
        {confirmed ? (
          <StatusBadge
            label={phase === 'effective' ? 'Confirmed · effective window' : 'Confirmed · scheduled'}
            tone="ok"
          />
        ) : null}
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
          <h3 className="text-lg font-semibold">
            {delegated ? '1. Verify delegated authority' : '1. Choose an insured position'}
          </h3>
          <p className="text-sm text-[var(--ink-muted)]">
            {delegated
              ? 'Connect the registered agent signer. The policyholder sets the scope and beneficiary. Your wallet separately confirms allowance and payment.'
              : 'Connect your policyholder wallet, then select or register a position you control.'}
          </p>
          {grant && selectedAgent && (
            <Callout
              kind={grantCanQuote ? 'info' : 'warn'}
              title={grantStatus?.label ?? 'Delegation'}
            >
              <p className="break-words">
                <strong>{selectedAgent.label}</strong> · {selectedAgent.exposure.position} · Expires{' '}
                {displayDate(grant.expiresAt)}.
              </p>
              <p className="break-all">
                Policyholder {grant.owner} · Agent signer {selectedAgent.signer}
              </p>
              <p>
                Limit cap {usdc(grant.limitCapMicros)} · Remaining premium budget{' '}
                {usdc(grant.remainingPremiumMicros)}.
              </p>
            </Callout>
          )}
          <Button variant="secondary" disabled={busy} onClick={() => void run(loadAgents)}>
            {delegated ? 'Check delegation' : 'Load my agents'}
          </Button>
          {!delegated && agents.some((a) => a.exposure.protocol === product.protocol) ? (
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
            !delegated && (
              <p className="text-sm text-[var(--ink-muted)]">
                {loaded
                  ? 'No registered positions for this product. Register one below.'
                  : 'Load your registered positions to continue.'}
              </p>
            )
          )}
          {!delegated && (
            <details open={fromBuild || undefined}>
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
                  Agent signer wallet
                  <input value={signer} onChange={(e) => setSigner(e.target.value)} />
                </label>
                <label>
                  Position identifier
                  <input
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder={
                      product.synthetic ? 'demo-position-01' : '0x… (32-byte position ID)'
                    }
                  />
                </label>
                <label>
                  Exposure value (USDC)
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
                          exposureMicros: usdToMicros(exposure),
                          ownerAttestsControl: true,
                          chainId: 5042002,
                          protocol: product.protocol,
                          productCode: product.code,
                        });
                        setAgents((prev) => [...prev, a]);
                        setAgentId(a.id);
                        if (fromBuild) router.push(`/agent?agentId=${a.id}`);
                      })
                    }
                  >
                    {fromBuild ? 'Register and return to Build' : 'Register position I control'}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--ink-muted)]">
                {product.synthetic
                  ? 'Registration records an attestation for a synthetic position.'
                  : 'Register the reviewed position you control. Claims require independent verification.'}
              </p>
            </details>
          )}
        </section>
      )}

      {stage === 2 && product && (
        <section className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h3 className="text-lg font-semibold">2. Configure coverage & generate quote</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <label>
              Limit
              <select value={selectedLimit ?? ''} onChange={(e) => setLimit(e.target.value)}>
                {limitChoices.map((v) => (
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
                readOnly={!product.synthetic || delegated}
                onChange={(e) => setBeneficiary(e.target.value)}
              />
            </label>
          </div>
          <p className="text-sm text-[var(--ink-muted)]">
            {selectedAgent?.label} · {selectedAgent?.exposure.position}
          </p>
          {!selectedLimit && (
            <p role="alert">This exposure or grant cannot support an available limit.</p>
          )}
          <fieldset className="grid min-w-0 gap-3 text-sm">
            <legend className="mb-2 font-semibold">Underwriting declarations</legend>
            {[
              'This registered position is healthy under the canonical collateral ratio.',
              'I know of no existing incident or liquidation affecting this position.',
              product.synthetic
                ? 'This exposure and its evidence are synthetic demo data only.'
                : 'I will provide independent liquidation, replay and recovery evidence for any claim.',
              delegated
                ? 'I verify that the policyholder authorized this registered position and its details are accurate.'
                : 'I control this position and attest that its registration is accurate.',
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
          </fieldset>
          <Callout kind={product.synthetic ? 'synthetic' : 'info'} title="Quote generation">
            Premium and deductible follow the testnet schedule. A quote is offchain and does not
            reserve capital.
          </Callout>
        </section>
      )}

      {stage === 3 && quote && product && (
        <section className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
          <h3 className="text-base font-semibold tracking-tight">3. Accept immutable terms</h3>
          <div className="grid gap-4 rounded-[var(--radius-sm)] bg-[var(--surface-inset)] p-4 sm:grid-cols-3">
            <Metric label="Premium" value={usdc(quote.terms.premiumMicros)} accent />
            <Metric label="Coverage limit" value={usdc(quote.terms.limitMicros)} accent />
            <Metric label="Deductible" value={usdc(quote.terms.deductibleMicros)} />
            <Metric label="Effective after binding" value={displayDate(quote.terms.effectiveAt)} />
            <Metric label="Coverage expiry" value={displayDate(quote.terms.expiresAt)} />
            <Metric
              label="Quote expires"
              value={displayDate(quote.terms.quoteExpiresAt)}
              hint={expired ? 'Expired — generate a new quote' : 'Accept before this deadline'}
            />
          </div>
          <div className="space-y-1 text-sm">
            <p className="break-all">
              <span className="text-[var(--ink-muted)]">Payer · </span>
              <span className="font-mono text-xs">{wallet.address}</span>
              {' · '}
              {delegated ? 'Delegated agent authority' : 'Policyholder wallet'}
            </p>
            <p className="break-all">
              <span className="text-[var(--ink-muted)]">Beneficiary · </span>
              <span className="font-mono text-xs">{quote.terms.beneficiary}</span>
            </p>
          </div>
          <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">
            {quote.terms.insuredEvent}
          </p>
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
            <summary className="cursor-pointer text-sm">Technical terms & digest</summary>
            <pre className="mt-3 overflow-auto rounded-[var(--radius-sm)] bg-[var(--surface-inset)] p-4 font-mono text-xs">
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
          <p className="break-all text-sm">
            <strong>Accepted payer</strong> {prep.policy.payer}
          </p>
          <p className="text-sm">
            Premium {usdc(prep.policy.terms.premiumMicros)} · Quote deadline{' '}
            {displayDate(prep.policy.terms.quoteExpiresAt)}
          </p>
          <Button
            variant="ghost"
            disabled={busy || allowanceChecking}
            onClick={() => {
              setAllowanceChecking(true);
              void run(async () => {
                try {
                  await refreshCapacity();
                } finally {
                  setAllowanceChecking(false);
                }
              });
            }}
          >
            Refresh pool capacity
          </Button>
          {capacity?.availableMicros != null &&
            BigInt(capacity.availableMicros) < BigInt(prep.policy.terms.limitMicros) && (
              <p role="status" className="text-sm text-[var(--warn)]">
                Observed capacity is below your limit. Refresh capacity before paying. The server
                rechecks capacity for each wallet step.
              </p>
            )}
          {bindUncertain && !hash && (
            <Callout kind="warn" title="Check wallet activity">
              <p>
                The wallet did not return a bind hash. Find the transaction in your wallet, then
                verify its receipt here or in the policy detail.
              </p>
              <label className="mt-2">
                Bind transaction hash
                <input value={recoveryHash} onChange={(e) => setRecoveryHash(e.target.value)} />
              </label>
              <Button
                className="mt-2"
                variant="secondary"
                disabled={busy || !isBindHash(recoveryHash.trim())}
                onClick={() =>
                  void run(async () => {
                    const recoveredHash = recoveryHash.trim();
                    if (!isBindHash(recoveredHash)) return;
                    await api<Policy>('confirm', {
                      policyId: prep.policy.terms.policyId,
                      hash: recoveredHash,
                    });
                    saveBindAttempt(prep.policy.terms.policyId, {
                      state: 'submitted',
                      hash: recoveredHash,
                    });
                    setHash(recoveredHash);
                    setBindUncertain(false);
                    await refreshLifecycle(prep.policy.terms.policyId);
                  })
                }
              >
                Verify bind receipt
              </Button>
            </Callout>
          )}
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
              disabled={busy || (expired && !approvalHash) || approved || submitted || !!confirmed}
              onClick={() => void run(() => payment('approve'))}
            >
              {approvalHash && !approved
                ? 'Re-check premium approval'
                : 'Approve exact USDC premium'}
            </Button>
            <Button
              disabled={
                busy || bindUncertain || (expired && !hash && !prep.policy.bindTx) || !!confirmed
              }
              onClick={() =>
                void run(() =>
                  prep.policy.bindTx && !hash
                    ? refreshLifecycle(prep.policy.terms.policyId)
                    : payment('bind'),
                )
              }
            >
              {hash || prep.policy.bindTx
                ? 'Re-check bind confirmation'
                : 'Pay premium & bind policy'}
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
                {phase === 'scheduled'
                  ? `Canonical bind verified. Coverage starts ${displayDate(confirmed.terms.effectiveAt)}.`
                  : 'Canonical bind verified. The coverage window has started.'}{' '}
                <Link className="underline" href={`/policies/${confirmed.terms.policyId}`}>
                  Open policy
                </Link>
              </p>
            </Callout>
          )}
          {!submitted && !confirmed && (
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
          )}
        </section>
      )}

      {!confirmed && (
        <div className="flex flex-wrap gap-3 border-t border-[var(--line)] pt-4">
          <Button variant="secondary" disabled={busy || stage === 1 || submitted} onClick={goBack}>
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

      <aside
        aria-label="Purchase summary"
        className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] lg:sticky lg:top-4"
      >
        <p className="text-[0.6875rem] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
          Purchase summary
        </p>
        <Metric
          label="Premium"
          value={summaryPremium === '—' ? '—' : summaryPremium}
          accent
        />
        <Metric label="Coverage limit" value={summaryLimit === '—' ? '—' : summaryLimit} />
        <Metric
          label="Deductible"
          value={summaryDeductible === '—' ? '—' : summaryDeductible}
        />
        {terms ? (
          <>
            <Metric label="Quote expires" value={displayDate(terms.quoteExpiresAt)} />
            <Metric label="Coverage window" value={`${displayDate(terms.effectiveAt)} → ${displayDate(terms.expiresAt)}`} />
          </>
        ) : (
          <p className="text-xs text-[var(--ink-muted)]">
            Configure exposure and generate a quote to see premium, limit and dates here.
          </p>
        )}
        <div className="space-y-1 border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-muted)]">
          <p>
            Stage {stage} of 4
            {delegated ? ' · delegated agent' : ' · policyholder'}
          </p>
          <p>
            {offline
              ? 'Synthetic / offline — no Arc payment'
              : confirmed
                ? 'Confirmed on Arc Testnet after reconciliation'
                : 'Submitted txs need wallet approval and receipt checks'}
          </p>
        </div>
      </aside>
    </div>
  );
}
