import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { ARC_TESTNET_CHAIN_ID } from './config';
import { getNetworkHealth } from './client';

function mockClient(overrides?: Partial<PublicClient>): PublicClient {
  return {
    getChainId: async () => ARC_TESTNET_CHAIN_ID,
    getBlockNumber: async () => 123n,
    ...overrides,
  } as PublicClient;
}

describe('getNetworkHealth', () => {
  it('reports healthy status when chain id matches', async () => {
    const health = await getNetworkHealth(mockClient(), 'https://example.invalid');
    expect(health.ok).toBe(true);
    expect(health.chainId).toBe(ARC_TESTNET_CHAIN_ID);
    expect(health.blockNumber).toBe(123n);
    expect(health.error).toBeUndefined();
  });

  it('reports error when rpc throws', async () => {
    const client = mockClient({
      getChainId: vi.fn().mockRejectedValue(new Error('timeout')),
      getBlockNumber: vi.fn().mockRejectedValue(new Error('timeout')),
    });

    const health = await getNetworkHealth(client);
    expect(health.ok).toBe(false);
    expect(health.blockNumber).toBeNull();
    expect(health.error).toMatch(/timeout/);
  });

  it('flags unexpected chain ids', async () => {
    const client = mockClient({
      getChainId: async () => 1,
      getBlockNumber: async () => 9n,
    });
    const health = await getNetworkHealth(client);
    expect(health.ok).toBe(false);
    expect(health.error).toMatch(/Unexpected chain ID/);
  });
});
