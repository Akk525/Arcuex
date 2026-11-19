const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const entrypoint = path.join(__dirname, 'entrypoint.sh');
const id = 'candidate-12345678-1234-4234-8234-123456789abc';
test('fixture bootstrap refuses an uninitialized volume without writing any files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-no-bootstrap-'));
  try {
    const result = spawnSync('bash', [entrypoint, process.execPath, '-e', 'process.exit(99)'], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        ARCUEX_CHAIN_SOURCE: 'fixture',
        ARCUEX_FIXTURE_ID: id,
        ARCUEX_STORAGE_ID: id,
        ARCUEX_DATA_DIR: dir,
        ARCUE_X_SQLITE_PATH: path.join(dir, `${id}.sqlite`),
      },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing bootstrap/);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('wrong volume identity is rejected before backups, marker writes or application startup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-wrong-volume-'));
  const db = path.join(dir, `${id}.sqlite`);
  try {
    fs.writeFileSync(path.join(dir, '.arcuex-volume-id'), 'foreign-volume');
    fs.writeFileSync(db, 'foreign-data-sentinel');
    const before = fs.readdirSync(dir).sort();
    const result = spawnSync('bash', [entrypoint, process.execPath, '-e', 'process.exit(99)'], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        ARCUEX_CHAIN_SOURCE: 'fixture',
        ARCUEX_FIXTURE_ID: id,
        ARCUEX_STORAGE_ID: id,
        ARCUEX_DATA_DIR: dir,
        ARCUE_X_SQLITE_PATH: db,
      },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /identity mismatch/);
    assert.deepEqual(fs.readdirSync(dir).sort(), before);
    assert.equal(fs.readFileSync(db, 'utf8'), 'foreign-data-sentinel');
    assert.equal(fs.readFileSync(path.join(dir, '.arcuex-volume-id'), 'utf8'), 'foreign-volume');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('fixture supervisor refuses a live worker before launching children', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'supervisor.cjs')], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      ARCUEX_CHAIN_SOURCE: 'fixture',
      ARCUEX_RECONCILIATION_ENABLED: '1',
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /worker forbidden/);
});
