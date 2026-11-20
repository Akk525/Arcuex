import Link from 'next/link';
import {
  ArrowRight,
  FileMagnifyingGlass,
  Flask,
  Receipt,
  ShieldCheck,
  UserCheck,
} from '@phosphor-icons/react/ssr';
import { StatusBadge } from '@/components/status-badge';

const claimProgress = [
  { icon: FileMagnifyingGlass, label: 'Evidence received', detail: 'Linked to the policy' },
  { icon: UserCheck, label: 'Human decision', detail: 'Approved', tone: 'ok' },
  { icon: Receipt, label: 'Arc settlement', detail: 'Awaiting receipt', tone: 'pending' },
] as const;

export function MarketingHero() {
  return (
    <section id="hero" className="marketing-wrap marketing-hero" aria-labelledby="hero-heading">
      <div className="arc-header marketing-hero-inner" data-appearance="dark">
        <span className="arc-header-art marketing-hero-art" aria-hidden="true">
          <span />
        </span>
        <div className="marketing-hero-copy">
          <h1 id="hero-heading" className="arc-serif marketing-hero-title">
            Insurance for agents that act.
          </h1>
          <p className="marketing-hero-description">
            Cover the work your AI agents do. When something goes wrong, submit evidence for human
            review and track reimbursement through Arc settlement.
          </p>
          <div className="marketing-hero-actions">
            <Link href="/coverage" className="marketing-cta marketing-hero-primary">
              Explore coverage <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
            <Link href="#developers" className="marketing-cta-secondary marketing-hero-secondary">
              Build with Arcuex
            </Link>
          </div>
        </div>
        <PolicyPreview />
      </div>
    </section>
  );
}

function PolicyPreview() {
  return (
    <figure className="marketing-policy-preview arc-panel" aria-labelledby="policy-preview-title">
      <figcaption className="policy-preview-caption flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-secondary)]">
          <Flask size={15} className="text-[var(--accent-signal)]" aria-hidden="true" />
          Illustrative policy
        </span>
        <StatusBadge label="Synthetic demo" tone="synthetic" />
      </figcaption>
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        <span className="arc-stat-icon">
          <ShieldCheck size={20} weight="duotone" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id="policy-preview-title"
            className="font-display text-lg font-semibold leading-tight text-[var(--ink)]"
          >
            Oracle adapter liquidation
          </h2>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">Insured agent · Research Agent</p>
        </div>
      </div>
      <dl className="policy-preview-terms grid grid-cols-2 divide-x divide-[var(--line)] border-y border-[var(--line)]">
        <div className="px-4 py-2.5 sm:px-5">
          <dt className="text-xs text-[var(--ink-muted)]">Coverage limit</dt>
          <dd className="font-display text-base font-semibold tabular-nums">1.00 USDC</dd>
        </div>
        <div className="px-4 py-2.5 sm:px-5">
          <dt className="text-xs text-[var(--ink-muted)]">Deductible</dt>
          <dd className="font-display text-base font-semibold tabular-nums">0.10 USDC</dd>
        </div>
      </dl>
      <div className="px-4 py-4 sm:px-5">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Claim progress</h3>
        <ol className="mt-2 divide-y divide-[var(--line)]">
          {claimProgress.map((step) => (
            <li
              key={step.label}
              className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-2 last:pb-0"
            >
              <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-[var(--ink-secondary)]">
                <step.icon size={16} className="text-[var(--accent-signal)]" aria-hidden="true" />
                {step.label}
              </span>
              {'tone' in step ? (
                <StatusBadge label={step.detail} tone={step.tone} />
              ) : (
                <span className="text-xs text-[var(--ink-muted)]">{step.detail}</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}
