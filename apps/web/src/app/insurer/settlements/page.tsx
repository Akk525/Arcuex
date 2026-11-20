import { AppShell } from '@/components/app-shell';
import { ReviewerWorkbench } from '@/components/claims/reviewer-workbench';
import { PageHeader } from '@/components/ui/page-header';

export default function SettlementsPage() {
  return (
    <AppShell>
      <PageHeader
        appearance="dark"
        title="Settlements"
        description="Follow approved claims that need settlement or receipt reconciliation."
      />
      <ReviewerWorkbench view="settlements" />
    </AppShell>
  );
}
