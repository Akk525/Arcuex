export type StepState = 'complete' | 'current' | 'upcoming' | 'error';

export type StepItem = {
  id: string;
  label: string;
  state: StepState;
};

export function Stepper({ steps, ariaLabel = 'Progress' }: { steps: StepItem[]; ariaLabel?: string }) {
  return (
    <ol
      aria-label={ariaLabel}
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1"
    >
      {steps.map((step, index) => {
        const tone =
          step.state === 'complete'
            ? 'border-[var(--ok)]/40 bg-emerald-50 text-[var(--ok)]'
            : step.state === 'current'
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
              : step.state === 'error'
                ? 'border-[var(--danger)]/40 bg-rose-50 text-[var(--danger)]'
                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]';
        return (
          <li key={step.id} className="flex items-center gap-1">
            <span
              className={`inline-flex items-center gap-2 rounded-[var(--radius)] border px-2.5 py-1.5 text-xs font-medium ${tone}`}
            >
              <span aria-hidden className="tabular-nums opacity-70">
                {index + 1}
              </span>
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span aria-hidden className="hidden text-[var(--ink-muted)] sm:inline">
                →
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
