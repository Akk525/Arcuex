const POINTS = [
  {
    title: 'Arc Testnet',
    body: 'Connectivity and settlement paths target Arc Testnet today. There is no mainnet insurance issuance in this product surface.',
  },
  {
    title: 'Injected wallets',
    body: 'Browser wallets connect through injected providers. Arcuex never collects or transmits private keys or seed phrases.',
  },
  {
    title: 'Explicit approval',
    body: 'On-chain transfers require a user-confirmed wallet approval. Nothing is broadcast from a background click.',
  },
  {
    title: 'Truth labels',
    body: 'Synthetic ledger data is demo underwriting, not a financial-event proof. QuickNode provides RPC infrastructure — RPC usage alone is not a Streams integration claim.',
  },
] as const;

export function TrustSection() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-16">
        <div>
          <h2 className="marketing-display text-2xl text-[var(--ink)] sm:text-3xl">
            Trust and infrastructure
          </h2>
          <p className="mt-3 max-w-[36ch] text-sm leading-relaxed text-[var(--ink-muted)] sm:text-base">
            Institutional controls first. Labels stay literal so demo and live paths cannot be
            confused.
          </p>
        </div>
        <ul className="grid gap-0 sm:grid-cols-2">
          {POINTS.map((point) => (
            <li
              key={point.title}
              className="border-t border-[var(--line)] py-5 sm:odd:pr-6 sm:even:border-l sm:even:pl-6"
            >
              <h3 className="text-sm font-semibold text-[var(--ink)]">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-secondary)]">{point.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
