import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ClaimsAuthPanel } from '@/components/claims/claims-auth-panel';
import { SubmitClaimForm } from '@/components/claims/submit-claim-form';

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ policyId?: string }>;
}) {
  const { policyId } = await searchParams;
  return (
    <AppShell>
      <div className="mb-3">
        <Link href="/claims" className="text-xs text-sky-800 underline">
          ← Claims
        </Link>
      </div>
      <div className="mx-auto max-w-xl">
        <ClaimsAuthPanel />
        <SubmitClaimForm initialPolicyId={policyId} />
      </div>
    </AppShell>
  );
}
