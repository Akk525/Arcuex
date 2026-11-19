import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { SubmitClaimForm } from '@/components/claims/submit-claim-form';
import { PageHeader } from '@/components/ui/page-header';

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ policyId?: string }>;
}) {
  const { policyId } = await searchParams;
  return (
    <AppShell>
      <div className="mb-3">
        <Link
          href="/claims"
          className="inline-flex min-h-11 items-center text-sm text-[var(--accent)] underline"
        >
          ← My claims
        </Link>
      </div>
      <PageHeader
        eyebrow="Claims"
        title="Submit a claim"
        description="Select an eligible policy and record the incident to open an investigation."
      />
      <div className="max-w-2xl">
        <SubmitClaimForm initialPolicyId={policyId} />
      </div>
    </AppShell>
  );
}
