import Link from 'next/link';
import { Panel } from '@/components/panel';
export function CoveragePanel() {
  return (
    <Panel title="Synthetic oracle liquidation coverage">
      <p className="text-sm leading-6 text-zinc-600">
        Register an agent and position, review demo terms, then approve and bind with your wallet on
        Arc Testnet. Coverage requires a verified bind receipt.
      </p>
      <Link
        className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
        href="/coverage"
      >
        Explore coverage →
      </Link>
    </Panel>
  );
}
