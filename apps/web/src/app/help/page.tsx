import { AppShell } from '@/components/app-shell';
import { Panel } from '@/components/panel';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

export default function HelpPage() {
  return (
    <AppShell>
      <PageHeader title="Help & documentation" description="Find the workflow you need or explore how Arcuex works." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Coverage and claims" description="Find policies, track applications and respond to proof requests.">
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/coverage" variant="secondary">Coverage</ButtonLink>
            <ButtonLink href="/claims" variant="secondary">Claims</ButtonLink>
          </div>
        </Panel>
        <Panel title="Developer documentation" description="See SDK examples and find connection and diagnostics tools.">
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/#developers" variant="secondary">SDK examples</ButtonLink>
            <ButtonLink href="/integrations" variant="secondary">Integrations & API</ButtonLink>
          </div>
        </Panel>
        <Panel title="About Arcuex">
          <ButtonLink href="/" variant="secondary">Product site</ButtonLink>
        </Panel>
      </div>
    </AppShell>
  );
}
