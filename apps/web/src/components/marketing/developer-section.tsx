'use client';

import Link from 'next/link';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowRight, Check } from '@phosphor-icons/react';

const K = ({ children }: { children: ReactNode }) => <span className="tk-k">{children}</span>;
const S = ({ children }: { children: ReactNode }) => <span className="tk-s">{children}</span>;
const F = ({ children }: { children: ReactNode }) => <span className="tk-f">{children}</span>;
const C = ({ children }: { children: ReactNode }) => <span className="tk-c">{children}</span>;

/** Samples mirror the real @arcuex/agent-sdk HTTP clients (packages/agent-sdk/src). */
const SAMPLES: Array<{ id: string; label: string; file: string; code: ReactNode }> = [
  {
    id: 'procure',
    label: 'Procure coverage',
    file: 'procure.ts',
    code: (
      <>
        <K>import</K> {'{ ProcurementApiClient }'} <K>from</K> <S>{"'@arcuex/agent-sdk'"}</S>;{'\n\n'}
        <K>const</K> arcuex = <K>new</K> <F>ProcurementApiClient</F>({'{ baseUrl }'});{'\n'}
        <C>{'// Your wallet signs; the client never holds keys.'}</C>{'\n'}
        <K>await</K> arcuex.<F>authenticate</F>(address, signMessage);{'\n\n'}
        <K>const</K> catalog = <K>await</K> arcuex.<F>products</F>();{'\n'}
        <K>const</K> {'{ policy, transactions }'} = <K>await</K> arcuex.<F>procure</F>({'{'}{'\n'}
        {'  '}quoteId, acceptedDigest, delegationId,{'\n'}
        {'}'});{'\n'}
        <C>{'// transactions: prepared approve + bind for wallet approval'}</C>
      </>
    ),
  },
  {
    id: 'claim',
    label: 'File a claim',
    file: 'claim.ts',
    code: (
      <>
        <K>import</K> {'{ ClaimsApiClient }'} <K>from</K> <S>{"'@arcuex/agent-sdk'"}</S>;{'\n\n'}
        <K>const</K> claims = <K>new</K> <F>ClaimsApiClient</F>({'{ baseUrl, agentId }'});{'\n'}
        <K>await</K> claims.<F>authenticate</F>(wallet, signMessage);{'\n\n'}
        <K>const</K> {'{ case: claim }'} = <K>await</K> claims.<F>submitClaim</F>({'{'}{'\n'}
        {'  '}policyId, exposureId, idempotencyKey,{'\n'}
        {'  '}observedEventRef, observedAt,{'\n'}
        {'}'});{'\n\n'}
        <C>{'// Then answer reviewer requests with evidence'}</C>{'\n'}
        <K>await</K> claims.<F>investigation</F>(claim.id);
      </>
    ),
  },
];

const FACTS = [
  'Quote, accept and procure within a delegation',
  'Submit claims and evidence as the insured agent',
  'External signing only: no private keys in the SDK',
] as const;

export function DeveloperSection() {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const sample = SAMPLES[active] ?? SAMPLES[0]!;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (active + (event.key === 'ArrowRight' ? 1 : -1) + SAMPLES.length) % SAMPLES.length;
    setActive(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  };

  return (
    <section id="developers" className="dev-band marketing-band scroll-mt-16">
      <div className="marketing-wrap relative z-10 grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16">
        <div>
          <p className="section-kicker !text-[#7fd6d0]">For developers</p>
          <h2 className="section-title max-w-[13ch] text-white">Integrate insurance into your agent.</h2>
          <p className="mt-5 max-w-[46ch] text-[1.0625rem] leading-relaxed text-[#b8d3d2]">
            A typed TypeScript SDK lets an agent buy coverage within the authority you delegate,
            file claims and answer evidence requests.
          </p>
          <ul className="mt-8 grid gap-3">
            {FACTS.map((fact) => (
              <li key={fact} className="flex items-start gap-3 text-[0.9375rem] text-[#dbecea]">
                <Check size={16} weight="bold" className="mt-1 shrink-0 text-[#5ec4c8]" aria-hidden="true" />
                {fact}
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/integrations" className="marketing-cta !bg-white !text-[var(--accent)] hover:!bg-[#e6f3f2]">
              View integration guide
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
            <Link
              href="/agent"
              className="marketing-cta-secondary !border-white/20 !bg-transparent !text-white hover:!bg-white/10"
            >
              Register an agent
            </Link>
          </div>
          <p className="mt-6 text-xs text-[#86a7a8]">
            Ships as a workspace package in the Arcuex repository. Not yet published to npm.
          </p>
        </div>

        <div className="code-window">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4">
            <div role="tablist" aria-label="SDK examples" className="flex gap-5" onKeyDown={onKeyDown}>
              {SAMPLES.map((item, i) => (
                <button
                  key={item.id}
                  id={`${baseId}-tab-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={i === active ? 0 : -1}
                  className="code-tab"
                  onClick={() => setActive(i)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className="hidden font-mono text-xs text-white/40 sm:inline">{sample.file}</span>
          </div>
          <pre id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`} tabIndex={0}>
            <code>{sample.code}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
