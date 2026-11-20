import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { HumanProcurementPanel } from '@/components/coverage/human-procurement-panel';
import { PolicyPortfolio } from '@/components/coverage/policy-portfolio';
import { UnderwritingWorkspace } from '@/components/underwriting/underwriting-workspace';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

export type CoverageQuery = {
  tab?: string;
  policyId?: string;
  agentId?: string;
  delegationId?: string;
  from?: string;
};

const tabs = [
  { id: 'policies', label: 'My policies', href: '/coverage' },
  { id: 'applications', label: 'Applications', href: '/coverage?tab=applications' },
  { id: 'products', label: 'Explore products', href: '/coverage?tab=products' },
] as const;

export function CoverageWorkspace({ search = {} }: { search?: CoverageQuery }) {
  const { policyId, agentId, delegationId, from } = search;
  const tab = search.tab === 'applications' ? 'applications'
    : search.tab === 'products' || policyId || agentId || delegationId || from === 'build'
      ? 'products'
      : 'policies';

  return (
    <AppShell>
      <PageHeader
        appearance="dark"
        title="Coverage"
        description="Manage protection for your agents and their positions."
        action={
          tab === 'products' ? (
            <ButtonLink href="/coverage?tab=applications" variant="secondary">Apply for tailored coverage</ButtonLink>
          ) : (
            <ButtonLink href="/coverage?tab=products">Get coverage</ButtonLink>
          )
        }
      />
      <nav aria-label="Coverage sections" className="mb-5 flex flex-wrap gap-1 border-b border-[var(--line)]">
        {tabs.map(({ id, label, href }) => (
          <Link
            key={id}
            href={href}
            aria-current={tab === id ? 'page' : undefined}
            className="min-h-11 rounded-t-[var(--radius)] border-b-2 border-transparent px-3 py-2.5 text-sm font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-inset)] aria-[current=page]:border-[var(--accent)] aria-[current=page]:text-[var(--accent)]"
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === 'policies' ? (
        <PolicyPortfolio />
      ) : tab === 'applications' ? (
        <section aria-labelledby="coverage-applications-title">
          <h2 id="coverage-applications-title" className="mb-1 text-lg font-semibold">Coverage applications</h2>
          <p className="mb-4 text-sm text-[var(--ink-muted)]">Apply for tailored coverage, respond to evidence requests and review your offer.</p>
          <UnderwritingWorkspace />
        </section>
      ) : (
        <HumanProcurementPanel
          resumePolicyId={policyId}
          requestedAgentId={agentId}
          requestedGrantId={delegationId}
          fromBuild={from === 'build'}
        />
      )}
    </AppShell>
  );
}
