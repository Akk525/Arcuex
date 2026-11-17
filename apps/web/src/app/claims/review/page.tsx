import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ReviewerWorkbench } from '@/components/claims/reviewer-workbench';

export default function ClaimsReviewPage() {
  return (
    <AppShell>
      <div className="mb-3">
        <Link href="/claims" className="text-xs text-sky-800 underline">
          ← Claims
        </Link>
      </div>
      <ReviewerWorkbench />
    </AppShell>
  );
}
