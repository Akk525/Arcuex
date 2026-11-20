const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { mkdtempSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

const entrypoint = join(__dirname, 'start-isolated.sh');
const identities = {
  RAILWAY_PROJECT_ID: '03848637-de2d-497f-8308-f8f3ccf06f07',
  RAILWAY_ENVIRONMENT_ID: '6dca510e-fe00-4478-8d8d-ef65fd5bc4d7',
  RAILWAY_SERVICE_ID: '1280c69e-abbc-4d06-8ecc-93bf4a6ed226',
  ARCUEX_BACKEND_VOLUME_ID: 'b92846ec-9a00-40b6-80a9-bc9dce1e69a2',
};

for (const [name, planA] of Object.entries(identities)) {
  test(`backend rejects missing or Plan A ${name} before startup`, () => {
    for (const value of ['', planA]) {
      const env = Object.fromEntries(
        Object.keys(identities).map((key) => [key, '22222222-2222-4222-8222-222222222222']),
      );
      env[name] = value;
      const result = spawnSync('bash', [entrypoint], {
        env: { PATH: process.env.PATH, ...env },
        encoding: 'utf8',
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(name));
    }
  });
}

test('Docker-wrapped backend start runs the isolation guard before shared storage writes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'backend-entrypoint-'));
  try {
    const result = spawnSync(
      'bash',
      [join(__dirname, '../railway/entrypoint.sh'), 'bash', entrypoint],
      {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'production',
          ARCUEX_CHAIN_SOURCE: 'arc-testnet',
          ARCUEX_DATA_DIR: dir,
          ARCUEX_STORAGE_ID: 'release-isolated-test',
          ARCUE_X_SQLITE_PATH: join(dir, 'candidate.sqlite'),
          RAILWAY_PROJECT_ID: identities.RAILWAY_PROJECT_ID,
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /backend startup blocked: RAILWAY_PROJECT_ID/);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
