import { openApplicationDatabase } from '../src/lib/server/db';
import { getRuntimeConfig } from '../src/lib/server/runtime-config';
import { reconcilePolicyBinds } from '../src/lib/server/policy-reconciliation';
import { reconcileSettlementAnchors } from '../src/lib/server/settlement-reconciliation';
// Explicit database and block range: never silently creates/uses a demo database.
const [from, to] = process.argv.slice(2);
const path = process.env.ARCUE_X_SQLITE_PATH;
if (!path || !from || !to || !/^[0-9]+$/.test(from) || !/^[0-9]+$/.test(to)) {
  console.error(
    'Require ARCUE_X_SQLITE_PATH and decimal from/to blocks (at most 2001 blocks). No broadcasts.',
  );
  process.exit(1);
}
const config = getRuntimeConfig();
if (config.chainSource !== 'arc-testnet' || (config.enforced && path !== config.databasePath))
  throw new Error('Indexer requires the configured Arc Testnet database');
const db = openApplicationDatabase(path);
try {
  const orphanedSettlements = await reconcileSettlementAnchors(db);
  const result = await reconcilePolicyBinds(db, BigInt(from), BigInt(to));
  console.log(JSON.stringify({ ...result, orphanedSettlements }));
} catch {
  console.error(
    'Reconciliation failed. Eligibility suspended; retry the same range after checking RPC/network.',
  );
  process.exitCode = 1;
} finally {
  db.close();
}
