import { ArrowElbowDownRight } from '@phosphor-icons/react/ssr';
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

/** Citations to exact records in this case. Unknown references are shown as unavailable, never guessed. */
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
    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
      <span className="text-[var(--ink-muted)]">{label}</span>
      <ul className="contents">
        {matches.map((record, index) => (
          <li key={record?.id ?? index}>
            {record ? (
              <a
                href={`#${evidenceAnchor(record.kind, record.id)}`}
                className="citation"
                data-stale={record.stale || undefined}
                onClick={() => openClaimRecord(evidenceAnchor(record.kind, record.id))}
              >
                <ArrowElbowDownRight size={11} weight="bold" aria-hidden="true" />
                {record.label}
                <span className="font-mono text-[0.6875rem] opacity-70">
                  {record.id.slice(0, 8)}
                </span>
                {record.stale ? <span className="text-[var(--warn)]">earlier context</span> : null}
              </a>
            ) : (
              <span className="citation" data-missing>
                Reference unavailable in this case
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const timeFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  hourCycle: 'h23',
});

export function formatClaimTime(timestamp: string) {
  const t = Date.parse(timestamp);
  return Number.isFinite(t) ? `${timeFormat.format(t)} UTC` : timestamp;
}

export function ClaimEventMetadata({ actor, timestamp }: { actor?: string; timestamp?: string }) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--ink-muted)]">
      {actor ? (
        <>
          <span className="font-medium text-[var(--ink-secondary)]">{actorLabel(actor)}</span>
          <span className="max-w-[16rem] truncate font-mono text-[0.6875rem]" title={actor}>
            {actor}
          </span>
        </>
      ) : (
        <span>Actor unavailable</span>
      )}
      <span aria-hidden="true">·</span>
      {timestamp ? (
        <time className="tabular-nums" dateTime={timestamp} title={timestamp}>
          {formatClaimTime(timestamp)}
        </time>
      ) : (
        <span>Time unavailable</span>
      )}
    </p>
  );
}
