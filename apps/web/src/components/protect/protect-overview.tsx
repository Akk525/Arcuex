'use client';

import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/panel';
import { ButtonLink } from '@/components/ui/button';
import { useFixtureMode } from '@/providers/source-mode';

export function ProtectOverview() {
  const fixture = useFixtureMode();

  return (
    <>
      <PageHeader
        eyebrow="Protect"
        title="Coverage overview"
        description={
          fixture
            ? 'Review a synthetic quote or use a seeded policy to rehearse a claim.'
            : 'Quote coverage, track a policy’s effective window and manage claims.'
        }
        action={<ButtonLink href="/coverage">Explore coverage</ButtonLink>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Policy portfolio">
          <p className="mb-3 text-sm text-[var(--ink-muted)]">
            See the insured exposure, policy terms and the next action for your purchase or policy.
          </p>
          <ButtonLink href="/policies" variant="secondary">
            Open policies
          </ButtonLink>
        </Panel>
        <Panel title="Claims">
          <p className="mb-3 text-sm text-[var(--ink-muted)]">
            Submit from an eligible policy, follow evidence requests and check the decision and
            payment status.
          </p>
          <ButtonLink href="/claims" variant="secondary">
            Open claims
          </ButtonLink>
        </Panel>
      </div>
    </>
  );
}
