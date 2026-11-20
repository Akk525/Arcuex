import { AppShell } from '@/components/app-shell';
import { UnderwritingWorkspace } from '@/components/underwriting/underwriting-workspace';
import { PageHeader } from '@/components/ui/page-header';

export default function UnderwritingReviewPage() {
  return (
    <AppShell>
      <PageHeader
        title="Underwriting"
        description="Review exposure evidence, request proof and decide which applications can proceed to a quote."
      />
      <UnderwritingWorkspace insurer />
    </AppShell>
  );
}
