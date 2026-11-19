import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ClaimCaseDetail } from '@/components/claims/claim-case-detail';
import { PageHeader } from '@/components/ui/page-header';
import { Callout } from '@/components/ui/callout';

export default async function ClaimCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <div className="mb-3">
        <Link
          href="/claims"
          className="inline-flex min-h-11 items-center text-xs text-[var(--accent)] underline"
        >
          ← Claims
        </Link>
      </div>
      <PageHeader
        eyebrow="Claim case"
        title="Case investigation"
        description="Statuses are adjudication states. Do not treat REVIEW or preparation as reimbursement."
      />
      <Callout kind="warn" title="Payment rule">
        A case is not reimbursed until a verified Arc Testnet settlement receipt matches the frozen
        adjudication binding.
      </Callout>
      <div className="mt-6">
        <ClaimCaseDetail caseId={id} />
      </div>
    </AppShell>
  );
}
