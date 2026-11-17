import Link from 'next/link';
import { Panel } from '@/components/panel';
export function AgentProcurePanel() {
  return (
    <Panel title="Delegated procurement">
      <p className="text-sm leading-6 text-zinc-600">
        Owners sign in to register an agent and authorize a product, exposure, beneficiary and spend
        cap. The agent authenticates with its own wallet. Transactions require external wallet
        authorization.
      </p>
      <Link href="/agent" className="mt-3 inline-block text-sm underline">
        Manage owner permissions →
      </Link>
    </Panel>
  );
}
