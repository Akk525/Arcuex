'use client';

import Link from 'next/link';
import { ClaimsCaseList } from '@/components/claims/claims-case-list';
import { ClaimsPanel } from '@/components/claims/claims-panel';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { useWorkspace } from '@/components/workspace-provider';
import { useClaimsSession } from '@/hooks/use-claims-session';
import { AuthRequired } from '@/components/ui/auth-required';

export function ClaimsWorkspace() {
  const { workspace } = useWorkspace();
  const { session, loading } = useClaimsSession();
  const ops = session?.role === 'reviewer' || session?.role === 'authority';
  const showOpsPanels = ops && workspace === 'ops';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Claims"
        title="My claims"
        description="Find your cases, respond to evidence requests and check each decision and payment status."
        action={
          ops ? (
            <ButtonLink href="/claims/review" variant="secondary">
              Open review queue
            </ButtonLink>
          ) : (
            <ButtonLink href="/claims/new">Submit claim</ButtonLink>
          )
        }
      />

      {loading ? (
        <p role="status" className="text-sm text-[var(--ink-muted)]">
          Checking session…
        </p>
      ) : !session ? (
        <AuthRequired description="Connect your wallet and sign in from the header to view its cases." />
      ) : (
        <ClaimsCaseList />
      )}

      {showOpsPanels ? (
        <div className="space-y-4 border-t border-[var(--line)] pt-6">
          <Callout kind="warn" title="Ops tools">
            Legacy ledger access requires a provisioned reviewer/authority session. Frontend chrome
            is not authorization.
          </Callout>
          <ClaimsPanel />
        </div>
      ) : (
        !ops && (
          <Link
            href="/claims/review"
            className="inline-flex min-h-11 items-center text-sm text-[var(--accent)] underline"
          >
            Reviewer sign-in
          </Link>
        )
      )}
    </div>
  );
}
