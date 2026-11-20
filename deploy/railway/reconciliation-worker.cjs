'use strict';
// Operational companion: reads Arc and invokes only the existing local reconciliation CLI.
// No signer, wallet, HTTP write endpoint, transaction send, or financial settlement capability.
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { validateState, planRange, commitSuccess, atomicJson } = require('./reconciliation-state.cjs');
const root = path.resolve(__dirname, '../..');
const Database = require(path.join(root, 'apps/web/node_modules/better-sqlite3'));
const { acquireIndexerLock } = require('./reconciliation-lock.cjs');
const manifest = require('../../docs/deployments/arc-testnet-insurance-pool.json');
const startBlock = process.env.ARCUEX_RECONCILIATION_START_BLOCK;
if (process.env.ARCUEX_CHAIN_ID !== '5042002' || !/^\d+$/.test(startBlock || '') || process.env.ARCUE_X_POOL_ADDRESS?.toLowerCase() !== manifest.insurancePool.toLowerCase() || !process.env.ARCUE_X_SQLITE_PATH?.startsWith('/data/')) throw new Error('Invalid operational indexer configuration');
const config = { pool: manifest.insurancePool.toLowerCase(), startBlock };
const dir = '/data/reconciliation'; fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const releaseIndexerLock = acquireIndexerLock(Database, dir + '/worker-lock.sqlite');
const cursor = dir + '/cursor.json', health = dir + '/health.json';
let state = fs.existsSync(cursor) ? validateState(JSON.parse(fs.readFileSync(cursor, 'utf8')), config) : { version: 1, chainId: 5042002, pool: config.pool, startBlock, confirmations: 2, nextBlock: startBlock, backfillComplete: false, lastSuccessfulAt: 0, consecutiveFailures: 0, healthy: false };
let stopping = false, child;
function suspend() {
  if (!fs.existsSync(process.env.ARCUE_X_SQLITE_PATH)) return; // No persisted eligibility on first boot.
  const db = new Database(process.env.ARCUE_X_SQLITE_PATH, { fileMustExist: true, timeout: 5000 });
  try { db.transaction(() => { if (db.prepare("SELECT name FROM sqlite_master WHERE name='policy_reconciliation_scopes'").get()) db.prepare('UPDATE policy_reconciliation_scopes SET healthy=0 WHERE scope=?').run('5042002:' + config.pool); })(); } finally { db.close(); }
}
function stop() { stopping = true; try { if (child) process.kill(-child.pid, 'SIGTERM'); } catch {} }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
async function rpc(method) {
  const r = await fetch(process.env.ARC_TESTNET_RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }), signal: AbortSignal.timeout(15000) });
  const j = await r.json(); if (!r.ok || j.error || typeof j.result !== 'string') throw new Error('RPC unavailable'); return j.result;
}
function reconcile(range) {
  return new Promise((resolve, reject) => {
    child = spawn('pnpm', ['--filter', '@arcuex/onchain', 'exec', 'node', '--import', 'tsx', '../../apps/web/scripts/reconcile-policy-binds.mts', range.from.toString(), range.to.toString()], { cwd: root, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', b => { if (output.length < 16000) output += b.toString(); }); child.stderr.resume();
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 120000);
    child.on('error', () => { clearTimeout(timer); child = null; reject(new Error('Reconciliation process failed')); });
    child.on('exit', code => { clearTimeout(timer); child = null; if (code !== 0) return reject(new Error('Reconciliation failed')); const line = output.split('\n').find(l => l.startsWith('{')); try { const result = JSON.parse(line); if (result.throughBlock !== range.to.toString()) throw new Error(); resolve(result); } catch { reject(new Error('Invalid reconciliation checkpoint')); } });
  });
}
(async () => {
  suspend();
  while (!stopping) {
    let wait = 60000;
    try {
      if (await rpc('eth_chainId') !== '0x4cef52') throw new Error('Wrong chain');
      const head = BigInt(await rpc('eth_blockNumber'));
      const range = planRange(state, head);
      if (range) {
        const result = await reconcile(range);
        state = commitSuccess(state, range, head, Math.floor(Date.now() / 1000));
        atomicJson(cursor, state); atomicJson(health, state);
        console.log(JSON.stringify({ event: 'policy-reconciliation', healthy: true, backfillComplete: state.backfillComplete, nextBlock: state.nextBlock, observed: result.observed, orphaned: result.orphaned, orphanedSettlements: result.orphanedSettlements }));
        if (!range.complete) wait = 100;
      }
    } catch {
      suspend();
      state = { ...state, healthy: false, updatedAt: Math.floor(Date.now() / 1000), consecutiveFailures: state.consecutiveFailures + 1 };
      atomicJson(health, state); // Cursor advances only after success; failed ranges retry unchanged.
      console.error(JSON.stringify({ event: 'policy-reconciliation', healthy: false, nextBlock: state.nextBlock, consecutiveFailures: state.consecutiveFailures, message: 'Read-only indexing failed; claims suspended; retrying same range' }));
    }
    for (let elapsed = 0; elapsed < wait && !stopping; elapsed += 500) await new Promise(r => setTimeout(r, Math.min(500, wait - elapsed)));
  }
  suspend();
  releaseIndexerLock();
})().catch(() => { try { suspend(); } catch {} console.error('policy-reconciliation: worker stopped; eligibility suspended'); process.exit(1); });
