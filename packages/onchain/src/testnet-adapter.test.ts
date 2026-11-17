import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { connectArcTestnetAdapter } from './testnet-adapter';

const LIVE = process.env.RUN_LIVE_PREFLIGHT === '1';

describe('connectArcTestnetAdapter', () => {
  it('loads checked-in manifest and validates Arc Testnet deployment (read-only)', async () => {
    if (!LIVE) {
      // Still validate that the helper rejects a bogus path without network.
      await expect(
        connectArcTestnetAdapter({
          manifestPath: resolve(process.cwd(), 'does-not-exist.json'),
        }),
      ).rejects.toThrow(/manifest/i);
      return;
    }

    const manifestPath = resolve(
      process.cwd(),
      '../../docs/deployments/arc-testnet-insurance-pool.json',
    );
    const { snapshot } = await connectArcTestnetAdapter({ manifestPath });
    expect(snapshot.chainId).toBe(5042002);
    expect(snapshot.bytecodeNonEmpty).toBe(true);
    expect(snapshot.pool.toLowerCase()).toBe(
      '0x6657974eedf488380251bdd95a7fffb0d456e49e',
    );
    expect(snapshot.usdcDecimals).toBe(6);
    expect(snapshot.ok).toBe(true);
  }, 30_000);
});
