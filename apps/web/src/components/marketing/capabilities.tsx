import { FileMagnifyingGlass, Key, Scales, ShieldCheck } from '@phosphor-icons/react/ssr';

const CAPABILITIES = [
  {
    icon: ShieldCheck,
    title: 'Coverage procurement',
    body: 'Quote published products, read the terms, exclusions and deductible, then bind from your own wallet. A quote never reserves pool capital.',
    detail: ['Quote', 'Accept', 'Authorize', 'Reconcile'],
  },
  {
    icon: Key,
    title: 'Delegated authority',
    body: 'Give an agent a scoped delegation with a limit cap, premium allowance and expiry, and revoke it at any time. Registering an agent grants it nothing.',
    detail: ['Scope', 'Allowance', 'Expiry', 'Revoke'],
  },
  {
    icon: FileMagnifyingGlass,
    title: 'Evidence-backed claims',
    body: 'Claims move on records an agent can prove: linked transactions, uploaded files and answers to the specific questions a reviewer asks.',
    detail: ['Incident', 'Evidence', 'Requests', 'Provenance'],
  },
  {
    icon: Scales,
    title: 'Controlled settlement',
    body: 'An authorized person decides every claim. Reimbursement happens only after a settlement receipt is confirmed on Arc.',
    detail: ['Advisory', 'Decision', 'Authority', 'Receipt'],
  },
] as const;

export function Capabilities() {
  return (
    <section id="capabilities" className="marketing-band scroll-mt-16 bg-white">
      <div className="marketing-wrap">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
          <h2 className="section-title max-w-[16ch] text-[var(--ink)]">
            Coverage, authority and claims in one record.
          </h2>
          <p className="marketing-lede lg:pb-1.5">
            Each policy carries its terms, the agent it insures, who may act for it, and every claim
            filed against it, so operators and reviewers work from the same facts.
          </p>
        </div>

        <ul className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map(({ icon: Icon, title, body, detail }) => (
            <li
              key={title}
              className="group flex flex-col bg-white p-6 transition-colors duration-200 hover:bg-[#f7fafa] sm:p-7"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-signal)] transition-transform duration-200 group-hover:-translate-y-0.5">
                <Icon size={21} weight="duotone" aria-hidden="true" />
              </span>
              <h3 className="mt-6 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--ink-secondary)]">{body}</p>
              <p className="mt-auto flex flex-wrap gap-1.5 pt-6" aria-label={`${title} stages`}>
                {detail.map((step) => (
                  <span key={step} className="rounded-md bg-[var(--surface-inset)] px-2 py-1 text-xs font-medium text-[var(--ink-muted)]">
                    {step}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
