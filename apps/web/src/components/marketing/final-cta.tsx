import { ButtonLink } from '@/components/ui/button';

export function FinalCta() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <div className="border border-[var(--line-strong)] bg-[var(--surface)] px-6 py-10 sm:px-10 sm:py-12">
        <h2 className="marketing-display max-w-[18ch] text-2xl text-[var(--ink)] sm:text-3xl">
          Start with coverage, or wire an agent.
        </h2>
        <p className="mt-4 max-w-[58ch] text-sm leading-relaxed text-[var(--ink-secondary)] sm:text-base">
          Quote and bind protection, connect a procurement agent, or open the dashboard once you
          have a session.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/coverage">Explore coverage</ButtonLink>
          <ButtonLink href="/agent" variant="secondary">
            Connect an agent
          </ButtonLink>
          <ButtonLink href="/dashboard" variant="ghost">
            Open dashboard
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
