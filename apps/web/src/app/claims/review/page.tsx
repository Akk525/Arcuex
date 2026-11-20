import { AppShell } from '@/components/app-shell';
import { ReviewerWorkbench } from '@/components/claims/reviewer-workbench';
import { PageHeader } from '@/components/ui/page-header';

export default function ClaimsReviewPage() {
  return (
    <AppShell>
      <PageHeader
        appearance="dark"
        title="Claims review"
        description="Review evidence requests, verification and claims ready for a human decision."
      />
      <ReviewerWorkbench />
    </AppShell>
  );
}
