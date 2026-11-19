import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  http,
  keccak256,
  type Hash,
  type Hex,
  type Address,
} from 'viem';
import { arcTestnet, ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import {
  insurancePoolAbi,
  prepareBindPolicy,
  prepareUsdcApprove,
  readOnchainPolicy,
  toPolicyIdBytes32,
} from '@arcuex/onchain';
import type { ProcurementPolicy } from '@arcuex/domain';
import { getArcRpcUrl } from './env-rpc';
import { check } from './procurement';
import manifest from '../../../../../docs/deployments/arc-testnet-insurance-pool.json';
import { getRuntimeConfig } from './runtime-config';
import { getDb } from './db';
import { readFixture } from './fixture-source';
import { procurementDigest } from '@arcuex/agent-sdk';

export const procurementPool = manifest.insurancePool as Address;
export const procurementClient = () =>
  createPublicClient({
    chain: arcTestnet,
    transport: http(getArcRpcUrl(), { retryCount: 1, timeout: 12000 }),
  });
export function transactions(policy: ProcurementPolicy) {
  check(
    getRuntimeConfig().chainSource !== 'fixture',
    'Financial preparation disabled in fixture mode',
  );
  const t = policy.terms,
    account = policy.payer as Address;
  return [
    prepareUsdcApprove({
      usdc: ARC_USDC_ERC20_ADDRESS,
      spender: procurementPool,
      amount: BigInt(t.premiumMicros),
      account,
    }),
    prepareBindPolicy({
      pool: procurementPool,
      account,
      policyId: toPolicyIdBytes32(t.policyId),
      termsHash: policy.digest,
      beneficiary: t.beneficiary as Address,
      premium: BigInt(t.premiumMicros),
      limit: BigInt(t.limitMicros),
      coverageStart: BigInt(t.effectiveAt),
      coverageEnd: BigInt(t.expiresAt),
    }),
  ];
}
export async function readProcurementCapacity(client = procurementClient()) {
  check((await client.getChainId()) === 5042002, 'RPC is not Arc Testnet', 'CHAIN_MISMATCH');
  const [code, usdc, capital] = await Promise.all([
    client.getCode({ address: procurementPool }),
    client.readContract({ address: procurementPool, abi: insurancePoolAbi, functionName: 'usdc' }),
    client.readContract({
      address: procurementPool,
      abi: insurancePoolAbi,
      functionName: 'availableCapital',
    }),
  ]);
  check(
    code && code !== '0x' && usdc.toLowerCase() === ARC_USDC_ERC20_ADDRESS.toLowerCase(),
    'Deployment mismatch',
    'CHAIN_MISMATCH',
  );
  return capital;
}
export async function preflight(policy: ProcurementPolicy, client = procurementClient()) {
  check(
    getRuntimeConfig().chainSource !== 'fixture',
    'Financial preflight disabled in fixture mode',
  );
  const [capital, onchain] = await Promise.all([
    readProcurementCapacity(client),
    readOnchainPolicy(client, procurementPool, toPolicyIdBytes32(policy.terms.policyId)),
  ]);
  check(!onchain.bound, 'Policy is already bound; reconcile the receipt', 'ALREADY_BOUND');
  if (policy.terms.synthetic === false) {
    const profile = policy.terms.independentProfile;
    check(profile, 'Independent evidence profile unavailable', 'PRODUCT_UNAVAILABLE');
    const runtime = await client.getCode({ address: profile.emitter });
    check(
      runtime && runtime !== '0x' && keccak256(runtime) === profile.runtimeCodeHash,
      'Approved independent evidence protocol could not be verified',
      'PRODUCT_UNAVAILABLE',
    );
  }
  check(
    capital >= BigInt(policy.terms.limitMicros),
    'Insufficient available pool capital',
    'CAPITAL_UNAVAILABLE',
  );
}

export async function preflightPayment(
  policy: ProcurementPolicy,
  stage: 'approve' | 'bind',
  client = procurementClient(),
) {
  await preflight(policy, client);
  const account = policy.payer as Address;
  const premium = BigInt(policy.terms.premiumMicros);
  const [block, balance, allowance] = await Promise.all([
    client.getBlock(),
    client.readContract({
      address: ARC_USDC_ERC20_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account],
    }),
    stage === 'bind' &&
      client.readContract({
        address: ARC_USDC_ERC20_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [account, procurementPool],
      }),
  ]);
  check(
    block.timestamp < BigInt(policy.terms.quoteExpiresAt),
    'Quote expired on Arc; request a fresh quote',
    'QUOTE_EXPIRED',
  );
  check(
    balance >= premium,
    'Payer needs enough testnet USDC for the premium',
    'INSUFFICIENT_PREMIUM_BALANCE',
  );
  check(
    stage === 'approve' || (allowance !== false && allowance >= premium),
    'Approve the premium before preparing the bind',
    'PREMIUM_ALLOWANCE_REQUIRED',
  );
}

