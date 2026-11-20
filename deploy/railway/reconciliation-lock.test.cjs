'use strict';

const { once } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('only one indexer process can own a cursor and a new worker acquires it after a crash', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'arcuex-indexer-'));
  const dbPath = join(dir, 'worker.sqlite');
  const sqlite = require.resolve('../../apps/web/node_modules/better-sqlite3');
  const lock = require.resolve('./reconciliation-lock.cjs');
  const hold = `
    const release = require(process.argv[2]).acquireIndexerLock(require(process.argv[1]), process.argv[3]);
    if (process.argv[4]) {
      console.log('ready');
      setInterval(() => {}, 1000);
    } else release();
  `;
  const args = ['-e', hold, sqlite, lock, dbPath];
  const owner = spawn(process.execPath, [...args, 'hold'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(owner, 'exit');
  try {
    const output = await Promise.race([
      once(owner.stdout, 'data').then(([data]) => data.toString()),
      exited.then(([code]) => `exited ${code}`),
    ]);
    assert.match(output, /ready/);
    const competing = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 5000 });
    assert.equal(competing.status, 1);
    assert.match(competing.stderr, /cursor already owned/);
    owner.kill('SIGKILL');
    await exited;
    const restarted = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 5000 });
    assert.equal(restarted.status, 0, restarted.stderr);
  } finally {
    owner.kill('SIGKILL');
    await exited;
    rmSync(dir, { recursive: true, force: true });
  }
});
