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
    async function send(path: string, body?: unknown) {
      const response = await fetch(path.startsWith('/api/') ? path : `/api/procurement/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-arcuex-wallet': wallet.address! },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = await response.json();
      if (response.status === 401) window.dispatchEvent(new Event('arcuex-session-changed'));
      if (!response.ok) throw new Error(json.error ?? 'Request failed');
      return json;
    }
    const identityResponse = await fetch('/api/session/me', { credentials: 'include' });
    const identity = await identityResponse.json();
    if (
      !identityResponse.ok ||
      identity.state !== 'authenticated' ||
      identity.wallet?.toLowerCase() !== wallet.address.toLowerCase() ||
      identity.role !== 'claimant'
    ) {
      const challenge = await send('auth/challenge', { address: wallet.address });
      const signature = await signMessageAsync({
        message: challenge.message,
        account: wallet.address,
      });
      await send('auth/verify', { id: challenge.id, signature });
      window.dispatchEvent(new Event('arcuex-session-changed'));
    }
    const payload =
      body && typeof body === 'object' && ['agents', 'delegations', 'quotes'].includes(path)
        ? { idempotencyKey: crypto.randomUUID(), ...body }
        : body;
    return send(path, payload);
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
