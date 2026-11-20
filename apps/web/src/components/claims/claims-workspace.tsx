'use client';

import Link from 'next/link';
import { Plus, Stack } from '@phosphor-icons/react';
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
    <div>
      <PageHeader
        appearance="dark"
        title="Claims List"
        description="Track each claim from filing to decision. Respond to evidence requests here so reviewers can see your proof in the record."
        action={
          ops ? (
            <ButtonLink href="/claims/review" variant="secondary">
              <Stack size={16} aria-hidden="true" />
              Review queue
            </ButtonLink>
          ) : (
            <ButtonLink href="/claims/new">
              <Plus size={16} weight="bold" aria-hidden="true" />
              File a claim
            </ButtonLink>
          )
        }
      />

      {loading ? (
        <p role="status" className="text-sm text-[var(--ink-muted)]">
          Checking session…
        </p>
      ) : !session ? (
        <AuthRequired description="Connect your wallet and sign in from the header to see your claims." />
      ) : (
        <ClaimsCaseList ops={ops} />
      )}

      {showOpsPanels ? (
        <details className="group mt-10 border-t border-[var(--line)] pt-6">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">
            Legacy claims ledger
          </summary>
          <div className="mt-4 space-y-4">
            <Callout kind="warn" title="Ops tools">
              Legacy ledger access requires a provisioned reviewer or authority session. Interface
              visibility is not authorization.
            </Callout>
            <ClaimsPanel />
          </div>
        </details>
      ) : (
        !ops &&
        !loading && (
          <p className="mt-10 text-xs text-[var(--ink-muted)]">
            Reviewing claims for Arcuex?{' '}
            <Link
              href="/claims/review"
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Reviewer sign-in
            </Link>
          </p>
        )
      )}
    </div>
  );
}
