import { decodeEventLog, erc20Abi, type Hash, type PublicClient } from 'viem';
import {
  insurancePoolAbi,
  readOnchainPolicy,
  isClaimSettled,
  readLossAccounting,
  prepareSettleClaim,
  type PreparedTx,
  toPolicyIdBytes32,
  toClaimIdBytes32,
} from '@arcuex/onchain';
import type { ClaimsCase } from '@arcuex/insurance';
import { procurementClient, procurementPool } from './procurement-chain';
import { check } from './procurement';
import { ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import {
  assertArcChain,
  assertCanonicalBlock,
  confirmedBlock,
  confirmedReceipt,
  requireReceiptLog,
} from './arc-confirmation';
import { getRuntimeConfig } from './runtime-config';

/** Adapter to the existing settlement transaction builder. Never signs or broadcasts. */
export async function prepareClaimsTransaction(
  c: ClaimsCase,
  client: PublicClient = procurementClient(),
  signingDeadlineMs?: number,
): Promise<PreparedTx & { nonce?: number }> {
  check(getRuntimeConfig().chainSource !== 'fixture', 'Fixture source cannot authorize settlement');
  const anchor = await confirmedBlock(client);
  check(
    c.payableMicros && c.lossKey && c.lossCapMicros && c.payoutTo,
    'Frozen settlement binding missing',
  );
  const [policy, loss, block, authority, settled, settledAtHead] = await Promise.all([
    readOnchainPolicy(client, procurementPool, toPolicyIdBytes32(c.policyId), anchor.number),
    readLossAccounting(client, procurementPool, c.lossKey as Hash, anchor.number),
    client.getBlock(),
    client.readContract({
      address: procurementPool,
      abi: insurancePoolAbi,
      functionName: 'claimsAuthority',
      blockNumber: anchor.number,
    }),
    isClaimSettled(client, procurementPool, toClaimIdBytes32(c.claimId ?? c.id), anchor.number),
    isClaimSettled(client, procurementPool, toClaimIdBytes32(c.claimId ?? c.id)),
  ]);
  await assertCanonicalBlock(client, anchor.number, anchor.hash);
  check(!settled && !settledAtHead, 'Claim already settled onchain', 'ALREADY_SETTLED');
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
  const transaction = prepareSettleClaim({
    pool: procurementPool,
    account: authority,
    policyId: toPolicyIdBytes32(c.policyId),
    claimId: toClaimIdBytes32(c.claimId ?? c.id),
    lossKey: c.lossKey as Hash,
    amount: c.payableMicros,
    lossCap: c.lossCapMicros,
    payoutTo: c.payoutTo as `0x${string}`,
  });
  const { account, to, data } = transaction;
  if (signingDeadlineMs !== undefined) {
    const tip = await client.getBlock();
    check(tip.hash && tip.number !== null && tip.number >= anchor.number, 'Arc tip unavailable');
    const [currentAuthority, currentPolicy, currentSettled, pendingSettled, nonce, pendingNonce] =
      await Promise.all([
        client.readContract({
          address: procurementPool,
          abi: insurancePoolAbi,
          functionName: 'claimsAuthority',
          blockNumber: tip.number,
        }),
        readOnchainPolicy(client, procurementPool, toPolicyIdBytes32(c.policyId), tip.number),
        isClaimSettled(client, procurementPool, toClaimIdBytes32(c.claimId ?? c.id), tip.number),
        client.readContract({
          address: procurementPool,
          abi: insurancePoolAbi,
          functionName: 'settledClaims',
          args: [toClaimIdBytes32(c.claimId ?? c.id)],
          blockTag: 'pending',
        }),
        client.getTransactionCount({ address: account, blockNumber: tip.number }),
        client.getTransactionCount({ address: account, blockTag: 'pending' }),
      ]);
    await client.call({ account, to, data, blockNumber: tip.number });
    await assertCanonicalBlock(client, tip.number, tip.hash);
    await assertCanonicalBlock(client, anchor.number, anchor.hash);
    check(currentAuthority.toLowerCase() === account.toLowerCase(), 'Arc claims authority changed');
    check(
      Number.isSafeInteger(nonce) && nonce >= 0 && nonce === pendingNonce,
      'Arc authority has unresolved pending transactions',
    );
    check(
      currentPolicy.bound &&
        !currentPolicy.cancelled &&
        currentPolicy.termsHash === policy.termsHash &&
        currentPolicy.beneficiary.toLowerCase() === c.payoutTo.toLowerCase() &&
        currentPolicy.coverageStart === policy.coverageStart &&
        currentPolicy.coverageEnd === policy.coverageEnd &&
        currentPolicy.limit - currentPolicy.paidOut >= c.payableMicros &&
        currentPolicy.reserved >= c.payableMicros,
      'Arc policy changed or capacity unavailable',
    );
    check(!currentSettled && !pendingSettled, 'Settlement is already recorded or pending on Arc');
    check(
      tip.timestamp >= policy.coverageStart &&
        tip.timestamp <= policy.coverageEnd &&
        tip.timestamp * 1000n < BigInt(signingDeadlineMs) &&
        Date.now() < signingDeadlineMs,
      'Settlement signing deadline expired or coverage window closed',
    );
    return { ...transaction, nonce };
  }
  await client.call({ account, to, data });
  return transaction;
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
/** A caller-provided hash is only a lookup key for a confirmed Arc receipt. */
export async function verifyClaimsSettlement(
  c: ClaimsCase,
  hash: Hash,
  client: PublicClient = procurementClient(),
) {
  const { receipt, block, nonce } = await readSettlementAttempt(c, hash, client);
  check(receipt.status === 'success', 'Successful pool settlement receipt required');
  const policyId = toPolicyIdBytes32(c.policyId);
  const claimId = toClaimIdBytes32(c.claimId ?? c.id);
  const [policy, loss, settled] = await Promise.all([
    readOnchainPolicy(client, procurementPool, policyId, receipt.blockNumber),
    readLossAccounting(client, procurementPool, c.lossKey as Hash, receipt.blockNumber),
    isClaimSettled(client, procurementPool, claimId, receipt.blockNumber),
  ]);
  check(
    policy.bound &&
      block.timestamp >= policy.coverageStart &&
      block.timestamp <= policy.coverageEnd &&
      policy.beneficiary.toLowerCase() === c.payoutTo?.toLowerCase() &&
      settled &&
      loss.exists &&
      loss.policyId === policyId &&
      loss.lossCap === c.lossCapMicros &&
      c.payableMicros !== null &&
      loss.paid >= c.payableMicros &&
      loss.paid <= loss.lossCap &&
      policy.paidOut >= c.payableMicros &&
      policy.paidOut + policy.reserved <= policy.limit,
    'Onchain settlement accounting or coverage window mismatch',
  );
  let matches = 0;
  let transfers = 0;
  for (const log of receipt.logs) {
    const emitter = log.address.toLowerCase();
    if (emitter === procurementPool.toLowerCase()) {
      const event = decodeEventLog({ abi: insurancePoolAbi, data: log.data, topics: log.topics });
      if (event.eventName !== 'ClaimSettled') continue;
      requireReceiptLog(receipt, log);
      assertSettlementEvent(c, event.args);
      check(
        event.args.lossPaidTotal >= event.args.amount && event.args.lossPaidTotal <= loss.paid,
        'Settlement cumulative payment mismatch',
      );
      matches++;
    } else if (emitter === ARC_USDC_ERC20_ADDRESS.toLowerCase()) {
      // Ignore other USDC events in the receipt.
      let event;
      try {
        event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      } catch {
        continue;
      }
      if (
        event.eventName === 'Transfer' &&
        event.args.from.toLowerCase() === procurementPool.toLowerCase() &&
        event.args.to.toLowerCase() === c.payoutTo?.toLowerCase() &&
        event.args.value === c.payableMicros
      ) {
        requireReceiptLog(receipt, log);
        transfers++;
      }
    }
  }
  check(matches === 1 && transfers === 1, 'Matching ClaimSettled event and USDC transfer required');
  await assertCanonicalBlock(client, receipt.blockNumber, receipt.blockHash);
  return {
    hash,
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    timestamp: Number(block.timestamp),
    termsHash: policy.termsHash,
    account: receipt.from,
    nonce,
  };
}

export async function readSettlementAttempt(
  c: ClaimsCase,
  hash: Hash,
  client: PublicClient = procurementClient(),
) {
  check(
    getRuntimeConfig().chainSource !== 'fixture',
    'Fixture source cannot confirm reimbursement',
  );
  check(
    c.payableMicros && c.lossKey && c.lossCapMicros && c.payoutTo,
    'Frozen settlement binding missing',
  );
  const { receipt, block } = await confirmedReceipt(client, hash);
  const [authority, tx] = await Promise.all([
    client.readContract({
      address: procurementPool,
      abi: insurancePoolAbi,
      functionName: 'claimsAuthority',
      blockNumber: receipt.blockNumber,
    }),
    client.getTransaction({ hash }),
  ]);
  const expected = prepareSettleClaim({
    pool: procurementPool,
    account: authority,
    policyId: toPolicyIdBytes32(c.policyId),
    claimId: toClaimIdBytes32(c.claimId ?? c.id),
    lossKey: c.lossKey as Hash,
    amount: c.payableMicros,
    lossCap: c.lossCapMicros,
    payoutTo: c.payoutTo as `0x${string}`,
  });
  check(
    receipt.from.toLowerCase() === authority.toLowerCase() &&
      receipt.to?.toLowerCase() === procurementPool.toLowerCase() &&
      tx.hash === receipt.transactionHash &&
      tx.blockNumber === receipt.blockNumber &&
      tx.blockHash === receipt.blockHash &&
      tx.from.toLowerCase() === receipt.from.toLowerCase() &&
      tx.to?.toLowerCase() === procurementPool.toLowerCase() &&
      tx.input === expected.data &&
      tx.value === 0n,
    'Receipt is not the exact settlement attempt from the designated authority',
  );
  await assertCanonicalBlock(client, receipt.blockNumber, receipt.blockHash);
  return { receipt, block, nonce: tx.nonce };
}

export async function verifyFailedSettlement(
  c: ClaimsCase,
  hash: Hash,
  client: PublicClient = procurementClient(),
) {
  const { receipt, block, nonce } = await readSettlementAttempt(c, hash, client);
  check(receipt.status === 'reverted', 'Confirmed reverted settlement required');
  await assertArcChain(client);
  check(
    !(await isClaimSettled(client, procurementPool, toClaimIdBytes32(c.claimId ?? c.id))),
    'Claim has another successful settlement awaiting reconciliation',
  );
  await assertCanonicalBlock(client, receipt.blockNumber, receipt.blockHash);
  return {
    timestamp: Number(block.timestamp),
    account: receipt.from,
    nonce,
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
  };
}
