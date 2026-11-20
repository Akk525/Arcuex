'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { formatUnits } from 'viem';
import { PROCUREMENT_OFFERINGS } from '@arcuex/domain/procurement';
import type {
  ProcurementAgent,
  ProcurementDelegationView,
  UnderwritingAction,
  UnderwritingView,
} from '@arcuex/domain';
import { useAccount } from 'wagmi';
import { actorLabel } from '@/lib/claims/investigation-presentation';
import { useClaimsSession } from '@/hooks/use-claims-session';
import { useProcurement } from '@/hooks/use-procurement';
import { ClaimsAuthPanel } from '@/components/claims/claims-auth-panel';
import { Button, ButtonLink } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';

const PRODUCT = PROCUREMENT_OFFERINGS[0];

const surface =
  'min-w-0 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5';
const muted = 'text-sm text-[var(--ink-muted)]';
const labels: Record<UnderwritingView['status'], string> = {
  needs_evidence: 'Needs evidence',
  needs_review: 'Needs insurer review',
  ready: 'Ready to quote',
  declined: 'Declined',
};
type Action = UnderwritingAction extends infer A
  ? A extends UnderwritingAction
    ? Omit<A, 'idempotencyKey'>
    : never
  : never;
type List = { applications: UnderwritingView[]; paymentEnabled: boolean };
type Detail = { application: UnderwritingView; paymentEnabled: boolean };
type AccountRecords = { agents: ProcurementAgent[]; delegations: ProcurementDelegationView[] };
const usdc = (micros: string) => formatUnits(BigInt(micros), 6) + ' USDC';

function offerLabel(view: UnderwritingView) {
  if (view.policyState === 'confirmed') return 'Bind receipt recorded';
  if (view.policyState === 'prepared') return 'Offer accepted';
  if (view.quote) return 'Offer available';
  return labels[view.status];
}

export function UnderwritingWorkspace({ insurer = false }: { insurer?: boolean }) {
  const session = useClaimsSession();
  const { address } = useAccount();
  if (insurer) {
    if (session.loading) return <p role="status">Checking insurer session…</p>;
    if (session.error) return <p role="alert">{session.error}</p>;
    if (session.session?.role !== 'reviewer' && session.session?.role !== 'authority') {
      return <ClaimsAuthPanel />;
    }
  }
  return (
    <Workspace
      key={insurer ? session.session?.role : (address ?? 'disconnected')}
      insurer={insurer}
    />
  );
}

async function insurerRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Underwriting request failed');
  return result as T;
}

