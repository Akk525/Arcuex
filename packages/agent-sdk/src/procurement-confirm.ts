import type { PublicClient, Hex } from 'viem';
import { readOnchainPolicy, toPolicyIdBytes32 } from '@arcuex/onchain';
import {
  hasProcurementBindAuthority,
  ProcurementError,
  type ProcurementService,
} from './procurement';

/** Read-only receipt and state reconciliation. Never signs or broadcasts. */
export async function confirmProcurement(
  service: ProcurementService,
  client: PublicClient,
  actor: string,
  policyId: unknown,
  txHash: unknown,
) {
  const policy = service.inspect(actor, policyId);
  if (typeof txHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(txHash))
    throw new ProcurementError('INVALID_TX', 'A bind transaction hash is required');
  if (policy.bindTx) {
    if (policy.bindTx.toLowerCase() !== txHash.toLowerCase())
      throw new ProcurementError(
        'ALREADY_BOUND',
        'Policy already confirmed with another transaction',
        409,
      );
    return policy;
  }
  if ((await client.getChainId()) !== 5042002)
    throw new ProcurementError('WRONG_NETWORK', 'RPC must be Arc Testnet', 503);
  const hash = txHash as Hex;
  const [receipt, tx, chainPolicy] = await Promise.all([
    client.getTransactionReceipt({ hash }),
    client.getTransaction({ hash }),
    readOnchainPolicy(client, service.pool, toPolicyIdBytes32(policy.terms.policyId)),
  ]);
  const block = await client.getBlock({ blockHash: receipt.blockHash });
  const expected = service.transactions(policy)[1]!;
  const t = policy.terms;
  const match =
    receipt.status === 'success' &&
    tx.to?.toLowerCase() === service.pool.toLowerCase() &&
    tx.from.toLowerCase() === policy.payer &&
    tx.input === expected.data &&
    tx.value === 0n &&
    receipt.transactionHash.toLowerCase() === hash.toLowerCase() &&
    block.timestamp >= BigInt(t.quoteExpiresAt - 600) &&
    block.timestamp < BigInt(t.quoteExpiresAt) &&
    block.timestamp < BigInt(t.effectiveAt) &&
    chainPolicy.bound &&
    chainPolicy.termsHash === policy.digest &&
    chainPolicy.beneficiary.toLowerCase() === t.beneficiary &&
    chainPolicy.premiumPayer.toLowerCase() === policy.payer &&
    chainPolicy.premium === BigInt(t.premiumMicros) &&
    chainPolicy.limit === BigInt(t.limitMicros) &&
    chainPolicy.coverageStart === BigInt(t.effectiveAt) &&
    chainPolicy.coverageEnd === BigInt(t.expiresAt);
  if (!match)
    throw new ProcurementError(
      'CHAIN_MISMATCH',
      'Receipt or deployed policy differs from accepted terms, payer, amounts or binding deadline. This policy is not recognized by the beta backend.',
      409,
    );
  if (!hasProcurementBindAuthority(service.store, policy, Number(block.timestamp)))
    throw new ProcurementError(
      'BIND_AUTHORITY_INVALID',
      'The payer lacked authority at the bind block',
      409,
    );
  service.store.confirm(t.policyId, hash.toLowerCase(), Number(block.timestamp));
  return service.inspect(actor, t.policyId);
}
