import { decodeEventLog, type Hash, type PublicClient } from 'viem';
import {
  insurancePoolAbi,
  readOnchainPolicy,
  readLossAccounting,
  prepareSettleClaim,
  toPolicyIdBytes32,
  toClaimIdBytes32,
} from '@arcuex/onchain';
import type { ClaimsCase } from '@arcuex/insurance';
import { procurementClient, procurementPool } from './procurement-chain';
import { check } from './procurement';
import { getRuntimeConfig } from './runtime-config';

/** Adapter to the existing settlement transaction builder. Never signs or broadcasts. */
export async function prepareClaimsTransaction(
  c: ClaimsCase,
  client: PublicClient = procurementClient(),
) {
  check(getRuntimeConfig().chainSource !== 'fixture', 'Fixture source cannot authorize settlement');
  check((await client.getChainId()) === 5042002, 'RPC is not Arc Testnet');
  check(
    c.payableMicros && c.lossKey && c.lossCapMicros && c.payoutTo,
    'Frozen settlement binding missing',
  );
  const [policy, loss, block, authority] = await Promise.all([
    readOnchainPolicy(client, procurementPool, toPolicyIdBytes32(c.policyId)),
    readLossAccounting(client, procurementPool, c.lossKey as Hash),
    client.getBlock(),
    client.readContract({
      address: procurementPool,
      abi: insurancePoolAbi,
      functionName: 'claimsAuthority',
    }),
  ]);
  check(
    policy.bound &&
      !policy.cancelled &&
      block.timestamp >= policy.coverageStart &&
      block.timestamp <= policy.coverageEnd,
    'Policy is not in an active onchain coverage window',
  );
  check(
    policy.beneficiary.toLowerCase() === c.payoutTo.toLowerCase() &&
      policy.limit - policy.paidOut >= c.payableMicros &&
      policy.reserved >= c.payableMicros,
    'Chain beneficiary or remaining reservation mismatch',
  );
  check(
    !loss.exists ||
      (loss.policyId === toPolicyIdBytes32(c.policyId) &&
        loss.lossCap === c.lossCapMicros &&
        loss.paid + c.payableMicros <= loss.lossCap),
    'Existing onchain loss commitment mismatch',
  );
  return prepareSettleClaim({
    pool: procurementPool,
    account: authority,
    policyId: toPolicyIdBytes32(c.policyId),
    claimId: toClaimIdBytes32(c.claimId ?? c.id),
    lossKey: c.lossKey as Hash,
    amount: c.payableMicros,
    lossCap: c.lossCapMicros,
    payoutTo: c.payoutTo as `0x${string}`,
  });
}
export function assertSettlementEvent(c: ClaimsCase, args: Record<string, unknown>) {
  check(
    args.policyId === toPolicyIdBytes32(c.policyId) &&
      args.claimId === toClaimIdBytes32(c.claimId ?? c.id) &&
      args.lossKey === c.lossKey &&
      String(args.beneficiary).toLowerCase() === c.payoutTo?.toLowerCase() &&
      args.amount === c.payableMicros &&
      args.lossCap === c.lossCapMicros,
    'Settlement receipt does not match the frozen claim binding',
  );
}
/** A caller-provided receipt reference alone can never mark a case paid. */
export async function verifyClaimsSettlement(
  c: ClaimsCase,
  hash: Hash,
  client: PublicClient = procurementClient(),
) {
  check(
    getRuntimeConfig().chainSource !== 'fixture',
    'Fixture source cannot confirm reimbursement',
  );
  check((await client.getChainId()) === 5042002, 'RPC is not Arc Testnet');
  const receipt = await client.getTransactionReceipt({ hash });
  check(
    receipt.status === 'success' && receipt.to?.toLowerCase() === procurementPool.toLowerCase(),
    'Successful pool settlement receipt required',
  );
  const authority = await client.readContract({
    address: procurementPool,
    abi: insurancePoolAbi,
    functionName: 'claimsAuthority',
    blockNumber: receipt.blockNumber,
  });
  check(
    receipt.from.toLowerCase() === authority.toLowerCase(),
    'Settlement sender is not the designated claims authority',
  );
  let matched = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== procurementPool.toLowerCase()) continue;
    let event;
    try {
      event = decodeEventLog({ abi: insurancePoolAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (event.eventName === 'ClaimSettled') {
      assertSettlementEvent(c, event.args);
      matched = true;
    }
  }
  check(matched, 'Matching ClaimSettled event missing');
  return hash;
}
