'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { ArrowSquareOut, CaretDown, SignOut, Wallet } from '@phosphor-icons/react';
import { useWalletStatus, walletStatusLabel } from '@/hooks/use-wallet-status';
import { useClaimsSession } from '@/hooks/use-claims-session';
import { useWalletSignIn } from '@/hooks/use-wallet-sign-in';
import { shortAddress } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { useFixtureMode } from '@/providers/source-mode';
import { ARC_TESTNET_FAUCET } from '@arcuex/chain';

/**
 * Wallet + claims-session controls for the top bar.
 * Session identity comes from GET /api/session/me (server cookie).
 * Signing in proves wallet control; it grants no role by itself.
 */
export function AccountBar() {
  const fixtureMode = useFixtureMode();
  const wallet = useWalletStatus();
  const { address, isConnected } = useAccount();
  const { session, loading, refresh, error: sessionError } = useClaimsSession();
  const auth = useWalletSignIn();
  const busy = auth.busy;
  const error = auth.error;
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function signIn() {
    if (await auth.signIn()) await refresh();
  }

  async function signOut() {
    if (await auth.signOut()) {
      await refresh();
      setOpen(false);
    }
  }

  const sessionMatchesWallet =
    Boolean(session) && session?.wallet?.toLowerCase() === address?.toLowerCase();
  const needsSignIn = wallet.uiStatus === 'ready' && !sessionMatchesWallet;
  const sessionLabel = loading
    ? 'Checking session…'
    : session
      ? session.role === 'claimant'
        ? 'Signed in'
        : `Signed in as ${session.role}`
      : sessionError
        ? 'Session unavailable'
        : 'Not signed in';
  const connectError =
    wallet.connectError instanceof Error
      ? wallet.connectError.message
      : wallet.connectError
        ? String(wallet.connectError)
        : null;
  const alertText = error ?? connectError;

  return (
    <div className="relative flex min-w-0 items-center gap-2" ref={menuRef}>
      {wallet.uiStatus === 'disconnected' ? (
        <Button size="sm" onClick={() => void wallet.connectInjected()} disabled={busy}>
          <Wallet size={15} weight="bold" aria-hidden="true" />
          Connect wallet
        </Button>
      ) : null}
      {wallet.uiStatus === 'connecting' || wallet.uiStatus === 'switching' ? (
        <span role="status" className="text-[0.8125rem] text-[var(--ink-muted)]">
          {walletStatusLabel(wallet.uiStatus)}…
        </span>
      ) : null}
      {wallet.uiStatus === 'wrong_network' ? (
        <Button size="sm" variant="secondary" onClick={() => void wallet.switchToArc()}>
          Switch to Arc
        </Button>
      ) : null}
      {needsSignIn ? (
        <Button size="sm" onClick={() => void signIn()} disabled={!isConnected || !address || busy}>
          {busy ? 'Signing…' : 'Sign in'}
        </Button>
      ) : null}
      {sessionError ? (
        <Button size="sm" variant="secondary" onClick={() => void refresh()}>
          Retry session
        </Button>
      ) : null}

      {wallet.address || session ? (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] py-1 pr-2 pl-1 text-[0.8125rem] font-medium text-[var(--ink)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-inset)]"
        >
          <Avatar address={wallet.address ?? session?.wallet ?? null} />
          <span className="hidden font-mono text-xs tabular-nums sm:inline">
            {wallet.address ? shortAddress(wallet.address) : 'Session'}
          </span>
          <CaretDown size={12} weight="bold" className="text-[var(--ink-muted)]" aria-hidden="true" />
          <span className="sr-only">Account menu</span>
        </button>
      ) : null}

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-72 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]"
        >
          <div className="px-2.5 pt-2 pb-2.5">
            <p className="text-xs text-[var(--ink-muted)]">Wallet</p>
            <p className="mt-0.5 flex items-center justify-between gap-2 text-sm font-medium text-[var(--ink)]">
              <span className="truncate font-mono text-[0.8125rem]">
                {wallet.address ? shortAddress(wallet.address, 6) : 'Not connected'}
              </span>
              <span className="text-xs font-normal text-[var(--ink-muted)]">
                {walletStatusLabel(wallet.uiStatus)}
              </span>
            </p>
            <p className="mt-2.5 text-xs text-[var(--ink-muted)]">Claims session</p>
            <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{sessionLabel}</p>
            {session && !sessionMatchesWallet && wallet.address ? (
              <p className="mt-1 text-xs text-[var(--warn)]">Session belongs to a different wallet.</p>
            ) : null}
          </div>
          <div className="border-t border-[var(--line)] pt-1.5">
            {session ? (
              <MenuItem onClick={() => void signOut()} disabled={busy}>
                <SignOut size={15} aria-hidden="true" />
                Sign out
              </MenuItem>
            ) : null}
            {wallet.address ? (
              <MenuItem
                onClick={() => {
                  wallet.disconnect();
                  setOpen(false);
                }}
              >
                <Wallet size={15} aria-hidden="true" />
                Disconnect wallet
              </MenuItem>
            ) : null}
            {!fixtureMode ? (
              <a
                role="menuitem"
                href={ARC_TESTNET_FAUCET}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-9 items-center gap-2 rounded-[var(--radius)] px-2.5 text-[0.8125rem] text-[var(--ink-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--ink)]"
              >
                <ArrowSquareOut size={15} aria-hidden="true" />
                Arc Testnet faucet
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {alertText ? (
        <p
          role="alert"
          className="absolute top-[calc(100%+0.5rem)] right-0 z-40 max-w-xs rounded-[var(--radius)] border border-[#f3c4bf] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)] shadow-[var(--shadow-md)]"
        >
          {alertText}
        </p>
      ) : null}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-9 w-full items-center gap-2 rounded-[var(--radius)] px-2.5 text-left text-[0.8125rem] text-[var(--ink-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--ink)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Avatar({ address }: { address: string | null }) {
  const seed = address ? parseInt(address.slice(2, 8), 16) : 0;
  const hue = 170 + (seed % 30);
  return (
    <span
      aria-hidden="true"
      className="grid h-7 w-7 place-items-center rounded-full text-[0.6875rem] font-semibold text-white"
      style={{ background: `linear-gradient(140deg, hsl(${hue} 55% 36%), hsl(${hue + 12} 60% 20%))` }}
    >
      {address ? address.slice(2, 4).toUpperCase() : 'A'}
    </span>
  );
}
