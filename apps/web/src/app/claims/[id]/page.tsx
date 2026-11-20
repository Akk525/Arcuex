import { AppShell } from '@/components/app-shell';
import { ClaimCaseDetail } from '@/components/claims/claim-case-detail';

export default async function ClaimCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ queue?: string }>;
}) {
  const [{ id }, { queue }] = await Promise.all([params, searchParams]);
  const claimQueue =
    queue === 'investigations' ? '/insurer/investigations' :
    queue === 'settlements' ? '/insurer/settlements' :
    '/claims/review';

  return (
    <AppShell claimQueue={claimQueue}>
      <ClaimCaseDetail caseId={id} claimQueue={claimQueue} />
    </AppShell>
  );
}
