'use client';
import { useState } from 'react';
import { useSignMessage } from 'wagmi';
import { useWalletStatus } from './use-wallet-status';
export function useProcurement() {
  const wallet = useWalletStatus();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function api<T>(path: string, body?: unknown): Promise<T> {
    if (wallet.uiStatus !== 'ready' || !wallet.address)
      throw new Error('Connect your wallet on Arc Testnet first.');
    const key = `arcuex-session:${wallet.address.toLowerCase()}`;
    let token = sessionStorage.getItem(key);
    async function send(path: string, body?: unknown, auth?: string) {
      const response = await fetch(`/api/procurement/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = await response.json();
      if (!response.ok) {
        if (response.status === 401) sessionStorage.removeItem(key);
        throw new Error(json.error ?? 'Request failed');
      }
      return json;
    }
    if (!token) {
      const challenge = await send('auth/challenge', { address: wallet.address });
      const signature = await signMessageAsync({
        message: challenge.message,
        account: wallet.address,
      });
      const session = await send('auth/verify', { id: challenge.id, signature });
      token = session.token as string;
      sessionStorage.setItem(key, token);
    }
    const payload =
      body && typeof body === 'object' && ['agents', 'delegations', 'quotes'].includes(path)
        ? { idempotencyKey: crypto.randomUUID(), ...body }
        : body;
    return send(path, payload, token);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed; retry.');
    } finally {
      setBusy(false);
    }
  }
  return { wallet, api, run, busy, error };
}
