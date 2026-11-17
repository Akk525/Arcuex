/**
 * Bounded autonomous insurance-buying agent example.
 *
 * Policy (hard limits — not a form click simulation):
 * - Synthetic product only
 * - Max premium: 5 USDC micros units at 6 decimals → 5_000_000
 * - Max limit: 100 USDC
 * - Prepare approve+bind only; never invent private keys
 * - Broadcast only when WALLET_PRIVATE_KEY + ARCUE_X_POOL_ADDRESS are set by operator
 *
 *   pnpm --filter @arcuex/agent-sdk exec tsx examples/autonomous-procure.ts
 */
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ARC_QUICKNODE_TESTNET_RPC_HTTP, ARC_TESTNET_CHAIN_ID, arcTestnet } from '@arcuex/chain';
import { openDatabase, migrate, InsuranceRepository } from '@arcuex/persistence';
import { ArcuexAgentClient } from '../src/index';

const MAX_PREMIUM = 5_000_000n;
const MAX_LIMIT = 100_000_000n;

async function main() {
  const db = openDatabase(':memory:');
  migrate(db);
  const repo = new InsuranceRepository(db);
  const rpc = process.env.ARC_TESTNET_RPC_URL?.trim() || ARC_QUICKNODE_TESTNET_RPC_HTTP;
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpc) });

  const poolAddress = process.env.ARCUE_X_POOL_ADDRESS?.trim() as `0x${string}` | undefined;
  const pk = process.env.WALLET_PRIVATE_KEY?.trim() as `0x${string}` | undefined;

  const walletClient =
    pk && poolAddress
      ? createWalletClient({
          account: privateKeyToAccount(pk),
          chain: arcTestnet,
          transport: http(rpc),
        })
      : undefined;

  const agent = new ArcuexAgentClient({
    repo,
    publicClient,
    walletClient,
    poolAddress: poolAddress ?? '0x1111111111111111111111111111111111111111',
  });

  console.log('=== Bounded agent procurement policy ===');
  console.log(`maxPremium=${MAX_PREMIUM} maxLimit=${MAX_LIMIT} syntheticOnly=true`);
  console.log(`chainId expected=${ARC_TESTNET_CHAIN_ID}`);

  const quote = agent.requestQuote({
    idempotencyKey: `agent-procure-${Date.now()}`,
    policyholder: {
      displayName: 'Autonomous Agent Treasury',
      walletAddress: walletClient?.account.address,
    },
    agent: { externalRef: 'agent://bounded-procure-v1', label: 'bounded-procure' },
  });

  const inspected = agent.inspectQuote(quote.id);
  console.log('Quote', quote.id);
  console.log('Terms hash', inspected.termsHash);
  console.log('Warnings', inspected.warnings);

  if (!inspected.synthetic) throw new Error('Policy violated: non-synthetic quote');
  if (inspected.terms.premiumMicros > MAX_PREMIUM) {
    throw new Error(`Policy violated: premium ${inspected.terms.premiumMicros} > ${MAX_PREMIUM}`);
  }
  if (inspected.terms.limitMicros > MAX_LIMIT) {
    throw new Error(`Policy violated: limit ${inspected.terms.limitMicros} > ${MAX_LIMIT}`);
  }

  // fundingVerified=true means the agent will attempt on-chain premium payment next
  const { policy } = agent.acceptQuote(quote.id, true);
  console.log('Accepted local policy', policy.id, policy.status);

  const account =
    walletClient?.account.address ?? ('0x2222222222222222222222222222222222222222' as const);
  const prep = agent.prepareBindAuthorization(policy.id, account);
  console.log('Prepared txs:', prep.prepared.map((p) => p.description));
  console.log('Permission scope:', prep.permissionScope);

  if (!walletClient || !poolAddress) {
    console.log(
      '\nBLOCKED: live bind requires ARCUE_X_POOL_ADDRESS + WALLET_PRIVATE_KEY (operator-provided).',
    );
    console.log('Prepared intents only — no keys stored by Arcuex backend.');
    return;
  }

  const results = await agent.authorizePrepared(prep.prepared);
  for (const r of results) {
    console.log('Confirmed tx', r.hash, 'block', r.blockNumber.toString(), 'status', r.status);
  }
  const onchain = await agent.waitForActiveCoverage(policy.id, { timeoutMs: 20_000 });
  console.log('On-chain policy bound=', onchain.bound, 'reserved=', onchain.reserved.toString());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
