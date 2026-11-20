import { resolve } from 'node:path';
import { openApplicationDatabase } from '../src/lib/server/db';
import { ConfigurationError, getRuntimeConfig } from '../src/lib/server/runtime-config';

try {
  const config = getRuntimeConfig();
  if (config.profile !== 'public-beta' || config.chainSource !== 'arc-testnet') {
    throw new Error('Isolated backend requires the public-beta Arc Testnet profile');
  }
  switch (process.argv[2]) {
    case 'config':
      break;
    case 'migrate': {
      const migrations = resolve(
        import.meta.dirname,
        '../../../packages/persistence/src/migrations',
      );
      const db = openApplicationDatabase(config.databasePath, migrations);
      db.close();
      console.log('backend startup: database initialized and source verified');
      break;
    }
    default:
      throw new Error('Expected config or migrate');
  }
} catch (error) {
  const detail =
    error instanceof ConfigurationError
      ? error.message
      : 'configuration or storage validation failed';
  console.error('backend startup blocked: ' + detail);
  process.exitCode = 1;
}
