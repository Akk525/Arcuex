'use client';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  ChatCircleText,
  CheckCircle,
  FileArrowUp,
  Gavel,
  Paperclip,
  Robot,
  ShieldCheck,
  Siren,
  WarningCircle,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { TimelineItem, type TimelineTone } from './timeline-item';
import type { getClaimsInvestigation } from '@arcuex/insurance';
import { claimsFetch } from '@/lib/claims/claims-api';
import { ClaimAuditEvent, type ClaimAuditRecord } from './claim-audit-event';
import { ClaimEventMetadata, ClaimEvidenceLinks, openClaimRecord } from './claim-evidence-links';
import { ClaimExaminerReport } from './claim-examiner-report';
import {
  actorLabel,
  evidenceAnchor,
  examinerExecutionLabel,
  groupTimelineDays,
  reviewBlockerMessage,
  type EvidenceTarget,
} from '@/lib/claims/investigation-presentation';
type View = ReturnType<typeof getClaimsInvestigation>;
type Entry = View['entries'][number];

/** What the dossier header needs from the investigation thread. Advisory content only. */
export type ExaminerSummary = {
  pending: boolean;
  latest: {
    summary: string;
    recommendation: string | null;
    execution: string;
    stale: boolean;
    anchor: string;
  } | null;
};
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
  onSummary,
  findings,
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
  onSummary?: (summary: ExaminerSummary) => void;
  /** Findings panel rendered between the open requests and the timeline. */
  findings?: ReactNode;
}) {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(''),
    [content, setContent] = useState(''),
    [filename, setFilename] = useState('proof.txt'),
    [requestId, setRequestId] = useState(''),
    [source, setSource] = useState('policyholder submission');
  const requestSelect = useRef<HTMLInputElement>(null);
  const rationaleField = useRef<HTMLTextAreaElement>(null);
  const hasOpenedInitialAnchor = useRef(false);
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

  const latestAssessment = steps.reduce(
    (index, step, i) => ('entry' in step && step.entry.kind === 'examiner_report' ? i : index),
    -1,
  );
  // Keep the latest advisory visible while a claim is open, even in a busy timeline.
  const earlierCount =
    steps.length > 14
      ? Math.min(steps.length - 10, open && latestAssessment >= 0 ? latestAssessment : steps.length)
      : 0;

  useEffect(() => {
    if (!view || hasOpenedInitialAnchor.current) return;
    hasOpenedInitialAnchor.current = true;
    const anchor = window.location.hash.slice(1);
    if (anchor.startsWith('claim-record-')) {
      const frame = requestAnimationFrame(() => openClaimRecord(anchor));
      return () => cancelAnimationFrame(frame);
    }
  }, [view]);

  // Report advisory state upward for the dossier summary. Never used to enable an action.
  useEffect(() => {
    if (!onSummary) return;
    const report = view?.entries.filter((e) => e.kind === 'examiner_report').at(-1);
    const analysis = report?.payload.analysis as
      { summary?: string; recommendation?: string } | undefined;
    onSummary({
      pending: Boolean(pending),
      latest: report
        ? {
            summary: String(analysis?.summary ?? 'No summary recorded.'),
            recommendation:
              typeof analysis?.recommendation === 'string' ? analysis.recommendation : null,
            execution: examinerExecutionLabel(report.payload.execution, report.payload.provider),
            stale: Boolean(report.stale),
            anchor: evidenceAnchor('record', report.id),
          }
        : null,
    });
  }, [view, pending, onSummary]);

  const proofFor = (requestId: string) =>
    entries
      .filter((r) => r.kind === 'proof_submission' && r.payload.requestId === requestId)
      .at(-1);
  const respondingInline = Boolean(requestId && view?.outstandingRequests.includes(requestId));

  function renderDays(records: typeof steps, label: string) {
    if (!records.length) return null;
    return (
      <ol aria-label={label} className="space-y-5">
        {[...groupTimelineDays(records)].map(([day, items]) => (
          <li key={day} className="min-w-0">
            <h4 className="mb-3 text-xs font-medium text-[var(--ink-muted)]">
              {day ? (
                <>
                  <time dateTime={day}>
                    {new Date(day + 'T00:00:00Z').toLocaleDateString('en', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </time>{' '}
                  · UTC
                </>
              ) : (
                'Date unavailable'
              )}
            </h4>
            <ol
              className="timeline-rail"
              aria-label={day ? `Events on ${day} UTC` : 'Events without a date'}
            >
              {items.map(renderStep)}
            </ol>
          </li>
        ))}
      </ol>
    );
  }

  function entryPresentation(
    e: Entry,
    outstanding: boolean,
  ): { title: string; tone: TimelineTone; icon: ReactNode } {
    const who = actorLabel(e.actor);
    switch (e.kind) {
      case 'proof_request':
        return {
          title: `Evidence request · ${outstanding ? 'Outstanding' : 'Resolved'}`,
          tone: outstanding ? 'request' : 'neutral',
          icon: <FileArrowUp size={14} weight="bold" />,
        };
      case 'request_resolution':
        return {
          title: 'Request resolved after human review',
          tone: 'human',
          icon: <Gavel size={14} weight="bold" />,
        };
      case 'proof_submission':
        return {
          title: `${who} submitted proof`,
          tone: 'proof',
          icon: <Paperclip size={14} weight="bold" />,
        };
      case 'examiner_report':
        return {
          title: 'Examiner assessment',
          tone: 'ai',
          icon: <Robot size={14} weight="bold" />,
        };
      case 'examiner_failure':
        return {
          title: 'Examiner assessment not recorded',
          tone: 'warn',
          icon: <WarningCircle size={14} weight="bold" />,
        };
      case 'examiner_request':
        return {
          title: `${who} requested an examiner assessment`,
          tone: 'neutral',
          icon: <Robot size={14} weight="regular" />,
        };
      case 'examiner_started':
        return {
          title: 'Examiner assessment started',
          tone: 'neutral',
          icon: <Robot size={14} weight="regular" />,
        };
      case 'escalation':
        return {
          title: `${who} escalated the investigation`,
          tone: 'warn',
          icon: <Siren size={14} weight="bold" />,
        };
      case 'message':
        return {
          title: `${who} posted a message`,
          tone: 'neutral',
          icon: <ChatCircleText size={14} weight="bold" />,
        };
      default:
        return {
          title: String(e.kind).replaceAll('_', ' '),
          tone: 'neutral',
          icon: <ChatCircleText size={14} weight="bold" />,
        };
    }
  }

  function renderStep(step: (typeof steps)[number]) {
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
        <TimelineItem
          key={v.id}
          icon={<ShieldCheck size={14} weight="bold" />}
          tone="verify"
          kind="verification"
        >
          <p className="text-sm font-semibold text-[var(--ink)]">
            Deterministic verification recorded
          </p>
          <ClaimEventMetadata actor={v.actor} timestamp={v.createdAt} />
          <p className="mt-1 text-[0.8125rem] text-[var(--ink-secondary)]">
            {v.executionStatus} · Evidence {v.evidenceSufficiency}
          </p>
          <ClaimEvidenceLinks
            references={[v.id]}
            targets={targets}
            kind="verification"
            label="Verification record"
          />
        </TimelineItem>
      );
    }
    const e = step.entry;
    const p = e.payload;
    const isRequest = e.kind === 'proof_request';
    const outstanding = openRequests.some((request) => request.id === e.id);
    const proof = isRequest ? proofFor(e.id) : undefined;
    const look = entryPresentation(e, outstanding);
    return (
      <TimelineItem
        key={e.id}
        id={evidenceAnchor('record', e.id)}
        kind={e.kind}
        tone={look.tone}
        icon={look.icon}
        emphasis={
          e.kind === 'examiner_report' ? 'ai' : isRequest && outstanding ? 'request' : undefined
        }
      >
        <p className="text-sm font-semibold text-[var(--ink)]">{look.title}</p>
        <ClaimEventMetadata actor={e.actor} timestamp={e.createdAt} />
        {typeof p.text === 'string' && (
          <p className="mt-2 text-[0.8125rem] leading-relaxed whitespace-pre-wrap text-[var(--ink)]">
            {p.text}
          </p>
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
          </>
        )}
        {e.kind === 'request_resolution' && (
          <>
            <p className="mt-1 text-[0.8125rem] text-[var(--ink-secondary)]">
              Outcome: {String(p.resolution ?? 'unavailable')}
            </p>
            <ClaimEvidenceLinks
              references={[p.requestId, p.submissionId]}
              targets={targets}
              kind="record"
              label="Request and reviewed proof"
            />
          </>
        )}
        {e.kind === 'proof_submission' && (
          <div className="mt-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[0.8125rem]">
            <p className="flex items-center gap-2 font-medium text-[var(--ink)]">
              <Paperclip size={13} aria-hidden="true" className="text-[var(--ink-muted)]" />
              {String(p.filename ?? 'Recorded proof')}
            </p>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
              <dt className="text-[var(--ink-muted)]">Declared source</dt>
              <dd className="text-[var(--ink-secondary)]">
                {String(p.declaredSource ?? 'unavailable')}
              </dd>
              <dt className="text-[var(--ink-muted)]">Classification</dt>
              <dd className="text-[var(--ink-secondary)]">
                {String(p.sourceClassification ?? 'unavailable').replaceAll('_', ' ')}
              </dd>
              <dt className="text-[var(--ink-muted)]">Verification</dt>
              <dd className="text-[var(--ink-secondary)]">
                Submitted unverified ·{' '}
                {e.proofVerificationStatus === 'fixture_consistency_only'
                  ? 'current verifier confirms fixture consistency only'
                  : 'no current independent authentication'}
              </dd>
              <dt className="text-[var(--ink-muted)]">Content hash</dt>
              <dd className="font-mono break-all text-[var(--ink-secondary)]">
                {String(p.contentHash ?? 'unavailable')}
              </dd>
            </dl>
            {p.requestId ? (
              <ClaimEvidenceLinks
                references={[p.requestId]}
                targets={targets}
                kind="record"
                label="Linked request"
              />
            ) : (
              <p className="mt-2 text-xs text-[var(--ink-muted)]">
                Additional proof without a request
              </p>
            )}
            <details className="record-details">
              <summary>Recorded proof bytes (text)</summary>
              <pre>{String(p.content ?? '')}</pre>
            </details>
          </div>
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
          <p className="mt-1 text-[0.8125rem] text-[var(--ink-secondary)]">
            No assessment was recorded. Human review can continue.
            {typeof p.reason === 'string' ? ` ${p.reason.replaceAll('_', ' ')}.` : ''}
          </p>
        )}
        <details className="record-details">
          <summary>Record ID and hash</summary>
          <pre>
            {e.id}
            {'\n'}
            {e.recordHash}
          </pre>
        </details>
      </TimelineItem>
    );
  }

  function respondTo(id: string) {
    setRequestId(id);
    requestAnimationFrame(() => requestSelect.current?.focus());
  }

  function renderProofForm(linked: boolean) {
    return (
      <div className="min-w-0 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="field-label">Proof filename</span>
            <input
              ref={linked ? requestSelect : undefined}
              aria-label="Proof filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="field-control mt-1.5 w-full"
              maxLength={120}
            />
          </label>
          <label className="block min-w-0">
            <span className="field-label">Declared proof source</span>
            <input
              aria-label="Declared proof source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="field-control mt-1.5 w-full"
              maxLength={240}
            />
          </label>
        </div>
        <label className="block">
          <span className="field-label">Proof content</span>
          <textarea
            aria-label="Proof content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="field-control mt-1.5 block w-full font-mono text-xs"
            maxLength={16000}
          />
        </label>
        <label className="block">
          <span className="field-label">Or attach a file</span>
          <span className="field-hint mt-0.5 block">
            UTF-8 text or JSON, 16 KB maximum. The exact bytes and their hash are recorded.
          </span>
          <input
            aria-label="Attach proof file"
            className="mt-1.5 block w-full min-w-0 max-w-full text-[0.8125rem] text-[var(--ink-secondary)] file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-[var(--line-strong)] file:bg-[var(--surface)] file:px-3 file:py-1.5 file:text-[0.8125rem] file:font-medium file:text-[var(--ink)]"
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
        {error ? (
          <p role="alert" className="text-[0.8125rem] font-medium text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="active:scale-100"
            disabled={busy || selectedRequestClosed || !content || !filename || !source}
            onClick={() => void submitProof()}
          >
            Submit linked proof
          </Button>
          {linked ? (
            <Button size="sm" variant="ghost" onClick={() => setRequestId('')}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!view)
    return (
      <section className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
        <p role="status" className="text-sm text-[var(--ink-muted)]">
          {error ? 'Investigation unavailable.' : 'Loading investigation…'}
        </p>
        {error ? (
          <>
            <p role="alert" className="mt-1 text-[0.8125rem] text-[var(--danger)]">
              {error}
            </p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => void load()}>
              Retry investigation
            </Button>
          </>
        ) : null}
        {error && audit.length > 0 && (
          <ol className="timeline-rail mt-4" aria-label="Available case history">
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
      </section>
    );

  return (
    <>
      {(open || openRequests.length > 0) && (
        <section
          id="outstanding-requests"
          aria-labelledby="outstanding-requests-title"
          className={`scroll-mt-24 overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--surface)] ${
            openRequests.length ? 'border-[#ecd9b0]' : 'border-[var(--line)]'
          }`}
        >
          <header
            className={`flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3.5 ${
              openRequests.length
                ? 'border-[#f1e4c6] bg-[color-mix(in_srgb,var(--warn-soft)_60%,var(--surface))]'
                : 'border-[var(--line)]'
            }`}
          >
            <h2 id="outstanding-requests-title" className="text-sm font-semibold text-[var(--ink)]">
              Outstanding evidence requests ({openRequests.length})
            </h2>
            <span className="text-xs text-[var(--ink-muted)]">
              Requests are written by a human reviewer
            </span>
          </header>
          {!openRequests.length ? (
            <p className="px-5 py-4 text-[0.8125rem] text-[var(--ink-muted)]">
              No open evidence requests.{' '}
              {canSubmit ? 'You can still add proof below at any time.' : ''}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {openRequests.map((request) => {
                const proof = proofFor(request.id);
                const inline = requestId === request.id;
                return (
                  <li key={request.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-semibold ${proof ? 'text-[var(--pending)]' : 'text-[var(--warn)]'}`}
                      >
                        {proof
                          ? 'Response received · awaiting human review'
                          : 'Awaiting linked proof'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-[var(--ink)]">
                      {String(request.payload.text ?? '')}
                    </p>
                    <ClaimEventMetadata actor={request.actor} timestamp={request.createdAt} />
                    {proof && (
                      <ClaimEvidenceLinks
                        references={[proof.id]}
                        targets={targets}
                        kind="record"
                        label="Review linked response"
                      />
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {canSubmit && !inline && (
                        <Button
                          size="sm"
                          variant={proof ? 'secondary' : 'primary'}
                          onClick={() => respondTo(request.id)}
                        >
                          <FileArrowUp size={15} aria-hidden="true" />
                          Respond to this request
                        </Button>
                      )}
                      {open && reviewer && proof && (
                        <Button
                          size="sm"
                          className="active:scale-100"
                          disabled={busy || !text.trim()}
                          onClick={() =>
                            void act({
                              action: 'resolve_request',
                              requestId: request.id,
                              submissionId: proof.id,
                              resolution: 'accepted',
                              text,
                            })
                          }
                        >
                          <CheckCircle size={15} aria-hidden="true" />
                          Resolve request after human review
                        </Button>
                      )}
                      <a
                        href={`#${evidenceAnchor('record', request.id)}`}
                        onClick={() => openClaimRecord(evidenceAnchor('record', request.id))}
                        className="inline-flex min-h-8 items-center px-1 text-[0.8125rem] font-medium text-[var(--accent)] hover:underline"
                      >
                        View in timeline
                      </a>
                    </div>
                    {open && reviewer && proof && !text.trim() ? (
                      <p className="mt-2 text-xs text-[var(--ink-muted)]">
                        Write your rationale in{' '}
                        <button
                          type="button"
                          className="font-medium text-[var(--accent)] hover:underline"
                          onClick={() => rationaleField.current?.focus()}
                        >
                          the reviewer note
                        </button>{' '}
                        before resolving. The original request and proof stay in the record.
                      </p>
                    ) : null}
                    {inline && canSubmit ? (
                      <div className="mt-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] p-4">
                        <p className="mb-3 text-[0.8125rem] font-semibold text-[var(--ink)]">
                          Proof for this request
                        </p>
                        {renderProofForm(true)}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {findings}

      {view.reviewBlockers.length > 0 && (
        <section
          aria-label="Before a decision"
          className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4"
        >
          <p className="text-sm font-semibold text-[var(--ink)]">Before a decision</p>
          <ul className="mt-2 space-y-1.5 text-[0.8125rem] text-[var(--ink-secondary)]">
            {view.reviewBlockers.map((code) => (
              <li key={code} className="flex gap-2">
                <WarningCircle
                  size={15}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-[var(--warn)]"
                />
                {reviewBlockerMessage(code)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        aria-labelledby="investigation-timeline"
        className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]"
      >
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-5 py-3.5">
          <div>
            <h2 id="investigation-timeline" className="text-sm font-semibold text-[var(--ink)]">
              Investigation timeline
            </h2>
            <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-muted)]">
              Every request, proof, assessment and decision, oldest first. Records are append-only.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <ArrowsClockwise size={14} aria-hidden="true" />
            Refresh investigation
          </Button>
        </header>

        {view.chronology ? (
          <div
            className="border-b border-[var(--line)] bg-[var(--paper)] px-5 py-3 text-[0.8125rem]"
            aria-label="Server-checked coverage chronology"
            role="group"
          >
            <p className="font-semibold text-[var(--ink)]">
              Server-checked chronology · {chronologyLabel[view.chronology.relation]}
            </p>
            <p className="mt-0.5 text-[var(--ink-secondary)]">
              Incident{' '}
              <span className="font-mono text-xs">
                {timestamp(view.chronology.incident.epochMs)}
              </span>
              , policy window{' '}
              <span className="font-mono text-xs">
                {timestamp(view.chronology.startsAt.epochMs)}
              </span>{' '}
              to{' '}
              <span className="font-mono text-xs">{timestamp(view.chronology.endsAt.epochMs)}</span>{' '}
              (inclusive).
            </p>
            {view.chronology.issue ? (
              <p className="mt-0.5 text-[var(--warn)]">
                Review required · {view.chronology.issue.replaceAll('_', ' ')}
              </p>
            ) : null}
            {view.chronology.waitingPeriodSatisfied === false ? (
              <p className="mt-0.5 text-[var(--warn)]">
                The recorded observation did not satisfy the policy waiting period.
              </p>
            ) : null}
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              Timestamp comparison only. Applicability, exclusions, causation and loss need separate
              evidence and review.
            </p>
            <details className="record-details">
              <summary>Recorded timestamp sources</summary>
              <pre>
                {`Policy ${view.chronology.policySource} · ${view.chronology.startsAt.raw ?? '—'} to ${view.chronology.endsAt.raw ?? '—'}\nIncident ${view.chronology.incident.source} · ${view.chronology.incident.raw ?? '—'}`}
              </pre>
            </details>
          </div>
        ) : null}
        {view.authorityReview?.length ? (
          <p className="border-b border-[var(--line)] px-5 py-3 text-[0.8125rem] font-medium text-[var(--warn)]">
            Claimant or delegation authority is unresolved. Human review is required.
          </p>
        ) : null}

        <div aria-label="Investigation chronology" className="space-y-4 px-5 py-5">
          {!steps.length && (
            <p className="text-[0.8125rem] text-[var(--ink-muted)]">
              No investigation activity recorded yet.
            </p>
          )}
          {earlierCount > 0 && (
            <details
              className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] px-3"
              data-investigation-history
            >
              <summary className="min-h-10 cursor-pointer py-2.5 text-[0.8125rem] font-medium text-[var(--ink-secondary)]">
                Earlier activity ({earlierCount} events)
              </summary>
              <div className="pb-3">
                {renderDays(steps.slice(0, earlierCount), 'Earlier investigation events')}
              </div>
            </details>
          )}
          {renderDays(steps.slice(earlierCount), 'Investigation thread')}
        </div>
      </section>

      {canParticipate ? (
        <section
          id="investigation-actions"
          aria-labelledby="investigation-actions-title"
          className="scroll-mt-24 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]"
        >
          <header className="border-b border-[var(--line)] px-5 py-3.5">
            <h2
              id="investigation-actions-title"
              className="text-sm font-semibold text-[var(--ink)]"
            >
              Add to the investigation
            </h2>
            <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-muted)]">
              {reviewer
                ? 'Your note is the rationale for requests, escalations and resolutions.'
                : 'Messages and proof are added to the record with your identity and time.'}
            </p>
          </header>
          <div className="space-y-4 px-5 py-4">
            <label className="block">
              <span className="field-label">{reviewer ? 'Reviewer note' : 'Message'}</span>
              <textarea
                ref={rationaleField}
                aria-label="Investigation message or reviewer rationale"
                className="field-control mt-1.5 block w-full"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={4000}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !text.trim()}
                onClick={() => void act({ action: 'message', text })}
              >
                Post investigation message
              </Button>
              {reviewer ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !text.trim()}
                    onClick={() => void act({ action: 'request_proof', text })}
                  >
                    Request additional proof
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !text.trim()}
                    onClick={() => void act({ action: 'escalate', text })}
                  >
                    Escalate investigation
                  </Button>
                </>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || pending}
                onClick={() => void act({ action: 'request_examiner' })}
              >
                <Robot size={15} aria-hidden="true" />
                Request examiner reassessment
              </Button>
              {pending && reviewer ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || !text.trim()}
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
                </Button>
              ) : null}
            </div>
            {error && !canSubmit ? (
              <p role="alert" className="text-[0.8125rem] font-medium text-[var(--danger)]">
                {error}
              </p>
            ) : null}
            {pending ? (
              <p role="status" className="text-[0.8125rem] text-[var(--pending)]">
                Examiner assessment requested. Findings will appear in the timeline when available;
                human review may continue.
              </p>
            ) : null}
            {canSubmit && (
              <fieldset className="min-w-0 border-t border-[var(--line)] pt-4">
                <legend className="sr-only">Submit additional proof</legend>
                <p className="mb-3 text-[0.8125rem] font-semibold text-[var(--ink)]">
                  Add proof without a request
                </p>
                {respondingInline ? (
                  <p className="text-[0.8125rem] text-[var(--ink-muted)]">
                    You are responding to an evidence request above.
                  </p>
                ) : (
                  <>
                    {selectedRequestClosed && (
                      <p role="status" className="mb-3 text-[0.8125rem] text-[var(--warn)]">
                        This request closed while you were drafting.{' '}
                        <button
                          type="button"
                          className="font-medium underline"
                          onClick={() => setRequestId('')}
                        >
                          Continue as additional proof
                        </button>
                      </p>
                    )}
                    {renderProofForm(false)}
                  </>
                )}
              </fieldset>
            )}
          </div>
        </section>
      ) : (
        <p className="text-[0.8125rem] text-[var(--ink-muted)]">
          {open
            ? 'This session has read-only access to the investigation.'
            : 'Investigation closed. The timeline remains available for review.'}
        </p>
      )}
    </>
  );
}
