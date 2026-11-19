import {
  examinerExecutionLabel,
  type EvidenceTarget,
} from '@/lib/claims/investigation-presentation';
import { ClaimEvidenceLinks } from './claim-evidence-links';
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
      <h4 className="font-medium">{title}</h4>
      <ul className="list-disc pl-5">
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
    <div className="mt-3 space-y-2">
      <p className="font-semibold">{examinerExecutionLabel(p.execution, p.provider)}</p>
      <p className="text-xs text-zinc-600">
        Model {String(p.model ?? 'unavailable')} · Prompt {String(p.promptVersion ?? 'unavailable')}
      </p>
      {entry.stale && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
          {open
            ? 'STALE DOSSIER — reassess before adopting a request.'
            : 'Historical assessment from an earlier dossier.'}
        </p>
      )}
      {analysis && (
        <>
          {analysis.chronology === undefined && (
            <p className="text-xs">
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
          <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
            <h4 className="font-medium">AI interpretation · advisory</h4>
            <p className="whitespace-pre-wrap">{analysis.summary}</p>
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
                <h4 className="font-medium">Proposed next actions</h4>
                {analysis.recommendation && <p>Recommendation: {analysis.recommendation}</p>}
                {analysis.proposedRequests?.map((proposal, index) => (
                  <div key={index} className="mt-2 border-t border-zinc-200 pt-2">
                    <p>
                      Proposed proof: {typeof proposal === 'string' ? proposal : proposal.question}
                    </p>
                    {typeof proposal !== 'string' && (
                      <ClaimEvidenceLinks references={proposal.citations} targets={targets} />
                    )}
                    {mayAdopt &&
                      open &&
                      analysis.chronology !== undefined &&
                      typeof proposal !== 'string' && (
                        <button
                          type="button"
                          disabled={busy || entry.stale}
                          className="rounded border px-3 py-1 text-xs disabled:opacity-50"
                          onClick={() => onAdopt(index)}
                        >
                          Adopt evidence request {index + 1}
                        </button>
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
      <details className="text-xs">
        <summary className="inline-flex min-h-11 cursor-pointer items-center underline">
          Assessment record
        </summary>
        <p>Dossier {String(p.dossierDigest ?? 'unavailable')}</p>
        <p>Response {String(p.responseId ?? 'unavailable')}</p>
      </details>
    </div>
  );
}
