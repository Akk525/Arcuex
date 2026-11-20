import type { Metadata } from 'next';
import { ArrowSquareOut } from '@phosphor-icons/react/ssr';
import { AppShell } from '@/components/app-shell';
import { Callout } from '@/components/ui/callout';
import { PageHeader } from '@/components/ui/page-header';
import { TruthBadge } from '@/components/ui/truth-badge';
import { ORACLE_LIQUIDATION_REPLAY as R, fixedPoint } from '@/lib/replay/oracle-liquidation';

export const metadata: Metadata = { title: 'Historical oracle-liquidation replay · Arcuex' };

const etherscan = (kind: 'tx' | 'address', value: string) => `https://etherscan.io/${kind}/${value}`;
const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`;

function Scenario({
  tone,
  eyebrow,
  title,
  data,
}: {
  tone: 'faulty' | 'counter';
  eyebrow: string;
  title: string;
  data: (typeof R)['faulty'] | (typeof R)['counterfactual'];
}) {
  const below = BigInt(data.healthFactor) < 10n ** 18n;
  return (
    <section
      aria-label={title}
      className={`min-w-0 rounded-[var(--radius-lg)] border bg-[var(--surface)] p-5 ${
        tone === 'faulty' ? 'border-[#f3c4bf]' : 'border-[#bfe0dd]'
      }`}
    >
      <p className="text-xs font-medium tracking-wide text-[var(--ink-muted)] uppercase">{eyebrow}</p>
      <h2 className="mt-1 text-[0.9375rem] font-semibold text-[var(--ink)]">{title}</h2>
      <p className="mt-4 text-xs text-[var(--ink-muted)]">Health factor</p>
      <p
        className={`font-display text-[2.25rem] leading-none font-semibold tabular-nums tracking-[-0.03em] ${
          below ? 'text-[var(--danger)]' : 'text-[var(--live)]'
        }`}
      >
        {fixedPoint(data.healthFactor, 18, 4)}
      </p>
      <p className="mt-1.5 text-[0.8125rem] text-[var(--ink-secondary)]">
        {below ? 'Below 1.0, so the position is liquidatable.' : 'Above 1.0, so the position is not liquidatable.'}
      </p>
      <dl className="mt-4 grid gap-2 border-t border-[var(--line)] pt-4 text-[0.8125rem]">
        {[
          ['Adapter price (USD)', fixedPoint(data.adapterPrice, 8, 2)],
          ['Collateral value (USD)', fixedPoint(data.collateralValueUsd, 8, 2)],
          ['Debt value (USD)', fixedPoint(data.debtValueUsd, 8, 2)],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--ink-muted)]">{k}</dt>
            <dd className="font-medium tabular-nums text-[var(--ink)]">{v}</dd>
          </div>
        ))}
      </dl>
      <p
        className={`mt-4 rounded-[var(--radius)] px-3 py-2 text-[0.8125rem] font-medium ${
          tone === 'faulty' ? 'bg-[var(--danger-soft)] text-[#5c120c]' : 'bg-[var(--accent-soft)] text-[var(--ink)]'
        }`}
      >
        {data.outcome}
      </p>
    </section>
  );
}

export default function OracleLiquidationReplayPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Mission Control · Historical replay"
        title="Oracle-capped liquidation, replayed"
        badges={
          <>
            <TruthBadge label="Historical research" tone="neutral" />
            <TruthBadge label="Not a claim · not paid" tone="warn" />
          </>
        }
        description={`A real liquidation on ${R.chain} at block ${R.block} (${R.blockTimestamp}), re-executed offline from its transaction prestate with deployed bytecode. One oracle field is changed to see whether the liquidation still happens.`}
      />

      <Callout kind="warn" title="Read-only counterfactual. Not an Arc transaction or an Arcuex policy.">
        No policy covered this borrower, so nothing here can be claimed or paid. The witness comes
        from a single RPC provider and has not been independently authenticated. Investigated{' '}
        {R.investigatedAt}.
      </Callout>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Scenario
          tone="faulty"
          eyebrow="What happened"
          title="Faulty capped oracle (actual prestate)"
          data={R.faulty}
        />
        <Scenario
          tone="counter"
          eyebrow="Counterfactual"
          title="Snapshot ratio set to canonical"
          data={R.counterfactual}
        />
      </div>

      <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--ink)]">The single intervention</h2>
        <p className="mt-1.5 max-w-3xl text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
          {R.intervention} This is a valuation counterfactual, not a valid governance transaction.
        </p>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Conditional gross loss</h2>
          <p className="mt-3 font-display text-[1.75rem] leading-none font-semibold tabular-nums tracking-[-0.02em] text-[var(--ink)]">
            {fixedPoint(R.grossLossBaseWei, 18, 4)} <span className="text-base font-medium text-[var(--ink-muted)]">WETH-equivalent</span>
          </p>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--ink-muted)]">
            floor(collateral depleted × canonical ratio) − debt extinguished. Gross, before
            recoveries, at the canonical valuation. It is not remaining net harm and not a USDC
            amount.
          </p>
          <dl className="mt-4 grid gap-2 border-t border-[var(--line)] pt-4 text-[0.8125rem]">
            {[
              ['Collateral depleted (wstETH)', fixedPoint(R.totalCollateralDepletion, 18, 4)],
              ['Debt extinguished (WETH)', fixedPoint(R.debtExtinguished, 18, 4)],
              ['Canonical ratio', fixedPoint(R.canonicalRatio, 18, 6)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">{k}</dt>
                <dd className="font-medium tabular-nums text-[var(--ink)]">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Candidate payout</h2>
            <TruthBadge label="REVIEW" tone="pending" />
          </div>
          <p className="mt-3 font-display text-[1.75rem] leading-none font-semibold text-[var(--ink)]">
            {R.candidatePayout}
          </p>
          <p className="mt-3 text-xs font-medium tracking-wide text-[var(--ink-muted)] uppercase">
            Why it is not payable
          </p>
          <ul className="mt-2 grid gap-2 text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
            {R.blockers.map((b) => (
              <li key={b} className="flex gap-2">
                <span aria-hidden="true" className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warn)]" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Evidence identifiers</h2>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          Explorer links identify historical objects. They were not used as independent corroboration.
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.8125rem] sm:grid-cols-2">
          {(
            [
              ['Parameter change tx', R.parameterChangeTx, 'tx'],
              ['Liquidation tx', R.liquidationTx, 'tx'],
              ['Borrower', R.borrower, 'address'],
              ['Price-cap adapter', R.adapter, 'address'],
            ] as const
          ).map(([k, v, kind]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-[var(--ink-muted)]">{k}</dt>
              <dd>
                <a
                  href={etherscan(kind, v)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-[var(--accent)] underline-offset-2 hover:underline"
                  title={v}
                >
                  {short(v)}
                  <ArrowSquareOut size={12} aria-hidden="true" />
                </a>
              </dd>
            </div>
          ))}
          <div className="min-w-0">
            <dt className="text-xs text-[var(--ink-muted)]">Replay method</dt>
            <dd className="font-mono text-xs text-[var(--ink-secondary)]">
              {R.method} · {R.hardfork}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--ink-muted)]">Operator post-mortem (published assertion)</dt>
            <dd>
              <a
                href={R.sources.postMortem}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--accent)] underline-offset-2 hover:underline"
              >
                Chaos Labs, March 10
                <ArrowSquareOut size={12} aria-hidden="true" />
              </a>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-[var(--ink-muted)]">
          Source in repository: <code className="font-mono">{R.sources.writeUp}</code>, decision{' '}
          <code className="font-mono">{R.sources.decision}</code>.
        </p>
      </section>
    </AppShell>
  );
}
