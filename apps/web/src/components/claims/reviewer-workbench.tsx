'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowsClockwise, CaretRight, Tray, Stack, ShieldCheck } from '@phosphor-icons/react';
import { CaseStatusBadge } from '@/components/claims/case-status-badge';
import { TruthBadge } from '@/components/ui/truth-badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { StatContent } from '@/components/ui/stat-content';
import { EmptyState } from '@/components/ui/empty-state';
import { claimsFetch } from '@/lib/claims/claims-api';
import {
  claimsNetworkFailure,
  parseClaimsCaseListPayload,
  readClaimsClientResponse,
  type ClaimsCaseListRow,
} from '@/lib/claims/claims-client-response';
import { queueSections, type QueueSection } from '@/lib/claims/investigation-presentation';
import { claimTitle, freshnessLabel, type Tone } from '@/lib/claims/claim-presentation';
import { useClaimsSession } from '@/hooks/use-claims-session';
import { ClaimsAuthPanel } from './claims-auth-panel';
import { ClaimsPanel } from './claims-panel';
import { Panel } from '@/components/panel';
import { canUseInsurerWorkspace } from '@/lib/app-nav';

type View = 'review' | 'investigations' | 'settlements' | 'overview';

type QueueView = Exclude<View, 'overview'>;

function dossierHref(id: string, view: QueueView) {
  const href = `/claims/${encodeURIComponent(id)}`;
  if (view === 'investigations') return `${href}?queue=${view}#claim-investigation`;
  if (view === 'settlements') return `${href}?queue=${view}#claim-financial-outcome`;
  return href;
}


/** Display order: work a human can do now first, handoffs last. */
const ORDER: QueueSection[] = [
  'awaiting_human',
  'ready',
  'verification_attention',
  'awaiting_evidence',
  'settlement',
];

const sectionHelp: Record<QueueSection, string> = {
  awaiting_human:
    'A claimant responded or the intake needs a person. Read the record, then resolve or escalate.',
  ready:
    'Current verification supports review. Decisions still need your contractual confirmation and rationale.',
  verification_attention: 'Decisions stay blocked until the current evidence is verified again.',
  awaiting_evidence: 'Evidence requests are open with no linked response. Nothing to decide yet.',
  settlement:
    'A human decision is recorded. Payment needs a separate authority and a reconciled receipt.',
};

function decisionState(row: ClaimsCaseListRow, fixture: boolean): { label: string; tone: Tone } {
  const section = row.triage!.section;
  if (section === 'ready') return { label: 'Approve or deny', tone: 'live' };
  if (section === 'awaiting_human')
    return (row.context?.respondedRequests ?? 0) > 0
      ? { label: 'Resolve request first', tone: 'warn' }
      : { label: 'Review intake', tone: 'warn' };
  if (section === 'awaiting_evidence') return { label: 'Blocked · open request', tone: 'neutral' };
  if (section === 'verification_attention') return { label: 'Blocked · reverify', tone: 'warn' };
  if (fixture) return { label: 'No payment action', tone: 'neutral' };
  if (row.status === 'SETTLEMENT_PENDING') return { label: 'Awaiting receipt', tone: 'pending' };
  return { label: 'Authority handoff', tone: 'pending' };
}

const toneText: Record<Tone, string> = {
  neutral: 'text-[var(--ink-muted)]',
  ok: 'text-[var(--ok)]',
  warn: 'text-[var(--warn)]',
  error: 'text-[var(--danger)]',
  pending: 'text-[var(--pending)]',
  live: 'text-[var(--live)]',
  synthetic: 'text-[var(--synthetic)]',
};

