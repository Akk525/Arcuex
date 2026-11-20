import { CheckCircle, Circle, Receipt, Scales, Sparkle } from '@phosphor-icons/react/ssr';
import { TruthBadge } from '@/components/ui/truth-badge';

const PRINCIPLES = [
  {
    icon: Sparkle,
    title: 'AI advises',
    body: 'The examiner reads the evidence and writes an advisory note. It is labeled as a test double or live inference, and it cannot approve or pay.',
  },
  {
    icon: Scales,
    title: 'People decide',
    body: 'An authorized reviewer requests what is missing, reads the file and records the decision with a reason.',
  },
  {
    icon: Receipt,
    title: 'Receipts settle',
    body: 'A claim is marked paid only after a settlement receipt is confirmed on Arc. Approval alone never reimburses.',
  },
] as const;

export function OversightSection() {
  return (
    <section id="oversight" className="marketing-band scroll-mt-16 bg-[var(--paper)]">
      <div className="marketing-wrap grid gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-20">
        <div>
          <h2 className="section-title max-w-[14ch] text-[var(--ink)]">Evidence first. A person signs off.</h2>
          <p className="marketing-lede mt-5">
            Every claim becomes a dossier: what happened, what was proven, what the examiner noted,
            and who decided. Nothing in it moves money on its own.
          </p>
          <ul className="mt-10 grid gap-6">
            {PRINCIPLES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[var(--accent-signal)] shadow-[var(--shadow-sm)]">
                  <Icon size={20} weight="duotone" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-display text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--ink)]">{title}</h3>
                  <p className="mt-1 max-w-[50ch] text-[0.9375rem] leading-relaxed text-[var(--ink-secondary)]">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <Dossier />
      </div>
    </section>
  );
}

const CHRONOLOGY = [
  { title: 'Claim submitted', meta: 'Nov 19, 10:24 UTC', state: 'done' },
  { title: 'Evidence received (2)', meta: 'Nov 19, 10:42 UTC', state: 'done' },
  { title: 'Reviewer requested loss documentation', meta: 'Nov 19, 11:02 UTC', state: 'done' },
  { title: 'Agent responded with diagnostic logs', meta: 'Nov 19, 11:16 UTC', state: 'done' },
  { title: 'Human decision: approved', meta: 'Nov 19, 11:45 UTC', state: 'done' },
  { title: 'Settlement receipt', meta: 'Not recorded', state: 'open' },
] as const;

function Dossier() {
  return (
    <figure
      aria-label="Example claim dossier, synthetic"
      className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-lg)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div>
          <p className="text-xs text-[var(--ink-muted)]">Claims / CLAIM-00124</p>
          <p className="mt-0.5 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">Research agent execution failure</p>
        </div>
        <TruthBadge label="Synthetic demo" tone="synthetic" />
      </header>
      <div className="grid sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <ol className="relative px-5 py-5">
          <span aria-hidden="true" className="absolute top-7 bottom-9 left-[1.8125rem] w-px bg-[var(--line-strong)]" />
          {CHRONOLOGY.map((step) => (
            <li key={step.title} className="relative grid grid-cols-[1.125rem_minmax(0,1fr)] gap-x-3 py-1.5">
              {step.state === 'done' ? (
                <CheckCircle size={18} weight="fill" className="relative rounded-full bg-white text-[#157a52]" aria-hidden="true" />
              ) : (
                <Circle size={18} className="relative rounded-full bg-white text-[var(--ink-faint)]" aria-hidden="true" />
              )}
              <span>
                <span className={`block text-[0.8125rem] font-semibold ${step.state === 'done' ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}>
                  {step.title}
                </span>
                <span className="block text-xs text-[var(--ink-muted)] tabular-nums">{step.meta}</span>
              </span>
            </li>
          ))}
        </ol>
        <dl className="grid content-start gap-4 border-t border-[var(--line)] bg-[#fbfcfc] px-5 py-5 sm:border-t-0 sm:border-l">
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">AI examiner</dt>
            <dd className="mt-1.5 flex flex-wrap gap-1.5">
              <TruthBadge label="Test double" tone="ai" title="Deterministic test double, not live model inference" />
              <TruthBadge label="Advisory only" tone="neutral" />
            </dd>
            <dd className="mt-1.5 text-xs leading-relaxed text-[var(--ink-secondary)]">Sufficient evidence for human determination.</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Verification</dt>
            <dd className="mt-1 text-[0.8125rem] font-medium text-[var(--ink)]">Evidence linked, validation current</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Decision</dt>
            <dd className="mt-1.5">
              <TruthBadge label="Approved" tone="live" />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Reimbursement</dt>
            <dd className="mt-1.5">
              <TruthBadge label="Not reimbursed" tone="warn" />
            </dd>
            <dd className="mt-1.5 text-xs leading-relaxed text-[var(--ink-secondary)]">No confirmed settlement receipt.</dd>
          </div>
        </dl>
      </div>
    </figure>
  );
}
