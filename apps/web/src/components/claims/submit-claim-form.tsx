'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
  exposures: Array<{ id: string; exposureKey: string; description: string }>;
};

export function SubmitClaimForm({ initialPolicyId }: { initialPolicyId?: string }) {
  const router = useRouter();
  const [policies, setPolicies] = useState<PolicyOption[] | null>(null);
  const [policyId, setPolicyId] = useState('');
  const [exposureId, setExposureId] = useState('');
  const [claimantRef, setClaimantRef] = useState('claimant:dashboard');
  const [rawEvidence, setRawEvidence] = useState(
    '{"note":"synthetic fixture evidence — not independent loss proof"}',
  );
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
            claimantRef,
            idempotencyKey: key,
            observedEventRef: eventRef,
            observedAt: new Date(observedAt).toISOString(),
            syntheticDemo: true,
          }),
        });
        const opened = await openRes.json();
        if (!openRes.ok) throw new Error(opened.error ?? 'Open failed');
        const caseId = opened.case.id as string;

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
              rawEvidence,
              verificationMethod: 'fixture_consistency',
              sourceReliability: 'demo_only',
              syntheticFixture: true,
            },
          }),
        });
        const evidenceJson = await evidenceRes.json();
        if (!evidenceRes.ok) throw new Error(evidenceJson.error ?? 'Evidence failed');

        const completed = await claimsFetch('claimant', '/api/claims/cases', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'complete_evidence',
            caseId,
            evidenceComplete: true,
          }),
        });

        const completeJson = await completed.json();
        if (!completed.ok) throw new Error(completeJson.error ?? 'Evidence completion failed');
        router.push(`/claims/${caseId}`);
      })().catch((err) => setError(err instanceof Error ? err.message : 'Submit failed'));
    });
  }

  return (
    <Panel title="Submit claim" action={<StatusBadge label="SYNTHETIC DEMO MODE" tone="synthetic" />}>
      <Callout kind="synthetic" title="Synthetic fixture mode">
        Submissions prove workflow consistency only. They are not independently verified real-world
        losses and cannot authorize payout without claims authority.
      </Callout>
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
            <span>Canonical synthetic incident reference</span>
            <input
              required
              maxLength={240}
              className="w-full rounded-md border border-zinc-200 px-2 py-2"
              value={eventRef}
              onChange={(e) => {
                setEventRef(e.target.value);
                setIntakeKey('');
              }}
              placeholder="synthetic:oracle-adapter:event-001"
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
              className="w-full rounded-md border border-zinc-200 px-2 py-2"
              value={observedAt}
              onChange={(e) => {
                setObservedAt(e.target.value);
                setIntakeKey('');
              }}
            />
            <span className="text-xs text-zinc-500">
              Must fall after effective coverage, within expiry, and before now. Synthetic
              attestation; subject to review.
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-600">Claimant ref</span>
            <input
              className="w-full rounded-md border border-zinc-200 px-2 py-1.5 font-mono text-xs"
              value={claimantRef}
              onChange={(e) => setClaimantRef(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-600">Supporting evidence (raw)</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-zinc-200 px-2 py-1.5 font-mono text-xs"
              value={rawEvidence}
              onChange={(e) => setRawEvidence(e.target.value)}
              required
            />
          </label>
          {error && !authRequired ? <p className="text-rose-700">{error}</p> : null}
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
