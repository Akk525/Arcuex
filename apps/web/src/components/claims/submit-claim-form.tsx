'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { claimsFetch } from '@/lib/claims/claims-api';
import {
  claimsNetworkFailure,
  parsePolicyOptionsPayload,
  readClaimsClientResponse,
} from '@/lib/claims/claims-client-response';
import { AuthRequired } from '@/components/ui/auth-required';
import { EmptyState } from '@/components/ui/empty-state';
import { Callout } from '@/components/ui/callout';

type PolicyOption = {
  id: string;
  status: string;
  synthetic?: boolean;
  exposures: Array<{ id: string; exposureKey: string; description: string }>;
};

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

  useEffect(() => {
    void (async () => {
      try {
        const res = await claimsFetch('claimant', '/api/claims/policies');
        const result = await readClaimsClientResponse(res, (json) => {
          const policies = parsePolicyOptionsPayload(json);
          return policies ? (policies as PolicyOption[]) : null;
        });
        if (!result.ok) {
          setPolicies(null);
          if (result.kind === 'unauthorized' || result.kind === 'forbidden') {
            setAuthRequired(true);
          }
          setError(result.message);
          return;
        }
        setPolicies(result.data);
        const selected = result.data.find((p) => p.id === initialPolicyId) ?? result.data[0];
        if (selected) {
          setPolicyId(selected.id);
          setExposureId(selected.exposures[0]?.id ?? '');
        }
      } catch (e) {
        setPolicies(null);
        setError(claimsNetworkFailure(e).message);
      }
    })();
  }, [initialPolicyId]);

  const selected = (policies ?? []).find((p) => p.id === policyId);
  const independent = selected?.synthetic === false;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const key = intakeKey || `case:${crypto.randomUUID()}`;
    setIntakeKey(key);
    startTransition(async () => {
      await (async () => {
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
          router.push(`/claims/${caseId}`);
          return;
        }
        let evidence = rawEvidence;
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
        router.push(`/claims/${caseId}`);
      })().catch((err) => setError(err instanceof Error ? err.message : 'Submit failed'));
    });
  }

  return (
    <Panel
      title="Submit claim"
      action={
        selected ? (
          <StatusBadge
            label={independent ? 'INDEPENDENT-EVIDENCE PILOT' : 'SYNTHETIC DEMO MODE'}
            tone={independent ? 'pending' : 'synthetic'}
          />
        ) : undefined
      }
    >
      {selected &&
        (independent ? (
          <Callout kind="info" title="Independent evidence required">
            Open the case with the Arc event reference and block timestamp. Submit the signed replay
            and recovery envelope through the verification API.
          </Callout>
        ) : (
          <Callout kind="synthetic" title="Synthetic fixture mode">
            Fixture evidence verifies the demo workflow. Production settlement remains disabled for
            synthetic claims.
          </Callout>
        ))}
      {error && !authRequired ? (
        <p className="mb-3 mt-3 text-sm text-[var(--danger)]">{error}</p>
      ) : null}
      {authRequired ? (
        <div className="mt-3">
          <AuthRequired description="Sign in from the header with the claimant wallet session. Authorization failures are not treated as an empty policy list." />
        </div>
      ) : null}
      {!policies && !error ? (
        <p className="mt-3 text-sm text-[var(--ink-muted)]">Loading insured policies…</p>
      ) : null}
      {policies && policies.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="No owned, confirmed policies"
            description="Bind coverage with this wallet first, then refresh. Empty results are authenticated API responses."
          />
        </div>
      ) : null}
      {policies && policies.length > 0 ? (
        <form onSubmit={onSubmit} className="space-y-3 text-sm">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-600">Insured policy</span>
            <select
              className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5"
              value={policyId}
              onChange={(e) => {
                setIntakeKey('');
                setPolicyId(e.target.value);
                const p = policies.find((x) => x.id === e.target.value);
                setExposureId(p?.exposures[0]?.id ?? '');
              }}
            >
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id.slice(0, 8)}… ({p.status})
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-600">Registered exposure</span>
            <select
              className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5"
              value={exposureId}
              onChange={(e) => {
                setExposureId(e.target.value);
                setIntakeKey('');
              }}
            >
              {(selected?.exposures ?? []).map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.exposureKey} — {ex.description}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span>
              {independent
                ? 'Arc liquidation event reference'
                : 'Canonical synthetic incident reference'}
            </span>
            <input
              required
              maxLength={240}
              className="w-full rounded-md border border-zinc-200 px-2 py-2"
              value={eventRef}
              onChange={(e) => {
                setEventRef(e.target.value);
                setIntakeKey('');
              }}
              placeholder={
                independent ? 'evm:5042002:0x…:logIndex' : 'synthetic:oracle-adapter:event-001'
              }
            />
            <span className="text-xs text-zinc-500">
              Use the same reference for the same economic event. A retry must not invent a new
              incident.
            </span>
          </label>
          <label className="block space-y-1">
            <span>Incident time</span>
            <input
              required
              type="datetime-local"
              step={independent ? 1 : undefined}
              className="w-full rounded-md border border-zinc-200 px-2 py-2"
              value={observedAt}
              onChange={(e) => {
                setObservedAt(e.target.value);
                setIntakeKey('');
              }}
            />
            <span className="text-xs text-zinc-500">
              Enter the incident time in your browser’s local time. The server saves it in UTC.
              {independent
                ? ' Use the exact Arc block timestamp.'
                : ' The time must fall in the effective coverage window.'}
            </span>
          </label>
          <p className="text-xs text-zinc-500">
            Policyholder identity comes from your authenticated wallet session.
          </p>
          {!independent && (
            <>
              <label className="block space-y-1">
                <input
                  type="checkbox"
                  checked={useFixture}
                  onChange={(e) => setUseFixture(e.target.checked)}
                />{' '}
                Use the supported synthetic fixture
              </label>
              <p className="text-xs text-zinc-500">
                The server-owned scenario describes 1.50 USDC gross economic loss and resolved zero
                recoveries. It is not proof of a real event. Verification and human review follow
                submission.
              </p>
              {!useFixture && (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-zinc-600">
                    Supporting evidence (raw)
                  </span>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-zinc-200 px-2 py-1.5 font-mono text-xs"
                    value={rawEvidence}
                    onChange={(e) => setRawEvidence(e.target.value)}
                  />
                  <span className="text-xs text-zinc-500">
                    Missing or unsupported evidence requires review and cannot establish a payable
                    loss.
                  </span>
                </label>
              )}
            </>
          )}
          {error && !authRequired ? (
            <p role="alert" className="text-rose-700">
              {error}
            </p>
          ) : null}
          {error && createdCaseId && (
            <Link className="block text-sm underline" href={`/claims/${createdCaseId}`}>
              Continue saved claim
            </Link>
          )}
          <button
            type="submit"
            disabled={pending || !exposureId}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Submitting…' : 'Submit claim case'}
          </button>
        </form>
      ) : null}
    </Panel>
  );
}
