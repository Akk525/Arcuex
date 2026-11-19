import { AppShell } from '@/components/app-shell';
import { ClaimCaseDetail } from '@/components/claims/claim-case-detail';
import { PageHeader } from '@/components/ui/page-header';

export default async function ClaimCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <PageHeader
        eyebrow="Claims"
        title="Case investigation"
        description="Review evidence requests, findings and the human decision on this case."
      />
      <ClaimCaseDetail caseId={id} />
    </AppShell>
  );
}
