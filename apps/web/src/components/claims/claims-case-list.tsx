'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  CaretRight,
  ChatCircleText,
  FileMagnifyingGlass,
  MagnifyingGlass,
  Info,
  ShieldCheck,
  Stack,
  Coins,
} from '@phosphor-icons/react';
import { CaseStatusBadge } from '@/components/claims/case-status-badge';
import { StatusBadge } from '@/components/status-badge';
import { TruthBadge } from '@/components/ui/truth-badge';
import { claimsFetch } from '@/lib/claims/claims-api';
import {
  claimsNetworkFailure,
  parseClaimsCaseListPayload,
  readClaimsClientResponse,
  type ClaimsCaseListRow,
} from '@/lib/claims/claims-client-response';
import { claimantStep, claimTitle, type ClaimCategory } from '@/lib/claims/claim-presentation';
import { hasArcReceiptHash } from '@/lib/claims/settlement-presentation';
import { AuthRequired } from '@/components/ui/auth-required';
import { Button, ButtonLink } from '@/components/ui/button';
import { StatContent } from '@/components/ui/stat-content';
import { EmptyState } from '@/components/ui/empty-state';
import { formatClaimTime } from './claim-evidence-links';

type Filter = 'all' | ClaimCategory;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'action', label: 'Needs your response' },
  { id: 'in_progress', label: 'In review' },
  { id: 'decided', label: 'Decided' },
  { id: 'closed', label: 'Closed' },
];

const dayFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const day = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? dayFormat.format(t) : iso;
};

function matches(row: ClaimsCaseListRow, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [
    claimTitle(row),
    row.id,
    row.policyId,
    row.context?.product ?? '',
    row.context?.insured.position ?? '',
    row.context?.incident?.ref ?? '',
  ].some((field) => field.toLowerCase().includes(q));
}

