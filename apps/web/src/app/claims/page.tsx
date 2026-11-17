import { AppShell } from '@/components/app-shell';
import { ClaimsPanel } from '@/components/claims/claims-panel';
import { Panel } from '@/components/panel';

export default function ClaimsPage() {
  return (
    <AppShell>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ClaimsPanel />
        <Panel title="Evidence & authorization">
          <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600">
            <li>
              Synthetic oracle-ratio fixtures use VERIFIED / REJECTED / REVIEW outcomes and are
              labeled synthetic — never real-world loss proofs.
            </li>
            <li>
              Payouts require <code>claimsAuthority</code> on-chain plus an explicit assessment —
              AI majority votes cannot authorize.
            </li>
            <li>Webhook / Streams delivery is transport only, not claim adjudication.</li>
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
