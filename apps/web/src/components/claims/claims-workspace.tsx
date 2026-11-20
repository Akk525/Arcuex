'use client';

import { Plus } from '@phosphor-icons/react';
import { ClaimsCaseList } from '@/components/claims/claims-case-list';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';
import { useClaimsSession } from '@/hooks/use-claims-session';
import { AuthRequired } from '@/components/ui/auth-required';

export function ClaimsWorkspace() {
  const { session, loading } = useClaimsSession();
  const ops = session?.role === 'reviewer' || session?.role === 'authority';

  return (
    <div>
      <PageHeader
        appearance="dark"
        title="Claims"
        description="Track each claim from filing to decision. Respond to evidence requests here so reviewers can see your proof in the record."
        action={
          <ButtonLink href="/claims/new">
            <Plus size={16} weight="bold" aria-hidden="true" />
            File a claim
          </ButtonLink>
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
    </div>
  );
}
