'use client';

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { TruthBadge } from '@/components/ui/truth-badge';
import {
  PRODUCT_STAGE_CHAPTERS,
  chapterIndexForProgress,
  type ProductStageChapter,
  type ProductStageVignette,
} from '@/components/marketing/product-stage-chapters';

const chapterCount = PRODUCT_STAGE_CHAPTERS.length;

export function ProductStage() {
  const [index, setIndex] = useState(0);
  const baseId = useId();

  useEffect(() => {
    const el = document.getElementById('product-stage-scrub');
    if (!el) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      if (el.getClientRects().length === 0) return;
      const rect = el.getBoundingClientRect();
      const scrollable = el.offsetHeight - window.innerHeight;
      const traveled = -rect.top;
      const progress = scrollable <= 0 ? 0 : Math.min(1, Math.max(0, traveled / scrollable));
      const next = chapterIndexForProgress(progress);
      setIndex((current) => (current === next ? current : next));
    };
    const onScroll = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  const active = PRODUCT_STAGE_CHAPTERS[index] ?? PRODUCT_STAGE_CHAPTERS[0];

  return (
    <>
      <div className="product-stage-fallback mx-auto w-full max-w-6xl px-5 py-[clamp(3rem,8vw,6rem)] sm:px-8">
        <ChapterTabs baseId={baseId} index={index} onSelect={setIndex} />
        <div
          id={`${baseId}-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${active.id}`}
          className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-16"
        >
          <StageFrame>
            <Vignette kind={active.vignette} />
          </StageFrame>
          <ChapterCopy chapter={active} index={index} />
        </div>
      </div>

      <div className="product-stage-scrub">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-5 py-[clamp(3rem,8vw,6rem)] sm:px-8 lg:hidden">
          {PRODUCT_STAGE_CHAPTERS.map((chapter, chapterIndex) => (
            <article key={chapter.id} className="grid gap-6">
              <StageFrame>
                <Vignette kind={chapter.vignette} />
              </StageFrame>
              <ChapterCopy chapter={chapter} index={chapterIndex} />
            </article>
          ))}
        </div>

        <div
          id="product-stage-scrub"
          className="mx-auto hidden w-full max-w-6xl px-5 sm:px-8 lg:grid lg:h-[300vh] lg:grid-cols-2 lg:gap-x-16"
        >
          <div>
            <div className="h-24" aria-hidden />
            <div className="sticky top-24 self-start">
              <StageFrame>
                <div key={active.vignette} className="product-stage-morph">
                  <Vignette kind={active.vignette} />
                </div>
              </StageFrame>
            </div>
          </div>
          <div>
            <div className="h-24" aria-hidden />
            <div className="sticky top-24">
              <ol aria-label="Coverage lifecycle" className="flex max-w-[38rem] flex-col">
                {PRODUCT_STAGE_CHAPTERS.map((chapter, chapterIndex) => {
                  const shown = chapterIndex === index;
                  return (
                    <li
                      key={chapter.id}
                      aria-current={shown ? 'step' : undefined}
                      className={`border-l py-3 pl-5 ${
                        shown ? 'border-[var(--accent)]' : 'border-[var(--line)]'
                      }`}
                    >
                      <h2
                        className={`text-lg font-semibold tracking-tight ${
                          shown ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'
                        }`}
                      >
                        <span className="mr-3 font-mono text-sm tabular text-[var(--ink-muted)]">
                          {String(chapterIndex + 1).padStart(2, '0')}
                        </span>
                        {chapter.title}
                      </h2>
                      {shown ? (
                        <p className="mt-3 max-w-[48ch] text-base leading-relaxed text-[var(--ink-secondary)]">
                          {chapter.body}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ChapterTabs({
  baseId,
  index,
  onSelect,
}: {
  baseId: string;
  index: number;
  onSelect: (index: number) => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : event.key === 'Home'
            ? -index
            : event.key === 'End'
              ? chapterCount - 1 - index
              : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (index + delta + chapterCount) % chapterCount;
    const chapter = PRODUCT_STAGE_CHAPTERS[next];
    if (!chapter) return;
    onSelect(next);
    document.getElementById(`${baseId}-tab-${chapter.id}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Coverage lifecycle"
      aria-orientation="horizontal"
      className="flex flex-wrap gap-x-2 gap-y-1"
      onKeyDown={onKeyDown}
    >
      {PRODUCT_STAGE_CHAPTERS.map((chapter, chapterIndex) => {
        const selected = chapterIndex === index;
        return (
          <button
            key={chapter.id}
            id={`${baseId}-tab-${chapter.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${baseId}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(chapterIndex)}
            className={`flex items-baseline gap-2 border-b-2 px-2 py-2 text-left ${
              selected
                ? 'border-[var(--accent)] text-[var(--ink)]'
                : 'border-transparent text-[var(--ink-secondary)]'
            }`}
          >
            <span className="font-mono text-xs tabular text-[var(--ink-muted)]">
              {String(chapterIndex + 1).padStart(2, '0')}
            </span>
            <span className="text-sm font-medium">{chapter.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function ChapterCopy({ chapter, index }: { chapter: ProductStageChapter; index: number }) {
  return (
    <div>
      <p className="font-mono text-sm tabular text-[var(--ink-muted)]">
        {String(index + 1).padStart(2, '0')}
      </p>
      <h2 className="marketing-display mt-3 text-[clamp(1.75rem,3vw,2.5rem)] text-[var(--ink)]">
        {chapter.title}
      </h2>
      <p className="mt-4 max-w-[48ch] text-base leading-relaxed text-[var(--ink-secondary)] sm:text-lg">
        {chapter.body}
      </p>
    </div>
  );
}

function StageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="product-stage">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
        <p className="font-mono text-[0.6875rem] text-[var(--ink-muted)]">AX-DEMO</p>
        <TruthBadge
          label="Synthetic demo UI"
          tone="synthetic"
          title="Illustrative composition. Not a live policy, claim, or payment."
        />
      </div>
      <div className="px-4 py-4 sm:px-5 sm:py-5">{children}</div>
    </div>
  );
}

function Vignette({ kind }: { kind: ProductStageVignette }) {
  switch (kind) {
    case 'procure':
      return <ProcureVignette />;
    case 'bind':
      return <BindVignette />;
    case 'evidence':
      return <EvidenceVignette />;
    case 'review':
      return <ReviewVignette />;
    case 'settlement':
      return <SettlementVignette />;
  }
}

function ProcureVignette() {
  return (
    <div className="flex min-h-[22rem] flex-col">
      <VignetteHeading id="Q-1842" title="Off-chain quote" badge="Priced" tone="pending" />
      <dl className="mt-4">
        <Row label="Product" value="Agent liability" />
        <Row label="Terms" value="Published v3" mono />
        <Row label="Limit" value="250,000.00 USDC" mono />
        <Row label="Duration" value="30 days" mono />
        <Row label="Premium" value="1,840.00 USDC" mono />
      </dl>
      <p className="mt-auto pt-4 text-sm leading-relaxed text-[var(--ink-muted)]">
        Quotes do not reserve pool capital.
      </p>
    </div>
  );
}

function BindVignette() {
  return (
    <div className="flex min-h-[22rem] flex-col">
      <VignetteHeading id="DEL-2201" title="Delegated checkout" badge="Wallet pending" tone="pending" />
      <dl className="mt-4">
        <Row label="Agent" value="ops-07" mono />
        <Row label="Signer" value="0x4c8e…a91e" mono />
        <Row label="Scope" value="Quote and bind" />
        <Row label="Limit cap" value="250,000.00 USDC" mono />
        <Row label="Premium budget" value="2,000.00 USDC" mono />
      </dl>
      <p className="mt-auto border-t border-[var(--line)] pt-3 text-sm leading-relaxed text-[var(--ink-secondary)]">
        Bind stays unconfirmed until the policyholder wallet approves the premium.
      </p>
    </div>
  );
}

function EvidenceVignette() {
  const artifacts = [
    { id: 'EV-09.1', name: 'Transaction log', state: 'Requested', tone: 'pending' as const },
    { id: 'EV-09.2', name: 'Position attestation', state: 'Received', tone: 'ok' as const },
    { id: 'EV-09.3', name: 'Incident disclosure', state: 'Missing', tone: 'warn' as const },
  ];
  return (
    <div className="flex min-h-[22rem] flex-col">
      <VignetteHeading id="CLM-4418" title="Evidence request" badge="Exchange open" tone="pending" />
      <dl className="mt-4">
        <Row label="Asked of" value="agent ops-07" mono />
        <Row label="Window" value="72 hours" mono />
      </dl>
      <ul className="mt-3 border-t border-[var(--line)]">
        {artifacts.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2.5"
          >
            <span className="min-w-0">
              <span className="block font-mono text-[0.6875rem] text-[var(--ink-muted)]">{item.id}</span>
              <span className="block text-sm text-[var(--ink)]">{item.name}</span>
            </span>
            <StatusBadge label={item.state} tone={item.tone} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewVignette() {
  return (
    <div className="flex min-h-[22rem] flex-col">
      <VignetteHeading id="CLM-4418" title="Adjudication queue" badge="Awaiting human" tone="pending" />
      <dl className="mt-4">
        <Row label="Reviewer" value="Unassigned" />
        <Row label="Advisory" value="Partial limit noted" />
        <Row label="Decision" value="Not recorded" />
      </dl>
      <div className="mt-auto border border-[var(--line)] bg-[var(--surface-inset)] px-3 py-3">
        <TruthBadge label="AI advice" tone="ai" title="Never authorizes payout" />
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-secondary)]">
          The note is advisory. It does not approve or pay the claim.
        </p>
      </div>
    </div>
  );
}

function SettlementVignette() {
  return (
    <div className="flex min-h-[22rem] flex-col">
      <VignetteHeading id="CLM-4418" title="Settlement record" badge="Not paid" tone="warn" />
      <dl className="mt-4">
        <Row label="Decision" value="Approved" />
        <Row label="Paid" value="No" mono />
        <Row label="Live path" value="Wallet confirmation" />
        <Row label="This ledger" value="Synthetic record" />
      </dl>
      <div className="mt-auto border border-[var(--line-strong)] bg-[var(--warn-soft)] px-3 py-3">
        <p className="text-sm font-semibold text-[var(--ink)]">Approved ≠ paid</p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--ink-secondary)]">
          On the live path, wallet confirmation is still required. This record is not a
          financial-event proof.
        </p>
      </div>
    </div>
  );
}

function VignetteHeading({
  id,
  title,
  badge,
  tone,
}: {
  id: string;
  title: string;
  badge: string;
  tone: 'pending' | 'warn' | 'ok';
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-xs text-[var(--ink-muted)]">{id}</p>
        <h3 className="mt-1 text-base font-semibold tracking-tight text-[var(--ink)]">{title}</h3>
      </div>
      <StatusBadge label={badge} tone={tone} />
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-2.5">
      <dt className="text-sm text-[var(--ink-muted)]">{label}</dt>
      <dd className={`text-right text-sm text-[var(--ink)] ${mono ? 'font-mono tabular' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
