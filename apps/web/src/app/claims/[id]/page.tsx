import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ClaimCaseDetail } from '@/components/claims/claim-case-detail';

export default async function ClaimCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <div className="mb-3">
        <Link href="/claims" className="text-xs text-sky-800 underline">
          ← Claims
        </Link>
      </div>
      <ClaimCaseDetail caseId={id} />
    </AppShell>
  );
}
