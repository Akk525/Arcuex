import type { Hash, PublicClient, TransactionReceipt } from 'viem';
import { ARC_CONFIRMATION_DEPTH } from '@arcuex/onchain';
import { check } from './procurement';
import { LAUNCH_CHAIN_ID } from './runtime-config';

export { ARC_CONFIRMATION_DEPTH };

export async function assertArcChain(client: PublicClient) {
  check(
    (await client.getChainId()) === LAUNCH_CHAIN_ID,
    'RPC is not Arc Testnet',
    'CHAIN_MISMATCH',
  );
}

export async function assertCanonicalBlock(
  client: PublicClient,
  blockNumber: bigint,
  blockHash: Hash,
) {
  const block = await client.getBlock({ blockNumber });
  check(block.hash === blockHash, 'Arc block is no longer canonical', 'CHAIN_REORGANIZED');
  return block;
}

export async function confirmedBlock(client: PublicClient) {
  await assertArcChain(client);
  const head = await client.getBlockNumber({ cacheTime: 0 });
  check(head >= ARC_CONFIRMATION_DEPTH, 'Arc confirmation depth unavailable', 'UNCONFIRMED');
  const number = head - ARC_CONFIRMATION_DEPTH;
  const block = await client.getBlock({ blockNumber: number });
  check(block.hash && block.number === number, 'Confirmed Arc block unavailable', 'UNCONFIRMED');
  return { number, hash: block.hash };
}

export async function confirmedReceipt(client: PublicClient, hash: Hash) {
  await assertArcChain(client);
  const receipt = await client.getTransactionReceipt({ hash });
  check(
    receipt.transactionHash.toLowerCase() === hash.toLowerCase(),
    'Arc receipt hash mismatch',
    'INVALID_RECEIPT',
  );
  const head = await client.getBlockNumber({ cacheTime: 0 });
  check(
    head >= receipt.blockNumber + ARC_CONFIRMATION_DEPTH,
    'Receipt is awaiting two Arc descendant blocks',
    'UNCONFIRMED',
  );
  const block = await assertCanonicalBlock(client, receipt.blockNumber, receipt.blockHash);
  return { receipt, block };
}

export function requireReceiptLog(
  receipt: TransactionReceipt,
  log: TransactionReceipt['logs'][number],
) {
  check(
    log.removed === false &&
      log.blockNumber === receipt.blockNumber &&
      log.blockHash === receipt.blockHash &&
      log.transactionHash === receipt.transactionHash,
    'Arc receipt contains a noncanonical log',
    'INVALID_RECEIPT',
  );
}
