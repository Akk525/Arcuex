import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react/ssr';

export function FinalCta() {
  return (
    <section id="get-started" className="scroll-mt-16 bg-white pb-[clamp(4.5rem,9vw,7.5rem)]">
      <div className="marketing-wrap">
        <div className="relative overflow-hidden rounded-3xl bg-[var(--paper)] px-6 py-14 sm:px-12 sm:py-16 lg:px-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-1/2 -right-[15%] h-[200%] w-[55%] bg-[linear-gradient(160deg,#1b8b94_0%,#0e5962_40%,#0a3c44_100%)] opacity-95 [clip-path:polygon(35%_0,100%_0,100%_100%,0_100%)] max-lg:hidden"
          />
          <div className="relative max-w-[36rem]">
            <h2 className="section-title !mt-0 text-[var(--ink)]">Put your first agent under cover.</h2>
            <p className="marketing-lede mt-5">
              Quote a synthetic policy on Arc Testnet in a few minutes, or connect an agent and let
              it procure within limits you set.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/coverage" className="marketing-cta">
                Explore coverage
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
              <Link href="/dashboard" className="marketing-cta-secondary">
                Open dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
