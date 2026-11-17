import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ClaimsAuthPanel } from '@/components/claims/claims-auth-panel';
import { ClaimsCaseList } from '@/components/claims/claims-case-list';
import { ClaimsPanel } from '@/components/claims/claims-panel';
import { HistoricSettlementPanel } from '@/components/claims/historic-settlement-panel';
import { Panel } from '@/components/panel';

export default function ClaimsPage() {
  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600">
          Claims investigation & adjudication (ClaimsCase v1). Synthetic fixtures are labeled.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link href="/claims/new" className="rounded-md bg-zinc-900 px-3 py-1.5 text-white">
            Submit claim
          </Link>
          <Link
            href="/claims/review"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5"
          >
            Reviewer workbench
          </Link>
        </div>
      </div>
      <div className="mb-4">
        <ClaimsAuthPanel />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ClaimsCaseList />
        <div className="space-y-4">
          <HistoricSettlementPanel />
          <Panel title="Trust boundaries">
            <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600">
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
          <ClaimsPanel />
        </div>
      </div>
    </AppShell>
  );
}
