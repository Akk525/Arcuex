'use client';

import { useCallback, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { claimsLogout, claimsWalletLogin } from '@/lib/claims/claims-api';

/**
 * Wallet-signature sign-in for the claims session. Proves wallet control only;
 * roles come from the server. Login/logout broadcast `arcuex-session-changed`.
 */
export function useWalletSignIn() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    if (!address) return false;
    setBusy(true);
    setError(null);
    try {
      const result = await claimsWalletLogin({
        wallet: address,
        signMessage: (message) => signMessageAsync({ message }),
      });
      if (!result.ok) {
        setError(result.error ?? 'Sign-in failed');
        return false;
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Session request failed');
      return false;
    } finally {
      setBusy(false);
    }
  }, [address, signMessageAsync]);

  const signOut = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await claimsLogout();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Session request failed');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { signIn, signOut, busy, error };
}
