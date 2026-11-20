import { ProductStage } from '@/components/marketing/product-stage';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { ButtonLink } from '@/components/ui/button';

export function HomePage() {
  return (
    <MarketingShell>
      <main>
        <section id="hero" className="marketing-section">
          <div className="mx-auto grid w-full max-w-6xl items-end gap-8 px-5 sm:px-8 lg:grid-cols-[minmax(11rem,16rem)_minmax(0,1fr)] lg:gap-14">
            <p className="marketing-display text-[clamp(3.25rem,12vw,4.75rem)] text-[var(--ink)]">
              Arcuex
            </p>
            <div className="min-w-0 max-w-[40rem] border-l border-[var(--line-strong)] pl-5 sm:pl-8">
              <h1 className="marketing-display max-w-full text-[clamp(1.875rem,7.2vw,3.25rem)] text-[var(--ink)]">
                Insurance infrastructure for autonomous agents.
              </h1>
              <p className="mt-5 max-w-[62ch] text-base leading-relaxed text-[var(--ink-secondary)] sm:text-lg">
                A path from procurement and delegated authority, through evidence-backed claims and
                human adjudication, to settlement on Arc Testnet.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <ButtonLink href="/coverage">Explore coverage</ButtonLink>
                <ButtonLink href="/agent" variant="secondary">
                  Connect an agent
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>

        <section id="product-stage" className="scroll-mt-24 border-t border-[var(--line)]">
          <ProductStage />
        </section>

        <section id="how-it-works" className="marketing-section border-t border-[var(--line)]">
          <div className="mx-auto max-w-6xl px-5 sm:px-8" data-section-status="placeholder">
            <h2 className="marketing-display text-2xl text-[var(--ink)] sm:text-3xl">
              How it works
            </h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--ink-muted)]">
              Placeholder. Procurement, evidence exchange, and human review will be explained here.
            </p>
          </div>
        </section>

        <section id="trust" className="marketing-section border-t border-[var(--line)]">
          <div className="mx-auto max-w-6xl px-5 sm:px-8" data-section-status="placeholder">
            <h2 className="marketing-display text-2xl text-[var(--ink)] sm:text-3xl">
              Trust and infrastructure
            </h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--ink-muted)]">
              Placeholder. Arc Testnet, wallet approval, and the synthetic-ledger boundary will be
              stated here.
            </p>
          </div>
        </section>

        <section id="get-started" className="marketing-section border-t border-[var(--line)]">
          <div className="mx-auto max-w-6xl px-5 sm:px-8" data-section-status="placeholder">
            <h2 className="marketing-display text-2xl text-[var(--ink)] sm:text-3xl">
              Get started
            </h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--ink-muted)]">
              Placeholder. The closing conversion will repeat the coverage, agent, and dashboard
              paths.
            </p>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
