import type { Hex } from 'viem';

type ReceiptReader = {
  waitForTransactionReceipt(input: { hash: Hex; confirmations: number; timeout: number }): Promise<{
    transactionHash: Hex;
    blockNumber: bigint;
    blockHash: Hex;
    status: 'success' | 'reverted';
  }>;
  getChainId(): Promise<number>;
  getBlockNumber(input: { cacheTime: 0 }): Promise<bigint>;
  getBlock(input: { blockNumber: bigint }): Promise<{ hash: Hex | null }>;
};

/** Observe the recorded hash. The caller can release its retry guard only after a canonical revert. */
export async function confirmCheckoutReceipt(
  reader: ReceiptReader,
  hash: Hex,
  confirmSuccess: (hash: Hex) => Promise<void>,
): Promise<'confirmed' | 'reverted'> {
  // Viem counts the inclusion block. Arc backend v1 requires two descendant blocks.
  const receipt = await reader.waitForTransactionReceipt({
    hash,
    confirmations: 3,
    timeout: 20_000,
  });
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase())
    throw new Error(
      'Wallet transaction was replaced. Keep the original attempt and reconcile the hashes.',
    );
  if (receipt.status === 'success') {
    await confirmSuccess(hash);
    return 'confirmed';
  }
  const [chainId, head, block] = await Promise.all([
    reader.getChainId(),
    reader.getBlockNumber({ cacheTime: 0 }),
    reader.getBlock({ blockNumber: receipt.blockNumber }),
  ]);
  if (chainId !== 5042002 || head < receipt.blockNumber + 2n || block.hash !== receipt.blockHash)
    throw new Error(
      'The revert is not canonically confirmed. Check the same hash before retrying.',
    );
  return 'reverted';
}
