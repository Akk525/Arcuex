import { AppShell } from '@/components/app-shell';
import { InsurerAccess } from '@/components/shell/insurer-access';
import { ReviewerWorkbench } from '@/components/claims/reviewer-workbench';
import { Panel } from '@/components/panel';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

export default function InsurerPage() {
  return (
    <AppShell>
      <PageHeader
        appearance="dark"
        title="Portfolio overview"
        description="Review claims that need a decision and see where underwriting, settlement and exposure need attention."
      />
      <InsurerAccess>
        <div className="space-y-5">
          <ReviewerWorkbench view="overview" />
          <div className="grid gap-4 md:grid-cols-3">
            <Panel title="Underwriting" description="Review coverage applications and evidence requests.">
              <ButtonLink href="/underwriting/review" variant="secondary">Open underwriting</ButtonLink>
            </Panel>
            <Panel title="Settlements" description="Track approved claims through authority handoff and payment confirmation.">
              <ButtonLink href="/insurer/settlements" variant="secondary">Open settlements</ButtonLink>
            </Panel>
            <Panel title="Capital & exposure" description="Inspect the synthetic solvency ledger.">
              <ButtonLink href="/capital" variant="secondary">View capital & exposure</ButtonLink>
            </Panel>
          </div>
        </div>
      </InsurerAccess>
    </AppShell>
  );
}
