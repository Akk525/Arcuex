'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Panel } from '@/components/panel';
import { CaseStatusBadge } from '@/components/claims/case-status-badge';
import { StatusBadge } from '@/components/status-badge';
import { claimsFetch } from '@/lib/claims/claims-api';
import {
  claimsNetworkFailure,
  parseClaimsCaseListPayload,
  readClaimsClientResponse,
  type ClaimsCaseListRow,
} from '@/lib/claims/claims-client-response';
import { queueSections, type QueueSection } from '@/lib/claims/investigation-presentation';

export function ReviewerWorkbench() {
  const [cases, setCases] = useState<ClaimsCaseListRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await claimsFetch('reviewer', '/api/claims/cases?view=workbench');
      const result = await readClaimsClientResponse(res, (payload) => {
        const rows = parseClaimsCaseListPayload(payload);
        return rows?.every((row) => row.triage) ? rows : null;
      });
      if (!result.ok) {
        setCases([]);
        setError(
          result.kind === 'unauthorized' || result.kind === 'forbidden'
            ? 'Sign in with a reviewer or settlement authority session to open the queue.'
            : result.message,
        );
        return;
      }
      setCases(result.data);
    } catch (error) {
      setCases([]);
      setError(claimsNetworkFailure(error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = (Object.keys(queueSections) as QueueSection[]).map((section) => ({
    section,
    rows: cases.filter((claim) => claim.triage?.section === section),
  }));
  const activeGroups = groups.filter(({ rows }) => rows.length > 0);

  return (
    <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
      <Panel title="Reviewer workbench">
        <p className="text-sm text-zinc-600">
          Open a case to see the permitted actions and current evidence.
        </p>
        <button
          type="button"
          className="mt-3 min-h-11 rounded border px-3 text-sm"
          onClick={() => void load()}
          disabled={loading}
        >
          {error ? 'Retry review queue' : 'Refresh review queue'}
        </button>
        {loading && (
          <p role="status" className="mt-3 text-sm text-zinc-600">
            Loading review queue…
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        {!loading && !error && !cases.length && (
          <p className="mt-3 text-sm text-zinc-600">Review queue empty.</p>
        )}
        {!loading && !error && activeGroups.length > 0 && (
          <nav aria-label="Review queue sections" className="mt-3 flex flex-wrap gap-x-4">
            {activeGroups.map(({ section, rows }) => (
              <a
                className="inline-flex min-h-11 items-center text-sm text-sky-800 underline"
                key={section}
                href={`#queue-${section}`}
              >
                {queueSections[section]} ({rows.length})
              </a>
            ))}
          </nav>
        )}
      </Panel>
      {!loading &&
        !error &&
        activeGroups.map(({ section, rows }) => (
          <section id={`queue-${section}`} key={section} className="scroll-mt-4">
            <Panel title={queueSections[section]}>
              <ul className="divide-y divide-zinc-200">
                {rows.map((c) => (
                  <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CaseStatusBadge status={c.status} />
                      {c.syntheticDemo && <StatusBadge label="SYNTHETIC FIXTURE" tone="warn" />}
                    </div>
                    <p className="mt-2 text-sm">{c.triage?.reason}</p>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 text-xs">
                      <Link
                        href={`/claims/${encodeURIComponent(c.id)}`}
                        className="inline-flex min-h-11 items-center text-sky-800 underline"
                        aria-label={`Open claim ${c.id}`}
                      >
                        Open case · {c.id.slice(0, 12)}
                      </Link>
                      <time dateTime={c.updatedAt} className="text-zinc-600">
                        Updated {c.updatedAt}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </section>
        ))}
    </div>
  );
}
