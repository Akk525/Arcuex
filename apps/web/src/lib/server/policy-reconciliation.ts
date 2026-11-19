import { randomUUID } from 'node:crypto';
import {
  isSupportedIndependentTerms,
  type ProcurementAgent,
  type ProcurementPolicy,
  type ProcurementQuote,
  type ProcurementDelegation,
} from '@arcuex/domain';
import { ProcurementStore, type SqliteDb } from '@arcuex/persistence';
import { procurementDigest } from '@arcuex/agent-sdk';
import { decodePoolLog, insurancePoolAbi, toPolicyIdBytes32 } from '@arcuex/onchain';
import { procurementClient, procurementPool, verifyBindEvent } from './procurement-chain';
import { getRuntimeConfig } from './runtime-config';

export const reconciliationScope = `5042002:${procurementPool.toLowerCase()}`;
export type BindEvidence = {
  chainId: 5042002;
  pool: string;
  transactionHash: `0x${string}`;
  blockNumber: string;
  blockHash: string;
  logIndex: number;
  timestamp: number;
  policyId: string;
  termsHash: string;
  beneficiary: string;
  premiumPayer: string;
  premium: string;
  limit: string;
  coverageStart: string;
  coverageEnd: string;
};
export type ReconciliationRow = {
  event_key: string;
  onchain_policy_id: string;
  local_policy_id: string | null;
  status: 'VERIFIED_LINKED' | 'ONCHAIN_UNLINKED' | 'INCOMPLETE' | 'ORPHANED';
  canonical: number;
  block_number: string;
  block_hash: string;
  payload: string;
};
export function reconciliationRows(db: SqliteDb): ReconciliationRow[] {
  const c = getRuntimeConfig();
  return db
    .prepare('SELECT * FROM policy_bind_events WHERE scope=? ORDER BY block_number,event_key')
    .all(
      c.chainSource === 'fixture' ? `fixture:${c.fixtureId}` : reconciliationScope,
    ) as ReconciliationRow[];
}

/** Backend attestations are authenticated by immutable quote/acceptance/agent records and the committed digest.
 * These attestations concern synthetic positions; they are not independent proofs of real financial exposure. */
function completeLink(store: ProcurementStore, p: ProcurementPolicy, e: BindEvidence): boolean {
  try {
    const t = p.terms;
    const agent = store.get<ProcurementAgent>('agent', t.agentId);
    const quote = store.get<ProcurementQuote>('quote', t.quoteId);
    const accepted = store.get<{ digest: string; actor: string; at: number }>(
      'acceptance',
      t.policyId,
    );
    if (
      !!store.db.prepare('SELECT id FROM policies WHERE id=?').get(t.policyId) ||
      t.version !== 1 ||
      (t.synthetic !== true &&
        (!isSupportedIndependentTerms(t) || p.payer !== t.owner || p.delegationId !== null)) ||
      typeof t.productCode !== 'string' ||
      !t.productCode ||
      !/^[1-9][0-9]*$/.test(t.premiumMicros) ||
      !/^[1-9][0-9]*$/.test(t.limitMicros) ||
      !/^[0-9]+$/.test(t.deductibleMicros) ||
      !Number.isSafeInteger(t.effectiveAt) ||
      !Number.isSafeInteger(t.expiresAt) ||
      !Number.isSafeInteger(t.quoteExpiresAt) ||
      t.effectiveAt >= t.expiresAt ||
      !/^0x[0-9a-f]{40}$/.test(t.beneficiary) ||
      /^0x0{40}$/.test(t.beneficiary) ||
      !/^0x[0-9a-f]{40}$/.test(p.payer) ||
      /^0x0{40}$/.test(p.payer) ||
      !agent ||
      !quote ||
      !accepted ||
      procurementDigest(t) !== p.digest ||
      quote.digest !== p.digest ||
      procurementDigest(quote.terms) !== p.digest ||
      accepted.digest !== p.digest ||
      accepted.actor !== p.payer ||
      !Number.isSafeInteger(accepted.at) ||
      accepted.at > e.timestamp ||
      agent.owner !== t.owner ||
      agent.id !== t.agentId ||
      procurementDigest(agent.exposure) !== procurementDigest(t.exposure) ||
      t.exposure.chainId !== 5042002 ||
      !t.exposure.position ||
      !t.exposure.protocol ||
      !/^[1-9][0-9]*$/.test(t.exposure.notionalMicros) ||
      !/^0x[0-9a-f]{40}$/.test(t.owner) ||
      /^0x0{40}$/.test(t.owner) ||
      !t.insuredEvent ||
      !Array.isArray(t.exclusions) ||
      !t.exclusions.every((v) => typeof v === 'string') ||
      !['positionHealthy', 'noKnownIncident', 'ownerAttestsControl'].every(
        (k) => t.eligibility[k as keyof typeof t.eligibility] === true,
      ) ||
      t.eligibility.syntheticOnly !== t.synthetic ||
      BigInt(t.exposure.notionalMicros) < BigInt(t.limitMicros)
    )
      return false;
    if (p.payer !== t.owner) {
      const d = p.delegationId
        ? store.get<ProcurementDelegation>('delegation', p.delegationId)
        : null;
      if (
        !d ||
        agent.signer !== p.payer ||
        d.owner !== t.owner ||
        d.agentId !== t.agentId ||
        d.position !== t.exposure.position ||
        d.productCode !== t.productCode ||
        d.beneficiary !== t.beneficiary ||
        d.expiresAt <= accepted.at ||
        BigInt(d.limitCapMicros) < BigInt(t.limitMicros) ||
        BigInt(d.premiumCapMicros) < BigInt(t.premiumMicros)
      )
        return false;
      const revoked = store.get<{ at: number }>('revocation', d.id);
      if (revoked && revoked.at <= accepted.at) return false;
    }
    verifyBindEvent(
      p,
      {
        ...e,
        premium: BigInt(e.premium),
        limit: BigInt(e.limit),
        coverageStart: BigInt(e.coverageStart),
        coverageEnd: BigInt(e.coverageEnd),
      },
      e.timestamp,
    );
    return !p.bindTx || p.bindTx.toLowerCase() === e.transactionHash.toLowerCase();
  } catch {
    return false;
  }
}

