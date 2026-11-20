'use client';

import type { ReactNode } from 'react';
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  ArrowsClockwise,
  CaretDown,
  Check,
  FileText,
  Prohibit,
  WarningCircle,
} from '@phosphor-icons/react';
import { Button, ButtonLink } from '@/components/ui/button';
import { AuthRequired } from '@/components/ui/auth-required';
import { Callout } from '@/components/ui/callout';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/status-badge';
import { TruthBadge } from '@/components/ui/truth-badge';
import { displayDate, isBindHash, usdc } from '@/lib/procurement/presentation';
import { saveBindAttempt } from '@/lib/procurement/bind-attempt';
import { shortId } from '@/lib/procurement/checkout-presentation';
import { policyTimeline, type TimelineState } from '@/lib/procurement/policy-timeline';
import { usePolicyRecords, type PolicyView } from './use-policy-records';

const EXPLORER = 'https://explorer.testnet.arc.io/tx/';

/** One-sentence answer to "what is the state of this policy?". Bound is never presented as in force. */
function stateSentence(v: PolicyView) {
  const t = v.policy.terms;
  switch (v.phase) {
    case 'effective':
      return 'Bind verified on Arc Testnet and the coverage window is open.';
    case 'scheduled':
      return `Bind verified on Arc Testnet. Coverage begins ${displayDate(t.effectiveAt)}; claims open then.`;
    case 'reconciling':
      return 'A bind transaction is recorded but not yet reconciled. No coverage is confirmed and claims are disabled.';
    case 'submitted':
      return 'A bind was submitted from this browser. Its receipt has not been checked yet.';
    case 'uncertain':
      return 'The wallet did not return a bind hash. Check your wallet activity before paying again.';
    case 'prepared':
      return 'Terms are accepted but the premium has not been paid. There is no coverage yet.';
    case 'expired':
      return 'This policy is no longer active.';
    case 'fixture':
      return 'Synthetic fixture policy. It has no Arc Testnet confirmation.';
    default:
      return 'Confirmation status could not be verified. Treat this policy as unconfirmed.';
  }
}

