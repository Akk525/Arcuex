const STEPS = [
  {
    title: 'Procure and delegate',
    body: 'Owners and agents request priced terms against published products. Owners can grant scoped bind authority without sharing private keys.',
    diagram: (
      <svg viewBox="0 0 160 72" className="h-14 w-full max-w-[10rem]" aria-hidden="true">
        <rect x="4" y="18" width="44" height="36" rx="4" fill="var(--surface-inset)" stroke="var(--line-strong)" />
        <rect x="58" y="18" width="44" height="36" rx="4" fill="var(--surface)" stroke="var(--line-strong)" />
        <rect x="112" y="18" width="44" height="36" rx="4" fill="var(--accent-soft)" stroke="var(--accent)" />
        <path
          d="M48 36h10M102 36h10"
          stroke="var(--ink-faint)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: 'Exchange evidence',
    body: 'Claims move on authenticatable evidence — uploads, proofs, and requests that keep investigation grounded in what can be verified.',
    diagram: (
      <svg viewBox="0 0 160 72" className="h-14 w-full max-w-[10rem]" aria-hidden="true">
        <rect x="12" y="12" width="56" height="48" rx="4" fill="var(--surface)" stroke="var(--line-strong)" />
        <rect x="92" y="12" width="56" height="48" rx="4" fill="var(--surface)" stroke="var(--line-strong)" />
        <path
          d="M68 28h24M68 44h24M92 28l-6-4M92 28l-6 4M68 44l6-4M68 44l6 4"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    ),
  },
  {
    title: 'Human review, then settlement',
    body: 'AI can assist investigation as advisory input. Humans adjudicate. Approval is not payment — live payouts still require controlled Arc settlement and wallet confirmation.',
    diagram: (
      <svg viewBox="0 0 160 72" className="h-14 w-full max-w-[10rem]" aria-hidden="true">
        <circle cx="36" cy="36" r="18" fill="var(--ai-soft)" stroke="var(--line-strong)" />
        <circle cx="80" cy="36" r="18" fill="var(--surface)" stroke="var(--line-strong)" />
        <circle cx="124" cy="36" r="18" fill="var(--ok-soft)" stroke="var(--ok)" />
        <text x="36" y="40" textAnchor="middle" fontSize="9" fill="var(--ink-muted)">
          AI
        </text>
        <text x="80" y="40" textAnchor="middle" fontSize="9" fill="var(--ink)">
          Human
        </text>
        <text x="124" y="40" textAnchor="middle" fontSize="9" fill="var(--ok)">
          Settle
        </text>
      </svg>
    ),
  },
] as const;

export function HowItWorks() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <h2 className="marketing-display text-2xl text-[var(--ink)] sm:text-3xl">How it works</h2>
      <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--ink-muted)] sm:text-base">
        Arcuex runs the insurance lifecycle for agent-native risk — from procurement through
        evidence and adjudication — without letting automation authorize payouts.
      </p>
      <ol className="mt-10 grid gap-0 border-t border-[var(--line)] md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="border-b border-[var(--line)] py-8 md:border-r md:border-b-0 md:px-6 md:py-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
          >
            <div className="mb-5 text-[var(--ink-faint)]">{step.diagram}</div>
            <p className="font-mono text-xs tabular text-[var(--ink-faint)]">
              {String(index + 1).padStart(2, '0')}
            </p>
            <h3 className="mt-2 text-base font-semibold text-[var(--ink)]">{step.title}</h3>
            <p className="mt-2 max-w-[36ch] text-sm leading-relaxed text-[var(--ink-secondary)]">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
