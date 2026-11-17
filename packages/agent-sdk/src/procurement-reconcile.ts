import type { PublicClient } from 'viem';
import { readOnchainPolicy, toPolicyIdBytes32 } from '@arcuex/onchain';
import { ProcurementError, type ProcurementService } from './procurement';
export async function reconcileProcurement(
  service: ProcurementService,
  client: PublicClient,
  actor: string,
  policyId: unknown,
) {
  const p = service.inspect(actor, policyId),
    t = p.terms;
  if ((await client.getChainId()) !== 5042002)
    throw new ProcurementError('WRONG_NETWORK', 'RPC must be Arc Testnet', 503);
  const [chain, block] = await Promise.all([
    readOnchainPolicy(client, service.pool, toPolicyIdBytes32(t.policyId)),
    client.getBlock(),
  ]);
  if (!chain.bound)
    return { status: 'Unbound on Arc Testnet; no coverage', block: block.number?.toString() };
  const match =
    chain.termsHash === p.digest &&
    chain.beneficiary.toLowerCase() === t.beneficiary &&
    chain.premiumPayer.toLowerCase() === p.payer &&
    chain.premium === BigInt(t.premiumMicros) &&
    chain.limit === BigInt(t.limitMicros) &&
    chain.coverageStart === BigInt(t.effectiveAt) &&
    chain.coverageEnd === BigInt(t.expiresAt);
  let status: string;
  if (!match)
    status = 'MISMATCH: deployed policy differs from backend terms; no recognized coverage';
  else if (!p.bindTx) status = 'Bound onchain; receipt must be verified before backend recognition';
  else if (chain.cancelled) status = 'Reservation released / cancelled by claims authority';
  else if (chain.paidOut >= chain.limit) status = 'Policy limit exhausted';
  else if (block.timestamp >= chain.coverageEnd) status = 'Coverage expired';
  else if (block.timestamp < chain.coverageStart)
    status = 'Confirmed and scheduled; coverage has not started';
  else status = 'Active synthetic coverage; onchain fields reconcile';
  return {
    status,
    block: block.number?.toString(),
    reservedMicros: chain.reserved.toString(),
    paidOutMicros: chain.paidOut.toString(),
  };
}
