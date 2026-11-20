'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, Flask, ShieldCheck } from '@phosphor-icons/react';
import { Stepper, type StepItem } from '@/components/ui/stepper';
import { TruthBadge } from '@/components/ui/truth-badge';
import { usdc } from '@/lib/procurement/presentation';
import { claimsFetch } from '@/lib/claims/claims-api';
import {
  claimsNetworkFailure,
  parsePolicyOptionsPayload,
  readClaimsClientResponse,
} from '@/lib/claims/claims-client-response';
import { AuthRequired } from '@/components/ui/auth-required';
import { EmptyState } from '@/components/ui/empty-state';
import { Button, ButtonLink } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';

type PolicyOption = {
  id: string;
  status: string;
  synthetic?: boolean;
  effectiveAt?: number;
  expiresAt?: number;
  labels?: { product: string | null; agent: string | null };
  exposures: Array<{ id: string; exposureKey: string; description: string; limitMicros?: string }>;
};

type Step = 'policy' | 'incident' | 'proof' | 'review';
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'policy', label: 'Policy' },
  { id: 'incident', label: 'Incident' },
  { id: 'proof', label: 'Proof' },
  { id: 'review', label: 'Review' },
];
type Progress = 'opening' | 'proof' | 'completing' | 'redirecting';
const progressText: Record<Progress, string> = {
  opening: 'Opening the claim…',
  proof: 'Recording initial proof…',
  completing: 'Sending the claim for investigation…',
  redirecting: 'Claim opened. Loading its record…',
};

