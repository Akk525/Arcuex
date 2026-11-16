import { describe, expect, it, vi } from 'vitest';
import { ARC_TESTNET_CHAIN_ID } from '@arcuex/chain';
import { QuickNodeClient, QuickNodeError } from './client';

function mockPublicClient(overrides?: {
  getChainId?: () => Promise<number>;
  getBlockNumber?: () => Promise<bigint>;
  getBlock?: () => Promise<{
    number: bigint;
    hash: `0x${string}`;
    timestamp: bigint;
    transactions: `0x${string}`[];
  }>;
  getTransactionReceipt?: () => Promise<unknown>;
}) {
  return {
    getChainId: overrides?.getChainId ?? (async () => ARC_TESTNET_CHAIN_ID),
    getBlockNumber: overrides?.getBlockNumber ?? (async () => 100n),
    getBlock:
      overrides?.getBlock ??
      (async () => ({
        number: 100n,
        hash: '0xabc0000000000000000000000000000000000000000000000000000000000000',
        timestamp: 1_700_000_000n,
        transactions: ['0x1', '0x2'] as `0x${string}`[],
      })),
    getTransactionReceipt:
      overrides?.getTransactionReceipt ?? (async () => ({ status: 'success' })),
  };
}

describe('QuickNodeClient', () => {
  it('returns status from mocked transport', async () => {
    const client = new QuickNodeClient({
      publicClient: mockPublicClient() as never,
      rpcUrl: 'https://example.quicknode.test',
    });

    const status = await client.getStatus();
    expect(status.ok).toBe(true);
    expect(status.chainId).toBe(ARC_TESTNET_CHAIN_ID);
    expect(status.blockNumber).toBe(100n);
    expect(status.rpcUrl).toBe('https://example.quicknode.test');
  });

  it('returns block summary', async () => {
    const client = new QuickNodeClient({
      publicClient: mockPublicClient() as never,
    });
    const block = await client.getBlock();
    expect(block.number).toBe(100n);
    expect(block.transactionCount).toBe(2);
  });

  it('retries then surfaces typed error', async () => {
    const getBlockNumber = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'));

    const client = new QuickNodeClient({
      publicClient: mockPublicClient({ getBlockNumber }) as never,
      maxRetries: 2,
    });

    await expect(client.getBlockNumber()).rejects.toBeInstanceOf(QuickNodeError);
    expect(getBlockNumber).toHaveBeenCalledTimes(3);
  });

  it('succeeds after a transient failure', async () => {
    const getBlockNumber = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(55n);

    const client = new QuickNodeClient({
      publicClient: mockPublicClient({ getBlockNumber }) as never,
      maxRetries: 2,
    });

    await expect(client.getBlockNumber()).resolves.toBe(55n);
    expect(getBlockNumber).toHaveBeenCalledTimes(2);
  });
});
