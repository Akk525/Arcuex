import { Check, X } from '@phosphor-icons/react/ssr';

export type StepState = 'complete' | 'current' | 'upcoming' | 'error';

export type StepItem = {
  id: string;
  label: string;
  state: StepState;
};

const STATE_TEXT: Record<StepState, string> = {
  complete: 'completed',
  current: 'current step',
  upcoming: 'not started',
  error: 'needs attention',
};

/** Connected step rail. Numbers are meaningful: these are sequential stages. */
export function Stepper({ steps, ariaLabel = 'Progress' }: { steps: StepItem[]; ariaLabel?: string }) {
  return (
    <ol aria-label={ariaLabel} className="flex w-full items-center">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const dot =
          step.state === 'complete'
            ? 'bg-[var(--accent-signal)] text-white'
            : step.state === 'current'
              ? 'bg-[var(--accent)] text-white ring-4 ring-[var(--accent-soft)]'
              : step.state === 'error'
                ? 'bg-[var(--danger)] text-white ring-4 ring-[var(--danger-soft)]'
                : 'bg-[var(--surface)] text-[var(--ink-muted)] ring-1 ring-[var(--line-strong)]';
        return (
          <li
            key={step.id}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={`flex min-w-0 items-center ${last ? '' : 'flex-1'}`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums ${dot}`}>
                {step.state === 'complete' ? (
                  <Check size={13} weight="bold" aria-hidden="true" />
                ) : step.state === 'error' ? (
                  <X size={13} weight="bold" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`truncate text-[0.8125rem] font-medium max-sm:sr-only ${
                  step.state === 'current' ? 'text-[var(--ink)]' : step.state === 'upcoming' ? 'text-[var(--ink-muted)]' : 'text-[var(--ink-secondary)]'
                }`}
              >
                {step.label}
              </span>
              <span className="sr-only">, {STATE_TEXT[step.state]}</span>
            </span>
            {!last ? (
              <span
                aria-hidden="true"
                className={`mx-3 h-px min-w-4 flex-1 ${step.state === 'complete' ? 'bg-[var(--accent-signal)]' : 'bg-[var(--line-strong)]'}`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
