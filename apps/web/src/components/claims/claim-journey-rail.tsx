import { Check, Prohibit, X } from '@phosphor-icons/react/ssr';
import type { JourneyState, JourneyStep } from '@/lib/claims/claim-journey';

const DOT: Record<JourneyState, string> = {
  complete: 'bg-[var(--ink)] text-white',
  current: 'bg-[var(--accent)] text-white ring-4 ring-[var(--accent-soft)]',
  upcoming: 'bg-[var(--surface)] text-[var(--ink-muted)] ring-1 ring-[var(--line-strong)]',
  blocked: 'bg-[var(--synthetic-soft)] text-[var(--synthetic)] ring-1 ring-[#e9d3a4]',
  skipped: 'bg-[var(--surface-inset)] text-[var(--ink-faint)] ring-1 ring-[var(--line)]',
  error: 'bg-[var(--danger)] text-white ring-4 ring-[var(--danger-soft)]',
};

function Dot({ step, index }: { step: JourneyStep; index: number }) {
  const paid = step.id === 'settlement' && step.state === 'complete';
  return (
    <span
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums ${
        paid ? 'bg-[var(--accent-signal)] text-white' : DOT[step.state]
      }`}
    >
      {step.state === 'complete' ? (
        <Check size={13} weight="bold" aria-hidden="true" />
      ) : step.state === 'error' ? (
        <X size={13} weight="bold" aria-hidden="true" />
      ) : step.state === 'blocked' || step.state === 'skipped' ? (
        <Prohibit size={13} weight="bold" aria-hidden="true" />
      ) : (
        index + 1
      )}
    </span>
  );
}

function Step({ step, index }: { step: JourneyStep; index: number }) {
  const body = (
    <span className="flex min-w-0 items-start gap-2.5">
      <Dot step={step} index={index} />
      <span className="min-w-0">
        <span
          className={`block text-[0.8125rem] font-semibold ${
            step.state === 'upcoming' || step.state === 'skipped' ? 'text-[var(--ink-muted)]' : 'text-[var(--ink)]'
          }`}
        >
          {step.label}
        </span>
        <span className="block text-xs leading-snug text-[var(--ink-muted)]">{step.caption}</span>
      </span>
    </span>
  );
  return (
    <li aria-current={step.state === 'current' ? 'step' : undefined} className="min-w-0">
      {step.anchor && step.state === 'current' ? (
        <a href={`#${step.anchor}`} className="block rounded-[var(--radius)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
          {body}
        </a>
      ) : (
        body
      )}
    </li>
  );
}

/**
 * Claim → evidence → examiner → human review, then reimbursement in its own box,
 * so a human approval is never read as a payment.
 */
export function ClaimJourneyRail({ steps }: { steps: JourneyStep[] }) {
  const decision = steps.slice(0, 4);
  const settlement = steps[4];
  return (
    <nav
      aria-label="Claim lifecycle"
      className="mt-4 grid gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(11rem,0.32fr)] md:items-center"
    >
      <ol className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {decision.map((step, i) => (
          <Step key={step.id} step={step} index={i} />
        ))}
      </ol>
      <p
        aria-hidden="true"
        className="hidden text-center text-[0.6875rem] leading-tight font-semibold tracking-wide text-[var(--ink-muted)] uppercase md:block"
      >
        Approval
        <br />≠ payment
      </p>
      {settlement ? (
        <ol
          className={`rounded-[var(--radius)] border border-dashed px-3 py-2.5 ${
            settlement.state === 'complete' ? 'border-[var(--accent-signal)] bg-[var(--accent-soft)]' : 'border-[var(--line-strong)] bg-[var(--surface-inset)]'
          }`}
          aria-label="Reimbursement"
        >
          <Step step={settlement} index={4} />
        </ol>
      ) : null}
    </nav>
  );
}
