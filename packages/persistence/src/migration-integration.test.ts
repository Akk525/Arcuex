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
    expect(db.prepare('SELECT * FROM schema_migrations').all()).toHaveLength(9);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
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
