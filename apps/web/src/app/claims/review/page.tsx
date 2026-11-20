import Link from 'next/link';
import { CaretLeft } from '@phosphor-icons/react/ssr';
import { AppShell } from '@/components/app-shell';
import { ReviewerWorkbench } from '@/components/claims/reviewer-workbench';
import { PageHeader } from '@/components/ui/page-header';

export default function ClaimsReviewPage() {
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
        appearance="dark"
        title="Insurer Review Queue"
        description="Claims grouped by what they need next. Open a claim to read its record and take the decisions your session is allowed to make."
      />
      <ReviewerWorkbench />
    </AppShell>
  );
}
