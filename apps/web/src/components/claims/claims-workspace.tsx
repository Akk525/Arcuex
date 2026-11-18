'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClaimsCaseList } from '@/components/claims/claims-case-list';
import { ClaimsPanel } from '@/components/claims/claims-panel';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { useWorkspace } from '@/components/workspace-provider';
import { useClaimsSession } from '@/hooks/use-claims-session';
import { AuthRequired } from '@/components/ui/auth-required';

export function ClaimsWorkspace() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { session, loading } = useClaimsSession();
  const showOpsPanels = workspace === 'ops';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Claims"
        title="My claims"
        description="Open cases, submit a new claim, and track adjudication status. REVIEW is not approval. Reimbursement requires a verified settlement receipt."
        action={
          <Button onClick={() => router.push('/claims/new')}>Submit claim</Button>
        }
      />

      {loading ? (
        <p className="text-sm text-[var(--ink-muted)]">Checking session…</p>
      ) : !session ? (
        <AuthRequired description="Use Sign in in the header after connecting your wallet. Cases load only with a server session cookie." />
      ) : (
        <p className="text-sm text-[var(--ink-muted)]">
          Signed in as <span className="font-medium text-[var(--ink)]">{session.role}</span>
          {session.wallet ? (
            <>
              {' '}
              · <span className="font-mono text-xs">{session.wallet}</span>
            </>
          ) : null}
          . Wallet and session controls stay in the header.
        </p>
      )}

      <ClaimsCaseList />

      <details className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
        <summary className="cursor-pointer font-medium text-[var(--ink)]">
          How claims adjudication works
        </summary>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[var(--ink-muted)]">
          <li>
            Evidence authenticity, coverage, net-loss, and settlement authorization are separate
            determinations — never one boolean.
          </li>
          <li>REVIEW has zero authorized payout until resolved.</li>
          <li>Synthetic fixture evidence is labeled and is not independent loss proof.</li>
          <li>This UI prepares settlements only; it does not broadcast on-chain transfers.</li>
        </ul>
        <p className="mt-3 text-[var(--ink-muted)]">
          Verified historical receipts and case evidence details appear on individual claim pages.
        </p>
      </details>

      {showOpsPanels ? (
        <div className="space-y-4 border-t border-[var(--line)] pt-6">
          <Callout kind="warn" title="Ops tools">
            Legacy ledger access requires a provisioned reviewer/authority session. Frontend chrome
            is not authorization.
          </Callout>
          <ClaimsPanel />
        </div>
      ) : (
        <p className="text-xs text-[var(--ink-muted)]">
          Need the review queue? Exchange an ops session, then open{' '}
          <Link href="/claims/review" className="underline">
            /claims/review
          </Link>
          .
        </p>
      )}
    </div>
  );
}
