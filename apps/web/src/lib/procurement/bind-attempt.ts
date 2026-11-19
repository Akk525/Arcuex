import type { Hex } from 'viem';
import { isBindHash } from './presentation';

export type BindAttempt = { state: 'uncertain' } | { state: 'submitted'; hash: Hex };
export const bindAttemptKey = (id: string) => `arcuex-purchase-bind:${id}`;

export function readBindAttempt(id: string): BindAttempt | null {
  try {
    const value = localStorage.getItem(bindAttemptKey(id));
    if (value === 'uncertain') return { state: 'uncertain' };
    const hash = value ?? sessionStorage.getItem(`arcuex-bind:${id}`);
    return isBindHash(hash) ? { state: 'submitted', hash } : null;
  } catch {
    return null;
  }
}

export function saveBindAttempt(id: string, attempt: BindAttempt) {
  localStorage.setItem(
    bindAttemptKey(id),
    attempt.state === 'submitted' ? attempt.hash : 'uncertain',
  );
}

export function clearBindAttempt(id: string) {
  localStorage.removeItem(bindAttemptKey(id));
  sessionStorage.removeItem(`arcuex-bind:${id}`);
}