/** No signing/broadcasting. A bounded scan plus revalidation of every prior canonical block.
 * Failures revoke freshness, preserve evidence and leave the scan retryable. */
export async function reconcilePolicyBinds(
  db: SqliteDb,
  fromBlock: bigint,
  toBlock: bigint,
  client = procurementClient(),
  confirmations = 2n,
) {
  if (getRuntimeConfig().chainSource === 'fixture')
    throw new Error('Live indexer disabled for fixture source');
  if (fromBlock < 0n || toBlock < fromBlock || toBlock - fromBlock > 2000n || confirmations < 1n)
    throw new Error('Invalid reconciliation range');
  const store = new ProcurementStore(db);
  const runId = randomUUID();
  db.transaction(() =>
    db
      .prepare(
        `INSERT INTO policy_reconciliation_scopes(scope,healthy,checked_at,run_id)
    VALUES (?,0,0,?) ON CONFLICT(scope) DO UPDATE SET healthy=0,run_id=excluded.run_id`,
      )
      .run(reconciliationScope, runId),
  )();
  try {
    if ((await client.getChainId()) !== 5042002) throw new Error('CHAIN_MISMATCH');
    const head = await client.getBlockNumber();
    if (toBlock + confirmations > head) throw new Error('UNCONFIRMED_RANGE');
    const anchor = await client.getBlock({ blockNumber: toBlock });
    if (!anchor.hash) throw new Error('MISSING_BLOCK');
    const previous = reconciliationRows(db).filter((r) => r.canonical);
    const orphaned = new Set<string>();
    for (const row of previous) {
      const n = BigInt(row.block_number);
      if (n + confirmations > head) {
        orphaned.add(row.event_key);
        continue;
      }
      const block = await client.getBlock({ blockNumber: n });
      if (block.hash !== row.block_hash) orphaned.add(row.event_key);
    }
    const logs = await client.getLogs({
      address: procurementPool,
      event: insurancePoolAbi.find((e) => e.type === 'event' && e.name === 'PolicyBound')!,
      fromBlock,
      toBlock,
      strict: true,
    });
    const evidence = new Map<string, BindEvidence>();
    for (const log of logs) {
      if (
        log.removed ||
        log.address.toLowerCase() !== procurementPool.toLowerCase() ||
        log.blockNumber === null ||
        log.blockHash === null ||
        log.transactionHash === null ||
        log.logIndex === null ||
        log.blockNumber < fromBlock ||
        log.blockNumber > toBlock
      )
        throw new Error('INVALID_LOG');
      const decoded = decodePoolLog(log);
      if (decoded.eventName !== 'PolicyBound') throw new Error('INVALID_EVENT');
      const block = await client.getBlock({ blockNumber: log.blockNumber });
      if (block.hash !== log.blockHash) throw new Error('REORG');
      const args = decoded.args;
      const chain = await client.readContract({
        address: procurementPool,
        abi: insurancePoolAbi,
        functionName: 'policies',
        args: [args.policyId],
        blockNumber: toBlock,
      });
      if (
        !chain[9] ||
        chain[0] !== args.termsHash ||
        chain[1].toLowerCase() !== args.beneficiary.toLowerCase() ||
        chain[2].toLowerCase() !== args.premiumPayer.toLowerCase() ||
        chain[3] !== args.limit ||
        chain[4] !== args.premium ||
        chain[5] !== args.coverageStart ||
        chain[6] !== args.coverageEnd
      )
        throw new Error('RPC_POLICY_MISMATCH');
      const e: BindEvidence = {
        chainId: 5042002,
        pool: procurementPool.toLowerCase(),
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber.toString(),
        blockHash: log.blockHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
        ...args,
        premium: args.premium.toString(),
        limit: args.limit.toString(),
        coverageStart: args.coverageStart.toString(),
        coverageEnd: args.coverageEnd.toString(),
      };
      const key = `${reconciliationScope}:${log.blockHash}:${log.transactionHash}:${log.logIndex}`;
      if (evidence.has(key) && JSON.stringify(evidence.get(key)) !== JSON.stringify(e))
        throw new Error('CONFLICTING_DUPLICATE');
      evidence.set(key, e);
    }
    // Missing deliveries in an explicitly rescanned range invalidate prior observations.
    for (const row of previous)
      if (
        BigInt(row.block_number) >= fromBlock &&
        BigInt(row.block_number) <= toBlock &&
        !evidence.has(row.event_key)
      )
        orphaned.add(row.event_key);
    // Close the observation window for all retained/new event blocks, including prior scan ranges.
    for (const [key, e] of evidence) {
      const block = await client.getBlock({ blockNumber: BigInt(e.blockNumber) });
      if (block.hash !== e.blockHash) throw new Error('REORG');
      if (orphaned.has(key)) throw new Error('INCONSISTENT_RPC');
    }
    for (const row of previous)
      if (!orphaned.has(row.event_key)) {
        const block = await client.getBlock({ blockNumber: BigInt(row.block_number) });
        if (block.hash !== row.block_hash) throw new Error('REORG');
      }
    const finalAnchor = await client.getBlock({ blockNumber: toBlock });
    if (anchor.hash !== finalAnchor.hash || (await client.getChainId()) !== 5042002)
      throw new Error('REORG_OR_CHAIN_MISMATCH');
    return db.transaction(() => {
      const current = db
        .prepare('SELECT run_id FROM policy_reconciliation_scopes WHERE scope=?')
        .get(reconciliationScope) as { run_id: string };
      if (current.run_id !== runId) throw new Error('SUPERSEDED_SCAN');
      for (const key of orphaned)
        db.prepare(
          "UPDATE policy_bind_events SET canonical=0,status='ORPHANED' WHERE event_key=?",
        ).run(key);
      // Re-evaluate old records too, so restored offchain records can safely complete historical links.
      for (const row of previous)
        if (!orphaned.has(row.event_key) && !evidence.has(row.event_key))
          evidence.set(row.event_key, JSON.parse(row.payload) as BindEvidence);
      const policies = db.prepare('SELECT id FROM procurement_policies').all() as { id: string }[];
      const quotes = db
        .prepare("SELECT payload FROM procurement_records WHERE kind='quote'")
        .all() as { payload: string }[];
      for (const [key, e] of evidence) {
        const matches = policies.filter((p) => toPolicyIdBytes32(p.id) === e.policyId);
        let localId = matches.length === 1 ? matches[0]!.id : null;
        let p = localId ? store.policy(localId) : null;
        if (!p && matches.length === 0) {
          // Recover only a self-procured quote with its original authenticated acceptance.
          // Delegated preparation is not reconstructed: its exact delegation is unavailable.
          const candidates: ProcurementPolicy[] = [];
          for (const row of quotes) {
            try {
              const q = JSON.parse(row.payload) as ProcurementQuote;
              if (toPolicyIdBytes32(q.terms.policyId) !== e.policyId) continue;
              const accepted = store.get<{ actor: string }>('acceptance', q.terms.policyId);
              if (accepted?.actor !== q.terms.owner) continue;
              const recovered: ProcurementPolicy = {
                ...q,
                state: 'prepared',
                payer: accepted.actor,
                delegationId: null,
                bindTx: null,
                confirmedAt: null,
              };
              if (completeLink(store, recovered, e)) candidates.push(recovered);
            } catch {
              /* Partial historical records never supply invented terms. */
            }
          }
          if (candidates.length === 1) {
            p = candidates[0]!;
            store.insertPolicy(p);
            localId = p.terms.policyId;
            policies.push({ id: localId });
          }
        }
        const verified = p && completeLink(store, p, e);
        const status = !p ? 'ONCHAIN_UNLINKED' : verified ? 'VERIFIED_LINKED' : 'INCOMPLETE';
        db.prepare(
          `INSERT INTO policy_bind_events VALUES (?,?,?,?,?,1,?,?,?)
          ON CONFLICT(event_key) DO UPDATE SET local_policy_id=excluded.local_policy_id,status=excluded.status,canonical=1`,
        ).run(
          key,
          reconciliationScope,
          e.policyId,
          localId,
          status,
          e.blockNumber,
          e.blockHash,
          JSON.stringify(e),
        );
        if (verified && p) store.confirm(p.terms.policyId, e.transactionHash, e.timestamp);
      }
      db.prepare(
        `UPDATE policy_reconciliation_scopes SET healthy=1,checked_at=?,through_block=?,through_hash=? WHERE scope=?`,
      ).run(Math.floor(Date.now() / 1000), toBlock.toString(), anchor.hash, reconciliationScope);
      return { observed: evidence.size, orphaned: orphaned.size, throughBlock: toBlock.toString() };
    })();
  } catch {
    // Never return RPC exceptions (they can contain credential-bearing URLs).
    throw new Error(
      'Policy reconciliation failed or superseded; this run grants no eligibility. Retry the range.',
    );
  }
}
