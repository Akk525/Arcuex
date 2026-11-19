'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { getClaimsInvestigation } from '@arcuex/insurance';
import { claimsFetch } from '@/lib/claims/claims-api';
import { Panel } from '@/components/panel';
import { ClaimAuditEvent, type ClaimAuditRecord } from './claim-audit-event';
import { ClaimEventMetadata, ClaimEvidenceLinks } from './claim-evidence-links';
import { ClaimExaminerReport } from './claim-examiner-report';
import {
  evidenceAnchor,
  reviewBlockerMessage,
  type EvidenceTarget,
} from '@/lib/claims/investigation-presentation';
type View = ReturnType<typeof getClaimsInvestigation>;
const chronologyLabel = {
  before_inception: 'Before inception',
  at_inception: 'At inception',
  during_coverage: 'During the policy window',
  at_expiry: 'At expiry',
  after_expiry: 'After expiry',
  unresolved: 'Unresolved',
};
const timestamp = (epochMs: number | null) =>
  epochMs === null ? 'Unavailable' : new Date(epochMs).toISOString();

export function ClaimsInvestigation({
  caseId,
  role,
  status,
  verificationRevision,
  onChange,
  targets: caseTargets,
  audit,
  verificationEvents,
  receipt,
}: {
  caseId: string;
  role?: string;
  status: string;
  verificationRevision: number;
  onChange: () => Promise<void>;
  targets: readonly EvidenceTarget[];
  audit: readonly ClaimAuditRecord[];
  verificationEvents: ReadonlyArray<{
    id: string;
    actor?: string;
    createdAt?: string;
    executionStatus: string;
    evidenceSufficiency: string;
  }>;
  receipt?: string | null;
}) {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(''),
    [content, setContent] = useState(''),
    [filename, setFilename] = useState('proof.txt'),
    [requestId, setRequestId] = useState(''),
    [source, setSource] = useState('policyholder submission');
  const requestSelect = useRef<HTMLSelectElement>(null);
  const rationaleField = useRef<HTMLTextAreaElement>(null);
  const reviewer = role === 'reviewer' || role === 'authority';
  const open = ['COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'].includes(status);
  const canParticipate = open && (reviewer || role === 'claimant');
  const canSubmit = open && (role === 'claimant' || role === 'reviewer');
  const selectedRequestClosed = Boolean(
    requestId && view && !view.outstandingRequests.includes(requestId),
  );
  const load = useCallback(async () => {
    try {
      const r = await claimsFetch('any', `/api/claims/cases/${caseId}/investigation`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Investigation unavailable');
      setView(data);
      setError('');
    } catch (e) {
      setView(null);
      setError(e instanceof Error ? e.message : 'Investigation unavailable');
    }
  }, [caseId]);
  const pending = view?.entries.some(
    (e) =>
      e.kind === 'examiner_request' &&
      !view.entries.some(
        (r) =>
          ['examiner_report', 'examiner_failure'].includes(r.kind) && r.payload.requestId === e.id,
      ),
  );
  useEffect(() => {
    void load();
  }, [load, status, verificationRevision]);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 2500);
    return () => clearInterval(timer);
  }, [pending, load]);
  async function act(input: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const r = await claimsFetch('any', `/api/claims/cases/${caseId}/investigation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestKey: crypto.randomUUID(), ...input }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Investigation action failed');
      if ('text' in input) setText('');
      if (input.action === 'submit_proof') {
        setContent('');
        setRequestId('');
      }
      await load();
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Investigation action failed');
    } finally {
      setBusy(false);
    }
  }
  async function submitProof() {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    await act({
      action: 'submit_proof',
      requestId: requestId || null,
      filename,
      content,
      contentHash:
        'sha256:' +
        Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join(''),
      declaredSource: source,
    });
  }
  const entries = view?.entries ?? [];
  const targets = [
    ...caseTargets,
    ...entries.map((e) => ({
      kind: 'record',
      id: e.id,
      label: e.kind.replaceAll('_', ' '),
      stale: e.stale,
    })),
  ];
  const openRequests = entries.filter((entry) => view?.outstandingRequests.includes(entry.id));
  const steps = [
    ...audit.map((event) => ({ event, time: event.createdAt })),
    ...verificationEvents.flatMap((verification) =>
      verification.createdAt ? [{ verification, time: verification.createdAt }] : [],
    ),
    ...entries.map((entry) => ({ entry, time: entry.createdAt })),
  ].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));

  function respondTo(id: string) {
    setRequestId(id);
    requestAnimationFrame(() => requestSelect.current?.focus());
  }

  return (
    <Panel title="Investigation · agent, examiner and human">
      <p className="text-sm text-zinc-600">
        Review the evidence requests and the case history. The persisted verifier records evidence
        findings, and a human reviewer makes the coverage decision.
      </p>
      {error ? (
        <p role="alert" className="my-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {!view ? (
        <div>
          <p role="status" className="text-sm">
            {error ? 'Investigation unavailable.' : 'Loading investigation…'}
          </p>
          {error ? (
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm"
              onClick={() => void load()}
            >
              Retry investigation
            </button>
          ) : null}
          {error && audit.length > 0 && (
            <ol className="mt-3 space-y-2" aria-label="Available case history">
              {audit.map((event) => (
                <ClaimAuditEvent
                  key={event.id}
                  event={event}
                  receipt={receipt}
                  targets={caseTargets}
                />
              ))}
            </ol>
          )}
        </div>
      ) : (
        <>
          {view.reviewBlockers.length > 0 && (
            <div className="my-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-semibold">Before a decision</p>
              <ul className="list-disc pl-5">
                {view.reviewBlockers.map((code) => (
                  <li key={code}>{reviewBlockerMessage(code)}</li>
                ))}
              </ul>
            </div>
          )}
          {view.chronology ? (
            <section
              className="my-3 rounded border bg-white p-3 text-sm"
              aria-label="Server-checked coverage chronology"
            >
              <p className="font-semibold">
                Server-checked chronology · {chronologyLabel[view.chronology.relation]}
              </p>
              <p>
                Incident {timestamp(view.chronology.incident.epochMs)} · Policy window{' '}
                {timestamp(view.chronology.startsAt.epochMs)} to{' '}
                {timestamp(view.chronology.endsAt.epochMs)} (inclusive).
              </p>
              {view.chronology.issue ? (
                <p>Review required · {view.chronology.issue.replaceAll('_', ' ')}</p>
              ) : null}
              {view.chronology.waitingPeriodSatisfied === false ? (
                <p>The recorded observation did not satisfy the policy waiting period.</p>
              ) : null}
              <p>
                Timestamp comparison only. Applicability, exclusions, causation and loss require
                separate evidence and review.
              </p>
              <details className="text-xs">
                <summary className="inline-flex min-h-11 cursor-pointer items-center underline">
                  Recorded timestamp sources
                </summary>
                <p>
                  Policy {view.chronology.policySource} · {view.chronology.startsAt.raw ?? '—'} to{' '}
                  {view.chronology.endsAt.raw ?? '—'}
                </p>
                <p>
                  Incident {view.chronology.incident.source} · {view.chronology.incident.raw ?? '—'}
                </p>
              </details>
            </section>
          ) : null}
          {view.authorityReview?.length ? (
            <p className="my-2 text-sm font-medium">
              Claimant or delegation authority is unresolved. Human review is required.
            </p>
          ) : null}
          <section
            aria-label="Outstanding evidence requests"
            className="my-4 rounded border border-zinc-200 p-3"
          >
            <h3 className="text-sm font-semibold">
              Outstanding evidence requests ({openRequests.length})
            </h3>
            {!openRequests.length && (
              <p className="mt-1 text-sm text-zinc-600">No open evidence requests.</p>
            )}
            <ul className="divide-y divide-zinc-200">
              {openRequests.map((request) => {
                const proof = entries
                  .filter(
                    (e) => e.kind === 'proof_submission' && e.payload.requestId === request.id,
                  )
                  .at(-1);
                return (
                  <li key={request.id} className="py-3 text-sm last:pb-0">
                    <p className="whitespace-pre-wrap">{String(request.payload.text ?? '')}</p>
                    <p className="mt-1 text-xs font-medium">
                      {proof
                        ? 'Response received · awaiting human review'
                        : 'Awaiting linked proof'}
                    </p>
                    <ClaimEventMetadata actor={request.actor} timestamp={request.createdAt} />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <a
                        href={`#${evidenceAnchor('record', request.id)}`}
                        className="inline-flex min-h-11 items-center text-sky-800 underline"
                      >
                        View request in timeline
                      </a>
                      {canSubmit && (
                        <button
                          type="button"
                          className="rounded border px-3 text-xs"
                          onClick={() => respondTo(request.id)}
                        >
                          Respond to this request
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          {!canParticipate && (
            <p className="text-sm text-zinc-600">
              {open
                ? 'This session has read-only access to the investigation.'
                : 'Investigation closed. The timeline remains available for review.'}
            </p>
          )}
          <div className="my-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Investigation timeline</h3>
            <div className="flex flex-wrap items-center gap-2">
              {canParticipate && (
                <a
                  className="inline-flex min-h-11 items-center text-xs text-sky-800 underline"
                  href="#investigation-actions"
                >
                  Go to investigation actions
                </a>
              )}
              <button
                type="button"
                className="rounded border px-3 py-1 text-xs"
                onClick={() => void load()}
              >
                Refresh investigation
              </button>
            </div>
          </div>
          {!steps.length && (
            <p className="text-sm text-zinc-600">No investigation activity recorded yet.</p>
          )}
          <ol className="space-y-3" aria-label="Investigation thread">
            {steps.map((step) => {
              if ('event' in step)
                return (
                  <ClaimAuditEvent
                    key={step.event.id}
                    event={step.event}
                    receipt={receipt}
                    targets={targets}
                  />
                );
              if ('verification' in step) {
                const v = step.verification;
                return (
                  <li key={v.id} className="rounded border border-zinc-200 bg-white p-3 text-sm">
                    <p className="font-semibold">Deterministic verification recorded</p>
                    <ClaimEventMetadata actor={v.actor} timestamp={v.createdAt} />
                    <p>
                      Execution {v.executionStatus} · Evidence {v.evidenceSufficiency}
                    </p>
                    <ClaimEvidenceLinks
                      references={[v.id]}
                      targets={targets}
                      kind="verification"
                      label="Verification record"
                    />
                  </li>
                );
              }
              const e = step.entry;
              const p = e.payload;
              const isRequest = e.kind === 'proof_request';
              const outstanding = view.outstandingRequests.includes(e.id);
              const proof = isRequest
                ? entries
                    .filter((r) => r.kind === 'proof_submission' && r.payload.requestId === e.id)
                    .at(-1)
                : undefined;
              return (
                <li
                  key={e.id}
                  id={evidenceAnchor('record', e.id)}
                  tabIndex={-1}
                  className="scroll-mt-4 rounded border border-zinc-200 bg-white p-3 text-sm"
                  data-entry-kind={e.kind}
                >
                  <p className="font-semibold">
                    {e.kind.replaceAll('_', ' ')}
                    {isRequest ? ` · ${outstanding ? 'Outstanding' : 'Resolved'}` : ''}
                  </p>
                  <ClaimEventMetadata actor={e.actor} timestamp={e.createdAt} />
                  {typeof p.text === 'string' && (
                    <p className="my-2 whitespace-pre-wrap">{p.text}</p>
                  )}
                  {isRequest && (
                    <>
                      <ClaimEvidenceLinks references={p.citations} targets={targets} />
                      {typeof p.reportId === 'string' && (
                        <ClaimEvidenceLinks
                          references={[p.reportId]}
                          targets={targets}
                          kind="record"
                          label="Adopted from examiner report"
                        />
                      )}
                      {proof && (
                        <ClaimEvidenceLinks
                          references={[proof.id]}
                          targets={targets}
                          kind="record"
                          label="Latest linked proof"
                        />
                      )}
                      {open && outstanding && reviewer && proof && (
                        <div className="mt-2 space-y-1">
                          {!text.trim() && (
                            <p className="text-xs">
                              Add reviewer rationale before resolving this request.
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {!text.trim() && (
                              <button
                                type="button"
                                className="rounded border px-3 text-xs"
                                onClick={() => rationaleField.current?.focus()}
                              >
                                Add rationale
                              </button>
                            )}
                            <button
                              type="button"
                              className="rounded border px-3 text-xs disabled:opacity-50"
                              disabled={busy || !text.trim()}
                              onClick={() =>
                                void act({
                                  action: 'resolve_request',
                                  requestId: e.id,
                                  submissionId: proof.id,
                                  resolution: 'accepted',
                                  text,
                                })
                              }
                            >
                              Resolve request after human review
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {e.kind === 'request_resolution' && (
                    <>
                      <p>Human review outcome: {String(p.resolution ?? 'unavailable')}</p>
                      <ClaimEvidenceLinks
                        references={[p.requestId, p.submissionId]}
                        targets={targets}
                        kind="record"
                        label="Request and reviewed proof"
                      />
                    </>
                  )}
                  {e.kind === 'proof_submission' && (
                    <>
                      <p className="my-1 font-medium">{String(p.filename ?? 'Recorded proof')}</p>
                      <p>
                        Source classification:{' '}
                        {String(p.sourceClassification ?? 'unavailable').replaceAll('_', ' ')}.
                      </p>
                      <p>Declared source: {String(p.declaredSource ?? 'unavailable')}</p>
                      <p>
                        Submitted unverified ·{' '}
                        {e.proofVerificationStatus === 'fixture_consistency_only'
                          ? 'Current verifier confirms fixture consistency only'
                          : 'No current independent authentication'}
                      </p>
                      <p className="font-mono text-xs">
                        Content hash: {String(p.contentHash ?? 'unavailable')}
                      </p>
                      {p.requestId ? (
                        <ClaimEvidenceLinks
                          references={[p.requestId]}
                          targets={targets}
                          kind="record"
                          label="Linked request"
                        />
                      ) : (
                        <p>Additional proof without a request</p>
                      )}
                      <details>
                        <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs underline">
                          Recorded proof bytes (text)
                        </summary>
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs">
                          {String(p.content ?? '')}
                        </pre>
                      </details>
                    </>
                  )}
                  {e.kind === 'examiner_report' && (
                    <ClaimExaminerReport
                      entry={e}
                      targets={targets}
                      mayAdopt={reviewer}
                      open={open}
                      busy={busy}
                      onAdopt={(index) =>
                        void act({
                          action: 'adopt_examiner_request',
                          reportId: e.id,
                          proposalIndex: index,
                        })
                      }
                    />
                  )}
                  {e.kind === 'examiner_failure' && (
                    <p className="mt-2">
                      No assessment was recorded. Human review can continue.
                      {typeof p.reason === 'string' ? ` ${p.reason.replaceAll('_', ' ')}.` : ''}
                    </p>
                  )}
                  <details className="mt-1 text-xs">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center underline">
                      Record ID and hash
                    </summary>
                    <p className="font-mono">
                      {e.id} · {e.recordHash}
                    </p>
                  </details>
                </li>
              );
            })}
          </ol>
          {canParticipate ? (
            <div id="investigation-actions" className="mt-4 scroll-mt-4 space-y-3 border-t pt-3">
              <h3 className="text-sm font-semibold">Investigation actions</h3>
              <label className="block text-sm">
                Investigation message or reviewer rationale
                <textarea
                  ref={rationaleField}
                  aria-label="Investigation message or reviewer rationale"
                  className="block w-full rounded border p-2"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={4000}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !text.trim()}
                  onClick={() => void act({ action: 'message', text })}
                  className="rounded border px-3 py-1 text-sm"
                >
                  Post investigation message
                </button>
                {reviewer ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || !text.trim()}
                      onClick={() => void act({ action: 'request_proof', text })}
                      className="rounded border px-3 py-1 text-sm"
                    >
                      Request additional proof
                    </button>
                    <button
                      type="button"
                      disabled={busy || !text.trim()}
                      onClick={() => void act({ action: 'escalate', text })}
                      className="rounded border px-3 py-1 text-sm"
                    >
                      Escalate investigation
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={busy || pending}
                  onClick={() => void act({ action: 'request_examiner' })}
                  className="rounded border px-3 py-1 text-sm"
                >
                  Request examiner reassessment
                </button>
              </div>
              {pending && reviewer ? (
                <button
                  type="button"
                  disabled={busy || !text.trim()}
                  className="rounded border px-3 py-1 text-sm"
                  onClick={() => {
                    const request = view.entries.find(
                      (e) =>
                        e.kind === 'examiner_request' &&
                        !view.entries.some(
                          (r) =>
                            ['examiner_report', 'examiner_failure'].includes(r.kind) &&
                            r.payload.requestId === e.id,
                        ),
                    );
                    if (request)
                      void act({ action: 'cancel_examiner', requestId: request.id, text });
                  }}
                >
                  Close stalled examiner request
                </button>
              ) : null}
              {pending ? (
                <p role="status" className="text-sm">
                  Examiner assessment requested. Findings will appear here when available; human
                  review may continue.
                </p>
              ) : null}
              {canSubmit && (
                <fieldset className="min-w-0 space-y-2 rounded border p-3">
                  <legend className="text-sm font-semibold">Submit additional proof</legend>
                  <label className="block text-sm">
                    Evidence request
                    <select
                      ref={requestSelect}
                      aria-label="Evidence request"
                      value={requestId}
                      onChange={(e) => setRequestId(e.target.value)}
                      className="mt-1 block w-full min-w-0 max-w-full rounded border p-2"
                    >
                      <option value="">Additional proof (no request)</option>
                      {selectedRequestClosed && (
                        <option value={requestId} disabled>
                          Request closed
                        </option>
                      )}
                      {view.entries
                        .filter((e) => view.outstandingRequests.includes(e.id))
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {String(e.payload.text)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Proof filename
                    <input
                      aria-label="Proof filename"
                      value={filename}
                      onChange={(e) => setFilename(e.target.value)}
                      className="mt-1 block w-full min-w-0 max-w-full rounded border p-2"
                      maxLength={120}
                    />
                  </label>
                  <label className="block text-sm">
                    Declared proof source
                    <input
                      aria-label="Declared proof source"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      className="mt-1 block w-full min-w-0 max-w-full rounded border p-2"
                      maxLength={240}
                    />
                  </label>
                  <label className="block text-sm">
                    Proof content
                    <textarea
                      aria-label="Proof content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="block w-full rounded border p-2 font-mono text-xs"
                      maxLength={16000}
                    />
                  </label>
                  <label className="block text-sm">
                    Attach UTF-8 text or JSON (16 KB maximum)
                    <input
                      aria-label="Attach proof file"
                      className="mt-1 block w-full min-w-0 max-w-full text-sm"
                      type="file"
                      accept="text/plain,application/json,.txt,.json"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 16000) {
                          setContent('');
                          setError('Proof exceeds 16 KB');
                          return;
                        }
                        setFilename(file.name);
                        try {
                          setContent(
                            new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
                              await file.arrayBuffer(),
                            ),
                          );
                          setError('');
                        } catch {
                          setContent('');
                          setError('Only valid UTF-8 text or JSON proof is supported');
                        }
                      }}
                    />
                  </label>
                  {selectedRequestClosed && (
                    <p role="status" className="text-sm">
                      This request closed while you were drafting. Select an open request or choose
                      additional proof to continue.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={busy || selectedRequestClosed || !content || !filename || !source}
                    onClick={() => void submitProof()}
                    className="rounded border px-3 py-1 text-sm"
                  >
                    Submit linked proof
                  </button>
                </fieldset>
              )}
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
