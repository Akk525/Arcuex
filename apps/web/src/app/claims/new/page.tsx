import Link from 'next/link';
import { CaretLeft } from '@phosphor-icons/react/ssr';
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
      <Link
        href="/claims"
        className="mb-3 inline-flex min-h-9 items-center gap-1 text-[0.8125rem] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
      >
        <CaretLeft size={13} weight="bold" aria-hidden="true" />
        Claims
      </Link>
      <PageHeader
        title="File a claim"
        description="Tell us which policy covered the agent and what happened. Filing opens an investigation; a human reviewer decides coverage."
      />
      <SubmitClaimForm initialPolicyId={policyId} />
    </AppShell>
  );
}
