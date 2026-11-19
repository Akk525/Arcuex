/** Local CLI initialization and rejection checks; all credentials generated in memory. */
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const dir = mkdtempSync(join(tmpdir(), 'arcuex-initializer-test-'));
const foreign = mkdtempSync(join(tmpdir(), 'arcuex-foreign-volume-test-'));
const id = `candidate-${randomUUID()}`;
const env = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]),
);
Object.assign(env, {
  NODE_ENV: 'production',
  ARCUEX_DEPLOYMENT_MODE: 'local-test',
  ARCUEX_CHAIN_SOURCE: 'fixture',
  ARCUEX_FIXTURE_ID: id,
  ARCUEX_FIXTURE_OWNER: '0x1111111111111111111111111111111111111111',
  ARCUEX_PUBLIC_ORIGIN: 'http://localhost:3053',
  ARCUEX_PUBLIC_HOST: 'localhost:3053',
  ARCUEX_TLS_SERVER_NAME: 'localhost',
  ARCUEX_CHAIN_ID: '5042002',
  ARCUE_X_POOL_ADDRESS: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
  ARCUEX_DATA_DIR: dir,
  ARCUE_X_SQLITE_PATH: join(dir, `${id}.sqlite`),
  ARCUEX_STORAGE_ID: id,
  ARCUEX_SESSION_EPOCH: id,
  ARCUEX_RATE_LIMIT_SECRET: randomBytes(32).toString('hex'),
  CLAIMS_REVIEWER_API_TOKEN: randomBytes(32).toString('hex'),
  CLAIMS_AUTHORITY_API_TOKEN: randomBytes(32).toString('hex'),
  ARCUEX_ACCEPTANCE_GATE_TOKEN: randomBytes(32).toString('hex'),
  CLAIMS_COOKIE_SECURE: '1',
  CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP: '0',
});
const call = (overrides = {}) =>
  spawnSync(
    'pnpm',
    [
      '--filter',
      '@arcuex/onchain',
      'exec',
      'tsx',
      '../../apps/web/scripts/seed-candidate-fixture.mts',
    ],
    {
      env: { ...env, ...overrides },
      encoding: 'utf8',
      timeout: 30000,
    },
  );
const fingerprint = () =>
  createHash('sha256').update(readFileSync(env.ARCUE_X_SQLITE_PATH)).digest('hex');
try {
  const first = call();
  assert.equal(
    first.status,
    0,
    'fresh initialization failed (output suppressed to protect environment)',
  );
  const result = JSON.parse(first.stdout);
  assert.match(result.ARCUEX_FIXTURE_DIGEST, /^[0-9a-f]{64}$/);
  assert.equal(result.checkpoint.validUntil - result.checkpoint.createdAt, 300);
  assert.equal(readFileSync(join(dir, '.arcuex-volume-id'), 'utf8'), id);
  const before = fingerprint();
  console.log(
    'PASS explicit initializer creates the candidate database, marker, digest and fixed checkpoint',
  );
  for (const [label, overrides] of [
    ['reseed refuses to overwrite the initialized candidate', {}],
    ['live RPC configuration is rejected', { ARC_TESTNET_RPC_URL: 'https://rpc.testnet.arc.io' }],
    [
      'Plan A volume identity is rejected',
      { RAILWAY_VOLUME_ID: 'b92846ec-9a00-40b6-80a9-bc9dce1e69a2' },
    ],
    [
      'signing credentials are rejected',
      { CLAIMS_AUTHORITY_PRIVATE_KEY: 'test-only-forbidden-value' },
    ],
  ]) {
    assert.notEqual(call(overrides).status, 0);
    assert.equal(fingerprint(), before);
    console.log('PASS ' + label + '; original database unchanged');
  }
  writeFileSync(join(foreign, '.arcuex-volume-id'), 'foreign-volume-sentinel');
  assert.notEqual(
    call({ ARCUEX_DATA_DIR: foreign, ARCUE_X_SQLITE_PATH: join(foreign, `${id}.sqlite`) }).status,
    0,
  );
  assert.equal(readFileSync(join(foreign, '.arcuex-volume-id'), 'utf8'), 'foreign-volume-sentinel');
  console.log('PASS foreign nonempty volume is rejected without marker overwrite');
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(foreign, { recursive: true, force: true });
}
