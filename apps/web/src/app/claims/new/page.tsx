import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { SubmitClaimForm } from '@/components/claims/submit-claim-form';

export default function NewClaimPage() {
  return (
    <AppShell>
      <div className="mb-3">
        <Link href="/claims" className="text-xs text-sky-800 underline">
          ← Claims
        </Link>
      </div>
      <div className="mx-auto max-w-xl">
        <SubmitClaimForm />
      </div>
    </AppShell>
  );
}
