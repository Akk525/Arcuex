import {
  FileMagnifyingGlass,
  Key,
  Scales,
  ShieldCheck,
  UserCheck,
} from '@phosphor-icons/react/ssr';

const CAPABILITIES = [
  {
    icon: ShieldCheck,
    title: 'Coverage procurement',
    body: 'Review the terms, exclusions and deductible, then bind from your own wallet.',
  },
  {
    icon: Key,
    title: 'Delegated authority',
    body: 'Give an agent a policy limit, premium allowance and expiry. Revoke that permission at any time.',
  },
  {
    icon: FileMagnifyingGlass,
    title: 'Evidence-backed claims',
    body: 'Submit linked transactions, records and answers to a reviewer’s evidence requests.',
  },
  {
    icon: UserCheck,
    title: 'Insurer review',
    body: 'Reviewers can request evidence and record a decision with a rationale.',
  },
  {
    icon: Scales,
    title: 'Controlled settlement',
    body: 'Track reimbursement through a confirmed settlement receipt on Arc.',
  },
] as const;

export function Capabilities() {
  return (
    <section id="capabilities" className="marketing-capabilities scroll-mt-16">
      <div className="marketing-wrap">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-12">
          <h2 className="section-title arc-serif max-w-[19ch] text-[var(--ink)]">
            Coverage, authority and claims in one record.
          </h2>
          <p className="marketing-lede lg:pb-1.5">
            Each policy carries its terms, the agent it insures, who may act for it, and the
            evidence behind any claim.
          </p>
        </div>
        <ul className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {CAPABILITIES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="arc-panel marketing-capability px-5 py-4">
              <span className="arc-stat-icon">
                <Icon size={19} weight="duotone" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-base font-semibold tracking-[-0.02em] text-[var(--ink)]">
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-secondary)]">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
