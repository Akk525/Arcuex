/**
 * Runnable agent SDK example (no private keys).
 *
 * Demonstrates: requestQuote → inspect → accept → prepareBindAuthorization.
 * On-chain broadcast is skipped unless ARCUE_X_POOL_ADDRESS + a wallet are configured.
 *
 *   pnpm --filter @arcuex/agent-sdk example:quote-bind
 */
import { createPublicClient, http } from 'viem';
import { ARC_TESTNET_RPC_HTTP, arcTestnet } from '@arcuex/chain';
import { openDatabase, migrate, InsuranceRepository } from '@arcuex/persistence';
import { ArcuexAgentClient } from '../src/index';

async function main() {
  const db = openDatabase(':memory:');
  migrate(db);
  const repo = new InsuranceRepository(db);

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(ARC_TESTNET_RPC_HTTP),
  });

  const poolAddress = (process.env.ARCUE_X_POOL_ADDRESS ??
    '0x1111111111111111111111111111111111111111') as `0x${string}`;

  const agent = new ArcuexAgentClient({
    repo,
    publicClient,
    poolAddress,
  });

  console.log('Permission scope:', agent.constructor.name);
  const quote = agent.requestQuote({
    idempotencyKey: `example-quote-${Date.now()}`,
    policyholder: {
      displayName: 'Example Operator',
      walletAddress: '0x2222222222222222222222222222222222222222',
    },
    agent: { externalRef: 'agent://example', label: 'example-agent' },
  });

  const inspected = agent.inspectQuote(quote.id);
  console.log('Quote', quote.id, 'synthetic=', inspected.synthetic);
  console.log('Terms hash', inspected.termsHash);
  console.log('Warnings', inspected.warnings);

  const { policy } = agent.acceptQuote(quote.id, true);
  console.log('Accepted policy', policy.id, 'status=', policy.status);

  const prep = agent.prepareBindAuthorization(
    policy.id,
    '0x2222222222222222222222222222222222222222',
  );
  console.log('Prepared', prep.prepared.length, 'txs under scope:');
  for (const scope of prep.permissionScope) console.log(' -', scope);
  console.log('policyIdBytes32', prep.policyIdBytes32);
  console.log('approve+bind data lengths', prep.prepared.map((p) => p.data.length));

  console.log(
    '\nNo private keys used. To broadcast, supply WalletClient + real ARCUE_X_POOL_ADDRESS and call authorizePrepared().',
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
