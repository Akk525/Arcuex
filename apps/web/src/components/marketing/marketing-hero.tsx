import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle,
  Code,
  FileText,
  Files,
  Flask,
  House,
  Robot,
  Scales,
  SealCheck,
  ShieldCheck,
  Sparkle,
  UserCheck,
  CurrencyCircleDollar,
} from '@phosphor-icons/react/ssr';
import { MarketingMark } from '@/components/marketing/marketing-mark';

const sidebar = [
  { label: 'Overview', icon: House, active: false },
  { label: 'Protect', icon: ShieldCheck, active: true },
  { label: 'Claims', icon: FileText, active: false },
  { label: 'Build', icon: Code, active: false },
] as const;

const pillars = [
  { label: 'Agent-ready', icon: Robot },
  { label: 'Evidence-backed', icon: SealCheck },
  { label: 'Human oversight', icon: UserCheck },
  { label: 'Arc settlement', icon: CurrencyCircleDollar },
] as const;

export function MarketingHero() {
  return (
    <section id="hero" className="font-display marketing-hero">
      <HeroStage />
      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-10">
        <div className="flex max-w-[35rem] flex-col justify-center pt-10 pb-12 lg:min-h-[calc(100dvh-4rem)] lg:max-h-[56rem] lg:py-10">
          <p className="hero-rise flex items-center gap-3 text-xs font-semibold tracking-[0.14em] text-[#0f6e78] uppercase">
            <span className="h-px w-7 bg-[#0f6e78]" aria-hidden="true" />
            Agent-native insurance infrastructure
          </p>
          <h1 className="hero-rise hero-rise-1 mt-5 text-[clamp(2.75rem,5.2vw,4.5rem)] leading-[1.03] font-bold tracking-[-0.042em] text-[#0e1a20]">
            The insurance layer for the agent economy.
          </h1>
          <p className="hero-rise hero-rise-2 mt-6 max-w-[40ch] font-sans text-base leading-relaxed text-[#4b5a64] sm:text-[1.0625rem]">
            Arcuex lets AI agents and their operators buy coverage, file evidence-backed claims, and
            reach decisions that a person signs off on.
          </p>
          <div className="hero-rise hero-rise-3 mt-8 flex flex-wrap items-center gap-3">
            <Link href="/coverage" className="marketing-cta">
              Explore coverage
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
            <Link href="#developers" className="marketing-cta-secondary">
              Build with Arcuex
            </Link>
          </div>
          <ul className="hero-rise hero-rise-4 mt-12 grid grid-cols-2 gap-x-6 gap-y-3 font-sans sm:flex sm:flex-wrap sm:gap-x-7">
            {pillars.map(({ label, icon: Icon }) => (
              <li key={label} className="flex items-center gap-2 text-[0.8125rem] font-medium text-[#33434d]">
                <Icon size={18} weight="duotone" className="text-[#12808a]" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <HeroCards />
      </div>
    </section>
  );
}

function HeroStage() {
  return (
    <div className="marketing-hero-stage" aria-hidden="true">
      <div className="marketing-hero-field" />
      <div className="marketing-hero-facet" />
      <div className="marketing-hero-rings" />
      <div className="marketing-hero-plinth">
        <div className="marketing-hero-plinth-top" />
        <div className="marketing-hero-plinth-front" />
        <div className="marketing-hero-plinth-glow" />
      </div>
    </div>
  );
}

function HeroCards() {
  return (
    <figure className="hero-cards font-sans" aria-label="Arcuex product preview: a synthetic policy and a claim that is approved but not reimbursed">
      <article className="hero-card hero-card-coverage">
        <header className="flex items-center justify-between gap-3 border-b border-black/6 px-4 py-2.5">
          <span className="flex items-center gap-1.5 font-display text-[10px] font-bold tracking-[0.14em] text-[#16303a]">
            <MarketingMark className="h-3.5 w-3.5" />
            ARCUEX
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#fbf3e2] px-2 py-0.5 text-[10px] font-semibold text-[#8a5a00]">
            <Flask size={11} aria-hidden="true" />
            Synthetic demo
          </span>
        </header>
        <div className="grid grid-cols-[4.75rem_minmax(0,1fr)]">
          <ul className="flex flex-col gap-0.5 border-r border-black/6 px-1.5 py-2">
            {sidebar.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <span
                    className={`flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[9.5px] font-medium ${
                      item.active ? 'bg-[#e6f3f2] text-[#0d4048]' : 'text-[#7b8792]'
                    }`}
                  >
                    <Icon size={12} weight={item.active ? 'fill' : 'regular'} aria-hidden="true" />
                    {item.label}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-3.5">
            <p className="text-[11px] text-[#6a7884]">Policy</p>
            <p className="mt-0.5 font-display text-[17px] font-semibold tracking-[-0.02em] text-[#0e1a20]">
              Research agent coverage
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#667581]">
              <Robot size={12} aria-hidden="true" />
              Insured agent: Research Agent
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-black/6 pt-3">
              {[
                ['Limit', '1.00 USDC'],
                ['Deductible', '0.10 USDC'],
                ['Premium', '0.05 USDC'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] text-[#667581]">{k}</dt>
                  <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#0e1a20]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </article>

      <article className="hero-card hero-card-claim">
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
          <span>
            <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-[-0.01em] text-[#0e1a20]">
              <Files size={16} className="text-[#12808a]" aria-hidden="true" />
              Claim investigation
            </span>
            <span className="mt-0.5 block pl-6 text-[11px] text-[#667581]">Agent task failure during a research run</span>
          </span>
          <span className="rounded-md bg-[#f1f4f4] px-1.5 py-1 font-mono text-[10px] text-[#4b5a64]">CLAIM-00124</span>
        </header>
        <ol className="relative mx-4 mt-3 mb-4 grid gap-2.5 border-t border-black/6 pt-3">
          <span className="absolute top-6 bottom-4 left-[7px] w-px bg-[#d5dedb]" aria-hidden="true" />
          <HeroStep i={0} icon={<CheckCircle size={16} weight="fill" className="text-[#157a52]" />} title="Evidence received" body="Two records linked to the policy" />
          <HeroStep i={1} icon={<Sparkle size={16} weight="fill" className="text-[#3f5d78]" />} title="AI examiner (test double)" body="Advisory note only. Cannot approve or pay." />
          <HeroStep
            i={2}
            icon={<Scales size={16} weight="fill" className="text-[#0d4048]" />}
            title="Human review"
            body="Decided by an authorized reviewer"
            trailing={
              <span className="flex flex-wrap justify-end gap-1">
                <span className="rounded-full bg-[#e6f3f2] px-2 py-0.5 text-[10px] font-semibold text-[#0f6b74]">Approved</span>
                <span className="hero-unpaid rounded-full bg-[#fbf3e2] px-2 py-0.5 text-[10px] font-semibold text-[#8a5a00]">
                  Not reimbursed
                </span>
              </span>
            }
          />
        </ol>
        <p className="border-t border-black/6 px-4 py-2.5 text-[10.5px] text-[#667581]">
          Approval is not payment. Reimbursement needs a confirmed settlement receipt.
        </p>
      </article>
    </figure>
  );
}

function HeroStep({
  i,
  icon,
  title,
  body,
  trailing,
}: {
  i: number;
  icon: React.ReactNode;
  title: string;
  body: string;
  trailing?: React.ReactNode;
}) {
  return (
    <li className={`hero-step hero-step-${i} grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-3`}>
      <span className="relative rounded-full bg-white" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold text-[#18242c]">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-[#667581]">{body}</span>
      </span>
      {trailing ?? null}
    </li>
  );
}
