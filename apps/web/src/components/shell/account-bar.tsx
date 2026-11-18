'use client';

import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useWalletStatus, walletStatusLabel } from '@/hooks/use-wallet-status';
import { useClaimsSession } from '@/hooks/use-claims-session';
import { claimsLogout, claimsWalletLogin } from '@/lib/claims/claims-api';
import { shortAddress } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { ARC_TESTNET_FAUCET } from '@arcuex/chain';

/**
 * Persistent wallet + claims-session controls for the shell.
 * Session identity comes from GET /api/claims/auth/session (server cookie).
 */
export function AccountBar() {
  const wallet = useWalletStatus();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { session, loading, refresh } = useClaimsSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const result = await claimsWalletLogin({
        wallet: address,
        signMessage: (message) => signMessageAsync({ message }),
      });
      if (!result.ok) {
        setError(result.error ?? 'Sign-in failed');
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      await claimsLogout();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <StatusBadge label={walletStatusLabel(wallet.uiStatus)} tone={wallet.uiStatus === 'ready' ? 'ok' : 'neutral'} />
        {wallet.address ? (
          <span className="font-mono text-xs text-[var(--ink-muted)]">
            {shortAddress(wallet.address)}
          </span>
        ) : null}
        {loading ? (
          <span className="text-xs text-[var(--ink-muted)]">Session…</span>
        ) : session ? (
          <StatusBadge
            label={
              session.role === 'claimant'
                ? 'Signed in'
                : `Session · ${session.role}`
            }
            tone="live"
          />
        ) : (
          <StatusBadge label="No session" tone="neutral" />
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {wallet.uiStatus === 'disconnected' ? (
          <Button size="sm" onClick={() => void wallet.connectInjected()} disabled={busy}>
            Connect wallet
          </Button>
        ) : null}
        {wallet.uiStatus === 'wrong_network' ? (
          <Button size="sm" variant="secondary" onClick={() => void wallet.switchToArc()}>
            Switch to Arc
          </Button>
        ) : null}
        {wallet.uiStatus === 'ready' && !session ? (
          <Button
            size="sm"
            onClick={() => void signIn()}
            disabled={!isConnected || !address || busy}
          >
            Sign in
          </Button>
        ) : null}
        {session ? (
          <Button size="sm" variant="secondary" onClick={() => void signOut()} disabled={busy}>
            Sign out
          </Button>
        ) : null}
        {wallet.address ? (
          <Button size="sm" variant="ghost" onClick={() => void wallet.disconnect()}>
            Disconnect
          </Button>
        ) : null}
        <a
          href={ARC_TESTNET_FAUCET}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--ink)]"
        >
          Faucet
        </a>
      </div>
      {error ? <p className="text-right text-xs text-[var(--danger)]">{error}</p> : null}
      {wallet.connectError ? (
        <p className="text-right text-xs text-[var(--danger)]">
          {wallet.connectError instanceof Error
            ? wallet.connectError.message
            : String(wallet.connectError)}
        </p>
      ) : null}
    </div>
  );
}