export function PolicyRecord({ id }: { id: string }) {
  const r = usePolicyRecords(id);
  const v = r.views?.[0];
  const ready = r.wallet.uiStatus === 'ready';

  if (!ready)
    return (
      <>
        <PageHeader title={`Policy ${shortId(id)}`} eyebrow="Protect" />
        <AuthRequired
          title="Connect a wallet on Arc Testnet"
          description="Policy records are visible to the policyholder, payer and insured agent signer. Connect one of those wallets."
        />
      </>
    );

  if (!v)
    return (
      <>
        <PageHeader
          title={`Policy ${shortId(id)}`}
          eyebrow="Protect"
          description="Load the record to see its terms, confirmation status and claim eligibility."
        />
        {r.error ? (
          <Callout kind="danger" title="Policy could not be loaded">
            <p role="alert">{r.error}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              disabled={r.busy}
              onClick={() => void r.run(r.load)}
            >
              Try again
            </Button>
          </Callout>
        ) : r.busy ? (
          <div role="status" aria-label="Loading policy" className="space-y-3">
            <div className="h-24 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-inset)]" />
            <div className="h-64 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-inset)]" />
          </div>
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-5 py-6">
            <p className="text-sm text-[var(--ink-secondary)]">
              Loading may ask your wallet to sign in. Arcuex then checks this policy against Arc
              Testnet.
            </p>
            <Button className="mt-3" onClick={() => void r.run(r.load)}>
              <ArrowsClockwise size={16} aria-hidden="true" />
              Load policy
            </Button>
          </div>
        )}
      </>
    );

  const p = v.policy;
  const t = p.terms;
  const lifecycle = v.lifecycle;
  const localHash = v.attempt?.state === 'submitted' ? v.attempt.hash : null;
  const timeline = policyTimeline({
    policy: p,
    lifecycle,
    phase: v.phase,
    approvals: r.approvals,
    localBindHash: localHash,
    bindUncertain: v.attempt?.state === 'uncertain',
    nowSeconds: r.nowSeconds,
  });
  const bindRef = lifecycle?.confirmation?.transactionHash ?? p.bindTx;
  const showBindRef =
    !r.fixtureMode &&
    lifecycle?.source?.mode === 'arc-testnet' &&
    Boolean(lifecycle.confirmation || p.bindTx);

  const primary = v.canClaim ? (
    <ButtonLink href={`/claims/new?policyId=${t.policyId}`}>
      <FileText size={16} aria-hidden="true" />
      {t.synthetic ? 'Submit a synthetic claim' : 'Open an independent claim'}
    </ButtonLink>
  ) : v.canResume ? (
    <ButtonLink href={`/coverage?policyId=${t.policyId}`}>
      <ArrowCounterClockwise size={16} aria-hidden="true" />
      {v.attempt ? 'Check submitted purchase' : 'Resume accepted purchase'}
    </ButtonLink>
  ) : null;

  return (
    <>
      <PageHeader
        appearance="dark"
        serif
        eyebrow={<span className="font-mono text-xs">{shortId(t.policyId)}</span>}
        title={v.productName}
        badges={
          <>
            {t.synthetic ? (
              <TruthBadge label="Synthetic cover" tone="synthetic" />
            ) : (
              <TruthBadge label="Independent-evidence pilot" tone="pending" />
            )}
            <StatusBadge label={v.label} tone={v.tone} />
          </>
        }
        action={
          <>
            <Button variant="secondary" disabled={r.busy} onClick={() => void r.run(r.load)}>
              <ArrowsClockwise
                size={16}
                aria-hidden="true"
                className={r.busy ? 'motion-safe:animate-spin' : ''}
              />
              Refresh
            </Button>
            {primary}
          </>
        }
      />

      <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
        {r.error && (
          <Callout kind="danger" title="Refresh failed">
            <p role="alert">{r.error}</p>
          </Callout>
        )}
        {r.chainError && (
          <Callout kind="warn" title="Chain reconciliation">
            <p role="status">{r.chainError}</p>
          </Callout>
        )}

        <section
          aria-label="Coverage summary"
          className="arc-panel overflow-hidden"
        >
          <p
            className="border-b border-[var(--line)] px-5 py-3.5 text-sm leading-relaxed text-[var(--ink)]"
            aria-live="polite"
          >
            {stateSentence(v)}
          </p>
          <dl className="grid grid-cols-2 gap-px bg-[var(--line)] lg:grid-cols-4">
            <SummaryCell label="Coverage limit" value={usdc(t.limitMicros)} large />
            <SummaryCell label="Deductible" value={usdc(t.deductibleMicros)} large />
            <SummaryCell label="Premium" value={usdc(t.premiumMicros)} large />
            <SummaryCell
              label="Coverage window"
              value={displayDate(t.effectiveAt)}
              detail={`to ${displayDate(t.expiresAt)}`}
            />
          </dl>
          {r.live && (
            <p className="border-t border-[var(--line)] bg-[var(--paper)] px-5 py-2.5 text-xs tabular-nums text-[var(--ink-muted)]">
              {r.fixtureMode ? 'Synthetic snapshot check' : 'Live contract check'}:{' '}
              {r.live.matches ? 'terms match' : r.live.bound ? 'mismatch' : 'not bound'}. Reserved{' '}
              {usdc(r.live.reservedMicros)}, paid out {usdc(r.live.paidOutMicros)}. Checked{' '}
              {r.live.checkedAt}.
            </p>
          )}
        </section>

        <Section title="Binding and coverage timeline">
          <ol className="policy-timeline relative">
            {timeline.map((e, i) => (
              <li
                key={e.id}
                className="policy-timeline-step relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0"
              >
                {i < timeline.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`policy-timeline-connector absolute top-6 bottom-0 left-[0.6875rem] w-px ${e.state === 'done' ? 'bg-[var(--accent-signal)]' : 'bg-[var(--line-strong)]'}`}
                  />
                )}
                <TimelineDot state={e.state} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <p
                      className={`text-sm font-semibold ${e.state === 'upcoming' || e.state === 'skipped' ? 'text-[var(--ink-muted)]' : 'text-[var(--ink)]'}`}
                    >
                      {e.title}
                      <span className="sr-only">, {timelineStateText[e.state]}</span>
                    </p>
                    {e.at ? (
                      <p className="text-xs tabular-nums text-[var(--ink-muted)]">
                        {displayDate(e.at)}
                      </p>
                    ) : null}
                  </div>
                  {e.detail ? (
                    <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-muted)]">
                      {e.detail}
                    </p>
                  ) : null}
                  {e.hash && isBindHash(e.hash) ? (
                    <a
                      href={`${EXPLORER}${e.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex max-w-full items-center gap-1.5 font-mono text-xs text-[var(--accent)] underline-offset-4 hover:underline"
                    >
                      <span className="truncate">{e.hash}</span>
                      <ArrowSquareOut size={12} className="shrink-0" aria-hidden="true" />
                      <span className="sr-only">(opens Arc Testnet explorer)</span>
                    </a>
                  ) : e.hash ? (
                    <p className="mt-1 break-all font-mono text-xs text-[var(--ink-muted)]">
                      {e.hash}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {lifecycle?.notice ? (
            <p className="mt-4 border-t border-[var(--line)] pt-3 text-[0.8125rem] text-[var(--ink-secondary)]">
              {lifecycle.notice}
            </p>
          ) : null}
        </Section>

        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="min-w-0 space-y-6">
            <Section title="Terms">
              <div className="space-y-5">
                <div>
                  <h3 className="text-[0.8125rem] font-semibold text-[var(--ink)]">
                    Covered event
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--ink-secondary)]">
                    {t.insuredEvent}
                  </p>
                </div>
                <div>
                  <h3 className="text-[0.8125rem] font-semibold text-[var(--ink)]">Not covered</h3>
                  <ul className="mt-1.5 space-y-1.5 text-sm text-[var(--ink-secondary)]">
                    {t.exclusions.map((item) => (
                      <li key={item} className="flex gap-2">
                        <Prohibit
                          size={15}
                          className="mt-0.5 shrink-0 text-[var(--ink-faint)]"
                          aria-hidden="true"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                {v.limitations ? (
                  <div>
                    <h3 className="text-[0.8125rem] font-semibold text-[var(--ink)]">
                      Limitations
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ink-secondary)]">
                      {v.limitations}
                    </p>
                  </div>
                ) : null}
              </div>
            </Section>

            <Section title="Transaction references">
              <dl className="divide-y divide-[var(--line)] text-sm">
                {r.approvals.map((a) => (
                  <RefRow key={a.hash} label="Premium approval" hash={a.hash} />
                ))}
                {showBindRef && bindRef ? (
                  <RefRow
                    label={
                      lifecycle?.confirmation
                        ? 'Indexed bind receipt'
                        : 'Recorded bind · reconciliation pending'
                    }
                    hash={bindRef}
                  />
                ) : null}
                {lifecycle?.confirmation ? (
                  <div className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-[var(--ink-muted)]">Block</dt>
                    <dd className="font-mono text-xs leading-5 text-[var(--ink)]">
                      {lifecycle.confirmation.blockNumber} · log {lifecycle.confirmation.logIndex}
                    </dd>
                  </div>
                ) : null}
                {timeline.filter((event) => event.id.startsWith('settlement-')).map((event) => (
                  <div key={event.id} className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-[var(--ink-muted)]">{event.title}</dt>
                    <dd className="text-[var(--ink)]">
                      {event.detail}.{' '}
                      {event.hash ? (
                        <a className="text-[var(--accent)] underline underline-offset-4" href={`https://explorer.testnet.arc.io/tx/${event.hash}`} target="_blank" rel="noreferrer">
                          View confirmed receipt
                        </a>
                      ) : (
                        <span className="text-[var(--ink-muted)]">No verified receipt link</span>
                      )}
                    </dd>
                  </div>
                ))}
                {r.approvals.length === 0 &&
                !(showBindRef && bindRef) &&
                !lifecycle?.settlements.length ? (
                  <p className="py-1 text-[var(--ink-muted)]">
                    No transactions recorded for this policy yet.
                  </p>
                ) : null}
              </dl>
            </Section>

            <details className="group rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-[var(--ink)]">
                Technical details
                <CaretDown
                  size={14}
                  className="transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="space-y-4 border-t border-[var(--line)] px-5 py-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <Tech label="Terms digest" value={p.digest} />
                  <Tech
                    label="Onchain policy ID"
                    value={lifecycle?.onchainPolicyId ?? 'Not linked'}
                  />
                  <Tech label="Pool" value={lifecycle?.pool ?? 'Unavailable'} />
                  <Tech
                    label="Reconciliation"
                    value={
                      lifecycle?.completeness?.toLowerCase().replace(/_/g, ' ') ?? 'Not checked'
                    }
                    plain
                  />
                  {lifecycle?.source ? (
                    <Tech
                      label="Source"
                      value={`${lifecycle.source.mode} · ${lifecycle.source.id}${lifecycle.source.checkpoint ? ` · checkpoint ${lifecycle.source.checkpoint.sequence}, valid until ${new Date(lifecycle.source.checkpoint.validUntil * 1000).toISOString()}` : ''}`}
                    />
                  ) : null}
                  <Tech
                    label="Checked"
                    value={lifecycle?.checkedAt ? displayDate(lifecycle.checkedAt) : 'Never'}
                    plain
                  />
                </dl>
                <pre className="max-h-96 overflow-auto rounded-[var(--radius)] bg-[var(--paper)] p-4 font-mono text-xs leading-relaxed text-[var(--ink-secondary)]">
                  {JSON.stringify(p, null, 2)}
                </pre>
              </div>
            </details>
          </div>

          {/* On small screens the sidebar dissolves into the grid so Claims sits above the timeline. */}
          <div className="min-w-0 max-lg:contents lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)] lg:space-y-6">
            <div className="max-lg:order-first">
              <Section title="Claims">
                <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">
                  {v.canClaim
                    ? r.fixtureMode
                      ? 'This synthetic policy is available for a rehearsal claim.'
                      : 'This policy is in force and its confirmation is current. You can begin a claim.'
                    : v.phase === 'scheduled'
                      ? `Claim intake opens when coverage starts on ${displayDate(t.effectiveAt)}.`
                      : 'Claim intake is unavailable for this policy and session.'}
                </p>
                {v.canClaim ? (
                  <ButtonLink href={`/claims/new?policyId=${t.policyId}`} className="mt-3 w-full">
                    {t.synthetic ? 'Submit a synthetic claim' : 'Open an independent claim'}
                  </ButtonLink>
                ) : null}
                <p className="mt-3 text-xs text-[var(--ink-muted)]">
                  Eligibility needs a reconciled bind, an open window and a confirmation checked in
                  the last five minutes.
                </p>
              </Section>
            </div>

            <Section title="Parties">
              <dl className="space-y-3 text-sm">
                <Party
                  label="Insured agent"
                  value={v.agent?.label ?? t.agentId}
                  detail={t.exposure.position}
                  detailMono
                />
                <Party label="Policyholder" value={t.owner} mono />
                <Party
                  label="Payer"
                  value={p.payer}
                  mono
                  detail={
                    p.delegationId
                      ? 'Paid under a delegation'
                      : p.payer === t.owner
                        ? 'The policyholder'
                        : undefined
                  }
                />
                <Party label="Beneficiary" value={t.beneficiary} mono />
                <Party
                  label="Delegation"
                  value={p.delegationId ?? 'None'}
                  mono={Boolean(p.delegationId)}
                />
              </dl>
            </Section>

            {!r.fixtureMode && p.state === 'prepared' && (
              <Section title="Recover a bind receipt">
                <p className="text-[0.8125rem] leading-relaxed text-[var(--ink-muted)]">
                  If you paid but this page does not show it, paste the bind transaction hash from
                  your wallet. Verification is read-only. A late or mismatched bind stays
                  ineligible.
                </p>
                <div className="procurement mt-3 space-y-2">
                  <label>
                    Bind transaction hash
                    <input
                      value={r.hash}
                      onChange={(e) => r.setHash(e.target.value)}
                      placeholder="0x…"
                      spellCheck={false}
                      className="font-mono text-xs"
                    />
                  </label>
                  <Button
                    variant="secondary"
                    className="w-full active:scale-100"
                    disabled={r.busy || !isBindHash(r.hash.trim())}
                    onClick={() =>
                      void r.run(async () => {
                        const receipt = r.hash.trim();
                        if (!isBindHash(receipt)) return;
                        await r.api('confirm', { policyId: t.policyId, hash: receipt });
                        saveBindAttempt(t.policyId, { state: 'submitted', hash: receipt });
                        await r.load();
                      })
                    }
                  >
                    Verify receipt and recover
                  </Button>
                </div>
              </Section>
            )}

            {r.pending.length > 0 && (
              <Callout kind="warn" title="Reconciliation incomplete">
                {r.pending.map((rec) => (
                  <p key={rec.onchainPolicyId} className="break-all text-xs">
                    <span className="font-mono">{rec.onchainPolicyId}</span> ·{' '}
                    {rec.completeness.toLowerCase().replace(/_/g, ' ')} · claims disabled
                  </p>
                ))}
              </Callout>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const timelineStateText: Record<TimelineState, string> = {
  done: 'complete',
  current: 'in progress',
  upcoming: 'not yet',
  attention: 'needs attention',
  skipped: 'not applicable',
};

function TimelineDot({ state }: { state: TimelineState }) {
  const cls =
    state === 'done'
      ? 'bg-[var(--accent-signal)] text-white'
      : state === 'current'
        ? 'bg-[var(--surface)] ring-2 ring-[var(--pending)]'
        : state === 'attention'
          ? 'bg-[var(--warn)] text-white'
          : 'bg-[var(--surface)] ring-1 ring-[var(--line-strong)]';
  return (
    <span
      className={`relative mt-px grid h-6 w-6 place-items-center rounded-full ${cls}`}
      aria-hidden="true"
    >
      {state === 'done' ? (
        <Check size={12} weight="bold" />
      ) : state === 'attention' ? (
        <WarningCircle size={14} weight="bold" />
      ) : state === 'current' ? (
        <span className="h-2 w-2 rounded-full bg-[var(--pending)]" />
      ) : null}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]">
      <h2 className="border-b border-[var(--line)] px-5 py-3 text-sm font-semibold text-[var(--ink)]">
        {title}
      </h2>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function SummaryCell({
  label,
  value,
  detail,
  large,
}: {
  label: string;
  value: string;
  detail?: string;
  large?: boolean;
}) {
  return (
    <div className="min-w-0 bg-[var(--surface)] px-5 py-4">
      <dt className="text-xs text-[var(--ink-muted)]">{label}</dt>
      <dd
        className={`mt-1 tabular-nums text-[var(--ink)] ${large ? 'font-display text-[1.375rem] leading-tight font-semibold tracking-[-0.02em]' : 'text-sm font-medium'}`}
      >
        {value}
      </dd>
      {detail ? (
        <dd className="mt-0.5 text-xs tabular-nums text-[var(--ink-muted)]">{detail}</dd>
      ) : null}
    </div>
  );
}

function Party({
  label,
  value,
  detail,
  mono,
  detailMono,
}: {
  label: string;
  value: string;
  detail?: string;
  mono?: boolean;
  detailMono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--ink-muted)]">{label}</dt>
      <dd
        className={`mt-0.5 text-[var(--ink)] ${mono ? 'break-all font-mono text-xs leading-5' : 'font-medium'}`}
      >
        {value}
      </dd>
      {detail ? (
        <dd className={`truncate text-xs text-[var(--ink-muted)] ${detailMono ? 'font-mono' : ''}`}>
          {detail}
        </dd>
      ) : null}
    </div>
  );
}

function RefRow({ label, hash }: { label: string; hash: string }) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[var(--ink-muted)]">{label}</dt>
      <dd className="min-w-0">
        <a
          className="inline-flex max-w-full items-center gap-1.5 font-mono text-xs leading-5 text-[var(--accent)] underline-offset-4 hover:underline"
          href={`${EXPLORER}${hash}`}
          target="_blank"
          rel="noreferrer"
        >
          <span className="break-all">{hash}</span>
          <ArrowSquareOut size={12} className="shrink-0" aria-hidden="true" />
          <span className="sr-only">(opens Arc Testnet explorer)</span>
        </a>
      </dd>
    </div>
  );
}

function Tech({ label, value, plain }: { label: string; value: string; plain?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--ink-muted)]">{label}</dt>
      <dd
        className={`mt-0.5 break-all text-[var(--ink)] ${plain ? 'text-sm' : 'font-mono text-xs leading-5'}`}
      >
        {value}
      </dd>
    </div>
  );
}
