import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { PoliciesPanel } from '@/components/coverage/policies-panel';
import { PageHeader } from '@/components/ui/page-header';

export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <div className="mb-3">
        <Link href="/policies" className="text-xs text-[var(--accent)] underline">
          ← Policies
        </Link>
      </div>
      <PageHeader
        eyebrow="Policy detail"
        title="Immutable terms & chain status"
        description="Prepared is not active. Confirmed means bind receipt verified — coverage still follows the scheduled effective window."
      />
      <PoliciesPanel id={id} />
    </AppShell>
  );
}
