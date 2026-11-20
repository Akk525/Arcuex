import { AppShell } from '@/components/app-shell';
import { Panel } from '@/components/panel';
import { AccountBar } from '@/components/shell/account-bar';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

export default function SettingsPage() {
  return (
    <AppShell>
      <PageHeader title="Settings" description="Manage your wallet connection and sign-in session." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Wallet & session" description="Use the wallet that owns or operates your agents and policies.">
          <AccountBar />
        </Panel>
        <Panel title="Diagnostics" description="Check this environment's network and service connectivity.">
          <ButtonLink href="/integrations#diagnostics" variant="secondary">View diagnostics</ButtonLink>
        </Panel>
      </div>
    </AppShell>
  );
}
