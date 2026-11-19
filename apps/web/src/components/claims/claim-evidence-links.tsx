import {
  actorLabel,
  evidenceAnchor,
  resolveEvidenceTargets,
  type EvidenceTarget,
} from '@/lib/claims/investigation-presentation';

export function ClaimEvidenceLinks({
  references,
  targets,
  kind,
  label = 'Source references',
}: {
  references: unknown;
  targets: readonly EvidenceTarget[];
  kind?: string;
  label?: string;
}) {
  const matches = resolveEvidenceTargets(references, targets, kind);
  if (!matches.length) return null;
  return (
    <div className="mt-2 text-xs">
      <p className="font-medium">{label}</p>
      <ul className="flex flex-wrap gap-x-3">
        {matches.map((record, index) => (
          <li key={record?.id ?? index}>
            {record ? (
              <a
                href={`#${evidenceAnchor(record.kind, record.id)}`}
                className="inline-flex min-h-11 items-center text-sky-800 underline"
                onClick={() =>
                  document.getElementById(evidenceAnchor(record.kind, record.id))?.focus()
                }
              >
                {record.label} · {record.id.slice(0, 12)}
                {record.stale ? ' · Earlier evidence context' : ''}
              </a>
            ) : (
              <span className="inline-flex min-h-11 items-center text-zinc-600">
                Reference unavailable in this case
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ClaimEventMetadata({ actor, timestamp }: { actor?: string; timestamp?: string }) {
  return (
    <p className="text-xs text-zinc-600">
      {actor ? (
        <>
          {actorLabel(actor)} · <span className="font-mono">{actor}</span>
        </>
      ) : (
        'Actor unavailable'
      )}
      {timestamp ? (
        <>
          {' '}
          · <time dateTime={timestamp}>{timestamp}</time>
        </>
      ) : (
        ' · Time unavailable'
      )}
    </p>
  );
}
