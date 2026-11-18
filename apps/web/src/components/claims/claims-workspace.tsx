'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClaimsAuthPanel } from '@/components/claims/claims-auth-panel';
import { ClaimsCaseList } from '@/components/claims/claims-case-list';
import { ClaimsPanel } from '@/components/claims/claims-panel';
import { HistoricSettlementPanel } from '@/components/claims/historic-settlement-panel';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { useWorkspace } from '@/components/workspace-provider';

export function ClaimsWorkspace() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const showOpsPanels = workspace === 'ops';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Claims"
        title="Claims investigation"
        description="Track case stages, evidence provenance, and loss calculations. REVIEW is not approval. Payment language applies only after a verified settlement receipt."
        action={
          <Button onClick={() => router.push('/claims/new')}>Submit claim</Button>
        }
      />

      <Callout kind="synthetic" title="Synthetic evidence is labeled">
        Fixture evidence proves workflow consistency only. It is not independent loss proof and cannot
        authorize reimbursement by itself.
      </Callout>

      <ClaimsAuthPanel />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ClaimsCaseList />
        <div className="space-y-4">
          <HistoricSettlementPanel />
          <Panel title="Trust boundaries">
            <ul className="list-disc space-y-2 pl-5 text-sm text-[var(--ink-muted)]">
              <li>
                Evidence authenticity, coverage, net-loss, and settlement authorization are separate
                determinations — never one boolean.
              </li>
              <li>
                REVIEW has zero authorized payout until resolved. AI majority votes cannot authorize
                settlement.
              </li>
              <li>This UI prepares settlements only; it does not broadcast on-chain transfers.</li>
            </ul>
          </Panel>
          {showOpsPanels ? (
            <ClaimsPanel />
          ) : (
            <Callout kind="info" title="Legacy ledger">
              Read-only legacy ledger tools live in the Ops workspace and require a reviewer or
              authority session.{' '}
              <Link href="/claims/review" className="underline">
                Open review queue
              </Link>{' '}
              after switching to Ops.
            </Callout>
          )}
        </div>
      </div>
    </div>
  );
}
