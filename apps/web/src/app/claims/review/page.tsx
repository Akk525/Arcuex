import Link from 'next/link';
import { ClaimsAuthPanel } from '@/components/claims/claims-auth-panel';
import { AppShell } from '@/components/app-shell';
import { ReviewerWorkbench } from '@/components/claims/reviewer-workbench';
import { PageHeader } from '@/components/ui/page-header';

export default function ClaimsReviewPage() {
  return (
    <AppShell>
      <div className="mb-3">
        <Link
          href="/claims"
          className="inline-flex min-h-11 items-center text-sm text-[var(--accent)] underline"
        >
          ← My claims
        </Link>
      </div>
      <PageHeader
        eyebrow="Ops"
        title="Reviewer workbench"
        description="Triage open claims, follow evidence requests and track settlement handoffs."
      />
      <div className="space-y-4">
        <ClaimsAuthPanel />
        <ReviewerWorkbench />
      </div>
    </AppShell>
  );
}
