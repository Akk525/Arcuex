import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { reconcilePolicy } from './reconcile';

function mockClient(overrides: Record<string, unknown>): PublicClient {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (overrides[functionName] !== undefined) return overrides[functionName];
      throw new Error(`unexpected ${functionName}`);
    }),
  } as unknown as PublicClient;
}

describe('reconcilePolicy', () => {
  it('reports ok when local matches chain', async () => {
    const termsHash = ('0x' + '11'.repeat(32)) as `0x${string}`;
    const policyId = ('0x' + '22'.repeat(32)) as `0x${string}`;
    const beneficiary = '0x00000000000000000000000000000000000000aa' as `0x${string}`;
    const client = mockClient({
      totalAssets: 10_000n,
      totalReserved: 1_000n,
      totalShares: 10_000n,
      availableCapital: 9_000n,
      claimsAuthority: '0x00000000000000000000000000000000000000bb',
      usdc: '0x3600000000000000000000000000000000000000',
      balanceOf: 10_000n,
      policies: [
        termsHash,
        beneficiary,
        '0x00000000000000000000000000000000000000cc',
        1_000n,
        10n,
        1n,
        2n,
        1_000n,
        0n,
        true,
        false,
      ],
    });

    const result = await reconcilePolicy(client, '0x00000000000000000000000000000000000000dd', {
      policyEntityId: 'p1',
      policyIdBytes32: policyId,
      termsHash,
      beneficiary,
      limitMicros: 1_000n,
      premiumMicros: 10n,
      bound: true,
      status: 'active',
    });

    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it('flags termsHash mismatch with contract authoritative note', async () => {
    const client = mockClient({
      totalAssets: 10_000n,
      totalReserved: 0n,
      totalShares: 10_000n,
      availableCapital: 10_000n,
      claimsAuthority: '0x00000000000000000000000000000000000000bb',
      usdc: '0x3600000000000000000000000000000000000000',
      balanceOf: 10_000n,
      policies: [
        ('0x' + 'aa'.repeat(32)) as `0x${string}`,
        '0x00000000000000000000000000000000000000aa',
        '0x00000000000000000000000000000000000000cc',
        1_000n,
        10n,
        1n,
        2n,
        0n,
        0n,
        true,
        false,
      ],
    });

    const result = await reconcilePolicy(client, '0x00000000000000000000000000000000000000dd', {
      policyEntityId: 'p1',
      policyIdBytes32: ('0x' + '22'.repeat(32)) as `0x${string}`,
      termsHash: ('0x' + 'bb'.repeat(32)) as `0x${string}`,
      beneficiary: '0x00000000000000000000000000000000000000aa',
      limitMicros: 1_000n,
      premiumMicros: 10n,
      bound: true,
      status: 'active',
    });

    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.includes('termsHash'))).toBe(true);
  });
});
