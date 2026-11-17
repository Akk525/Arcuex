import { expect, it, vi } from 'vitest';
import type { PublicClient, WalletClient } from 'viem';
import { sendPreparedTx, prepareDeposit } from './tx';
const account = '0x0000000000000000000000000000000000000001';
const hash = `0x${'ab'.repeat(32)}` as const;
it.each(['timeout', 'reverted'] as const)(
  'notifies caller of broadcast before receipt %s',
  async (failure) => {
    const onBroadcast = vi.fn();
    const client = {
      waitForTransactionReceipt: vi.fn(async () => {
        expect(onBroadcast).toHaveBeenCalledWith(hash);
        if (failure === 'timeout') throw new Error('RPC unavailable');
        return { hash, status: 'reverted', blockNumber: 1n, gasUsed: 1n };
      }),
    } as unknown as PublicClient;
    const wallet = {
      account: { address: account },
      sendTransaction: vi.fn(async () => hash),
    } as unknown as WalletClient;
    await expect(
      sendPreparedTx(
        client,
        wallet,
        prepareDeposit({ pool: account, account, amount: 1n }),
        onBroadcast,
      ),
    ).rejects.toThrow(hash);
  },
);
