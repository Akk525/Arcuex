import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, openReadonlyDatabase } from '@arcuex/persistence';
import { assertDatabaseSource, readFixture, seedFixture } from './fixture-source';
import { validateRuntimeEnvironment } from './runtime-config';
import { assertStorageReady } from './storage';

const id = 'candidate-12345678-1234-4234-8234-123456789abc';
const owner = `0x${'11'.repeat(20)}`;
const at = Math.floor(Date.now() / 1000);
function environment(dir: string, digest: string) {
  return {
    NODE_ENV: 'production',
    ARCUEX_DEPLOYMENT_MODE: 'local-test',
    ARCUEX_CHAIN_SOURCE: 'fixture',
    ARCUEX_FIXTURE_ID: id,
    ARCUEX_FIXTURE_DIGEST: digest,
    ARCUEX_PUBLIC_ORIGIN: 'http://localhost:3053',
    ARCUEX_PUBLIC_HOST: 'localhost:3053',
    ARCUEX_TLS_SERVER_NAME: 'localhost',
    ARCUEX_CHAIN_ID: '5042002',
    ARCUE_X_POOL_ADDRESS: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
    ARCUEX_DATA_DIR: dir,
    ARCUE_X_SQLITE_PATH: join(dir, `${id}.sqlite`),
    ARCUEX_STORAGE_ID: id,
    ARCUEX_SESSION_EPOCH: id,
    ARCUEX_RATE_LIMIT_SECRET: '01'.repeat(32),
    CLAIMS_REVIEWER_API_TOKEN: '02'.repeat(32),
    CLAIMS_AUTHORITY_API_TOKEN: '03'.repeat(32),
    ARCUEX_ACCEPTANCE_GATE_TOKEN: '04'.repeat(32),
    CLAIMS_COOKIE_SECURE: '1',
    CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP: '0',
  };
}
function fixture() {
  const db = openDatabase();
  const seeded = seedFixture(db, { id, owner, at });
  const config = validateRuntimeEnvironment(environment('/tmp/candidate-fixture', seeded.digest));
  return { db, config, ...seeded };
}
describe('pinned fixture source isolation and recovery', () => {
  it('requires a complete separate hosted identity and keeps HTTPS, gate and secure cookies enforced', () => {
    const hosted = {
      ...environment('/data', 'aa'.repeat(32)),
      ARCUEX_DEPLOYMENT_MODE: 'public-beta',
      ARCUEX_PUBLIC_ORIGIN: 'https://candidate.example.com',
      ARCUEX_PUBLIC_HOST: 'candidate.example.com',
      ARCUEX_TLS_SERVER_NAME: 'candidate.example.com',
      RAILWAY_PROJECT_ID: '11111111-1111-4111-8111-111111111111',
      RAILWAY_ENVIRONMENT_ID: '22222222-2222-4222-8222-222222222222',
      RAILWAY_SERVICE_ID: '33333333-3333-4333-8333-333333333333',
      RAILWAY_VOLUME_ID: '44444444-4444-4444-8444-444444444444',
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: 'generated-framework-test-only',
      __NEXT_PREVIEW_MODE_SIGNING_KEY: 'generated-framework-test-only',
      __NEXT_PREVIEW_MODE_ENCRYPTION_KEY: 'generated-framework-test-only',
    };
    const c = validateRuntimeEnvironment(hosted);
    expect(c.requireAcceptanceGate && c.requireRailwayEdge && c.secureCookies).toBe(true);
    expect(() => validateRuntimeEnvironment({ ...hosted, RAILWAY_VOLUME_ID: undefined })).toThrow(
      /RAILWAY_VOLUME_ID/,
    );
  });
  it('uses thirteen unchanged default migrations; pins provenance and a fixed checkpoint', () => {
    const f = fixture();
    try {
      expect(f.db.prepare('SELECT * FROM schema_migrations').all()).toHaveLength(13);
      expect(readFixture(f.db, f.config, at).source).toEqual({
        mode: 'fixture',
        id,
        digest: f.digest,
        checkpoint: { sequence: 1, createdAt: at, validUntil: at + 300 },
      });
      expect(f.db.pragma('foreign_key_check')).toEqual([]);
      expect(f.db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      expect(() => f.db.prepare("UPDATE candidate_fixture_source SET snapshot='{}'").run()).toThrow(
        /immutable/,
      );
      expect(() => f.db.prepare('DELETE FROM candidate_fixture_source').run()).toThrow(/immutable/);
      expect(() => f.db.prepare("UPDATE procurement_policies SET bind_tx='changed'").run()).toThrow(
        /immutable/,
      );
      expect(() => seedFixture(f.db, { id, owner, at })).toThrow(/empty|already/);
    } finally {
      f.db.close();
    }
  });
  it('preserves exact state and deadline across close/reopen and consistent SQLite backup recovery', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arcuex-fixture-restart-'));
    const path = join(dir, `${id}.sqlite`),
      backup = join(dir, 'backup.sqlite');
    let db = openDatabase(path);
    try {
      const seeded = seedFixture(db, { id, owner, at });
      const c = validateRuntimeEnvironment(environment(dir, seeded.digest));
      const first = readFixture(db, c, at);
      await db.backup(backup);
      const probe = openReadonlyDatabase(path);
      try {
        expect(readFixture(probe, c, at + 1)).toEqual(first);
        expect(() =>
          probe.prepare("UPDATE launch_runtime_state SET value='changed'").run(),
        ).toThrow(/readonly/);
        expect(probe.prepare('SELECT * FROM schema_migrations').all()).toHaveLength(13);
      } finally {
        probe.close();
      }
      db.close();
      db = openDatabase(path);
      expect(readFixture(db, c, at + 10)).toEqual(first);
      db.close();
      db = openDatabase(backup);
      expect(readFixture(db, c, at + 20)).toEqual(first);
      expect(() => readFixture(db, c, at + 300)).toThrow(/expired/);
      expect(() => readFixture(db, c, at - 1)).toThrow(/checkpoint/);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it.each([
    'UPDATE policy_reconciliation_scopes SET checked_at=checked_at+1',
    'UPDATE policy_reconciliation_scopes SET healthy=0',
    "UPDATE policy_bind_events SET payload='{}'",
    "UPDATE policy_bind_events SET block_hash='changed'",
    "DELETE FROM launch_runtime_state WHERE key='chain_source_identity'",
    'DROP TABLE candidate_fixture_source',
  ])('fails closed on inconsistent or unavailable source: %s', (sql) => {
    const f = fixture();
    try {
      f.db.exec(sql);
      expect(() => readFixture(f.db, f.config, at)).toThrow();
    } finally {
      f.db.close();
    }
  });
  it('rejects digest/source changes and both directions of source switching', () => {
    const f = fixture();
    try {
      expect(() => readFixture(f.db, { ...f.config, fixtureDigest: '00'.repeat(32) }, at)).toThrow(
        /digest/,
      );
      expect(() =>
        readFixture(f.db, { ...f.config, fixtureId: id.replace('12345678', '87654321') }, at),
      ).toThrow();
      expect(() => assertDatabaseSource(f.db, { ...f.config, chainSource: 'arc-testnet' })).toThrow(
        /live/,
      );
      const live = openDatabase();
      try {
        assertDatabaseSource(live, { ...f.config, chainSource: 'arc-testnet' });
        expect(() => seedFixture(live, { id, owner, at })).toThrow(/already/);
        expect(() => assertDatabaseSource(live, f.config)).toThrow();
      } finally {
        live.close();
      }
    } finally {
      f.db.close();
    }
  });
  it.each([
    { ARC_TESTNET_RPC_URL: 'https://rpc.testnet.arc.io' },
    { QUICKNODE_RPC_URL: 'https://rpc.quicknode.testnet.arc.io' },
    { ARCUEX_RECONCILIATION_ENABLED: '1' },
    { RAILWAY_PROJECT_ID: '03848637-de2d-497f-8308-f8f3ccf06f07' },
    { RAILWAY_ENVIRONMENT_ID: '6dca510e-fe00-4478-8d8d-ef65fd5bc4d7' },
    { RAILWAY_SERVICE_ID: '1280c69e-abbc-4d06-8ecc-93bf4a6ed226' },
    { RAILWAY_VOLUME_ID: 'b92846ec-9a00-40b6-80a9-bc9dce1e69a2' },
    { ARCUE_X_SQLITE_PATH: '/data/arcuex.sqlite' },
    { ARCUEX_STORAGE_ID: 'plan-a-volume' },
    { ARCUEX_SESSION_EPOCH: 'plan-a-epoch' },
    { CLAIMS_AUTHORITY_PRIVATE_KEY: 'secret-never-printed' },
    { RAILWAY_TOKEN: 'secret-never-printed' },
    { DATABASE_URL: 'secret-never-printed' },
    { PLAN_A_ACCEPTANCE_GATE_TOKEN: 'secret-never-printed' },
    { SIGNER_CREDENTIAL: 'secret-never-printed' },
    { CLAIMS_AUTHORITY_API_TOKEN: '02'.repeat(32) },
    { CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP: '1' },
    { ARCUEX_CHAIN_SOURCE: 'arc-testnet' },
    { ARCUEX_CHAIN_SOURCE: 'unknown' },
  ])('rejects mixed sources, Plan A identities and unsafe credentials: %j', (overrides) => {
    expect(() =>
      validateRuntimeEnvironment({
        ...environment('/tmp/candidate-fixture', 'aa'.repeat(32)),
        ...overrides,
      }),
    ).toThrow();
  });
  it('rejects the wrong volume marker, database symlinks and hard links', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arcuex-fixture-storage-'));
    const other = mkdtempSync(join(tmpdir(), 'arcuex-isolated-other-'));
    try {
      const c = validateRuntimeEnvironment(environment(dir, 'aa'.repeat(32)));
      writeFileSync(join(dir, '.arcuex-volume-id'), 'other-volume');
      expect(() => assertStorageReady(c)).toThrow(/identity/);
      writeFileSync(join(dir, '.arcuex-volume-id'), id);
      const foreign = join(other, 'untouched.sqlite');
      writeFileSync(foreign, 'isolated sentinel');
      symlinkSync(foreign, c.databasePath);
      expect(() => assertStorageReady(c)).toThrow(/escapes/);
      rmSync(c.databasePath);
      linkSync(foreign, c.databasePath);
      expect(() => assertStorageReady(c)).toThrow(/hard links/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });
});