const day = (seconds?: number) =>
  seconds
    ? new Date(seconds * 1000).toLocaleDateString('en', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—';

export function SubmitClaimForm({ initialPolicyId }: { initialPolicyId?: string }) {
  const router = useRouter();
  const [policies, setPolicies] = useState<PolicyOption[] | null>(null);
  const [policyId, setPolicyId] = useState('');
  const [exposureId, setExposureId] = useState('');
  const [useFixture, setUseFixture] = useState(true);
  const [rawEvidence, setRawEvidence] = useState('');
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [eventRef, setEventRef] = useState('');
  const [observedAt, setObservedAt] = useState('');
  const [intakeKey, setIntakeKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>('policy');
  const [progress, setProgress] = useState<Progress | null>(null);
  const readVersion = useRef(0);

  const loadPolicies = useCallback(async () => {
    const version = ++readVersion.current;
    setError(null);
    setAuthRequired(false);
    setPolicies(null);
    try {
      const res = await claimsFetch('claimant', '/api/claims/policies');
      const result = await readClaimsClientResponse(res, (json) => {
        const policies = parsePolicyOptionsPayload(json);
        return policies ? (policies as PolicyOption[]) : null;
      });
      if (version !== readVersion.current) return;
      if (!result.ok) {
        setPolicies(null);
        if (result.kind === 'unauthorized' || result.kind === 'forbidden') {
          setAuthRequired(true);
        }
        setError(result.message);
        return;
      }
      setPolicies(result.data);
      const selected = initialPolicyId
        ? result.data.find((p) => p.id === initialPolicyId)
        : result.data[0];
      setPolicyId(selected?.id ?? '');
      setExposureId(selected?.exposures[0]?.id ?? '');
    } catch (e) {
      if (version !== readVersion.current) return;
      setPolicies(null);
      setError(claimsNetworkFailure(e).message);
    }
  }, [initialPolicyId]);

  useEffect(() => {
    void loadPolicies();
    const sessionChanged = () => {
      void loadPolicies();
    };
    window.addEventListener('arcuex-session-changed', sessionChanged);
    return () => {
      readVersion.current++;
      window.removeEventListener('arcuex-session-changed', sessionChanged);
    };
  }, [loadPolicies]);

  const selected = (policies ?? []).find((p) => p.id === policyId);
  const independent = selected?.synthetic === false;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !selected.exposures.some((exposure) => exposure.id === exposureId)) return;
    setError(null);
    const key = intakeKey || `case:${crypto.randomUUID()}`;
    setIntakeKey(key);
    startTransition(async () => {
      await (async () => {
        setProgress('opening');
        const openRes = await claimsFetch('claimant', '/api/claims/cases', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'open',
            policyId,
            exposureId,
            claimantRef: 'authenticated-policyholder',
            idempotencyKey: key,
            observedEventRef: eventRef,
            observedAt: new Date(observedAt).toISOString(),
            syntheticDemo: !independent,
          }),
        });
        const opened = await openRes.json();
        if (!openRes.ok) throw new Error(opened.error ?? 'Open failed');
        const caseId = opened.case.id as string;

        setCreatedCaseId(caseId);
        if (independent) {
          setProgress('redirecting');
          router.push(`/claims/${caseId}`);
          return;
        }
        let evidence = rawEvidence;
        setProgress('proof');
        if (useFixture) {
          const detailResponse = await claimsFetch('claimant', `/api/claims/cases/${caseId}`);
          const detail = await detailResponse.json();
          if (!detailResponse.ok || typeof detail.fixtureCatalog?.raw !== 'string')
            throw new Error('Supported fixture unavailable. Open the saved claim to continue.');
          evidence = detail.fixtureCatalog.raw;
        }
        if (evidence.trim()) {
          const evidenceRes = await claimsFetch('claimant', '/api/claims/cases', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'attach_evidence',
              caseId,
              evidence: {
                source: 'dashboard-submit',
                chain: 'arc-testnet',
                provenance: 'claimant-upload',
                rawEvidence: evidence,
                verificationMethod: 'fixture_consistency',
                sourceReliability: 'demo_only',
                syntheticFixture: true,
              },
            }),
          });
          const evidenceJson = await evidenceRes.json();
          if (!evidenceRes.ok) throw new Error(evidenceJson.error ?? 'Evidence failed');
        }

        setProgress('completing');
        const completed = await claimsFetch('claimant', '/api/claims/cases', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'complete_evidence',
            caseId,
            evidenceComplete: !!evidence.trim(),
          }),
        });

        const completeJson = await completed.json();
        if (!completed.ok) throw new Error(completeJson.error ?? 'Evidence completion failed');
        setProgress('redirecting');
        router.push(`/claims/${caseId}`);
      })().catch((err) => {
        setProgress(null);
        setError(err instanceof Error ? err.message : 'Submit failed');
      });
    });
  }

  const selectedExposure = selected?.exposures.find((exposure) => exposure.id === exposureId);
  const observedValid = Boolean(observedAt) && Number.isFinite(Date.parse(observedAt));
  const ready: Record<Step, boolean> = {
    policy: Boolean(selected && selectedExposure),
    incident: Boolean(eventRef.trim() && observedValid),
    proof: true,
    review: true,
  };
  const index = STEPS.findIndex((s) => s.id === step);
  const steps: StepItem[] = STEPS.map((s, i) => ({
    id: s.id,
    label: s.label,
    state:
      i < index
        ? 'complete'
        : i === index
          ? error && s.id === 'review'
            ? 'error'
            : 'current'
          : 'upcoming',
  }));
  const go = (to: Step) => {
    setStep(to);
    requestAnimationFrame(() => document.getElementById(`claim-step-${to}`)?.focus());
  };
  const nextStep = () => {
    if (!ready[step]) return;
    const next = STEPS[index + 1];
    if (next) go(next.id);
  };
  const reference = independent
    ? 'Arc liquidation event reference'
    : 'Canonical synthetic incident reference';

  if (authRequired)
    return (
      <AuthRequired description="Connect the insured wallet and sign in from the header to see eligible policies." />
    );

  if (!policies && error)
    return (
      <div
        role="alert"
        className="max-w-2xl rounded-[var(--radius-lg)] border border-[#f3c4bf] bg-[var(--danger-soft)] px-5 py-4"
      >
        <p className="text-sm font-semibold text-[var(--danger)]">
          Eligible policies could not be loaded
        </p>
        <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-secondary)]">{error}</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => void loadPolicies()}>
          Retry policy list
        </Button>
      </div>
    );

  if (!policies)
    return (
      <div role="status" className="max-w-3xl space-y-3">
        <span className="sr-only">Loading insured policies…</span>
        <div className="h-8 animate-pulse rounded-[var(--radius)] bg-[var(--surface-inset)]" />
        <div className="h-40 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-inset)]" />
      </div>
    );

  if (policies.length === 0)
    return (
      <div className="max-w-2xl">
        <EmptyState
          icon={<ShieldCheck size={18} weight="duotone" />}
          title="No policy can take a claim right now"
          description="A claim opens against a policy you own once its bind is reconciled and coverage has started. Check your portfolio for policies still awaiting confirmation."
          action={
            <ButtonLink href="/policies" variant="secondary">
              View policies
            </ButtonLink>
          }
        />
      </div>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <form
        className="min-w-0 space-y-5"
        onSubmit={(e) => {
          if (step !== 'review') {
            e.preventDefault();
            nextStep();
            return;
          }
          onSubmit(e);
        }}
      >
        {selected && step !== 'policy' ? (
          <section className="arc-panel flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5" aria-label="Selected policy">
            <div className="min-w-0">
              <p className="text-xs text-[var(--ink-muted)]">Selected policy</p>
              <p className="break-all text-sm font-semibold text-[var(--ink)]">{selected.labels?.product ?? selected.id}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => go('policy')}>Change policy</Button>
          </section>
        ) : null}
        <div className="arc-panel p-3 sm:px-5"><Stepper steps={steps} ariaLabel="Claim filing progress" /></div>

        {initialPolicyId && !policies.some((p) => p.id === initialPolicyId) && (
          <Callout kind="warn" title="Linked policy is unavailable">
            It is not eligible for a claim from this session. Select another policy or return to
            your portfolio.
          </Callout>
        )}

        {step === 'policy' && (
          <StepPanel
            id="policy"
            title="Which policy covered the agent?"
            hint="Only policies you own with reconciled, in-force coverage are listed."
          >
            <fieldset className="space-y-2">
              <legend className="sr-only">Insured policy</legend>
              {policies.map((p) => {
                const exposure = p.exposures[0];
                return (
                  <label key={p.id} className="choice">
                    <input
                      type="radio"
                      name="policy"
                      className="sr-only"
                      checked={policyId === p.id}
                      onChange={() => {
                        setIntakeKey('');
                        setPolicyId(p.id);
                        setExposureId(p.exposures[0]?.id ?? '');
                      }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--ink)]">
                          {p.labels?.product ?? `Policy ${p.id.slice(0, 8)}`}
                        </span>
                        {p.synthetic === false ? (
                          <TruthBadge label="Independent evidence" tone="pending" />
                        ) : (
                          <TruthBadge label="Synthetic" tone="synthetic" />
                        )}
                      </span>
                      <span className="text-[0.8125rem] text-[var(--ink-secondary)]">
                        {p.labels?.agent ?? exposure?.description ?? 'Insured agent'}
                        {exposure ? (
                          <span className="font-mono text-xs text-[var(--ink-muted)]">
                            {' '}
                            · {exposure.exposureKey}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs tabular-nums text-[var(--ink-muted)]">
                        {day(p.effectiveAt)} to {day(p.expiresAt)}
                        {exposure?.limitMicros
                          ? ` · limit ${usdc(exposure.limitMicros)}`
                          : ''} · <span className="font-mono">{p.id.slice(0, 8)}</span>
                      </span>
                    </span>
                    <span className="choice-dot" aria-hidden="true" />
                  </label>
                );
              })}
            </fieldset>
            {selected && selected.exposures.length > 1 && (
              <label className="mt-4 block">
                <span className="field-label">Registered exposure</span>
                <select
                  className="field-control mt-1.5 w-full"
                  aria-label="Registered exposure"
                  value={exposureId}
                  onChange={(e) => {
                    setExposureId(e.target.value);
                    setIntakeKey('');
                  }}
                >
                  {selected.exposures.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.exposureKey} · {ex.description}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </StepPanel>
        )}

        {step === 'incident' && (
          <StepPanel
            id="incident"
            title="What happened, and when?"
            hint="The reference and time identify one economic event. They are compared against the coverage window by the server."
          >
            <div className="space-y-4">
              <label className="block">
                <span className="field-label">{reference}</span>
                <input
                  required
                  maxLength={240}
                  className="field-control mt-1.5 w-full font-mono"
                  aria-label={reference}
                  aria-describedby="incident-reference-help"
                  value={eventRef}
                  onChange={(e) => {
                    setEventRef(e.target.value);
                    setIntakeKey('');
                  }}
                  placeholder={
                    independent ? 'evm:5042002:0x…:logIndex' : 'synthetic:oracle-adapter:event-001'
                  }
                />
                <span id="incident-reference-help" className="field-hint mt-1 block">
                  {independent
                    ? 'The Arc event that liquidated the insured position.'
                    : 'The synthetic scenario event this claim describes.'}{' '}
                  Use the same reference for the same event; a retry must not invent a new incident.
                </span>
              </label>
              <label className="block">
                <span className="field-label">Incident time</span>
                <input
                  required
                  type="datetime-local"
                  step={independent ? 1 : undefined}
                  className="field-control mt-1.5 w-full sm:w-72"
                  aria-label="Incident time"
                  aria-describedby="incident-time-help"
                  value={observedAt}
                  onChange={(e) => {
                    setObservedAt(e.target.value);
                    setIntakeKey('');
                  }}
                />
                <span id="incident-time-help" className="field-hint mt-1 block">
                  Your browser’s local time; the server saves it in UTC.
                  {independent
                    ? ' Use the exact Arc block timestamp.'
                    : ' It must fall inside the effective coverage window.'}
                  {selected
                    ? ` Coverage runs ${day(selected.effectiveAt)} to ${day(selected.expiresAt)}.`
                    : ''}
                </span>
              </label>
            </div>
          </StepPanel>
        )}

        {step === 'proof' && (
          <StepPanel
            id="proof"
            title="Attach initial proof"
            hint={
              independent
                ? 'Independent claims are proven through the verification API after the claim opens.'
                : 'Proof is recorded unverified. Verification and a human reviewer assess it after you file.'
            }
          >
            {independent ? (
              <Callout kind="info" title="Independent evidence comes next">
                After the claim opens, submit the signed replay and recovery envelope through the
                verification API. Nothing is attached from this form.
              </Callout>
            ) : (
              <div className="space-y-2">
                <label className="choice">
                  <input
                    type="radio"
                    name="proof"
                    className="sr-only"
                    checked={useFixture}
                    onChange={() => setUseFixture(true)}
                  />
                  <span className="flex min-w-0 flex-1 gap-3">
                    <Flask
                      size={18}
                      weight="duotone"
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-[var(--synthetic)]"
                    />
                    <span>
                      <span className="block font-semibold text-[var(--ink)]">
                        Use the supported synthetic fixture
                      </span>
                      <span className="mt-0.5 block text-[0.8125rem] text-[var(--ink-secondary)]">
                        A server-owned scenario: 1.50 USDC gross economic loss and resolved zero
                        recoveries. It is not proof of a real event.
                      </span>
                    </span>
                  </span>
                  <span className="choice-dot" aria-hidden="true" />
                </label>
                <label className="choice">
                  <input
                    type="radio"
                    name="proof"
                    className="sr-only"
                    checked={!useFixture}
                    onChange={() => setUseFixture(false)}
                  />
                  <span className="flex min-w-0 flex-1 gap-3">
                    <FileText
                      size={18}
                      weight="duotone"
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-[var(--ink-muted)]"
                    />
                    <span>
                      <span className="block font-semibold text-[var(--ink)]">
                        Paste my own evidence
                      </span>
                      <span className="mt-0.5 block text-[0.8125rem] text-[var(--ink-secondary)]">
                        Unsupported evidence needs human review and cannot establish a payable loss.
                      </span>
                    </span>
                  </span>
                  <span className="choice-dot" aria-hidden="true" />
                </label>
                {!useFixture && (
                  <label className="block pt-2">
                    <span className="field-label">Supporting evidence (raw)</span>
                    <textarea
                      className="field-control mt-1.5 block min-h-28 w-full font-mono text-xs"
                      value={rawEvidence}
                      onChange={(e) => setRawEvidence(e.target.value)}
                    />
                    <span className="field-hint mt-1 block">
                      Leave empty to file without proof; the claim then waits for evidence.
                    </span>
                  </label>
                )}
              </div>
            )}
          </StepPanel>
        )}

        {step === 'review' && (
          <StepPanel
            id="review"
            title="Review and file"
            hint="Check the record before it is created. Filing opens an investigation; it does not approve or pay anything."
          >
            <dl className="divide-y divide-[var(--line)] rounded-[var(--radius)] border border-[var(--line)] text-[0.8125rem]">
              <ReviewRow label="Policy" onEdit={() => go('policy')}>
                {selected?.labels?.product ?? selected?.id}
                <span className="block font-mono text-xs text-[var(--ink-muted)]">
                  {selected?.id}
                </span>
              </ReviewRow>
              <ReviewRow label="Insured agent" onEdit={() => go('policy')}>
                {selected?.labels?.agent ?? selectedExposure?.description}
                <span className="block font-mono text-xs text-[var(--ink-muted)]">
                  {selectedExposure?.exposureKey}
                </span>
              </ReviewRow>
              <ReviewRow label="Incident" onEdit={() => go('incident')}>
                <span className="font-mono text-xs">{eventRef}</span>
                <span className="block text-xs text-[var(--ink-muted)]">
                  {observedValid
                    ? `${new Date(observedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC`
                    : '—'}
                </span>
              </ReviewRow>
              <ReviewRow label="Initial proof" onEdit={() => go('proof')}>
                {independent
                  ? 'Submitted through the verification API after filing'
                  : useFixture
                    ? 'Supported synthetic fixture'
                    : rawEvidence.trim()
                      ? `Pasted evidence, ${new TextEncoder().encode(rawEvidence).length} bytes`
                      : 'None yet'}
              </ReviewRow>
              <ReviewRow label="Filed by">
                Your authenticated wallet session, as policyholder
                <span className="block text-xs text-[var(--ink-muted)]">
                  Insured agents file with their own registered signer through the SDK.
                </span>
              </ReviewRow>
            </dl>
            {error ? (
              <p role="alert" className="mt-4 text-[0.8125rem] font-medium text-[var(--danger)]">
                {error}
              </p>
            ) : null}
            {error && createdCaseId && (
              <Link
                className="mt-1 inline-block text-[0.8125rem] font-medium text-[var(--accent)] underline"
                href={`/claims/${createdCaseId}`}
              >
                Continue saved claim
              </Link>
            )}
            {progress ? (
              <p role="status" className="mt-4 text-[0.8125rem] text-[var(--pending)]">
                {progressText[progress]}
              </p>
            ) : null}
          </StepPanel>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
          {index > 0 ? (
            <Button variant="ghost" disabled={pending} onClick={() => go(STEPS[index - 1]!.id)}>
              Back
            </Button>
          ) : (
            <ButtonLink href="/claims" variant="ghost">
              Cancel
            </ButtonLink>
          )}
          {step === 'review' ? (
            <Button
              type="submit"
              className="active:scale-100"
              disabled={pending || !exposureId || !ready.incident}
            >
              {pending ? 'Submitting…' : 'Submit claim case'}
            </Button>
          ) : (
            <Button type="submit" disabled={!ready[step]}>
              Continue
            </Button>
          )}
        </div>
      </form>

      <aside className="hidden space-y-3 lg:sticky lg:top-[calc(var(--topbar-h)+1.25rem)] lg:block">
        <div className="arc-panel px-5 py-4 text-[0.8125rem]">
          <p className="text-xs font-medium text-[var(--ink-muted)]">After you file</p>
          <ol className="mt-3 space-y-3">
            {[
              ['Verification', 'The server checks your proof and records what it can confirm.'],
              [
                'Investigation',
                'A reviewer may ask for more proof. An AI examiner can advise, never decide.',
              ],
              [
                'Human decision',
                'A reviewer approves or denies coverage with a written rationale.',
              ],
              ['Settlement', 'Approval is not payment. Funds move only with a reconciled receipt.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--surface-inset)] text-[0.6875rem] font-semibold tabular-nums text-[var(--ink-secondary)]">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-medium text-[var(--ink)]">{t}</span>
                  <span className="text-xs text-[var(--ink-muted)]">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        {selected && (
          <p className="px-1 text-xs text-[var(--ink-muted)]">
            {independent
              ? 'Independent-evidence pilot. Settlement requires a verified Arc receipt.'
              : 'Synthetic policy. Claims run the full workflow, and settlement stays disabled.'}
          </p>
        )}
      </aside>
    </div>
  );
}

function StepPanel({
  id,
  title,
  hint,
  children,
}: {
  id: Step;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`claim-step-${id}`}
      className="arc-panel px-5 py-5 sm:px-6"
    >
      <h2
        id={`claim-step-${id}`}
        tabIndex={-1}
        className="font-display text-lg font-semibold tracking-[-0.01em] text-[var(--ink)] focus-visible:outline-none"
      >
        {title}
      </h2>
      <p className="mt-1 mb-4 text-[0.8125rem] text-[var(--ink-muted)]">{hint}</p>
      {children}
    </section>
  );
}

function ReviewRow({
  label,
  onEdit,
  children,
}: {
  label: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 px-4 py-3">
      <dt className="w-28 shrink-0 text-[var(--ink-muted)]">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-[var(--ink)]">{children}</dd>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline"
        >
          Edit
        </button>
      ) : null}
    </div>
  );
}
