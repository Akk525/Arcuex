'use client';

import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { Panel } from '@/components/panel';
import { claimsLogout, claimsOpsLogin, claimsWalletLogin } from '@/lib/claims/claims-api';

/**
 * Wallet session for claimants (httpOnly cookie).
 * Ops reviewer/authority exchange a server token once for an opaque session —
 * the secret is not stored in sessionStorage/localStorage.
 */
export function ClaimsAuthPanel() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [reviewerToken, setReviewerToken] = useState('');
  const [authorityToken, setAuthorityToken] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel title="Claims authentication">
      <p className="mb-3 text-xs text-zinc-600">
        Claimants sign a one-time nonce (wallet session cookie). Reviewer/authority privileges are
        separately provisioned — a wallet alone never grants them. Authority API secrets are not
        kept in browser storage.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          disabled={!isConnected || !address}
          onClick={() => {
            setError(null);
            void claimsWalletLogin({
              wallet: address!,
              signMessage: (message) => signMessageAsync({ message }),
            }).then((r) => {
              if (!r.ok) setError(r.error ?? 'Wallet login failed');
              else setStatus(`Wallet session OK (${address})`);
            });
          }}
        >
          Sign in with wallet
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs"
          onClick={() => {
            void claimsLogout().then(() => setStatus('Logged out'));
          }}
        >
          Log out
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Reviewer API token (one-shot exchange)</span>
          <input
            className="w-full rounded-md border border-zinc-200 px-2 py-1 font-mono text-xs"
            type="password"
            value={reviewerToken}
            onChange={(e) => setReviewerToken(e.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            className="mt-1 rounded-md border border-zinc-300 px-2 py-1 text-xs"
            onClick={() => {
              setError(null);
              void claimsOpsLogin('reviewer', reviewerToken).then((r) => {
                setReviewerToken('');
                if (!r.ok) setError(r.error ?? 'Reviewer login failed');
                else setStatus('Reviewer session cookie set');
              });
            }}
          >
            Exchange reviewer session
          </button>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Authority API token (one-shot exchange)</span>
          <input
            className="w-full rounded-md border border-zinc-200 px-2 py-1 font-mono text-xs"
            type="password"
            value={authorityToken}
            onChange={(e) => setAuthorityToken(e.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            className="mt-1 rounded-md border border-zinc-300 px-2 py-1 text-xs"
            onClick={() => {
              setError(null);
              void claimsOpsLogin('authority', authorityToken).then((r) => {
                setAuthorityToken('');
                if (!r.ok) setError(r.error ?? 'Authority login failed');
                else setStatus('Authority session cookie set (secret not stored)');
              });
            }}
          >
            Exchange authority session
          </button>
        </label>
      </div>
      {status ? <p className="mt-2 text-xs text-emerald-700">{status}</p> : null}
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </Panel>
  );
}
