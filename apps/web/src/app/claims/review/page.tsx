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
          ← Claims
        </Link>
      </div>
      <PageHeader
        eyebrow="Ops workspace"
        title="Reviewer workbench"
        description="Privileged REVIEW queue. Switching to Ops does not grant access — exchange a provisioned reviewer session."
      />
      <Callout kind="warn" title="Role-gated">
        Wallet sessions alone never grant reviewer or authority privileges. Settlement preparation
        does not broadcast transfers.
      </Callout>
      <div className="mt-6 space-y-4">
        <ClaimsAuthPanel ops />
        <ReviewerWorkbench />
      </div>
    </AppShell>
  );
}
