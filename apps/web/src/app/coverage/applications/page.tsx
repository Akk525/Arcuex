import { AppShell } from '@/components/app-shell';
import { UnderwritingWorkspace } from '@/components/underwriting/underwriting-workspace';
import { PageHeader } from '@/components/ui/page-header';

export default function ApplicationsPage() {
  return (
    <AppShell>
      <PageHeader title="Coverage applications" description="Apply for synthetic oracle coverage, answer evidence requests and review your offer." />
      <UnderwritingWorkspace />
    </AppShell>
  );
}
