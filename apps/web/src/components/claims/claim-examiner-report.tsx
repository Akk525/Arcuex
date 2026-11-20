import {
  examinerExecutionLabel,
  type EvidenceTarget,
} from '@/lib/claims/investigation-presentation';
import { ClaimEvidenceLinks } from './claim-evidence-links';
import { TruthBadge } from '@/components/ui/truth-badge';
import { Button } from '@/components/ui/button';
import type { getClaimsInvestigation } from '@arcuex/insurance';

type Entry = ReturnType<typeof getClaimsInvestigation>['entries'][number];
type Analysis = {
  summary?: string;
  chronology?: string;
  verifiedFindings?: string[];
  claimantAssertions?: string[];
  gaps?: string[];
  proposedRequests?: Array<string | { question: string; citations: string[] }>;
  recommendation?: string;
  citations?: string[];
};

function FindingsList({ title, items }: { title: string; items?: string[] }) {
  return Array.isArray(items) && items.length > 0 ? (
    <div className="mt-3">
      <h4 className="text-xs font-semibold text-[var(--ink-secondary)]">{title}</h4>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 marker:text-[var(--ink-faint)]">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  ) : null;
}

export function ClaimExaminerReport({
  entry,
  targets,
  mayAdopt,
  open,
  busy,
  onAdopt,
}: {
  entry: Entry;
  targets: readonly EvidenceTarget[];
  mayAdopt: boolean;
  open: boolean;
  busy: boolean;
  onAdopt: (index: number) => void;
}) {
  const p = entry.payload;
  const analysis = p.analysis as Analysis | undefined;
  return (
    <div className="mt-2 space-y-2 text-[0.8125rem]">
      <div className="flex flex-wrap gap-1.5">
        <TruthBadge
          label="AI advice · never authorizes an action"
          tone="ai"
          title="Never authorizes payout"
        />
        <TruthBadge
          label={examinerExecutionLabel(p.execution, p.provider)}
          tone={String(p.execution).includes('live') ? 'live' : 'neutral'}
        />
      </div>
      <p className="text-xs text-[var(--ink-muted)]">
        Model {String(p.model ?? 'unavailable')} · Prompt {String(p.promptVersion ?? 'unavailable')}
      </p>
      {entry.stale && (
        <p className="rounded-[var(--radius-sm)] bg-[var(--warn-soft)] px-2.5 py-1.5 text-xs font-medium text-[var(--warn)]">
          {open
            ? 'Stale dossier. Reassess before adopting a request.'
            : 'Historical assessment from an earlier dossier.'}
        </p>
      )}
      {analysis && (
        <>
          {analysis.chronology === undefined && (
            <p className="text-xs text-[var(--ink-muted)]">
              Historical advisory report recorded before the chronology gate.
            </p>
          )}
          {analysis.chronology !== undefined && (
            <ClaimEvidenceLinks
              references={analysis.verifiedFindings}
              targets={targets}
              kind="verification"
              label="Referenced verifier records"
            />
          )}
          <div className="rounded-[var(--radius)] border border-[#d6e0e9] bg-[var(--surface)] p-3">
            <h4 className="text-xs font-semibold text-[var(--ai)]">AI interpretation · advisory</h4>
            <p className="mt-1 leading-relaxed whitespace-pre-wrap text-[var(--ink)]">
              {analysis.summary}
            </p>
            <FindingsList
              title="Claimant assertions reported by the examiner"
              items={analysis.claimantAssertions}
            />
            {analysis.chronology === undefined && (
              <FindingsList title="Historical model commentary" items={analysis.verifiedFindings} />
            )}
            <FindingsList title="Unresolved evidence gaps" items={analysis.gaps} />
            {(analysis.recommendation || analysis.proposedRequests?.length) && (
              <div className="mt-3">
                <h4 className="text-xs font-semibold text-[var(--ink-secondary)]">
                  Proposed next actions
                </h4>
                {analysis.recommendation && (
                  <p className="mt-1 text-[var(--ink-secondary)]">
                    Suggests: {analysis.recommendation.replaceAll('_', ' ')}. A human decides
                    whether to act.
                  </p>
                )}
                {analysis.proposedRequests?.map((proposal, index) => (
                  <div key={index} className="mt-2 border-t border-[var(--line)] pt-2">
                    <p className="text-[var(--ink)]">
                      Proposed proof: {typeof proposal === 'string' ? proposal : proposal.question}
                    </p>
                    {typeof proposal !== 'string' && (
                      <ClaimEvidenceLinks references={proposal.citations} targets={targets} />
                    )}
                    {mayAdopt &&
                      open &&
                      analysis.chronology !== undefined &&
                      typeof proposal !== 'string' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-2"
                          disabled={busy || entry.stale}
                          onClick={() => onAdopt(index)}
                        >
                          Adopt evidence request {index + 1}
                        </Button>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <ClaimEvidenceLinks
            references={analysis.citations}
            targets={targets}
            label="Examiner citations"
          />
        </>
      )}
      <details className="record-details">
        <summary>Assessment record</summary>
        <pre>
          {`Dossier ${String(p.dossierDigest ?? 'unavailable')}\nResponse ${String(p.responseId ?? 'unavailable')}`}
        </pre>
      </details>
    </div>
  );
}