export function ReviewerWorkbench({ view = 'review' }: { view?: View }) {
  const { session, loading: sessionLoading } = useClaimsSession();
  const ops = canUseInsurerWorkspace(session?.role);
  const [showLedger, setShowLedger] = useState(false);
  const [cases, setCases] = useState<ClaimsCaseListRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await claimsFetch('reviewer', '/api/claims/cases?view=workbench');
      const result = await readClaimsClientResponse(res, (payload) => {
        const rows = parseClaimsCaseListPayload(payload);
        return rows?.every((row) => row.triage) ? rows : null;
      });
      if (!result.ok) {
        setCases([]);
        setError(
          result.kind === 'unauthorized' || result.kind === 'forbidden'
            ? 'Sign in with a reviewer or settlement authority session to open the queue.'
            : result.message,
        );
        return;
      }
      setCases(result.data);
      setNow(Date.now());
    } catch (error) {
      setCases([]);
      setError(claimsNetworkFailure(error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (ops) void load();
    else setLoading(false);
  }, [ops, sessionLoading, load]);

  const groups = useMemo(() => {
    const sections = view === 'settlements' ? ['settlement' as const]
      : view === 'investigations' ? ORDER.filter((section) => section !== 'settlement')
      : ORDER;
    return sections
      .map((section) => ({ section, rows: cases.filter((row) => row.triage?.section === section) }))
      .filter(({ rows }) => rows.length > 0);
  }, [cases, view]);

  if (sessionLoading)
    return (
      <p role="status" className="text-sm text-[var(--ink-muted)]">
        Checking session…
      </p>
    );

  if (!ops || !session) return <ClaimsAuthPanel />;

  if (view === 'overview') {
    const next = groups.find(({ section }) => section === 'awaiting_human' || section === 'ready')?.rows[0];
    return (
      <Panel
        title="Claims requiring attention"
        action={next ? <ButtonLink href={dossierHref(next.id, 'review')}>Review next case</ButtonLink> : null}
      >
        {loading ? <p role="status">Loading claims…</p> : error ? (
          <div className="space-y-2">
            <p role="alert">{error}</p>
            <Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--ink-muted)]">
              {next ? claimTitle(next) : 'No claims are waiting for a human decision.'}
            </p>
            <ButtonLink href="/claims/review" size="sm" variant="secondary">Open claims review</ButtonLink>
          </div>
        )}
      </Panel>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-[var(--ink-muted)]">
          <TruthBadge label={`Signed in · ${session.role}`} tone="human" />
          Decisions are recorded under this session. Examiner advice never authorizes an action.
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          <ArrowsClockwise
            size={15}
            aria-hidden="true"
            className={loading ? 'motion-safe:animate-spin' : ''}
          />
          {error ? 'Retry review queue' : 'Refresh review queue'}
        </Button>
      </div>

      {view !== 'investigations' ? <aside className="arc-panel flex items-start gap-3 p-4" aria-label="Financial gate">
        <span className="arc-stat-icon"><ShieldCheck size={17} aria-hidden="true" /></span>
        <div>
          <p className="font-semibold text-[var(--ink)]">Financial gate & reimbursement</p>
          <p className="text-sm text-[var(--ink-muted)]">A human decision records coverage. Reimbursement requires a separate authority and a verified Arc settlement receipt.</p>
        </div>
      </aside> : null}

      {loading && cases.length === 0 && (
        <div role="status" className="space-y-2">
          <span className="sr-only">Loading review queue…</span>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-[var(--radius)] bg-[var(--surface-inset)]"
            />
          ))}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-lg)] border border-[#f3c4bf] bg-[var(--danger-soft)] px-5 py-4"
        >
          <p className="text-sm font-semibold text-[var(--danger)]">
            The review queue could not be loaded
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-secondary)]">{error}</p>
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <EmptyState
          icon={<Tray size={18} weight="duotone" />}
          title={view === 'settlements' ? 'No settlements awaiting action' : 'Nothing to review'}
          description={view === 'settlements'
            ? 'Approved claims appear here when they need a settlement handoff or receipt.'
            : 'Claims appear here when they need evidence, verification or a human decision.'}
        />
      )}

      {!error && groups.length > 0 && (
        <>
          <nav
            aria-label="Review queue sections"
            className="grid grid-cols-2 gap-2 xl:grid-cols-5"
          >
            {groups.map(({ section, rows }) => (
              <a
                key={section}
                href={`#queue-${section}`}
                className="arc-stat"
              >
                <StatContent icon={<Stack size={16} />} label={queueSections[section]} count={rows.length} />
              </a>
            ))}
          </nav>

          {groups.map(({ section, rows }) => (
            <section
              key={section}
              id={`queue-${section}`}
              aria-labelledby={`queue-${section}-title`}
              className="scroll-mt-24 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]"
            >
              <header className="border-b border-[var(--line)] px-5 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2
                    id={`queue-${section}-title`}
                    className="text-sm font-semibold text-[var(--ink)]"
                  >
                    {queueSections[section]}
                  </h2>
                  <span className="text-xs tabular-nums text-[var(--ink-muted)]">
                    {rows.length}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-muted)]">
                  {sectionHelp[section]}
                </p>
              </header>
              <div
                aria-hidden="true"
                className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.9fr)_minmax(0,1fr)_minmax(0,1fr)_1rem] gap-4 border-b border-[var(--line)] bg-[var(--paper)] px-5 py-2 text-xs font-medium text-[var(--ink-muted)] lg:grid"
              >
                <span>Claim</span>
                <span>Why it is here</span>
                <span>Evidence and verification</span>
                <span>Decision</span>
                <span />
              </div>
              <ul className="divide-y divide-[var(--line)]">
                {rows.map((row) => (
                  <QueueRow key={row.id} row={row} now={now} view={view} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      {view === 'review' ? (
        <details onToggle={(event) => setShowLedger(event.currentTarget.open)}>
          <summary className="cursor-pointer py-2 text-sm font-semibold text-[var(--ink-muted)]">Legacy synthetic claims ledger</summary>
          {showLedger ? <ClaimsPanel /> : null}
        </details>
      ) : null}
    </div>
  );
}

function QueueRow({ row, now, view }: { row: ClaimsCaseListRow; now: number; view: QueueView }) {
  const fixture = row.syntheticDemo;
  const decision = decisionState(row, fixture);
  const fresh = freshnessLabel(row.verification, now);
  const c = row.context;
  const unanswered = c ? c.openRequests - c.respondedRequests : 0;
  return (
    <li className="group relative grid gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-[#fafcfc] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.9fr)_minmax(0,1fr)_minmax(0,1fr)_1rem] lg:items-center">
      <div className="min-w-0">
        <Link
          href={dossierHref(row.id, view)}
          aria-label={`Open claim ${row.id}`}
          className="font-semibold text-[var(--ink)] after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-[var(--radius)] focus-visible:after:ring-2 focus-visible:after:ring-[var(--accent-ring)] focus-visible:after:ring-inset"
        >
          {claimTitle(row)}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
          <CaseStatusBadge status={row.status} confirmedReceipt={row.confirmedSettlementReceipt} paymentFinality={row.paymentFinality} />
          {fixture ? <TruthBadge label="Synthetic" tone="synthetic" /> : null}
          <span className="font-mono">{row.id.slice(0, 8)}</span>
        </div>
      </div>
      <p className="text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
        {row.triage?.reason}
      </p>
      <div className="space-y-0.5 text-xs">
        <p
          className={
            unanswered > 0 ? 'font-medium text-[var(--warn)]' : 'text-[var(--ink-secondary)]'
          }
        >
          {c
            ? c.openRequests === 0
              ? 'No open requests'
              : `${c.openRequests} open · ${c.respondedRequests} answered`
            : 'Requests unavailable'}
        </p>
        <p className={toneText[fresh.tone]} title={row.verification?.at ?? undefined}>
          {fresh.label}
        </p>
      </div>
      <p className={`text-[0.8125rem] font-semibold ${toneText[decision.tone]}`}>
        <span className="font-normal text-[var(--ink-muted)] lg:hidden">Decision: </span>
        {decision.label}
      </p>
      <CaretRight
        size={15}
        weight="bold"
        aria-hidden="true"
        className="hidden text-[var(--ink-faint)] transition-transform group-hover:translate-x-0.5 lg:block"
      />
    </li>
  );
}
