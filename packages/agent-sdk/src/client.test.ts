import { describe, expect, it } from 'vitest';
import { createPublicClient, http } from 'viem';
import { ARC_TESTNET_RPC_HTTP, arcTestnet } from '@arcuex/chain';
import { openDatabase, migrate, InsuranceRepository } from '@arcuex/persistence';
import { ArcuexAgentClient } from './client';
import { AGENT_PERMISSION_SCOPE } from './permissions';

describe('ArcuexAgentClient', () => {
  it('runs quote → inspect → accept → prepare bind without private keys', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new InsuranceRepository(db);
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(ARC_TESTNET_RPC_HTTP),
    });

    const agent = new ArcuexAgentClient({
      repo,
      publicClient,
      // Placeholder pool for preparation tests only — not a live deploy.
      poolAddress: '0x1111111111111111111111111111111111111111',
    });

    const quote = agent.requestQuote({
      idempotencyKey: 'agent-sdk-test-quote-001',
      policyholder: {
        displayName: 'Demo Agent Operator',
        walletAddress: '0x2222222222222222222222222222222222222222',
      },
      agent: { externalRef: 'agent://demo-1', label: 'demo-agent' },
    });

    const inspected = agent.inspectQuote(quote.id);
    expect(inspected.synthetic).toBe(true);
    expect(inspected.termsHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(inspected.warnings.some((w) => w.includes('SYNTHETIC'))).toBe(true);

    const { policy } = agent.acceptQuote(quote.id, true);
    expect(policy.status === 'bound' || policy.status === 'active' || policy.status === 'pending_funding').toBe(
      true,
    );

    const prep = agent.prepareBindAuthorization(
      policy.id,
      '0x2222222222222222222222222222222222222222',
    );
    expect(prep.prepared).toHaveLength(2);
    expect(prep.permissionScope).toEqual(AGENT_PERMISSION_SCOPE);
    expect(prep.actions[0]?.kind).toBe('usdc_approve');
    expect(prep.actions[1]?.kind).toBe('bind_policy');
    expect(repo.getOnchainPolicyLink(policy.id)?.policyIdBytes32).toBe(prep.policyIdBytes32);
  });
});
