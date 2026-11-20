import Link from 'next/link';
import { Robot } from '@phosphor-icons/react/ssr';
import type { DashboardOverview } from '@/lib/dashboard-overview-types';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { WorkList, WorkRow } from '@/components/ui/work-row';

const VALIDITY: Record<string, { label: string; tone: 'ok' | 'neutral' | 'warn' | 'pending' }> = {
  // Server-checked validity at read time; the Agents page re-checks freshness before acting.
  active: { label: 'Delegation active', tone: 'ok' },
  expired: { label: 'Delegation expired', tone: 'neutral' },
  revoked: { label: 'Delegation revoked', tone: 'neutral' },
  unavailable: { label: 'Scope unavailable', tone: 'warn' },
};

/** Agent identity and delegated authority are shown separately — registration grants no authority. */
export function AgentsPanel({
  agents,
  delegations,
}: {
  agents: DashboardOverview['agents'];
  delegations: DashboardOverview['delegations'];
}) {
  return (
    <Panel
      title="Insured agents"
      action={
        <Link href="/agent" className="text-[0.8125rem] font-medium text-[var(--accent-signal)] hover:text-[var(--accent)]">
          {agents.length > 0 ? 'Manage' : 'Register an agent'}
        </Link>
      }
      flush
    >
      {agents.length === 0 ? (
        <p className="border-t border-[var(--line)] px-4 py-5 text-sm text-[var(--ink-muted)] sm:px-5">
          No agents registered. Register an agent, then grant it a scoped delegation to quote and
          bind within your limits.
        </p>
      ) : (
        <WorkList label="Agents">
          {agents.map((agent) => {
            const grants = delegations.filter((d) => d.agentId === agent.id);
            const current = grants.find((d) => d.validity === 'active') ?? grants[0];
            const validity = current
              ? (VALIDITY[current.validity.toLowerCase()] ?? { label: current.validity, tone: 'pending' as const })
              : { label: 'No delegation', tone: 'neutral' as const };
            return (
              <WorkRow
                key={agent.id}
                href="/agent"
                icon={<Robot size={18} weight="duotone" />}
                iconTone="accent"
                title={agent.label}
                meta={
                  <span className="font-mono text-xs">{agent.id.slice(0, 8)}…{agent.id.slice(-4)}</span>
                }
                status={<StatusBadge label={validity.label} tone={validity.tone} />}
              />
            );
          })}
        </WorkList>
      )}
    </Panel>
  );
}
