import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { PoliciesPanel } from '@/components/coverage/policies-panel';
import { PageHeader } from '@/components/ui/page-header';

export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <div className="mb-3">
        <Link
          href="/policies"
          className="inline-flex min-h-11 items-center text-sm text-[var(--accent)] underline"
        >
          ← Policy portfolio
        </Link>
      </div>
      <PageHeader
        eyebrow="Protect"
        title="Policy details"
        description="Review recorded terms, coverage dates, confirmation and claim eligibility."
      />
      <PoliciesPanel id={id} />
    </AppShell>
  );
}
