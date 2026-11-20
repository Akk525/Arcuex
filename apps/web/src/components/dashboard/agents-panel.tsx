import type { DashboardOverview } from '@/lib/server/dashboard-overview';
import { Panel } from '@/components/panel';
import { EmptyState } from '@/components/ui/empty-state';
import { ButtonLink } from '@/components/ui/button';

export function AgentsPanel({
  agents,
  delegations,
}: {
  agents: DashboardOverview['agents'];
  delegations: DashboardOverview['delegations'];
}) {
  if (agents.length === 0 && delegations.length === 0) {
    return (
      <Panel title="Agents and delegated permissions">
        <EmptyState
          title="No agents registered"
          description="Register an agent and grant scoped bind authority when you are ready to automate procurement."
          action={
            <ButtonLink href="/agent" variant="secondary">
              Connect an agent
            </ButtonLink>
          }
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Agents and delegated permissions"
      action={
        <ButtonLink href="/agent" variant="ghost" size="sm">
          Manage
        </ButtonLink>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium text-[var(--ink-muted)]">Agents</h3>
          <ul className="mt-2 divide-y divide-[var(--line)]">
            {agents.map((agent) => (
              <li key={agent.id} className="py-2">
                <p className="text-sm font-medium text-[var(--ink)]">{agent.label}</p>
                <p className="font-mono text-xs text-[var(--ink-faint)]">
                  {agent.status} · {agent.id.slice(0, 8)}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-medium text-[var(--ink-muted)]">Delegations</h3>
          {delegations.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ink-muted)]">No active delegations.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--line)]">
              {delegations.map((d) => (
                <li key={d.id} className="py-2">
                  <p className="text-sm font-medium text-[var(--ink)]">{d.validity}</p>
                  <p className="font-mono text-xs text-[var(--ink-faint)]">
                    agent {d.agentId.slice(0, 8)} · {d.id.slice(0, 8)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
