import { Broadcast, Fingerprint, HandPalm, Tag } from '@phosphor-icons/react/ssr';

const POINTS = [
  {
    icon: Broadcast,
    title: 'Arc Testnet',
    body: 'Connectivity and settlement target Arc Testnet (chain 5042002) today. There is no mainnet insurance issuance.',
  },
  {
    icon: Fingerprint,
    title: 'Your wallet, your keys',
    body: 'Browser wallets connect through injected providers. Arcuex never collects, stores or transmits private keys or seed phrases.',
  },
  {
    icon: HandPalm,
    title: 'Explicit approval',
    body: 'Every on-chain transfer waits for you to confirm it in your wallet. Nothing is broadcast from a background action.',
  },
  {
    icon: Tag,
    title: 'Literal labels',
    body: 'Synthetic underwriting is labeled synthetic and is not proof of a financial event. QuickNode serves RPC reads; that alone is not a Streams integration.',
  },
] as const;

export function TrustSection() {
  return (
    <section id="trust" className="marketing-band scroll-mt-16 border-t border-[var(--line)] bg-white">
      <div className="marketing-wrap grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div>
          <h2 className="section-title max-w-[12ch] text-[var(--ink)]">Built to be checked, not trusted.</h2>
          <p className="marketing-lede mt-5 max-w-[40ch]">
            The controls are part of the product. Demo and live paths are always labeled, so
            nobody mistakes one for the other.
          </p>
        </div>
        <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="border-t border-[var(--line-strong)] pt-6">
              <Icon size={22} weight="duotone" className="text-[var(--accent-signal)]" aria-hidden="true" />
              <h3 className="mt-4 font-display text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--ink)]">{title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--ink-secondary)]">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
