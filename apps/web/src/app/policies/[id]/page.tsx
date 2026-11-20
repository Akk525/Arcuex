import Link from 'next/link';
import { CaretLeft } from '@phosphor-icons/react/ssr';
import { AppShell } from '@/components/app-shell';
import { PolicyRecord } from '@/components/coverage/policy-record';

export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <nav aria-label="Breadcrumb" className="mb-2">
        <Link
          href="/policies"
          className="inline-flex min-h-9 items-center gap-1 text-[0.8125rem] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
        >
          <CaretLeft size={13} weight="bold" aria-hidden="true" />
          Policies
        </Link>
      </nav>
      <PolicyRecord id={id} />
    </AppShell>
  );
}
