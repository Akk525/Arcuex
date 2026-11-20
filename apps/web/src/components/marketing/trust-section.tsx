import { Broadcast, Fingerprint, HandPalm, Receipt, Sparkle, Tag } from '@phosphor-icons/react/ssr';

/** Each row states a control, what it guarantees, and where it is enforced in this build. */
const CONTROLS = [
  {
    icon: HandPalm,
    control: 'Wallet approval',
    guarantee: 'Every on-chain transfer waits for you to confirm it in your own wallet.',
    enforced: 'Arcuex prepares transactions; only your wallet can send them.',
  },
  {
    icon: Fingerprint,
    control: 'No custody of keys',
    guarantee: 'Arcuex never collects, stores or transmits private keys or seed phrases.',
    enforced: 'The app and SDK accept external signers only.',
  },
  {
    icon: Sparkle,
    control: 'AI is advisory',
    guarantee: 'The examiner can summarize evidence. It cannot approve a claim or move funds.',
    enforced: 'Decisions require an authorized reviewer and a separate settlement authority.',
  },
  {
    icon: Receipt,
    control: 'Paid means receipted',
    guarantee: 'A claim reads as paid only once a settlement receipt is confirmed.',
    enforced: 'Payment status is derived from the Arc Testnet receipt, not from the decision.',
  },
  {
    icon: Tag,
    control: 'Literal labels',
    guarantee: 'Synthetic underwriting and test-double inference are always labeled as such.',
    enforced: 'Synthetic records are flagged in storage and carried into every view.',
  },
  {
    icon: Broadcast,
    control: 'Testnet scope',
    guarantee: 'Coverage and settlement target Arc Testnet (chain 5042002). No mainnet issuance.',
    enforced: 'Wallet steps check the chain before any transaction is prepared.',
  },
] as const;

export function TrustSection() {
  return (
    <section id="trust" className="marketing-band scroll-mt-16 border-t border-[var(--line)] bg-white">
      <div className="marketing-wrap">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
          <h2 className="section-title max-w-[13ch] text-[var(--ink)]">Built to be checked, not trusted.</h2>
          <p className="marketing-lede lg:pb-1.5">
            The controls are part of the product. Here is each one, what it guarantees, and where
            this build enforces it.
          </p>
        </div>

        <div className="mt-14 overflow-hidden rounded-2xl border border-[var(--line)]">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,0.75fr)_minmax(0,1.2fr)_minmax(0,1.1fr)] gap-8 border-b border-[var(--line)] bg-[var(--paper)] px-7 py-3 text-xs font-medium text-[var(--ink-muted)] md:grid"
          >
            <span>Control</span>
            <span>Guarantee</span>
            <span>Where it is enforced</span>
          </div>
          <dl className="divide-y divide-[var(--line)]">
            {CONTROLS.map(({ icon: Icon, control, guarantee, enforced }) => (
              <div
                key={control}
                className="grid gap-2 px-5 py-5 transition-colors duration-200 hover:bg-[#fafcfc] sm:px-7 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.2fr)_minmax(0,1.1fr)] md:gap-8"
              >
                <dt className="flex items-center gap-3 font-display text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--ink)]">
                  <Icon size={20} weight="duotone" className="shrink-0 text-[var(--accent-signal)]" aria-hidden="true" />
                  {control}
                </dt>
                <dd className="text-[0.9375rem] leading-relaxed text-[var(--ink-secondary)] md:pt-0.5">{guarantee}</dd>
                <dd className="flex gap-2 text-sm leading-relaxed text-[var(--ink-muted)] md:pt-0.5">
                  <span className="font-medium text-[var(--ink-secondary)] md:hidden">Enforced:</span>
                  {enforced}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
