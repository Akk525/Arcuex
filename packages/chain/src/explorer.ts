import type { Address, Hash } from 'viem';
import { ARC_TESTNET_EXPLORER } from './config';

function trimSlash(url: string): string {
  return url.replace(/\/$/, '');
}

export function explorerAddressUrl(
  address: Address,
  baseUrl: string = ARC_TESTNET_EXPLORER,
): string {
  return `${trimSlash(baseUrl)}/address/${address}`;
}

export function explorerTxUrl(hash: Hash, baseUrl: string = ARC_TESTNET_EXPLORER): string {
  return `${trimSlash(baseUrl)}/tx/${hash}`;
}

export function explorerBlockUrl(
  blockNumber: bigint | number,
  baseUrl: string = ARC_TESTNET_EXPLORER,
): string {
  return `${trimSlash(baseUrl)}/block/${blockNumber.toString()}`;
}
