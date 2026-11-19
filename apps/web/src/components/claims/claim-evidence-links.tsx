import {
  actorLabel,
  evidenceAnchor,
  resolveEvidenceTargets,
  type EvidenceTarget,
} from '@/lib/claims/investigation-presentation';

export function openClaimRecord(anchor: string) {
  const target = document.getElementById(anchor);
  if (!target) return;
  for (
    let parent = target.parentElement?.closest('details');
    parent;
    parent = parent.parentElement?.closest('details')
  ) {
    parent.open = true;
  }
  target.focus();
  target.scrollIntoView({ block: 'nearest' });
}

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
                className="inline-flex min-h-11 items-center text-[var(--accent)] underline"
                onClick={() => openClaimRecord(evidenceAnchor(record.kind, record.id))}
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
          ·{' '}
          <time className="tabular-nums" dateTime={timestamp}>
            {timestamp}
          </time>
        </>
      ) : (
        ' · Time unavailable'
      )}
    </p>
  );
}
