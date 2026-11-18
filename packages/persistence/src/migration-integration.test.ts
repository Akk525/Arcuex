import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildSyntheticTerms, createSyntheticCoverageProduct, newId } from '@arcuex/domain';
import { migrate } from './migrate';
import { InsuranceRepository } from './repository';
const common = ['001_init.sql', '002_onchain.sql', '003_streams_inbox.sql'];
const procurement = ['004_procurement.sql', '005_procurement_immutability.sql'];
const claims = [
  '004_claims_cases.sql',
  '005_claims_case_binding.sql',
  '006_claims_auth_sessions.sql',
];
function beforeIntegration(files: string[]) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  for (const file of files) {
    db.exec(readFileSync(join(__dirname, 'migrations', file), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(file, new Date().toISOString());
  }
  return db;
}
function seedClaims(db: Database.Database) {
  const repo = new InsuranceRepository(db),
    holder = newId(),
    agent = newId(),
    quote = newId(),
    policy = newId(),
    exposure = newId(),
    id = newId(),
    stamp = new Date().toISOString(),
    terms = buildSyntheticTerms({
      coverageStartsAt: '2026-11-01T00:00:00.000Z',
      coverageEndsAt: '2026-12-01T00:00:00.000Z',
    });
  const product = createSyntheticCoverageProduct();
  repo.saveProduct(product);
  repo.savePolicyholder({ id: holder, displayName: 'Upgrade fixture', createdAt: stamp });
  repo.saveAgent({
    id: agent,
    policyholderId: holder,
    externalRef: 'fixture',
    label: 'fixture',
    createdAt: stamp,
  });
  repo.saveQuote({
    id: quote,
    productId: product.id,
    policyholderId: holder,
    agentId: agent,
    status: 'accepted',
    terms,
    idempotencyKey: 'upgrade-quote',
    expiresAt: stamp,
    createdAt: stamp,
  });
  repo.savePolicy({
    id: policy,
    quoteId: quote,
    productId: product.id,
    policyholderId: holder,
    agentId: agent,
    status: 'active',
    terms,
    createdAt: stamp,
  });
  repo.saveExposure({
    id: exposure,
    policyId: policy,
    exposureKey: 'fixture',
    description: 'fixture',
    limitMicros: terms.limitMicros,
    createdAt: stamp,
  });
  db.prepare(
    `INSERT INTO claims_cases(id,schema_version,status,policy_id,exposure_id,claimant_ref,idempotency_key,synthetic_demo,evidence_authenticity,coverage_determination,settlement_authorization,deductible_micros,prior_compensation_micros,created_at,updated_at,adjudication_binding_json) VALUES (?,1,'REVIEW',?,?,'holder','upgrade-case',1,'unverified','review_required','none','100000','0',?,?,?)`,
  ).run(id, policy, exposure, stamp, stamp, '{"frozen":"preserve-exactly"}');
  db.prepare(
    `INSERT INTO claims_case_events VALUES (?,?,'DRAFT','REVIEW','system:fixture','EXISTING','{}',?)`,
  ).run(newId(), id, stamp);
  db.prepare(
    `INSERT INTO claims_sessions(id,role,subject,expires_at,created_at) VALUES ('existing-session','reviewer','fixture',?,?)`,
  ).run(stamp, stamp);
  return id;
}
describe('integration migration histories', () => {
  it('migrates a fresh database and is repeatable with foreign keys enabled', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys=ON');
    migrate(db);
    migrate(db);
    expect(db.prepare('SELECT * FROM schema_migrations').all()).toHaveLength(13);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name='launch_rate_limits'").get(),
    ).toBeTruthy();
    expect(
      db.prepare("SELECT value FROM launch_runtime_state WHERE key='recovery_hold'").get(),
    ).toEqual({ value: '0' });
  });

  it('applies 009_launch_security onto an already-integrated database', () => {
    const db = beforeIntegration([
      ...common,
      ...procurement,
      ...claims,
      '007_procurement_claims_integration.sql',
      '008_shared_wallet_session_scope.sql',
    ]);
    migrate(db);
    const applied = db
      .prepare('SELECT id FROM schema_migrations WHERE id=?')
      .get('009_launch_security.sql') as { id: string } | undefined;
    expect(applied?.id).toBe('009_launch_security.sql');
    const cols = db.prepare('PRAGMA table_info(claims_sessions)').all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'config_epoch')).toBe(true);
  });
  it.each(['procurement', 'claims', 'both'])(
    'upgrades existing %s history without losing records or original migration IDs',
    (history) => {
      const files = [
        ...common,
        ...(history !== 'claims' ? procurement : []),
        ...(history !== 'procurement' ? claims : []),
      ];
      const db = beforeIntegration(files);
      let caseId: string | undefined;
      if (history !== 'procurement') caseId = seedClaims(db);
      if (history !== 'claims') {
        db.prepare('INSERT INTO procurement_records VALUES (?,?,?,?)').run(
          'quote',
          'old-quote',
          'owner',
          '{"immutable":"snapshot"}',
        );
        db.prepare('INSERT INTO procurement_sessions VALUES (?,?,?)').run(
          'retired',
          'owner',
          9999999999,
        );
      }
      migrate(db);
      migrate(db);
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      for (const file of files)
        expect(db.prepare('SELECT id FROM schema_migrations WHERE id=?').get(file)).toBeTruthy();
      if (caseId) {
        expect(
          db.prepare('SELECT adjudication_binding_json FROM claims_cases WHERE id=?').get(caseId),
        ).toEqual({ adjudication_binding_json: '{"frozen":"preserve-exactly"}' });
        expect(
          db.prepare('SELECT * FROM claims_case_events WHERE case_id=?').all(caseId),
        ).toHaveLength(1);
        expect(
          db.prepare('SELECT id FROM claims_sessions WHERE id=?').get('existing-session'),
        ).toBeTruthy();
      }
      if (history !== 'claims')
        expect(
          db.prepare('SELECT payload FROM procurement_records WHERE id=?').get('old-quote'),
        ).toEqual({ payload: '{"immutable":"snapshot"}' });
      expect(() => db.prepare('SELECT * FROM procurement_sessions').all()).toThrow('no such table');
    },
  );
  it('rolls back a failed rebuild and restores foreign key enforcement', () => {
    const db = beforeIntegration([...common, ...procurement, ...claims]);
    const id = seedClaims(db);
    db.pragma('foreign_keys=OFF');
    db.prepare('UPDATE claims_cases SET exposure_id=? WHERE id=?').run(newId(), id);
    db.pragma('foreign_keys=ON');
    expect(() => migrate(db)).toThrow('Foreign key');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(
      db
        .prepare(
          "SELECT id FROM schema_migrations WHERE id='007_procurement_claims_integration.sql'",
        )
        .get(),
    ).toBeUndefined();
    expect(db.prepare('SELECT id FROM claims_cases WHERE id=?').get(id)).toBeTruthy();
  });
});

