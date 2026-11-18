import { openDatabase } from '@arcuex/persistence';
import { reconcilePolicyBinds } from '../src/lib/server/policy-reconciliation';
// Explicit database and block range: never silently creates/uses a demo database.
const [from, to] = process.argv.slice(2);
const path = process.env.ARCUE_X_SQLITE_PATH;
if (!path || !from || !to || !/^[0-9]+$/.test(from) || !/^[0-9]+$/.test(to)) {
  console.error(
    'Require ARCUE_X_SQLITE_PATH and decimal from/to blocks (at most 2001 blocks). No broadcasts.',
  );
  process.exit(1);
}
const db = openDatabase(path);
try {
  console.log(JSON.stringify(await reconcilePolicyBinds(db, BigInt(from), BigInt(to))));
} catch {
  console.error(
    'Reconciliation failed. Eligibility suspended; retry the same range after checking RPC/network.',
  );
  process.exitCode = 1;
} finally {
  db.close();
}
