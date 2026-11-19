'use client';
import { useCallback, useEffect, useState } from 'react';
import type { getClaimsInvestigation } from '@arcuex/insurance';
import { claimsFetch } from '@/lib/claims/claims-api';
import { Panel } from '@/components/panel';
type View = ReturnType<typeof getClaimsInvestigation>;
export function ClaimsInvestigation({
  caseId,
  role,
  status,
  verificationRevision,
  onChange,
}: {
  caseId: string;
  role?: string;
  status: string;
  verificationRevision: number;
  onChange: () => Promise<void>;
}) {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(''),
    [content, setContent] = useState(''),
    [filename, setFilename] = useState('proof.txt'),
    [requestId, setRequestId] = useState(''),
    [source, setSource] = useState('policyholder submission');
  const reviewer = role === 'reviewer' || role === 'authority';
  const open = ['COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'].includes(status);
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
      setText('');
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
  return (
    <Panel title="Investigation · agent, examiner and human">
      <p className="text-sm text-zinc-600">
        Proof submissions remain unverified until assessed by the persisted verifier. AI findings
        are advisory and cannot approve coverage or authorize payment.
      </p>
      {error ? (
        <p role="alert" className="my-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {!view ? (
        <div>
          <p className="text-sm">
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
        </div>
      ) : (
        <>
          <p className="my-2 text-sm">
            <strong>Review blockers:</strong>{' '}
            {view.reviewBlockers.length
              ? view.reviewBlockers.join(' · ')
              : 'No investigation blocker; contractual review and financial restrictions still apply.'}
          </p>
          {view.authorityReview?.length ? (
            <p className="my-2 text-sm font-medium">
              Claimant or delegation authority is unresolved. Human review is required.
            </p>
          ) : null}
          <p className="text-sm">
            Outstanding evidence requests: <strong>{view.outstandingRequests.length}</strong> ·{' '}
            {open ? 'Investigation open' : 'Investigation resolved; records are read-only'}
          </p>
          <button
            type="button"
            className="my-2 rounded border px-3 py-1 text-xs"
            onClick={() => void load()}
          >
            Refresh investigation
          </button>
          <ol className="space-y-3" aria-label="Investigation thread">
            {view.entries.map((e) => {
              const p = e.payload,
                analysis = p.analysis as
                  | {
                      summary: string;
                      verifiedFindings?: string[];
                      claimantAssertions?: string[];
                      gaps: string[];
                      proposedRequests: Array<string | { question: string; citations: string[] }>;
                      recommendation: string;
                      citations: string[];
                    }
                  | undefined;
              const isRequest = e.kind === 'proof_request',
                outstanding = view.outstandingRequests.includes(e.id);
              const proof = view.entries
                .filter((r) => r.kind === 'proof_submission' && r.payload.requestId === e.id)
                .at(-1);
              return (
                <li
                  key={e.id}
                  className="rounded border bg-white p-3 text-sm"
                  data-entry-kind={e.kind}
                >
                  <p className="font-semibold">
                    {e.kind.replaceAll('_', ' ')}
                    {isRequest ? ` · ${outstanding ? 'Outstanding' : 'Resolved'}` : ''}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {e.actor} · {e.createdAt}
                  </p>
                  <p className="break-all font-mono text-xs">
                    {e.id} · {e.recordHash}
                  </p>
                  {p.text ? <p className="my-2 whitespace-pre-wrap">{String(p.text)}</p> : null}
                  {isRequest && Array.isArray(p.citations) ? (
                    <p className="break-all text-xs">Source references: {p.citations.join(', ')}</p>
                  ) : null}
                  {e.kind === 'proof_submission' ? (
                    <>
                      <p>
                        {String(p.filename)} · {String(p.sourceClassification)} · Submitted
                        unverified; current finding: {e.proofVerificationStatus}
                      </p>
                      <p className="break-all font-mono text-xs">
                        Content hash: {String(p.contentHash)}
                      </p>
                      <p className="text-xs">
                        Request: {String(p.requestId ?? 'unsolicited')} · Declared source:{' '}
                        {String(p.declaredSource)}
                      </p>
                      <details>
                        <summary>Recorded proof bytes (text)</summary>
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs">
                          {String(p.content)}
                        </pre>
                      </details>
                    </>
                  ) : null}
                  {analysis ? (
                    <>
                      <p className="my-2 font-semibold">
                        {p.execution === 'test_double'
                          ? 'TEST DOUBLE · no live AI inference'
                          : 'LIVE OPENAI · advisory only'}{' '}
                        · {String(p.model)}
                        {e.stale
                          ? open
                            ? ' · STALE DOSSIER — reassess'
                            : ' · Historical assessment before resolution'
                          : ''}
                      </p>
                      <p>{analysis.summary}</p>
                      <p>Recommendation: {analysis.recommendation}</p>
                      {[
                        {
                          label: 'Examiner summary of verified findings',
                          items: analysis.verifiedFindings,
                        },
                        { label: 'Claimant assertions', items: analysis.claimantAssertions },
                      ].map(({ label, items }) =>
                        items?.length ? (
                          <div key={label} className="mt-2">
                            <p className="font-medium">{label}</p>
                            <ul className="list-inside list-disc">
                              {items.map((item, index) => (
                                <li key={index}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null,
                      )}
                      <ul className="list-inside list-disc">
                        {analysis.gaps.map((gap, i) => (
                          <li key={i}>{gap}</li>
                        ))}
                      </ul>
                      {analysis.proposedRequests.map((proposal, i) => (
                        <div key={i} className="my-2">
                          <p>
                            Proposed proof:{' '}
                            {typeof proposal === 'string' ? proposal : proposal.question}
                          </p>
                          {typeof proposal !== 'string' ? (
                            <p className="break-all text-xs">
                              Source references: {proposal.citations.join(', ')}
                            </p>
                          ) : null}
                          {reviewer && open && typeof proposal !== 'string' ? (
                            <button
                              type="button"
                              disabled={busy || e.stale}
                              onClick={() =>
                                void act({
                                  action: 'adopt_examiner_request',
                                  reportId: e.id,
                                  proposalIndex: i,
                                })
                              }
                              className="rounded border px-2 py-1 text-xs"
                            >
                              Adopt evidence request {i + 1}
                            </button>
                          ) : null}
                        </div>
                      ))}
                      <p className="break-all text-xs">
                        Prompt: {String(p.promptVersion)} · Dossier: {String(p.dossierDigest)} ·
                        Response: {String(p.responseId)} · Citations:{' '}
                        {analysis.citations.join(', ')}
                      </p>
                      <p className="text-xs">
                        No independent evidence or payment authority established.
                      </p>
                    </>
                  ) : null}
                  {isRequest && outstanding && open ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => setRequestId(e.id)}
                      >
                        Respond to this request
                      </button>
                      {reviewer && proof ? (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
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
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {open ? (
            <div className="mt-4 space-y-3 border-t pt-3">
              <label className="block text-sm">
                Investigation message or reviewer rationale
                <textarea
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
              <fieldset className="space-y-2 rounded border p-3">
                <legend className="text-sm font-semibold">Submit additional proof</legend>
                <label className="block text-sm">
                  Evidence request
                  <select
                    aria-label="Evidence request"
                    value={requestId}
                    onChange={(e) => setRequestId(e.target.value)}
                    className="ml-2 rounded border"
                  >
                    <option value="">Additional proof (no request)</option>
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
                    className="ml-2 rounded border"
                    maxLength={120}
                  />
                </label>
                <label className="block text-sm">
                  Declared proof source
                  <input
                    aria-label="Declared proof source"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="ml-2 rounded border"
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
                <button
                  type="button"
                  disabled={busy || !content || !filename || !source}
                  onClick={() => void submitProof()}
                  className="rounded border px-3 py-1 text-sm"
                >
                  Submit linked proof
                </button>
              </fieldset>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
