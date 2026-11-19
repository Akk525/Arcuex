/** Candidate volume initialization only. Never reads another environment or loads a signing key. */
import { readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase } from '@arcuex/persistence';
import { validateRuntimeEnvironment } from '../src/lib/server/runtime-config';
import { seedFixture } from '../src/lib/server/fixture-source';

// The digest is produced by this explicit seed operation; the running app requires it independently.
if (process.env.ARCUEX_FIXTURE_DIGEST) throw new Error('Refusing reseed of a pinned source');
const c = validateRuntimeEnvironment({ ...process.env, ARCUEX_FIXTURE_DIGEST: '0'.repeat(64) });
if (c.chainSource !== 'fixture' || !c.enforced)
  throw new Error('Explicit production fixture configuration required');
const root = realpathSync(c.dataDir);
if (readdirSync(root).length !== 0 || c.databasePath !== join(c.dataDir, `${c.fixtureId}.sqlite`))
  throw new Error('Seed requires a new, empty candidate volume; no overwrite or restore');
writeFileSync(c.databasePath, '', { flag: 'wx', mode: 0o600 });
const db = openDatabase(
  c.databasePath,
  join(import.meta.dirname, '../../../packages/persistence/src/migrations'),
);
try {
  const result = seedFixture(db, {
    id: c.fixtureId,
    owner: process.env.ARCUEX_FIXTURE_OWNER ?? '',
    at: Math.floor(Date.now() / 1000),
  });
  writeFileSync(join(root, '.arcuex-volume-id'), c.fixtureId, { flag: 'wx', mode: 0o600 });
  console.log(
    JSON.stringify({
      ARCUEX_FIXTURE_DIGEST: result.digest,
      source: 'synthetic snapshot; not Arc blockchain evidence',
      policyId: result.snapshot.policy.terms.policyId,
      checkpoint: result.snapshot.checkpoint,
    }),
  );
} finally {
  db.close();
}
