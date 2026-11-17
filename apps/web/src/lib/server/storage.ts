import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RuntimeConfig } from './runtime-config';

const VOLUME_ID_FILE = '.arcuex-volume-id';

export function volumeIdentityPath(dataDir: string): string {
  return `${dataDir}/${VOLUME_ID_FILE}`;
}

/**
 * Fail closed if the mounted volume identity does not match ARCUEX_STORAGE_ID.
 * The entrypoint writes the identity file on first boot when absent.
 *
 * Paths are compared via realpath so platforms that symlink /tmp (macOS) still work
 * for local-test drills while public-beta keeps the same containment rules.
 */
export function assertStorageReady(c: RuntimeConfig): void {
  if (!c.enforced) return;

  const root = realpathSync(c.dataDir);
  const parent = realpathSync(dirname(c.databasePath));

  if (!(parent === root || parent.startsWith(`${root}/`))) {
    throw new Error('Database parent escapes the configured volume');
  }
  // public-beta volumes must not be world-writable. local-test often uses /tmp.
  if (c.profile === 'public-beta' && statSync(root).mode & 0o002) {
    throw new Error('Data volume must not be world writable');
  }
  accessSync(parent, constants.W_OK | constants.R_OK);

  const identity = readFileSync(volumeIdentityPath(c.dataDir), 'utf8').trim();
  if (identity !== c.storageId) {
    // Also accept the identity file via the resolved root (symlink-safe).
    const identityResolved = readFileSync(`${root}/${VOLUME_ID_FILE}`, 'utf8').trim();
    if (identityResolved !== c.storageId) {
      throw new Error('Persistent volume identity mismatch');
    }
  }

  try {
    const actual = realpathSync(c.databasePath);
    if (!(actual === root || actual.startsWith(`${root}/`))) {
      throw new Error('Database symlink escapes volume');
    }
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
}
