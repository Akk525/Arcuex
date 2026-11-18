import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { SubmitClaimForm } from '@/components/claims/submit-claim-form';
import { PageHeader } from '@/components/ui/page-header';
import { Callout } from '@/components/ui/callout';

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ policyId?: string }>;
}) {
  const { policyId } = await searchParams;
  return (
    <AppShell>
      <div className="mb-3">
        <Link href="/claims" className="text-xs text-[var(--accent)] underline">
          ← My claims
        </Link>
      </div>
      <PageHeader
        eyebrow="Claims"
        title="Submit a claim"
        description="Attach evidence against a confirmed policy you own. Use the header to connect and sign in — session controls are not repeated below."
      />
      <Callout kind="warn" title="Not reimbursed on submit">
        Opening a case starts investigation. Approval and payment require separate determinations and
        a verified settlement receipt.
      </Callout>
      <div className="mx-auto mt-6 max-w-xl">
        <SubmitClaimForm initialPolicyId={policyId} />
      </div>
    </AppShell>
  );
}
