import { FinalCta } from '@/components/marketing/final-cta';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { ProductStage } from '@/components/marketing/product-stage';
import { TrustSection } from '@/components/marketing/trust-section';
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
          <HowItWorks />
        </section>

        <section id="trust" className="marketing-section border-t border-[var(--line)]">
          <TrustSection />
        </section>

        <section id="get-started" className="marketing-section border-t border-[var(--line)]">
          <FinalCta />
        </section>
      </main>
    </MarketingShell>
  );
}
