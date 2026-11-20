'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PolicyLifecycle, ProcurementDelegationView } from '@arcuex/domain';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  ArrowsClockwise,
  CaretDown,
  Check,
  Prohibit,
  Timer,
  WarningCircle,
} from '@phosphor-icons/react';
import { useProcurement } from '@/hooks/use-procurement';
import { Callout } from '@/components/ui/callout';
import { Stepper, type StepItem } from '@/components/ui/stepper';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
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
import { confirmCheckoutReceipt } from '@/lib/procurement/checkout-recovery';
import { delegationPresentation } from '@/lib/delegation-presentation';
import {
  checkoutStatus,
  coverageStartCopy,
  paymentSteps,
  quoteCountdown,
  shortId,
  type CheckoutFacts,
} from '@/lib/procurement/checkout-presentation';

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
      { id: '1', label: 'Product & agent', state: mark(1, !!agentId && agents.length > 0) },
      { id: '2', label: 'Terms', state: mark(2, !!quote) },
      { id: '3', label: 'Quote', state: mark(3, !!prep) },
      {
        id: '4',
        label: 'Authorize',
        state: confirmed ? 'complete' : stage === 4 && error ? 'error' : mark(4, false),
      },
      // Complete only once the server reports a confirmed, reconciled bind.
      { id: '5', label: 'Policy', state: confirmed ? 'complete' : 'upcoming' },
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
    const outcome = await confirmCheckoutReceipt(publicClient, txHash, async (sameHash) => {
      if (kind === 'bind') {
        const policy = await api<Policy>('confirm', { policyId, hash: sameHash });
        setPrep({ policy, state: 'accepted_offchain' });
        await refreshLifecycle(policyId);
        setNotice(
          'Receipt checked. Coverage follows canonical reconciliation and the effective window.',
        );
      } else {
        await api('approvals', { policyId, hash: sameHash });
        setApproved(true);
        setNotice('Premium allowance confirmed. Continue to authorize the bind.');
      }
    });
    if (outcome !== 'reverted') return;

    if (kind === 'bind') {
      const attempt = readBindAttempt(policyId);
      if (attempt?.state === 'submitted' && attempt.hash.toLowerCase() === txHash.toLowerCase()) {
        clearBindAttempt(policyId);
        setBindUncertain(false);
        setHash(null);
      }
    } else if (sessionStorage.getItem(`arcuex-approve:${policyId}`) === txHash) {
      sessionStorage.removeItem(`arcuex-approve:${policyId}`);
      setApprovalHash(null);
    }
    throw new Error('Transaction reverted on Arc. Refresh payment preflight before retrying.');
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


  function selectProduct(code: string) {
    const selected = catalog?.products.find((option) => option.code === code);
    if (!selected) return;
    setProductCode(selected.code);
    setAgentId(agents.find((a) => a.exposure.protocol === selected.protocol)?.id ?? '');
    setPosition('');
    setLimit(selected.limitsMicros[0]);
    setDays(7);
    setBeneficiary(wallet.address ?? '');
    setChecks([false, false, false, false]);
  }

  const terms = quote?.terms ?? prep?.policy.terms;
  const nowSeconds = Math.floor(now / 1000);
  const facts: CheckoutFacts = {
    hasQuote: Boolean(quote),
    accepted: Boolean(prep),
    quoteExpired: expired,
    allowanceConfirmed: approved,
    allowanceHash: Boolean(approvalHash),
    bindHash: Boolean(hash || prep?.policy.bindTx),
    bindUncertain: bindUncertain && !hash,
    phase,
  };
  const status = checkoutStatus(facts);
  const paySteps = paymentSteps(facts);
  const ownAgents = product
    ? agents.filter(
        (a) => a.owner === wallet.address?.toLowerCase() && a.exposure.protocol === product.protocol,
      )
    : [];
  const effectiveLabel = terms ? displayDate(terms.effectiveAt) : 'at the scheduled start';
  const paymentCopy: Record<(typeof paySteps)[number]['id'], { title: string; body: string }> = {
    allowance: {
      title: 'Approve the exact premium',
      body: `Lets the pool draw ${prep ? usdc(prep.policy.terms.premiumMicros) : 'the premium'} from the payer. Approval is not payment and not coverage.`,
    },
    bind: {
      title: 'Pay premium and bind',
      body: 'Sends the premium and binds the accepted terms on Arc Testnet. Your wallet asks you to confirm.',
    },
    reconcile: {
      title: 'Reconciliation',
      body: 'Arcuex checks the receipt and links the bind to these terms. Coverage is confirmed only after this step.',
    },
  };

  return (
    <div className="procurement grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {product && (
            <TruthBadge
              label={product.synthetic ? 'Synthetic product' : 'Independent-evidence pilot'}
              tone={product.synthetic ? 'synthetic' : 'pending'}
            />
          )}
          {catalog && (
            <TruthBadge
              label={offline ? 'Offline quotes only' : 'Arc Testnet payment'}
              tone={offline ? 'synthetic' : 'live'}
              title={offline ? 'Fixture deployment: quotes cannot be paid or bound.' : 'Payment uses Arc Testnet USDC and requires your wallet approval.'}
            />
          )}
          {delegated ? <TruthBadge label="Delegated purchase" tone="human" /> : null}
        </div>

        {resumePolicyId && catalog && !offline && stage === 1 && (
          <section
            aria-labelledby="resume-title"
            className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[#c7dbef] bg-[var(--pending-soft)] px-5 py-4"
          >
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[var(--pending)]" />
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 max-w-xl">
                <h2 id="resume-title" className="font-semibold text-[var(--ink)]">
                  Resume an interrupted checkout
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--ink-secondary)]">
                  Policy <span className="font-mono text-xs">{shortId(resumePolicyId)}</span> has
                  accepted terms. Resuming reloads them and checks any bind already submitted.
                  Nothing is paid until you confirm in your wallet.
                </p>
              </div>
              <Button variant="primary" disabled={busy} onClick={() => void run(resumePayment)}>
                <ArrowCounterClockwise size={16} aria-hidden="true" />
                Resume checkout
              </Button>
            </div>
          </section>
        )}

        <Stepper steps={steps} ariaLabel="Coverage purchase progress" />

        {(status || terms) && (
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 lg:hidden">
            <div className="min-w-0">
              <p className="text-xs text-[var(--ink-muted)]">Premium</p>
              <p className="tabular-nums font-semibold text-[var(--ink)]">
                {terms ? usdc(terms.premiumMicros) : '—'}
              </p>
            </div>
            {status ? <StatusBadge label={status.label} tone={status.tone} /> : null}
          </div>
        )}

        <div aria-live="polite" className="sr-only">
          {status?.label}
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

        {catalogError && (
          <Callout kind="danger" title="Product catalog unavailable">
            <p role="alert">Reload the page to try again. No quote has been created.</p>
          </Callout>
        )}
        {!catalog && !catalogError && (
          <div role="status" className="space-y-3" aria-label="Loading approved products">
            <div className="h-28 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-inset)]" />
            <div className="h-48 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-inset)]" />
          </div>
        )}

        {stage === 1 && product && catalog && (
          <StepSection
            n={1}
            title={delegated ? 'Product and delegated authority' : 'Product and insured exposure'}
            description={
              delegated
                ? 'The policyholder chose the product, scope and beneficiary. Connect the registered agent signer to buy within that grant.'
                : 'Choose what to insure. You can only insure a position you control and have registered.'
            }
          >
            <fieldset disabled={busy || delegated} className="min-w-0">
              <legend className="mb-2.5 text-[0.8125rem] font-medium text-[var(--ink)]">
                Coverage product
              </legend>
              <div className={`grid gap-3 ${catalog.products.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                {catalog.products.map((p) => (
                  <label key={p.code} className="choice" data-selected={p.code === productCode || undefined}>
                    <input
                      type="radio"
                      name="product"
                      className="sr-only"
                      value={p.code}
                      checked={p.code === productCode}
                      onChange={() => selectProduct(p.code)}
                    />
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-[var(--ink)]">{p.name}</span>
                      <span aria-hidden="true" className="choice-dot" />
                    </span>
                    <span className="mt-1 block text-xs text-[var(--ink-muted)]">
                      {p.synthetic ? 'Synthetic demo underwriting' : 'Independent evidence required'} ·
                      version {p.version}
                    </span>
                    <span className="mt-2.5 block text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)] line-clamp-3">
                      {p.event}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-x-8 gap-y-5 rounded-[var(--radius)] bg-[var(--paper)] p-4 sm:grid-cols-2 sm:p-5">
              <div className="space-y-1.5">
                <h3 className="text-[0.8125rem] font-semibold text-[var(--ink)]">Pricing and limits</h3>
                <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">{product.pricing}</p>
                <p className="text-sm text-[var(--ink-muted)] tabular-nums">
                  Limits {product.limitsMicros.map(usdc).join(', ')}. Terms of{' '}
                  {product.durationsDays.join(' or ')} days.
                </p>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-[0.8125rem] font-semibold text-[var(--ink)]">Eligibility</h3>
                <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">
                  A registered position you control, declared healthy, with no known incident.
                </p>
                <p className="text-xs text-[var(--ink-muted)]">
                  {capacity?.status === 'verified'
                    ? `Pool capacity at last check: ${usdc(capacity.availableMicros!)}. Quotes do not reserve capital.`
                    : offline
                      ? 'Fixture source. No onchain capacity or payment available.'
                      : 'Current pool capacity is unverified.'}
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <h3 className="text-[0.8125rem] font-semibold text-[var(--ink)]">Not covered</h3>
                <ul className="grid gap-1.5 text-sm text-[var(--ink-secondary)] sm:grid-cols-2 sm:gap-x-6">
                  {product.exclusions.map((item) => (
                    <li key={item} className="flex gap-2">
                      <Prohibit size={15} className="mt-0.5 shrink-0 text-[var(--ink-faint)]" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-3 border-t border-[var(--line)] pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[0.8125rem] font-semibold text-[var(--ink)]">
                    {delegated ? 'Delegated authority' : 'Insured exposure'}
                  </h3>
                  {wallet.uiStatus !== 'ready' && (
                    <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
                      Connect a wallet on Arc Testnet with the controls in the header.
                    </p>
                  )}
                </div>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run(loadAgents)}>
                  {delegated ? 'Check delegation' : loaded ? 'Reload my agents' : 'Load my agents'}
                </Button>
              </div>

              {grant && selectedAgent && (
                <div className="rounded-[var(--radius)] border border-[var(--line)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
                    <p className="font-semibold text-[var(--ink)]">{selectedAgent.label}</p>
                    <StatusBadge
                      label={grantStatus?.label ?? 'Delegation'}
                      tone={grantCanQuote ? 'live' : 'warn'}
                    />
                  </div>
                  <dl className="grid gap-x-6 gap-y-3 px-4 py-3 text-sm sm:grid-cols-2">
                    <Field label="Insured position" value={selectedAgent.exposure.position} />
                    <Field label="Grant expires" value={displayDate(grant.expiresAt)} />
                    <Field label="Limit cap" value={usdc(grant.limitCapMicros)} numeric />
                    <Field label="Premium budget remaining" value={usdc(grant.remainingPremiumMicros)} numeric />
                    <Field label="Policyholder" value={grant.owner} mono />
                    <Field label="Agent signer (you)" value={selectedAgent.signer} mono />
                  </dl>
                  <p className="border-t border-[var(--line)] px-4 py-2.5 text-xs text-[var(--ink-muted)]">
                    The agent&apos;s identity does not grant authority. This grant sets what it may
                    buy, and your wallet still approves each payment.
                  </p>
                </div>
              )}

              {!delegated && ownAgents.length > 0 && (
                <fieldset className="min-w-0">
                  <legend className="sr-only">Registered agent</legend>
                  <div className="grid gap-2">
                    {ownAgents.map((a) => (
                      <label key={a.id} className="choice choice-row" data-selected={a.id === agentId || undefined}>
                        <input
                          type="radio"
                          name="agent"
                          className="sr-only"
                          value={a.id}
                          checked={a.id === agentId}
                          onChange={() => setAgentId(a.id)}
                        />
                        <span aria-hidden="true" className="choice-dot" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-[var(--ink)]">{a.label}</span>
                          <span className="block truncate font-mono text-xs text-[var(--ink-muted)]">
                            {a.exposure.position}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-xs text-[var(--ink-muted)]">Exposure</span>
                          <span className="block text-sm font-medium tabular-nums text-[var(--ink)]">
                            {usdc(a.exposure.notionalMicros)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {!delegated && ownAgents.length === 0 && (
                <p className="rounded-[var(--radius)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--ink-muted)]">
                  {loaded
                    ? 'No registered positions for this product yet. Register one below.'
                    : 'Load your registered positions to choose what to insure.'}
                </p>
              )}

              {!delegated && (
                <details open={fromBuild || undefined} className="group rounded-[var(--radius)] border border-[var(--line)]">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-[var(--ink)]">
                    {product.synthetic ? 'Register a new synthetic position' : 'Register a reviewed position'}
                    <CaretDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="space-y-4 border-t border-[var(--line)] px-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label>
                        Agent label
                        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="treasury-agent" />
                      </label>
                      <label>
                        Agent signer wallet
                        <input value={signer} onChange={(e) => setSigner(e.target.value)} className="font-mono text-xs" />
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
                        Exposure value (USDC)
                        <input value={exposure} onChange={(e) => setExposure(e.target.value)} inputMode="decimal" />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="max-w-md text-xs text-[var(--ink-muted)]">
                        {product.synthetic
                          ? 'Registration records your attestation for a synthetic position.'
                          : 'Register the reviewed position you control. Claims require independent verification.'}
                      </p>
                      <Button
                        variant="secondary"
                        disabled={busy}
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
                      </Button>
                    </div>
                  </div>
                </details>
              )}
            </div>
          </StepSection>
        )}

        {stage === 2 && product && (
          <StepSection
            n={2}
            title="Coverage terms"
            description="Choose the limit and term, then answer the underwriting declarations. The quote is priced from these answers."
          >
            {selectedAgent && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius)] bg-[var(--paper)] px-4 py-3 text-sm">
                <span className="text-[var(--ink-muted)]">Insuring</span>
                <span className="font-medium text-[var(--ink)]">{selectedAgent.label}</span>
                <span className="min-w-0 truncate font-mono text-xs text-[var(--ink-muted)]">
                  {selectedAgent.exposure.position}
                </span>
                <span className="tabular-nums text-[var(--ink-secondary)]">
                  {usdc(selectedAgent.exposure.notionalMicros)} exposure
                </span>
              </div>
            )}

            <fieldset className="min-w-0">
              <legend className="mb-2.5 text-[0.8125rem] font-medium text-[var(--ink)]">Coverage limit</legend>
              {limitChoices.length > 0 ? (
                <div className="segmented">
                  {limitChoices.map((v) => (
                    <label key={v} className="segment" data-selected={v === selectedLimit || undefined}>
                      <input
                        type="radio"
                        name="limit"
                        className="sr-only"
                        value={v}
                        checked={v === selectedLimit}
                        onChange={() => setLimit(v)}
                      />
                      <span className="tabular-nums">{usdc(v)}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p role="alert" className="text-sm text-[var(--warn)]">
                  This exposure or grant cannot support any available limit.
                </p>
              )}
              <p className="mt-2 text-xs text-[var(--ink-muted)]">
                Limits above the insured exposure{grant ? ' or the grant cap' : ''} are not offered.
              </p>
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              <fieldset className="min-w-0">
                <legend className="mb-2.5 text-[0.8125rem] font-medium text-[var(--ink)]">Term</legend>
                <div className="segmented">
                  {product.durationsDays.map((v) => (
                    <label key={v} className="segment" data-selected={v === days || undefined}>
                      <input
                        type="radio"
                        name="days"
                        className="sr-only"
                        value={v}
                        checked={v === days}
                        onChange={() => setDays(v)}
                      />
                      <span className="tabular-nums">{v} days</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                Beneficiary
                <input
                  value={beneficiary}
                  readOnly={!product.synthetic || delegated}
                  onChange={(e) => setBeneficiary(e.target.value)}
                  className="font-mono text-xs"
                  aria-describedby="beneficiary-hint"
                />
                <span id="beneficiary-hint" className="text-xs font-normal text-[var(--ink-muted)]">
                  {delegated
                    ? 'Set by the policyholder in the grant.'
                    : product.synthetic
                      ? 'Receives any approved settlement.'
                      : 'Fixed to the registered policyholder for this product.'}
                </span>
              </label>
            </div>

            <fieldset className="min-w-0 space-y-2.5 border-t border-[var(--line)] pt-5">
              <legend className="mb-1 text-[0.8125rem] font-semibold text-[var(--ink)]">
                Underwriting declarations
              </legend>
              <p className="text-xs text-[var(--ink-muted)]">All four are required to request a quote.</p>
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
                <label className="proc-check declaration" key={s} data-checked={checks[i] || undefined}>
                  <input
                    type="checkbox"
                    checked={checks[i]}
                    onChange={(e) => setChecks((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
                  />
                  <span>{s}</span>
                </label>
              ))}
            </fieldset>
            <Callout kind={product.synthetic ? 'synthetic' : 'info'} title="About the quote">
              Premium and deductible follow the testnet schedule. A quote is offchain, expires, and
              does not reserve capital.
            </Callout>
          </StepSection>
        )}

        {stage === 3 && quote && product && (
          <StepSection
            n={3}
            title="Review your quote"
            description="These terms are fixed by a signed digest. Read what is covered, what is not, and when coverage would begin."
          >
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--paper)] px-4 py-2.5 sm:px-5">
                <p className="text-xs text-[var(--ink-muted)]">
                  Quote <span className="font-mono">{shortId(quote.terms.quoteId)}</span>
                </p>
                <p
                  className={`inline-flex items-center gap-1.5 text-xs font-medium tabular-nums ${expired ? 'text-[var(--warn)]' : 'text-[var(--ink-secondary)]'}`}
                >
                  <Timer size={14} aria-hidden="true" />
                  {expired ? 'Expired' : `Accept within ${quoteCountdown(quote.terms.quoteExpiresAt, nowSeconds).replace(' left', '')}`}
                </p>
              </div>
              <dl className="grid gap-px bg-[var(--line)] sm:grid-cols-3">
                <div className="bg-[var(--surface)] px-4 py-4 sm:px-5">
                  <dt className="text-xs text-[var(--ink-muted)]">Premium you pay</dt>
                  <dd className="mt-1 font-display text-[1.75rem] leading-none font-semibold tracking-[-0.02em] tabular-nums text-[var(--ink)]">
                    {usdc(quote.terms.premiumMicros)}
                  </dd>
                  <dd className="mt-1.5 text-xs text-[var(--ink-muted)]">One payment for the full term</dd>
                </div>
                <div className="bg-[var(--surface)] px-4 py-4 sm:px-5">
                  <dt className="text-xs text-[var(--ink-muted)]">Coverage limit</dt>
                  <dd className="mt-1 font-display text-[1.75rem] leading-none font-semibold tracking-[-0.02em] tabular-nums text-[var(--ink)]">
                    {usdc(quote.terms.limitMicros)}
                  </dd>
                  <dd className="mt-1.5 text-xs text-[var(--ink-muted)]">Most this policy can pay in total</dd>
                </div>
                <div className="bg-[var(--surface)] px-4 py-4 sm:px-5">
                  <dt className="text-xs text-[var(--ink-muted)]">Deductible</dt>
                  <dd className="mt-1 font-display text-[1.75rem] leading-none font-semibold tracking-[-0.02em] tabular-nums text-[var(--ink)]">
                    {usdc(quote.terms.deductibleMicros)}
                  </dd>
                  <dd className="mt-1.5 text-xs text-[var(--ink-muted)]">Subtracted from each verified loss</dd>
                </div>
              </dl>
              <CoverageWindow
                acceptBy={displayDate(quote.terms.quoteExpiresAt)}
                starts={displayDate(quote.terms.effectiveAt)}
                ends={displayDate(quote.terms.expiresAt)}
                expired={expired}
              />
            </div>

            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-[0.8125rem] font-semibold text-[var(--ink)]">Covered event</h3>
                <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">{quote.terms.insuredEvent}</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-[0.8125rem] font-semibold text-[var(--ink)]">Not covered</h3>
                <ul className="space-y-1.5 text-sm text-[var(--ink-secondary)]">
                  {quote.terms.exclusions.map((s) => (
                    <li key={s} className="flex gap-2">
                      <Prohibit size={15} className="mt-0.5 shrink-0 text-[var(--ink-faint)]" aria-hidden="true" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[0.8125rem] font-semibold text-[var(--ink)]">Who is involved</h3>
              <dl className="divide-y divide-[var(--line)] rounded-[var(--radius)] border border-[var(--line)] text-sm">
                <PartyRow label="Insured agent" value={selectedAgent ? `${selectedAgent.label}` : quote.terms.agentId} detail={quote.terms.exposure.position} />
                <PartyRow label="Policyholder" value={quote.terms.owner} mono />
                <PartyRow
                  label="Payer"
                  value={wallet.address ?? '—'}
                  mono
                  detail={delegated ? 'Agent signer, paying under the delegation' : 'Your connected wallet'}
                />
                <PartyRow label="Beneficiary" value={quote.terms.beneficiary} mono detail="Receives any approved settlement" />
                <PartyRow
                  label="Delegation"
                  value={grant ? shortId(grant.id) : 'None'}
                  mono={Boolean(grant)}
                  detail={grant ? `Within a ${usdc(grant.limitCapMicros)} limit cap` : 'The policyholder buys directly'}
                />
              </dl>
            </div>

            <Callout kind="warn" title="Limitations">
              {product.limitations} Coverage begins only after canonical reconciliation verifies a
              matching bind and the scheduled start. Late binds are ineligible.
            </Callout>

            <TechnicalDetails summary="Quote terms and digest" value={quote} />

            {offline ? (
              <Callout kind="synthetic" title="Offline quote">
                This fixture deployment cannot accept quotes for payment or bind a new policy.
              </Callout>
            ) : (
              <label className="proc-check declaration" data-checked={accepted || undefined}>
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                <span>
                  I accept these exact terms and the {usdc(quote.terms.premiumMicros)} Arc Testnet
                  premium. Accepting is recorded offchain; I pay in the next step.
                </span>
              </label>
            )}
            {expired && (
              <p role="alert" className="text-sm font-medium text-[var(--warn)]">
                Quote expired. Go back and generate a new quote.
              </p>
            )}
          </StepSection>
        )}

        {stage === 4 && prep && !offline && (
          <StepSection
            n={4}
            title={confirmed ? 'Coverage confirmed' : 'Pay and bind'}
            description={
              confirmed
                ? undefined
                : 'Terms are accepted. Two wallet confirmations follow, then Arcuex verifies the bind on Arc Testnet. Each step is separate.'
            }
          >
            <dl className="grid gap-x-6 gap-y-3 rounded-[var(--radius)] bg-[var(--paper)] px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Field label="Accepted payer" value={prep.policy.payer} mono />
              <Field label="Premium" value={usdc(prep.policy.terms.premiumMicros)} numeric />
              <Field
                label="Quote deadline"
                value={
                  facts.bindHash || confirmed
                    ? displayDate(prep.policy.terms.quoteExpiresAt)
                    : `${displayDate(prep.policy.terms.quoteExpiresAt)} · ${quoteCountdown(prep.policy.terms.quoteExpiresAt, nowSeconds)}`
                }
              />
            </dl>

            {bindUncertain && !hash && (
              <Callout kind="warn" title="Check your wallet activity">
                <p>
                  The wallet did not return a bind hash, so we cannot tell whether it was sent. Do
                  not pay again. Find the transaction in your wallet and verify it here or from the
                  policy page.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1">
                    Bind transaction hash
                    <input
                      value={recoveryHash}
                      onChange={(e) => setRecoveryHash(e.target.value)}
                      placeholder="0x…"
                      className="font-mono text-xs"
                      spellCheck={false}
                    />
                  </label>
                  <Button
                    variant="secondary"
                    className="active:scale-100"
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
                </div>
              </Callout>
            )}

            <ol className="relative space-y-0" aria-label="Payment steps">
              {paySteps.map((step, index) => {
                const copy = paymentCopy[step.id];
                const last = index === paySteps.length - 1;
                return (
                  <li key={step.id} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 pb-6 last:pb-0">
                    {!last && (
                      <span
                        aria-hidden="true"
                        className={`absolute top-8 bottom-0 left-[0.9375rem] w-px ${step.state === 'done' ? 'bg-[var(--accent-signal)]' : 'bg-[var(--line-strong)]'}`}
                      />
                    )}
                    <PaymentDot state={step.state} n={index + 1} />
                    <div className="min-w-0 pt-0.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h3 className="font-semibold text-[var(--ink)]">{copy.title}</h3>
                        <span
                          className={`text-xs font-medium ${
                            step.state === 'done'
                              ? 'text-[var(--ok)]'
                              : step.state === 'attention'
                                ? 'text-[var(--warn)]'
                                : step.state === 'current'
                                  ? 'text-[var(--pending)]'
                                  : 'text-[var(--ink-muted)]'
                          }`}
                        >
                          {step.status}
                        </span>
                      </div>
                      <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--ink-muted)]">{copy.body}</p>
                      {step.id === 'allowance' && (
                        <Button
                          variant="secondary"
                          className="mt-3 active:scale-100"
                          disabled={busy || (expired && !approvalHash) || approved || submitted || !!confirmed}
                          onClick={() => void run(() => payment('approve'))}
                        >
                          {approvalHash && !approved ? 'Re-check premium approval' : 'Approve exact USDC premium'}
                        </Button>
                      )}
                      {step.id === 'bind' && (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <Button
                            className="active:scale-100"
                            disabled={busy || bindUncertain || (expired && !hash && !prep.policy.bindTx) || !!confirmed}
                            onClick={() =>
                              void run(() =>
                                prep.policy.bindTx && !hash
                                  ? refreshLifecycle(prep.policy.terms.policyId)
                                  : payment('bind'),
                              )
                            }
                          >
                            {hash || prep.policy.bindTx ? 'Re-check bind confirmation' : 'Pay premium and bind policy'}
                          </Button>
                          {hash && (
                            <a
                              className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[var(--accent)] underline-offset-4 hover:underline"
                              href={`https://explorer.testnet.arc.io/tx/${hash}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View bind transaction
                              <ArrowSquareOut size={14} aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      )}
                      {step.id === 'bind' && hash && (
                        <p className="mt-2 break-all font-mono text-xs text-[var(--ink-muted)]">{hash}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm">
              <p className="text-[var(--ink-muted)]">
                {capacity?.status === 'verified'
                  ? `Pool capacity at last check: ${usdc(capacity.availableMicros!)}.`
                  : 'Pool capacity is unverified. The server rechecks it at each wallet step.'}
              </p>
              <Button
                variant="ghost"
                size="sm"
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
                <ArrowsClockwise size={14} aria-hidden="true" />
                Refresh capacity
              </Button>
            </div>
            {capacity?.availableMicros != null &&
              BigInt(capacity.availableMicros) < BigInt(prep.policy.terms.limitMicros) && (
                <p role="status" className="text-sm text-[var(--warn)]">
                  Observed capacity is below your limit. Refresh capacity before paying. The server
                  rechecks capacity for each wallet step.
                </p>
              )}

            {confirmed && (
              <Callout kind="live" title="Policy confirmed">
                <p>
                  {phase === 'scheduled'
                    ? `Canonical bind verified. Coverage starts ${displayDate(confirmed.terms.effectiveAt)}.`
                    : 'Canonical bind verified. The coverage window has started.'}{' '}
                  <Link className="font-medium underline underline-offset-4" href={`/policies/${confirmed.terms.policyId}`}>
                    Open policy
                  </Link>
                </p>
              </Callout>
            )}
            {!submitted && !confirmed && (
              <Button
                variant="ghost"
                size="sm"
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
                Start a fresh quote instead
              </Button>
            )}
          </StepSection>
        )}

        {!confirmed && catalog && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" disabled={busy || stage === 1 || submitted} onClick={goBack}>
              Back
            </Button>
            {stage < 4 && !(stage === 3 && offline) ? (
              <Button disabled={busy || !product || (stage === 3 && expired)} onClick={() => void continueFromStage()}>
                {stage === 1 && 'Continue to terms'}
                {stage === 2 && (busy ? 'Generating quote…' : 'Get quote')}
                {stage === 3 && (busy ? 'Accepting…' : 'Accept terms')}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <aside
        aria-label="Purchase summary"
        className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-sm)] lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]"
      >
        <div className="border-b border-[var(--line)] px-5 py-4">
          <p className="text-xs text-[var(--ink-muted)]">Purchase summary</p>
          <p className="mt-1 font-semibold text-[var(--ink)]">{product?.name ?? terms?.productCode ?? 'Choose a product'}</p>
          {selectedAgent ? (
            <p className="mt-0.5 truncate text-sm text-[var(--ink-muted)]">Insuring {selectedAgent.label}</p>
          ) : null}
        </div>
        <dl className="space-y-3 px-5 py-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--ink-muted)]">Premium</dt>
            <dd className="font-display text-xl font-semibold tracking-[-0.015em] tabular-nums text-[var(--ink)]">
              {terms ? usdc(terms.premiumMicros) : '—'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--ink-muted)]">Coverage limit</dt>
            <dd className="font-medium tabular-nums text-[var(--ink)]">
              {terms ? usdc(terms.limitMicros) : product && selectedLimit ? usdc(selectedLimit) : '—'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--ink-muted)]">Deductible</dt>
            <dd className="font-medium tabular-nums text-[var(--ink)]">{terms ? usdc(terms.deductibleMicros) : '—'}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--ink-muted)]">Term</dt>
            <dd className="font-medium tabular-nums text-[var(--ink)]">
              {terms ? `${Math.round((terms.expiresAt - terms.effectiveAt) / 86_400)} days` : `${days} days`}
            </dd>
          </div>
          {terms && !facts.bindHash && !confirmed ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--ink-muted)]">Quote</dt>
              <dd className={`font-medium tabular-nums ${expired ? 'text-[var(--warn)]' : 'text-[var(--ink)]'}`}>
                {quoteCountdown(terms.quoteExpiresAt, nowSeconds)}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="space-y-2 border-t border-[var(--line)] px-5 py-4">
          <p className="text-xs font-medium text-[var(--ink)]">When coverage begins</p>
          <p className="text-[0.8125rem] leading-relaxed text-[var(--ink-muted)]">
            {terms ? coverageStartCopy(phase, effectiveLabel) : 'Get a quote to see the coverage window.'}
          </p>
          {terms ? (
            <p className="text-xs tabular-nums text-[var(--ink-muted)]">
              Window {displayDate(terms.effectiveAt)} to {displayDate(terms.expiresAt)}
            </p>
          ) : null}
        </div>
        <div className="space-y-2 border-t border-[var(--line)] bg-[var(--paper)] px-5 py-3.5">
          {status ? <StatusBadge label={status.label} tone={status.tone} /> : (
            <p className="text-xs text-[var(--ink-muted)]">Nothing accepted or paid yet.</p>
          )}
          <p className="text-xs text-[var(--ink-muted)]">
            {offline
              ? 'Synthetic fixture. No Arc Testnet payment is possible here.'
              : delegated
                ? 'Delegated purchase. The agent signer pays within the grant.'
                : 'Every payment step needs your wallet approval.'}
          </p>
        </div>
      </aside>
    </div>
  );
}

