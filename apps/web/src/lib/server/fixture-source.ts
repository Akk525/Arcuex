import { createHash } from 'node:crypto';
import type { ProcurementPolicy } from '@arcuex/domain';
import { ProcurementStore, type SqliteDb } from '@arcuex/persistence';
import { ProcurementService, procurementDigest } from '@arcuex/agent-sdk';
import { toPolicyIdBytes32 } from '@arcuex/onchain';
import { ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import { LAUNCH_POOL, type RuntimeConfig } from './runtime-config';

const sourceKey = 'chain_source_identity';
const fixtureScope = (id: string) => `fixture:${id}`;
const sha = (raw: string) => createHash('sha256').update(raw).digest('hex');
type Snapshot = {
  version: 1;
  id: string;
  checkpoint: { sequence: 1; createdAt: number; validUntil: number };
  policy: ProcurementPolicy;
  event: { key: string; payload: string };
};

/** Explicit seed operation on a new disposable DB only. No RPC, wallet or financial transaction. */
export function seedFixture(
  db: SqliteDb,
  input: { id: string; owner: string; at: number; agentSigner?: string },
) {
  if (!/^candidate-[0-9a-f-]{36}$/.test(input.id) || !Number.isSafeInteger(input.at))
    throw new Error('Invalid fixture identity/checkpoint');
  return db.transaction(() => {
    for (const table of [
      'procurement_records',
      'procurement_policies',
      'policies',
      'claims_cases',
      'claims_sessions',
      'claims_auth_nonces',
      'policy_bind_events',
    ]) {
      if ((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)
        throw new Error('Fixture seed requires an empty disposable database');
    }
    if (db.prepare('SELECT key FROM launch_runtime_state WHERE key=?').get(sourceKey))
      throw new Error('Source already initialized; reset requires a new database and identity');
    const store = new ProcurementStore(db);
    const service = new ProcurementService(
      store,
      LAUNCH_POOL,
      ARC_USDC_ERC20_ADDRESS,
      () => input.at - 1200,
    );
    const agent = service.register(input.owner, {
      idempotencyKey: input.id,
      label: 'Synthetic hosted rehearsal fixture',
      signer: input.agentSigner ?? input.owner,
      position: input.id,
      exposureMicros: '1000000',
      ownerAttestsControl: true,
    });
    const quote = service.quote(input.owner, {
      idempotencyKey: input.id,
      agentId: agent.id,
      limitMicros: '1000000',
      durationDays: 1,
      eligibility: {
        positionHealthy: true,
        noKnownIncident: true,
        syntheticOnly: true,
        ownerAttestsControl: true,
      },
    });
    const prepared = service.prepare(input.owner, {
      quoteId: quote.terms.quoteId,
      acceptedDigest: quote.digest,
    }).policy;
    const hash = `0x${'ab'.repeat(32)}`;
    store.confirm(prepared.terms.policyId, hash, input.at - 1100);
    const policy = store.policy(prepared.terms.policyId)!;
    const checkpoint = { sequence: 1 as const, createdAt: input.at, validUntil: input.at + 300 };
    const payload = JSON.stringify({
      provenance: 'synthetic-fixture-not-chain-evidence',
      sourceId: input.id,
      checkpoint,
      chainId: 5042002,
      pool: LAUNCH_POOL,
      transactionHash: hash,
      blockNumber: '1',
      blockHash: `0x${'cd'.repeat(32)}`,
      logIndex: 0,
      timestamp: input.at - 1100,
      policyId: toPolicyIdBytes32(policy.terms.policyId),
      termsHash: policy.digest,
      beneficiary: policy.terms.beneficiary,
      premiumPayer: policy.payer,
      premium: policy.terms.premiumMicros,
      limit: policy.terms.limitMicros,
      coverageStart: String(policy.terms.effectiveAt),
      coverageEnd: String(policy.terms.expiresAt),
    });
    const event = { key: `fixture:${input.id}:1`, payload };
    db.prepare(
      'INSERT INTO policy_reconciliation_scopes(scope,healthy,checked_at,through_block,through_hash) VALUES (?,1,?,?,?)',
    ).run(fixtureScope(input.id), input.at, '1', sha(payload));
    db.prepare("INSERT INTO policy_bind_events VALUES (?,?,?,?,'VERIFIED_LINKED',1,'1',?,?)").run(
      event.key,
      fixtureScope(input.id),
      toPolicyIdBytes32(policy.terms.policyId),
      policy.terms.policyId,
      sha(payload),
      payload,
    );
    const snapshot: Snapshot = { version: 1, id: input.id, checkpoint, policy, event };
    const raw = JSON.stringify(snapshot),
      digest = sha(raw);
    db.exec(
      'CREATE TABLE candidate_fixture_source (id INTEGER PRIMARY KEY CHECK(id=1), snapshot TEXT NOT NULL)',
    );
    db.prepare('INSERT INTO candidate_fixture_source VALUES (1,?)').run(raw);
    db.exec(
      "CREATE TRIGGER fixture_source_no_update BEFORE UPDATE ON candidate_fixture_source BEGIN SELECT RAISE(ABORT,'fixture source immutable'); END; CREATE TRIGGER fixture_source_no_delete BEFORE DELETE ON candidate_fixture_source BEGIN SELECT RAISE(ABORT,'fixture source immutable'); END;",
    );
    db.prepare('INSERT INTO launch_runtime_state VALUES (?,?)').run(
      sourceKey,
      `fixture:${input.id}:${digest}`,
    );
    return { digest, snapshot };
  })();
}

/** Never repairs, renews or falls back. Restart reuses the exact pinned snapshot and deadline. */
export function readFixture(db: SqliteDb, c: RuntimeConfig, now = Math.floor(Date.now() / 1000)) {
  if (c.chainSource !== 'fixture') throw new Error('Fixture source not selected');
  const row = db.prepare('SELECT snapshot FROM candidate_fixture_source WHERE id=1').get() as
    { snapshot: string } | undefined;
  if (!row || sha(row.snapshot) !== c.fixtureDigest)
    throw new Error('Fixture snapshot unavailable or digest mismatch');
  const s = JSON.parse(row.snapshot) as Snapshot;
  if (
    s.version !== 1 ||
    s.id !== c.fixtureId ||
    s.checkpoint.sequence !== 1 ||
    s.checkpoint.validUntil !== s.checkpoint.createdAt + 300 ||
    now < s.checkpoint.createdAt ||
    now >= s.checkpoint.validUntil
  )
    throw new Error('Fixture checkpoint unavailable or expired; never renewed on restart');
  const identity = db
    .prepare('SELECT value FROM launch_runtime_state WHERE key=?')
    .get(sourceKey) as { value: string } | undefined;
  if (identity?.value !== `fixture:${s.id}:${c.fixtureDigest}`)
    throw new Error('Database source identity mismatch');
  const actual = new ProcurementStore(db).policy(s.policy.terms.policyId);
  if (!actual || procurementDigest(actual) !== procurementDigest(s.policy))
    throw new Error('Fixture policy differs from pinned snapshot');
  const scope = db
    .prepare('SELECT * FROM policy_reconciliation_scopes WHERE scope=?')
    .get(fixtureScope(s.id)) as
    | { healthy: number; checked_at: number; through_block: string; through_hash: string }
    | undefined;
  const events = db.prepare('SELECT * FROM policy_bind_events').all() as Array<{
    event_key: string;
    scope: string;
    status: string;
    canonical: number;
    block_number: string;
    block_hash: string;
    payload: string;
    local_policy_id: string;
    onchain_policy_id: string;
  }>;
  const e = events[0];
  if (
    !scope ||
    scope.healthy !== 1 ||
    scope.checked_at !== s.checkpoint.createdAt ||
    scope.through_block !== '1' ||
    scope.through_hash !== sha(s.event.payload) ||
    events.length !== 1 ||
    !e ||
    e.event_key !== s.event.key ||
    e.payload !== s.event.payload ||
    e.scope !== fixtureScope(s.id) ||
    e.status !== 'VERIFIED_LINKED' ||
    e.canonical !== 1 ||
    e.block_number !== '1' ||
    e.block_hash !== sha(s.event.payload) ||
    e.local_policy_id !== s.policy.terms.policyId ||
    e.onchain_policy_id !== toPolicyIdBytes32(s.policy.terms.policyId)
  )
    throw new Error('Fixture checkpoint/evidence inconsistent');
  return {
    ...s,
    source: {
      mode: 'fixture' as const,
      id: s.id,
      digest: c.fixtureDigest,
      checkpoint: s.checkpoint,
    },
  };
}

export function assertDatabaseSource(db: SqliteDb, c: RuntimeConfig) {
  if (c.chainSource === 'fixture') return readFixture(db, c);
  const row = db.prepare('SELECT value FROM launch_runtime_state WHERE key=?').get(sourceKey) as
    { value: string } | undefined;
  if (row && row.value !== 'arc-testnet')
    throw new Error('Cannot open fixture database in live mode');
  if (db.prepare("SELECT name FROM sqlite_master WHERE name='candidate_fixture_source'").get())
    throw new Error('Fixture database cannot become live');
  if (!row)
    db.transaction(() =>
      db.prepare('INSERT INTO launch_runtime_state VALUES (?,?)').run(sourceKey, 'arc-testnet'),
    )();
}