it('retires old claims-only claimant sessions/nonces while preserving ops and newly issued shared sessions', () => {
  const db = beforeIntegration([...common, ...procurement, ...claims]);
  db.prepare(
    "INSERT INTO claims_sessions(id,role,subject,expires_at,created_at) VALUES ('old-wallet','claimant','holder','2099-01-01T00:00:00.000Z','2026-11-01T00:00:00.000Z')",
  ).run();
  db.prepare(
    "INSERT INTO claims_sessions(id,role,subject,expires_at,created_at) VALUES ('ops','authority','ops','2099-01-01T00:00:00.000Z','2026-11-01T00:00:00.000Z')",
  ).run();
  db.prepare(
    "INSERT INTO claims_auth_nonces VALUES ('old-nonce','owner','claims only','2099-01-01T00:00:00.000Z',NULL)",
  ).run();
  migrate(db);
  expect(
    (
      db.prepare("SELECT revoked_at FROM claims_sessions WHERE id='old-wallet'").get() as {
        revoked_at: string;
      }
    ).revoked_at,
  ).toBeTruthy();
  // 008 preserves ops through shared-scope rotation; 009 then retires every pre-launch
  // session (including ops) so the pinned signing domain/session epoch cannot be skipped.
  expect(
    (
      db.prepare("SELECT revoked_at FROM claims_sessions WHERE id='ops'").get() as {
        revoked_at: string;
      }
    ).revoked_at,
  ).toBeTruthy();
  expect(
    (
      db.prepare("SELECT consumed_at FROM claims_auth_nonces WHERE nonce='old-nonce'").get() as {
        consumed_at: string;
      }
    ).consumed_at,
  ).toBeTruthy();
  db.prepare(
    "INSERT INTO claims_sessions(id,role,subject,expires_at,created_at,config_epoch) VALUES ('new-wallet','claimant','holder','2099-01-01T00:00:00.000Z','2026-11-17T00:00:00.000Z','launch-2026-11-20')",
  ).run();
  migrate(db);
  expect(db.prepare("SELECT revoked_at FROM claims_sessions WHERE id='new-wallet'").get()).toEqual({
    revoked_at: null,
  });
});

