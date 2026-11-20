import { Capabilities } from '@/components/marketing/capabilities';
import { DeveloperSection } from '@/components/marketing/developer-section';
import { FinalCta } from '@/components/marketing/final-cta';
import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { OversightSection } from '@/components/marketing/oversight-section';
import { ProductStage } from '@/components/marketing/product-stage';
import { TrustSection } from '@/components/marketing/trust-section';

export function HomePage() {
  return (
    <MarketingShell>
      <main id="main-content">
        <MarketingHero />
        <Capabilities />

        <section id="how-it-works" className="scroll-mt-16 border-t border-[var(--line)] bg-white pt-[clamp(4.5rem,10vw,8.5rem)] pb-[clamp(3rem,6vw,5rem)]">
          <div className="marketing-wrap mb-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
            <h2 className="section-title max-w-[15ch] text-[var(--ink)]">From quote to settlement, step by step.</h2>
            <p className="marketing-lede lg:pb-1.5">
              The same claim follows one path: priced terms, a bound policy, an evidence exchange,
              a human decision and, only with a confirmed receipt, payment.
            </p>
          </div>
          <ProductStage />
        </section>

        <OversightSection />
        <DeveloperSection />
        <TrustSection />
        <FinalCta />
      </main>
    </MarketingShell>
  );
}