function StepSection({
  n,
  title,
  description,
  children,
}: {
  n: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`checkout-step-${n}`}
      className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-sm)]"
    >
      <header className="border-b border-[var(--line)] px-5 py-4 sm:px-6">
        <p className="text-xs tabular-nums text-[var(--ink-muted)]">Step {n} of 5</p>
        <h2 id={`checkout-step-${n}`} className="mt-0.5 font-display text-lg font-semibold tracking-[-0.015em] text-[var(--ink)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">{description}</p>
        ) : null}
      </header>
      <div className="space-y-5 px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function Field({ label, value, mono, numeric }: { label: string; value: string; mono?: boolean; numeric?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--ink-muted)]">{label}</dt>
      <dd
        className={`mt-0.5 text-[var(--ink)] ${mono ? 'break-all font-mono text-xs' : 'break-words'} ${numeric ? 'tabular-nums font-medium' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

function PartyRow({ label, value, detail, mono }: { label: string; value: string; detail?: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[var(--ink-muted)]">{label}</dt>
      <dd className="min-w-0">
        <span className={`block text-[var(--ink)] ${mono ? 'break-all font-mono text-xs leading-5' : 'font-medium'}`}>{value}</span>
        {detail ? <span className="block truncate text-xs text-[var(--ink-muted)]">{detail}</span> : null}
      </dd>
    </div>
  );
}

function CoverageWindow({ acceptBy, starts, ends, expired }: { acceptBy: string; starts: string; ends: string; expired: boolean }) {
  const points = [
    { label: 'Accept by', value: acceptBy, tone: expired ? 'text-[var(--warn)]' : 'text-[var(--ink)]' },
    { label: 'Coverage can start', value: starts, tone: 'text-[var(--ink)]' },
    { label: 'Coverage ends', value: ends, tone: 'text-[var(--ink)]' },
  ];
  return (
    <div className="border-t border-[var(--line)] px-4 py-4 sm:px-5">
      <ol className="grid gap-4 sm:grid-cols-3 sm:gap-0">
        {points.map((p, i) => (
          <li key={p.label} className="relative flex gap-3 sm:block sm:pr-4">
            <span className="relative flex items-center sm:mb-2.5">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${i === 0 ? 'bg-[var(--ink-faint)]' : 'bg-[var(--accent-signal)]'}`}
              />
              {i < points.length - 1 && (
                <span aria-hidden="true" className="ml-2 hidden h-px flex-1 bg-[var(--line-strong)] sm:block" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-[var(--ink-muted)]">{p.label}</span>
              <span className={`block text-sm font-medium tabular-nums ${p.tone}`}>{p.value}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-[var(--ink-muted)]">
        Coverage starts at the scheduled time only if the bind is paid and reconciled before then.
      </p>
    </div>
  );
}

