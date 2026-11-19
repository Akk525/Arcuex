import { afterEach, describe, expect, it } from 'vitest';
import { bankDisputeProductTemplate, type ProductPrincipal } from '@arcuex/domain';
import { openDatabase, type SqliteDb } from './db';
import { initializeProductRegistry, ProductPublicationRepository } from './product-publications';

const opened: SqliteDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
const principal = (
  subject: string,
  permissions: ProductPrincipal['permissions'],
  organizationId = 'synthetic-lab',
): ProductPrincipal => ({
  subject,
  permissions,
  organizationId,
  authorizationRef: `test-server-authority:${subject}`,
});
const author = principal('author', ['product:read', 'product:author']);
const approver = principal('approver', [
  'product:read',
  'product:approve',
  'product:publish',
  'product:retire',
]);
function setup() {
  const db = openDatabase();
  opened.push(db);
  initializeProductRegistry(db);
  return { db, repo: new ProductPublicationRepository(db, () => '2026-11-18T19:00:00.000Z') };
}

describe('opt-in immutable product publication provenance', () => {
  it('supports review withdrawal and rejects backdated, stale or retired transitions', () => {
    const { repo, db } = setup();
    const draft = repo.createDraft(bankDisputeProductTemplate(), author);
    repo.transition(draft.key, 'request_review', 1, author);
    repo.transition(draft.key, 'return_to_draft', 2, author);
    repo.transition(draft.key, 'request_review', 3, author);
    const earlier = new ProductPublicationRepository(db, () => '2026-11-17T19:00:00.000Z');
    expect(() => earlier.transition(draft.key, 'approve', 4, approver)).toThrow('backwards');
    expect(() =>
      repo.transition(draft.key, 'approve', 4, { ...approver, authorizationRef: '' }),
    ).toThrow();
    repo.transition(draft.key, 'approve', 4, approver);
    repo.transition(draft.key, 'retire', 5, approver);
    expect(() => repo.transition(draft.key, 'publish', 6, approver)).toThrow('Invalid');
    expect(repo.get(draft.key, author).revision).toBe(6);
  });
  it('does not change default migrations or introduce a policy representation', () => {
    const db = openDatabase();
    opened.push(db);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name='platform_product_versions'").get(),
    ).toBeUndefined();
    db.prepare('INSERT INTO procurement_records VALUES (?,?,?,?)').run(
      'fixture',
      'old',
      'owner',
      '{"preserve":"byte-for-byte"}',
    );
    initializeProductRegistry(db);
    initializeProductRegistry(db);
    expect(db.prepare('SELECT * FROM schema_migrations').all()).toHaveLength(14);
    expect(db.prepare('SELECT payload FROM procurement_records WHERE id=?').get('old')).toEqual({
      payload: '{"preserve":"byte-for-byte"}',
    });
    expect(db.prepare('SELECT * FROM procurement_policies').all()).toHaveLength(0);
    expect(db.prepare('SELECT * FROM policies').all()).toHaveLength(0);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
  it('persists separate approval, publication and retirement, preserving version history', () => {
    const { repo, db } = setup();
    const draft = repo.createDraft(bankDisputeProductTemplate(), author);
    const review = repo.transition(draft.key, 'request_review', draft.revision, author);
    const approved = repo.transition(draft.key, 'approve', review.revision, approver);
    const published = repo.transition(draft.key, 'publish', approved.revision, approver);
    expect(published.state).toBe('published');
    expect(published.events.at(-1)!.approval_event_id).toBe(approved.events.at(-1)!.id);
    const retired = repo.transition(draft.key, 'retire', published.revision, approver);
    const reread = new ProductPublicationRepository(db).get(draft.key, author);
    expect(reread.state).toBe('retired');
    expect(reread.bundle.product.digest).toBe(draft.bundle.product.digest);
    expect(retired.events.map((e) => e.to_state)).toEqual([
      'draft',
      'review',
      'approved',
      'published',
      'retired',
    ]);
    repo.createDraft(bankDisputeProductTemplate(false), author);
    expect(
      repo
        .versions(draft.key.organizationId, draft.key.productId, author)
        .map((v) => v.key.version),
    ).toEqual([1, 2]);
    expect(() => repo.createDraft(bankDisputeProductTemplate(), author)).toThrow();
  });
  it('rejects self-approval, role escalation, cross-org access and illegal transitions', () => {
    const { repo } = setup();
    const draft = repo.createDraft(bankDisputeProductTemplate(), author);
    expect(() => repo.transition(draft.key, 'publish', 1, approver)).toThrow();
    repo.transition(draft.key, 'request_review', 1, author);
    expect(() => repo.transition(draft.key, 'approve', 2, author)).toThrow();
    expect(() =>
      repo.transition(draft.key, 'approve', 2, principal('author', ['product:approve'])),
    ).toThrow('cannot approve');
    expect(() =>
      repo.get(draft.key, principal('outsider', ['product:read'], 'another-org')),
    ).toThrow('not authorized');
    expect(() =>
      repo.transition(
        draft.key,
        'approve',
        2,
        principal('outsider', ['product:approve'], 'another-org'),
      ),
    ).toThrow();
    expect(() => repo.transition(draft.key, 'approve', 1, approver)).toThrow('revision conflict');
    expect(repo.get(draft.key, author).revision).toBe(2);
  });
  it('protects content/provenance from SQL update or deletion and rejects substituted bundles', () => {
    const { repo, db } = setup();
    const draft = repo.createDraft(bankDisputeProductTemplate(), author);
    for (const table of ['platform_product_versions', 'platform_product_publication_events']) {
      expect(() => db.prepare(`DELETE FROM ${table}`).run()).toThrow('Immutable');
    }
    expect(() =>
      db.prepare('UPDATE platform_product_versions SET digest=?').run('changed'),
    ).toThrow('Immutable');
    expect(() =>
      db.prepare('UPDATE platform_product_publication_events SET actor_id=?').run('changed'),
    ).toThrow('Immutable');
    const broken = structuredClone(bankDisputeProductTemplate(false));
    const payload = {
      ...broken,
      product: { ...broken.product, digest: draft.bundle.product.digest },
    };
    expect(() => repo.createDraft(payload, author)).toThrow('snapshot mismatch');
    expect(repo.versions(draft.key.organizationId, draft.key.productId, author)).toHaveLength(1);
  });
});