export function verifyBindEvent(
  policy: ProcurementPolicy,
  args: Record<string, unknown>,
  timestamp: number,
) {
  const t = policy.terms;
  check(
    args.policyId === toPolicyIdBytes32(t.policyId) &&
      args.termsHash === policy.digest &&
      String(args.beneficiary).toLowerCase() === t.beneficiary &&
      String(args.premiumPayer).toLowerCase() === policy.payer &&
      args.premium === BigInt(t.premiumMicros) &&
      args.limit === BigInt(t.limitMicros) &&
      args.coverageStart === BigInt(t.effectiveAt) &&
      args.coverageEnd === BigInt(t.expiresAt),
    'Receipt does not match immutable policy',
    'RECONCILIATION_MISMATCH',
  );
  check(
    timestamp >= t.quoteExpiresAt - 600 &&
      timestamp < t.quoteExpiresAt &&
      timestamp < t.effectiveAt,
    'Late bind or pre-quote block is outside the accepted quote window',
    'LATE_BIND',
  );
}
export async function verifyReceipt(policy: ProcurementPolicy, hash: Hash) {
  check(
    getRuntimeConfig().chainSource !== 'fixture',
    'Live receipt confirmation disabled in fixture mode',
  );
  const client = procurementClient();
  check((await client.getChainId()) === 5042002, 'RPC is not Arc Testnet', 'CHAIN_MISMATCH');
  const receipt = await client.getTransactionReceipt({ hash });
  check(
    receipt.status === 'success' &&
      receipt.to?.toLowerCase() === procurementPool.toLowerCase() &&
      receipt.from.toLowerCase() === policy.payer,
    'Successful bind receipt from the expected payer required',
    'INVALID_RECEIPT',
  );
  const block = await client.getBlock({ blockHash: receipt.blockHash });
  let matched = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== procurementPool.toLowerCase()) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: insurancePoolAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (decoded.eventName === 'PolicyBound') {
      verifyBindEvent(policy, decoded.args, Number(block.timestamp));
      matched = true;
    }
  }
  check(matched, 'PolicyBound event missing', 'INVALID_RECEIPT');
  return Number(block.timestamp);
}
export async function reconcile(policy: ProcurementPolicy) {
  const config = getRuntimeConfig();
  if (config.chainSource === 'fixture') {
    const fixture = readFixture(getDb(), config);
    check(
      fixture.policy.terms.policyId === policy.terms.policyId &&
        procurementDigest(fixture.policy) === procurementDigest(policy),
      'Policy is not in configured fixture source',
    );
    return {
      bound: true,
      cancelled: false,
      matches: true,
      paidOutMicros: '0',
      reservedMicros: fixture.policy.terms.limitMicros,
      checkedAt: new Date(fixture.checkpoint.createdAt * 1000).toISOString(),
      source: fixture.source,
    };
  }
  const client = procurementClient();
  check((await client.getChainId()) === 5042002, 'RPC chain mismatch', 'CHAIN_MISMATCH');
  const p = await readOnchainPolicy(
    client,
    procurementPool,
    toPolicyIdBytes32(policy.terms.policyId),
  );
  const t = policy.terms;
  const matches =
    p.bound &&
    p.termsHash === policy.digest &&
    p.beneficiary.toLowerCase() === t.beneficiary &&
    p.premiumPayer.toLowerCase() === policy.payer &&
    p.premium === BigInt(t.premiumMicros) &&
    p.limit === BigInt(t.limitMicros) &&
    p.coverageStart === BigInt(t.effectiveAt) &&
    p.coverageEnd === BigInt(t.expiresAt);
  return {
    bound: p.bound,
    cancelled: p.cancelled,
    matches,
    paidOutMicros: p.paidOut.toString(),
    reservedMicros: p.reserved.toString(),
    checkedAt: new Date().toISOString(),
  };
}
export function txHash(value: unknown): Hash {
  check(
    typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value),
    'Valid transaction hash required',
  );
  return value as Hex;
}

/** Verify the exact ERC-20 approval receipt; no funding assertion is accepted from the caller. */
export async function verifyApproval(
  policy: ProcurementPolicy,
  hash: Hash,
  client = procurementClient(),
) {
  check(
    getRuntimeConfig().chainSource !== 'fixture',
    'Live approval confirmation disabled in fixture mode',
  );
  check((await client.getChainId()) === 5042002, 'RPC is not Arc Testnet', 'CHAIN_MISMATCH');
  const [receipt, tx] = await Promise.all([
    client.getTransactionReceipt({ hash }),
    client.getTransaction({ hash }),
  ]);
  const expected = transactions(policy)[0]!;
  check(
    receipt.status === 'success' &&
      tx.from.toLowerCase() === policy.payer &&
      tx.to?.toLowerCase() === expected.to.toLowerCase() &&
      tx.input === expected.data &&
      tx.value === 0n,
    'Approval receipt does not match the exact premium, spender or payer',
    'INVALID_RECEIPT',
  );
  const block = await client.getBlock({ blockHash: receipt.blockHash });
  return Number(block.timestamp);
}
