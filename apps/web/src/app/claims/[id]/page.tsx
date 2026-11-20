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
        description="Respond to evidence requests, review findings and record a human decision. Approval is not reimbursement."
      />
      <ClaimCaseDetail caseId={id} />
    </AppShell>
  );
}
