import Link from 'next/link';
import { ShieldCheck, Users, WarningCircle, Stack } from '@phosphor-icons/react/ssr';
import { StatContent } from '@/components/ui/stat-content';
import type { DashboardOverview } from '@/lib/dashboard-overview-types';

export function SummaryStrip({ data }: { data: DashboardOverview }) {
  const eligible = data.portfolio.items.filter((p) => p.claimsEligible).length;
  const activeDelegations = data.delegations.filter((d) => d.validity === 'active').length;
  const openRequests = data.evidenceRequests.length;

  const cells = [
    {
      href: '/policies',
      label: 'Policies',
      icon: ShieldCheck,
      value: data.portfolio.total,
      note: data.portfolio.total === 0 ? 'None bound yet' : `${eligible} claims-eligible`,
    },
    {
      href: '/agent',
      label: 'Insured agents',
      icon: Users,
      value: data.agents.length,
      note: `${activeDelegations} active ${activeDelegations === 1 ? 'delegation' : 'delegations'}`,
    },
    {
      href: '/claims',
      label: 'Claims needing action',
      icon: WarningCircle,
      value: data.claimsNeedingAttention.length,
      note:
        openRequests === 0
          ? 'No open evidence requests'
          : `${openRequests} open evidence ${openRequests === 1 ? 'request' : 'requests'}`,
    },
    {
      href: '/policies',
      label: 'Pending reconciliation',
      icon: Stack,
      value: data.pendingReconciliation.length,
      note: 'On-chain policy records',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 min-[350px]:grid-cols-2 xl:grid-cols-4">
      {cells.map(({ href, label, icon: Icon, value, note }) => (
        <Link key={label} href={href} className="arc-stat">
          <StatContent icon={<Icon size={19} weight="duotone" />} label={label} count={value} detail={note} />
        </Link>
      ))}
    </div>
  );
}
