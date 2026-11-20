import { AppShell } from '@/components/app-shell';
import { ReviewerWorkbench } from '@/components/claims/reviewer-workbench';
import { PageHeader } from '@/components/ui/page-header';

export default function InvestigationsPage() {
  return (
    <AppShell>
      <PageHeader
        appearance="dark"
        title="AI investigations"
        description="Open a claim dossier to review verification, submitted proof and any available examiner findings before recording a decision."
      />
      <ReviewerWorkbench view="investigations" />
    </AppShell>
  );
}
