'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { claimsFetch } from '@/lib/claims/claims-api';

type PolicyOption = {
  id: string;
  status: string;
  exposures: Array<{ id: string; exposureKey: string; description: string }>;
};

export function SubmitClaimForm() {
  const router = useRouter();
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [policyId, setPolicyId] = useState('');
  const [exposureId, setExposureId] = useState('');
  const [claimantRef, setClaimantRef] = useState('claimant:dashboard');
  const [rawEvidence, setRawEvidence] = useState(
    '{"note":"synthetic fixture evidence — not independent loss proof"}',
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void claimsFetch('claimant', '/api/claims/policies')
      .then(async (res) => {
        const json = (await res.json()) as {
          policies?: PolicyOption[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? 'Failed to load policies');
        const active = json.policies ?? [];
        setPolicies(active);
        if (active[0]) {
          setPolicyId(active[0].id);
          setExposureId(active[0].exposures[0]?.id ?? '');
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load policies'));
  }, []);

  const selected = policies.find((p) => p.id === policyId);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(() => {
      void (async () => {
        const openRes = await claimsFetch('claimant', '/api/claims/cases', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'open',
            policyId,
            exposureId,
            claimantRef,
            idempotencyKey: `case:${policyId}:${Date.now()}`,
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

        await claimsFetch('claimant', '/api/claims/cases', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'complete_evidence',
            caseId,
            evidenceComplete: true,
          }),
        });

        router.push(`/claims/${caseId}`);
      })().catch((err) => setError(err instanceof Error ? err.message : 'Submit failed'));
    });
  }

  return (
    <Panel
      title="Submit claim"
      action={<StatusBadge label="SYNTHETIC DEMO MODE" tone="warn" />}
    >
      <p className="mb-3 text-xs text-amber-800">
        Synthetic fixture submissions prove workflow consistency only. They are not independently
        verified real-world losses and cannot authorize payout without claims authority.
      </p>
      {policies.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No active policies found. Bind coverage first, then return here.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3 text-sm">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-600">Insured policy</span>
            <select
              className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5"
              value={policyId}
              onChange={(e) => {
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
              onChange={(e) => setExposureId(e.target.value)}
            >
              {(selected?.exposures ?? []).map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.exposureKey} — {ex.description}
                </option>
              ))}
            </select>
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
          {error ? <p className="text-rose-700">{error}</p> : null}
          <button
            type="submit"
            disabled={pending || !exposureId}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Submitting…' : 'Submit claim case'}
          </button>
        </form>
      )}
    </Panel>
  );
}