export function ClaimsCaseList({ ops = false }: { ops?: boolean }) {
  const [cases, setCases] = useState<ClaimsCaseListRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const readVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++readVersion.current;
    setError(null);
    setLoading(true);
    setAuthRequired(false);
    try {
      const res = await claimsFetch('any', '/api/claims/cases');
      const result = await readClaimsClientResponse(res, parseClaimsCaseListPayload);
      if (version !== readVersion.current) return;
      if (!result.ok) {
        setCases(null);
        if (result.kind === 'unauthorized' || result.kind === 'forbidden') setAuthRequired(true);
        setError(result.message);
        return;
      }
      setCases(result.data);
    } catch (e) {
      if (version !== readVersion.current) return;
      setCases(null);
      setError(claimsNetworkFailure(e).message);
    } finally {
      if (version === readVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      readVersion.current++;
    };
  }, [refresh]);

  const rows = useMemo(
    () => (cases ?? []).map((row) => ({ row, step: claimantStep(row) })),
    [cases],
  );
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, action: 0, in_progress: 0, decided: 0, closed: 0 };
    for (const { step } of rows) {
      c.all++;
      c[step.category]++;
    }
    return c;
  }, [rows]);
  const attention = rows.filter(({ step }) => step.category === 'action');
  const visible = rows.filter(
    ({ row, step }) => (filter === 'all' || step.category === filter) && matches(row, query),
  );

  if (authRequired)
    return <AuthRequired description="Sign in with your wallet session to load your claims." />;

  if (error)
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[#f3c4bf] bg-[var(--danger-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-semibold text-[var(--danger)]">Claims could not be loaded</p>
          <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-secondary)]">{error}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void refresh()}>
          Retry cases
        </Button>
      </div>
    );

  if (!cases)
    return (
      <div role="status" className="space-y-2" aria-label="Loading cases">
        <span className="sr-only">Loading cases…</span>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-[var(--radius)] bg-[var(--surface-inset)]"
          />
        ))}
      </div>
    );

  if (cases.length === 0)
    return (
      <EmptyState
        icon={<FileMagnifyingGlass size={18} weight="duotone" />}
        title="No claims yet"
        description="A claim starts from an in-force policy. Choose the policy that covered the agent and describe what happened."
        action={
          <>
            <ButtonLink href="/claims/new">File a claim</ButtonLink>
            <ButtonLink href="/policies" variant="secondary">
              View policies
            </ButtonLink>
          </>
        }
      />
    );

  return (
    <div className="space-y-5">
      <div className={`grid gap-4 ${!ops && attention.length > 0 ? 'xl:grid-cols-2' : ''}`}>
      {!ops && attention.length > 0 && (
        <section
          aria-labelledby="claims-attention"
          className="overflow-hidden rounded-[var(--radius-lg)] border border-[#ecd9b0] bg-[var(--surface)]"
        >
          <header className="flex items-center justify-between gap-3 border-b border-[#f1e4c6] bg-[color-mix(in_srgb,var(--warn-soft)_60%,var(--surface))] px-5 py-3">
            <h2 id="claims-attention" className="text-sm font-semibold text-[var(--ink)]">
              Reviewers are waiting on you
            </h2>
            <span className="text-xs tabular-nums text-[var(--ink-muted)]">
              {attention.length} {attention.length === 1 ? 'claim' : 'claims'}
            </span>
          </header>
          <ul className="divide-y divide-[var(--line)]">
            {attention.map(({ row, step }) => (
              <li key={row.id}>
                <Link
                  href={`/claims/${row.id}#outstanding-requests`}
                  className="work-row group focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] bg-[var(--warn-soft)] text-[var(--warn)]">
                    <ChatCircleText size={18} weight="duotone" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--ink)]">
                      {step.label} on {claimTitle(row)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--ink-muted)]">
                      {row.context?.product ?? 'Claim'} · filed{' '}
                      {day(row.createdAt ?? row.updatedAt)}
                    </span>
                  </span>
                  <span className="hidden text-[0.8125rem] font-semibold text-[var(--accent)] sm:inline">
                    Respond
                  </span>
                  <CaretRight
                    size={14}
                    weight="bold"
                    aria-hidden="true"
                    className="text-[var(--ink-faint)] transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="reimbursement-guide" className="arc-panel p-4 sm:p-5">
        <h2 id="reimbursement-guide" className="flex items-center gap-2 font-semibold text-[var(--ink)]">
          <Info size={20} className="text-[var(--accent-signal)]" aria-hidden="true" />
          When reimbursement is confirmed
        </h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">Approved coverage becomes a reimbursement after a verified Arc settlement receipt records the funds transfer.</p>
        <ol className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-[var(--ink-secondary)]">
          {[
            { label: 'Human approval', icon: ShieldCheck },
            { label: 'Settlement receipt', icon: Stack },
            { label: 'Funds reimbursed', icon: Coins },
          ].map(({ label, icon: Icon }) => (
            <li key={label} className="flex min-w-0 flex-col items-center gap-1">
              <span className="arc-stat-icon"><Icon size={16} aria-hidden="true" /></span>
              {label}
            </li>
          ))}
        </ol>
      </section>
      </div>

      <section aria-labelledby="claims-list" className="space-y-3">
        <h2 id="claims-list" className="sr-only">
          All claims
        </h2>
        <div role="group" aria-label="Filter claims" className="grid grid-cols-2 gap-2 xl:grid-cols-5">
          {FILTERS.filter((f) => f.id === 'all' || counts[f.id] > 0 || f.id === filter).map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className="arc-stat">
              <StatContent icon={<FileMagnifyingGlass size={16} />} label={f.label} count={counts[f.id]} />
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <div className="flex items-center gap-2">
            <label className="relative block min-w-0 flex-1 lg:w-72 lg:flex-none">
              <span className="sr-only">Search claims</span>
              <MagnifyingGlass
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-faint)]"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Agent, incident, policy or claim ID"
                className="field-control h-9 w-full !pl-9 text-[0.8125rem]"
              />
            </label>
            <Button
              variant="secondary"
              size="sm"
              disabled={loading}
              onClick={() => void refresh()}
              aria-label="Refresh claims"
            >
              <ArrowsClockwise
                size={15}
                aria-hidden="true"
                className={loading ? 'motion-safe:animate-spin' : ''}
              />
              <span className="max-sm:sr-only">Refresh</span>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_1rem] gap-4 border-b border-[var(--line)] bg-[var(--paper)] px-5 py-2.5 text-xs font-medium text-[var(--ink-muted)] md:grid"
          >
            <span>Claim</span>
            <span>Incident</span>
            <span>Evidence</span>
            <span>Status</span>
            <span />
          </div>
          {visible.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-[var(--ink)]">No claims match</p>
              <p className="mt-1 text-[0.8125rem] text-[var(--ink-muted)]">
                Try another search or status.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {visible.map(({ row, step }) => (
                <ClaimRow key={row.id} row={row} step={step} />
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-[var(--ink-muted)]">
          Approval is a coverage decision, not a payment. A claim shows as paid only after a
          matching settlement receipt is reconciled.
        </p>
      </section>
    </div>
  );
}

function evidenceSummary(row: ClaimsCaseListRow) {
  const c = row.context;
  if (!c) return { text: 'Not available', tone: 'muted' as const };
  const unanswered = c.openRequests - c.respondedRequests;
  if (unanswered > 0)
    return {
      text: `${unanswered} open ${unanswered === 1 ? 'request' : 'requests'}`,
      tone: 'warn' as const,
    };
  if (c.respondedRequests > 0)
    return {
      text: `${c.respondedRequests} ${c.respondedRequests === 1 ? 'response' : 'responses'} in review`,
      tone: 'pending' as const,
    };
  return { text: 'No open requests', tone: 'muted' as const };
}

function ClaimRow({
  row,
  step,
}: {
  row: ClaimsCaseListRow;
  step: ReturnType<typeof claimantStep>;
}) {
  const evidence = evidenceSummary(row);
  const incident = row.context?.incident;
  return (
    <li className="group relative grid gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-[#fafcfc] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_1rem] md:items-center">
      <div className="min-w-0">
        <Link
          href={`/claims/${row.id}`}
          className="font-semibold text-[var(--ink)] after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-[var(--radius)] focus-visible:after:ring-2 focus-visible:after:ring-[var(--accent-ring)] focus-visible:after:ring-inset"
        >
          {claimTitle(row)}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
          <span className="truncate">
            {row.context?.product ?? 'Policy ' + row.policyId.slice(0, 8)}
          </span>
          <span className="font-mono">{row.id.slice(0, 8)}</span>
          {row.syntheticDemo ? <TruthBadge label="Synthetic" tone="synthetic" /> : null}
        </p>
      </div>
      <div className="min-w-0 text-sm">
        {incident ? (
          <>
            <p
              className="truncate font-mono text-xs text-[var(--ink-secondary)]"
              title={incident.ref}
            >
              {incident.ref}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-[var(--ink-muted)]">
              Observed {formatClaimTime(incident.observedAt)}
            </p>
          </>
        ) : (
          <p className="text-xs text-[var(--ink-muted)]">No incident recorded</p>
        )}
      </div>
      <p
        className={`text-[0.8125rem] ${
          evidence.tone === 'warn'
            ? 'font-medium text-[var(--warn)]'
            : evidence.tone === 'pending'
              ? 'text-[var(--pending)]'
              : 'text-[var(--ink-muted)]'
        }`}
      >
        <span className="text-[var(--ink-muted)] md:hidden">Evidence: </span>
        {evidence.text}
      </p>
      <div className="flex min-w-0 flex-col items-start gap-1">
        {step.category === 'action' ? (
          <StatusBadge label={step.label} tone="warn" />
        ) : (
          <CaseStatusBadge status={row.status} confirmedReceipt={row.confirmedSettlementReceipt} paymentFinality={row.paymentFinality} />
        )}
        <span className="text-xs text-[var(--ink-muted)]">
          {row.status === 'APPROVED' ? 'Not reimbursed · ' : ''}Updated {day(row.updatedAt)}
          {row.payable.usdc ? (
            <>
              {' · '}
              {row.syntheticDemo
                ? 'illustrative'
                : hasArcReceiptHash(row.confirmedSettlementReceipt)
                  ? 'paid'
                  : 'proposed'}{' '}
              <span className="tabular-nums">{row.payable.usdc} USDC</span>
            </>
          ) : null}
        </span>
      </div>
      <CaretRight
        size={15}
        weight="bold"
        aria-hidden="true"
        className="hidden text-[var(--ink-faint)] transition-transform group-hover:translate-x-0.5 md:block"
      />
    </li>
  );
}
