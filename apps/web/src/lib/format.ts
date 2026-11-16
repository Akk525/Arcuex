import type { Address, Hash } from 'viem';

export function shortAddress(address: Address | string, size = 4): string {
  if (address.length < size * 2 + 2) return address;
  return `${address.slice(0, size + 2)}…${address.slice(-size)}`;
}

export function shortHash(hash: Hash | string, size = 6): string {
  if (hash.length < size * 2 + 2) return hash;
  return `${hash.slice(0, size + 2)}…${hash.slice(-size)}`;
}

export function formatLatency(ms: number): string {
  return `${ms} ms`;
}
