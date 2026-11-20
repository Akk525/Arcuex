import type { PublicClient } from 'viem';
import { InsuranceRepository, type SqliteDb } from '@arcuex/persistence';
import { reopenOrphanedSettlement } from '@arcuex/insurance';
import { procurementClient } from './procurement-chain';
import { recordedSettlement } from './claims-settlement-projection';
import { ARC_CONFIRMATION_DEPTH, assertArcChain } from './arc-confirmation';
import { getRuntimeConfig } from './runtime-config';

/** Recheck persisted payment anchors on each scan, including after a worker restart. */
export async function reconcileSettlementAnchors(
  db: SqliteDb,
  client: PublicClient = procurementClient(),
) {
  if (getRuntimeConfig().chainSource !== 'arc-testnet') throw new Error('Live source required');
  const rows = db
    .prepare(
      "SELECT id, row_version FROM claims_cases WHERE status='PAID' AND evidence_authenticity='verified_independent'",
    )
    .all() as { id: string; row_version: number }[];
  if (!rows.length) return 0;

  await assertArcChain(client);
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const repo = new InsuranceRepository(db);
  let orphaned = 0;
  for (const row of rows) {
    const anchor = recordedSettlement(db, row.id)?.anchor;
    if (!anchor) continue; // Historical payments have no block anchor. Require a separate receipt audit.
    const blockNumber = BigInt(anchor.blockNumber);
    if (head < blockNumber + ARC_CONFIRMATION_DEPTH)
      throw new Error('Settlement anchor depth unavailable');
    const block = await client.getBlock({ blockNumber });
    if (!block.hash) throw new Error('Settlement anchor unavailable');
    if (block.hash !== anchor.blockHash) {
      // A second observation avoids changing state on an inconsistent, single RPC reply.
      const rechecked = await client.getBlock({ blockNumber });
      if (rechecked.hash !== block.hash) throw new Error('Inconsistent Arc settlement anchor');
      if (
        reopenOrphanedSettlement(repo, {
          caseId: row.id,
          expectedVersion: row.row_version,
          orphanedBlockHash: anchor.blockHash,
        })
      )
        orphaned++;
    }
  }
  return orphaned;
}