function PaymentDot({ state, n }: { state: 'done' | 'current' | 'waiting' | 'attention'; n: number }) {
  const cls =
    state === 'done'
      ? 'bg-[var(--accent-signal)] text-white'
      : state === 'current'
        ? 'bg-[var(--accent)] text-white ring-4 ring-[var(--accent-soft)]'
        : state === 'attention'
          ? 'bg-[var(--warn)] text-white ring-4 ring-[var(--warn-soft)]'
          : 'bg-[var(--surface)] text-[var(--ink-muted)] ring-1 ring-[var(--line-strong)]';
  return (
    <span className={`relative grid h-8 w-8 place-items-center rounded-full text-xs font-semibold tabular-nums ${cls}`}>
      {state === 'done' ? (
        <Check size={14} weight="bold" aria-hidden="true" />
      ) : state === 'attention' ? (
        <WarningCircle size={16} weight="bold" aria-hidden="true" />
      ) : (
        n
      )}
    </span>
  );
}

function TechnicalDetails({ summary, value }: { summary: string; value: unknown }) {
  return (
    <details className="group rounded-[var(--radius)] border border-[var(--line)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-[var(--ink-secondary)]">
        {summary}
        <CaretDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <pre className="max-h-80 overflow-auto border-t border-[var(--line)] bg-[var(--paper)] p-4 font-mono text-xs leading-relaxed text-[var(--ink-secondary)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
