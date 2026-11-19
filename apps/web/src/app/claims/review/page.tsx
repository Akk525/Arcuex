import Link from 'next/link';
import { ClaimsAuthPanel } from '@/components/claims/claims-auth-panel';
import { AppShell } from '@/components/app-shell';
import { ReviewerWorkbench } from '@/components/claims/reviewer-workbench';
import { PageHeader } from '@/components/ui/page-header';
import { Callout } from '@/components/ui/callout';

export default function ClaimsReviewPage() {
  return (
    <AppShell>
      <div className="mb-3">
        <Link href="/claims" className="text-xs text-[var(--accent)] underline">
          ← My claims
        </Link>
      </div>
      <PageHeader
        eyebrow="Ops"
        title="Reviewer workbench"
        description="Triage open claims, review linked evidence and track payment handoffs. Use a provisioned ops session to open the queue."
      />
      <Callout kind="warn" title="Role-gated">
        Settlement preparation does not broadcast transfers. Server authorization decides access.
      </Callout>
      <div className="mt-6 space-y-4">
        <ClaimsAuthPanel ops />
        <ReviewerWorkbench />
      </div>
    </AppShell>
  );
}