function Workspace({ insurer }: { insurer: boolean }) {
  const { api, run, busy, error, wallet } = useProcurement();
  const [list, setList] = useState<List | null>(null);
  const [queueError, setQueueError] = useState('');
  const [records, setRecords] = useState<AccountRecords | null>(null);
  const [selected, setSelected] = useState('');
  const [agentId, setAgentId] = useState('');
  const [text, setText] = useState('');
  const [requestId, setRequestId] = useState('');
  const request = insurer ? insurerRequest : api;
  const view =
    list?.applications.find((entry) => entry.application.id === selected) ?? list?.applications[0];
  const actor = wallet.address?.toLowerCase();
  const applicant = view?.application.applicant === actor;
  const agents =
    records?.agents.filter((agent) => agent.exposure.protocol === PRODUCT.protocol) ?? [];
  const selectedAgent = agents.find((agent) => agent.id === agentId) ?? agents[0];
  const grants =
    records?.delegations.filter(
      (grant) => grant.agentId === selectedAgent?.id && grant.validity === 'active',
    ) ?? [];
  const open =
    view?.entries.filter(
      (entry) =>
        entry.kind === 'request' &&
        !view.entries.some(
          (response) => response.kind === 'response' && response.requestId === entry.id,
        ),
    ) ?? [];
  const frozen = !!view?.quote || view?.entries.some((entry) => entry.kind === 'decision');
  const quote = view?.quote;

  useEffect(() => {
    if (!insurer) return;
    const controller = new AbortController();
    void insurerRequest<List>('/api/underwriting')
      .then((result) => {
        if (!controller.signal.aborted) setList(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setQueueError(error instanceof Error ? error.message : 'Underwriting queue unavailable');
      });
    return () => controller.abort();
  }, [insurer]);

  function update(detail: Detail) {
    setSelected(detail.application.application.id);
    setList((previous) => ({
      paymentEnabled: detail.paymentEnabled,
      applications: [
        detail.application,
        ...(previous?.applications ?? []).filter(
          (item) => item.application.id !== detail.application.application.id,
        ),
      ],
    }));
  }

  function refresh() {
    void run(async () => {
      const result = await request<List>('/api/underwriting');
      setQueueError('');
      setList(result);
      if (!insurer) setRecords(await api<AccountRecords>('list'));
    });
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAgent) return;
    const form = new FormData(event.currentTarget);
    void run(async () => {
      update(
        await api<Detail>('/api/underwriting', {
          idempotencyKey: crypto.randomUUID(),
          productCode: PRODUCT.code,
          agentId: selectedAgent.id,
          delegationId: form.get('delegationId') || undefined,
          operation: form.get('operation'),
          activity: form.get('activity'),
          limitMicros: form.get('limit'),
          durationDays: Number(form.get('duration')),
          attestEligible: form.get('eligible') === 'on',
        }),
      );
    });
  }

  function act(action: Action) {
    if (!view) return;
    void run(async () => {
      update(
        await request<Detail>(`/api/underwriting/${view.application.id}`, {
          ...action,
          idempotencyKey: crypto.randomUUID(),
        }),
      );
      setText('');
      setRequestId('');
    });
  }

  function accept() {
    if (!view || !quote) return;
    void run(async () => {
      await api('accept', {
        quoteId: quote.terms.quoteId,
        acceptedDigest: quote.digest,
        delegationId: view.application.delegationId ?? undefined,
      });
      update(await api<Detail>(`/api/underwriting/${view.application.id}`));
    });
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge label="Synthetic underwriting · Arc Testnet" tone="synthetic" />
        <Button
          variant="secondary"
          disabled={busy || (!insurer && !wallet.address)}
          onClick={refresh}
        >
          {busy ? 'Working…' : list || insurer ? 'Refresh applications' : 'Load my applications'}
        </Button>
      </div>
      {(error || queueError) && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error || queueError}
        </p>
      )}
      {!insurer && !wallet.address && (
        <p className={muted}>Connect your wallet on Arc Testnet to load applications.</p>
      )}
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2.3fr)]">
        <div className="min-w-0 space-y-4">
          <section className={surface}>
            <h2 className="mb-3 font-semibold">
              {insurer ? 'Applications queue' : 'Your applications'}
            </h2>
            {!list ? (
              <p className={muted}>
                {insurer
                  ? queueError
                    ? 'Queue unavailable.'
                    : 'Loading queue…'
                  : 'Load applications to view requests and offers.'}
              </p>
            ) : list.applications.length === 0 ? (
              <p className={muted}>No applications to show.</p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {list.applications.map((item) => (
                  <li key={item.application.id}>
                    <button
                      type="button"
                      aria-pressed={view?.application.id === item.application.id}
                      onClick={() => {
                        setSelected(item.application.id);
                        setText('');
                        setRequestId('');
                      }}
                      className="w-full rounded px-2 py-3 text-left aria-pressed:bg-[var(--surface-inset)]"
                    >
                      <span className="block break-words text-sm font-semibold">
                        {item.application.agent.label}
                      </span>
                      <span className={muted}>
                        {offerLabel(item)} · {usdc(item.application.limitMicros)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {records && (
            <section className={surface}>
              <h2 className="mb-3 font-semibold">Apply for oracle coverage</h2>
              {selectedAgent ? (
                <form className="space-y-3" onSubmit={apply}>
                  <label className="field-label">
                    Registered exposure
                    <select
                      className="field-control"
                      value={selectedAgent.id}
                      onChange={(event) => setAgentId(event.target.value)}
                    >
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.label} · {agent.exposure.position}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedAgent.owner !== actor && (
                    <label className="field-label">
                      Delegation
                      <select
                        className="field-control"
                        key={selectedAgent.id}
                        name="delegationId"
                        required
                      >
                        <option value="">Select an active delegation</option>
                        {grants.map((grant) => (
                          <option key={grant.id} value={grant.id}>
                            {grant.beneficiary} · {usdc(grant.remainingPremiumMicros)} remaining
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="field-label">
                    Agent activity
                    <select className="field-control" name="operation">
                      <option value="monitor">Monitor the position</option>
                      <option value="manage_position">Manage the position</option>
                    </select>
                  </label>
                  <label className="field-label">
                    Describe the activity and controls
                    <textarea
                      className="field-control"
                      name="activity"
                      required
                      maxLength={4000}
                      rows={3}
                    />
                  </label>
                  <label className="field-label">
                    Requested limit
                    <select className="field-control" key={selectedAgent.id} name="limit">
                      {PRODUCT.limitsMicros
                        .filter(
                          (limit) => BigInt(limit) <= BigInt(selectedAgent.exposure.notionalMicros),
                        )
                        .map((limit) => (
                          <option key={limit} value={limit}>
                            {usdc(limit)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Term
                    <select className="field-control" name="duration" defaultValue="7">
                      {PRODUCT.durationsDays.map((duration) => (
                        <option key={duration} value={duration}>
                          {duration} days
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input name="eligible" type="checkbox" required />I attest the owner controls
                    this exposure, the position is healthy and there is no known incident.
                  </label>
                  <Button type="submit" disabled={busy}>
                    Submit application
                  </Button>
                </form>
              ) : (
                <ButtonLink href="/agent" variant="secondary" size="sm">
                  Register an exposure
                </ButtonLink>
              )}
            </section>
          )}
        </div>
        {view && (
          <div className="min-w-0 space-y-4">
            <section
              className={`${surface} bg-[linear-gradient(110deg,var(--surface)_45%,var(--accent-soft))]`}
            >
              <h2 className="break-words text-xl font-semibold">{view.application.agent.label}</h2>
              <p className={muted}>
                Oracle adapter liquidation · {offerLabel(view)}
                {!quote && ' · Indicative terms'}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <dt className={muted}>Limit</dt>
                  <dd>{usdc(view.application.limitMicros)}</dd>
                </div>
                <div>
                  <dt className={muted}>Premium</dt>
                  <dd>{usdc(quote?.terms.premiumMicros ?? view.premiumMicros)}</dd>
                </div>
                <div>
                  <dt className={muted}>Deductible</dt>
                  <dd>{usdc(quote?.terms.deductibleMicros ?? view.deductibleMicros)}</dd>
                </div>
                <div>
                  <dt className={muted}>Term</dt>
                  <dd>{view.application.durationDays} days</dd>
                </div>
              </dl>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
                {(quote?.terms.underwriting?.reasons ?? view.reasons).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {quote && (
                <div className="mt-4 min-w-0 border-t border-[var(--line)] pt-3 text-sm">
                  <p>
                    Quote expires{' '}
                    {new Date(quote.terms.quoteExpiresAt * 1000)
                      .toISOString()
                      .replace('T', ' ')
                      .slice(0, 16)}{' '}
                    UTC
                  </p>
                  <p className="break-all font-mono text-xs">{quote.digest}</p>
                  <p className="mt-2">Covered event: {quote.terms.insuredEvent}</p>
                  <ul className="list-disc pl-5">
                    {quote.terms.exclusions.map((exclusion) => (
                      <li key={exclusion}>{exclusion}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!insurer && applicant && view.status === 'ready' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {view.policyState && quote ? (
                    <ButtonLink
                      href={
                        view.policyState === 'confirmed'
                          ? `/policies/${quote.terms.policyId}`
                          : `/coverage?policyId=${quote.terms.policyId}`
                      }
                    >
                      Open {view.policyState === 'confirmed' ? 'policy' : 'wallet checkout'}
                    </ButtonLink>
                  ) : (
                    <>
                      <Button
                        disabled={busy}
                        variant={quote ? 'secondary' : 'primary'}
                        onClick={() => act({ action: 'quote' })}
                      >
                        {quote ? 'Refresh offer' : 'Get exact offer'}
                      </Button>
                      {quote && list?.paymentEnabled && (
                        <Button disabled={busy} onClick={accept}>
                          Accept exact offer
                        </Button>
                      )}
                      {quote && !list?.paymentEnabled && (
                        <span className={muted}>
                          Offline fixture quote. Wallet checkout is disabled.
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
            <section className={surface}>
              <h2 className="font-semibold">Evidence dossier</h2>
              <dl className="my-3 divide-y divide-[var(--line)]">
                {view.findings.map((finding) => (
                  <div
                    key={finding.label}
                    className="grid gap-1 py-2 sm:grid-cols-[minmax(9rem,1fr)_2fr]"
                  >
                    <dt className="text-sm font-medium">
                      {finding.label}
                      <span className="block text-xs text-[var(--ink-muted)]">
                        {finding.source}
                      </span>
                    </dt>
                    <dd className="whitespace-pre-wrap break-words text-sm">{finding.detail}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="text-sm font-semibold">Evidence required if a claim is filed</h3>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {(quote?.terms.underwriting?.claimEvidence ?? view.claimEvidence).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section className={surface}>
              <h2 className="font-semibold">Application thread</h2>
              {view.entries.length === 0 && (
                <p className={muted}>No messages or evidence requests yet.</p>
              )}
              <ol className="my-3 space-y-2">
                {view.entries.map((entry) => (
                  <li key={entry.id} className="rounded bg-[var(--surface-inset)] p-3 text-sm">
                    <p className="break-all font-medium">
                      {entry.kind === 'decision' ? entry.outcome : entry.kind} ·{' '}
                      {entry.by === 'Underwriting rules' ? entry.by : actorLabel(entry.by)}
                    </p>
                    {entry.kind === 'response' && (
                      <a className="text-xs underline" href={`#entry-${entry.requestId}`}>
                        View linked request
                      </a>
                    )}
                    <p id={`entry-${entry.id}`} className="whitespace-pre-wrap break-words">
                      {entry.text}
                    </p>
                  </li>
                ))}
              </ol>
              <label className="field-label">
                Message, evidence or decision rationale
                <textarea
                  className="field-control"
                  rows={3}
                  value={text}
                  maxLength={4000}
                  onChange={(event) => setText(event.target.value)}
                />
              </label>
              {!insurer && !frozen && open.length > 0 && (
                <label className="field-label mt-2">
                  Respond to an evidence request
                  <select
                    className="field-control"
                    value={requestId}
                    onChange={(event) => setRequestId(event.target.value)}
                  >
                    <option value="">Select a request</option>
                    {open.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.text}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || !text.trim()}
                  onClick={() => act({ action: 'message', text })}
                >
                  Send message
                </Button>
                {insurer && !frozen && (
                  <>
                    <Button
                      variant="secondary"
                      disabled={busy || !text.trim()}
                      onClick={() => act({ action: 'request', text })}
                    >
                      Request evidence
                    </Button>
                    <Button
                      disabled={busy || !text.trim() || open.length > 0}
                      onClick={() => act({ action: 'decision', outcome: 'approve', text })}
                    >
                      Approve for quoting
                    </Button>
                    <Button
                      variant="danger"
                      disabled={busy || !text.trim()}
                      onClick={() => act({ action: 'decision', outcome: 'decline', text })}
                    >
                      Decline application
                    </Button>
                  </>
                )}
                {!insurer && requestId && (
                  <Button
                    disabled={busy || !text.trim()}
                    onClick={() => act({ action: 'response', requestId, text })}
                  >
                    Submit evidence
                  </Button>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