it('adds reconciliation to the release database without rewriting historical policy, settlement, or loss bindings', () => {
  const db = beforeIntegration([
    ...common,
    ...procurement,
    ...claims,
    '007_procurement_claims_integration.sql',
    '008_shared_wallet_session_scope.sql',
    '009_launch_security.sql',
  ]);
  seedClaims(db);
  const preservedTables = [
    'claims_cases',
    'claims_case_events',
    'claims_sessions',
    'policies',
    'covered_exposures',
    'capital_pools',
    'capital_reservations',
    'settlements',
    'onchain_claim_settlements',
  ];
  const snapshots = preservedTables.map(
    (table) => [table, db.prepare(`SELECT * FROM ${table}`).all()] as const,
  );
  const policyId = newId();
  const payload = JSON.stringify({
    terms: { policyId, owner: 'historical-owner' },
    payer: 'historical-payer',
  });
  db.transaction(() => {
    db.prepare(
      'INSERT INTO procurement_policies(id,owner,quote_id,payload,bind_tx,confirmed_at) VALUES (?,?,?,?,?,?)',
    ).run(policyId, 'historical-owner', newId(), payload, 'historic-bind', 100);
  })();
  const before = db.prepare('SELECT * FROM procurement_policies').all();
  migrate(db);
  migrate(db);
  expect(db.prepare('SELECT * FROM procurement_policies').all()).toEqual(before);
  expect(db.prepare('SELECT * FROM policy_bind_events').all()).toEqual([]);
  for (const [table, snapshot] of snapshots)
    expect(db.prepare(`SELECT * FROM ${table}`).all()).toEqual(snapshot);
  expect(new InsuranceRepository(db).claimsPolicyContext(policyId)).toBeNull();
  expect(db.pragma('foreign_key_check')).toEqual([]);
  db.close();
});

it('enforces one canonical bind while retaining orphaned provenance and the local lookup index', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  migrate(db);
  db.transaction(() => {
    db.prepare(
      'INSERT INTO policy_reconciliation_scopes(scope,healthy,checked_at) VALUES (?,0,0)',
    ).run('scope');
    const insert = db.prepare(
      `INSERT INTO policy_bind_events(event_key,scope,onchain_policy_id,status,canonical,block_number,block_hash,payload) VALUES (?,'scope','policy',?, ?,'1','block','{}')`,
    );
    insert.run('one', 'ONCHAIN_UNLINKED', 1);
    expect(() => insert.run('duplicate', 'ONCHAIN_UNLINKED', 1)).toThrow('UNIQUE');
    insert.run('historic', 'ORPHANED', 0);
  })();
  expect(db.prepare('SELECT * FROM policy_bind_events').all()).toHaveLength(2);
  expect(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='policy_bind_local'")
      .get(),
  ).toBeTruthy();
  expect(db.pragma('foreign_key_check')).toEqual([]);
  db.close();
});
