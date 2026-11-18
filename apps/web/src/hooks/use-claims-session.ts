'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionMe } from '@arcuex/domain';
import { useAccount } from 'wagmi';

export type ClaimsSession = {
  role: 'claimant' | 'reviewer' | 'authority' | 'system';
  wallet: string | null;
  capabilities: SessionMe['capabilities'];
};

type SessionState = {
  session: ClaimsSession | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useClaimsSession(): SessionState {
  const { address, chainId } = useAccount();
  const generation = useRef(0);
  const [session, setSession] = useState<ClaimsSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setSession(null);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/session/me', { credentials: 'include', cache: 'no-store' });
      if (request !== generation.current) return;
      if (res.status === 401 || res.status === 403) {
        setSession(null);
        return;
      }
      if (!res.ok) {
        setSession(null);
        setError(`Session check failed (${res.status})`);
        return;
      }
      const json = (await res.json()) as SessionMe;
      if (request !== generation.current) return;
      if (
        json.version === 1 &&
        json.state === 'authenticated' &&
        (json.role === 'claimant' ||
          json.role === 'reviewer' ||
          json.role === 'authority' ||
          json.role === 'system')
      ) {
        setSession({
          role: json.role,
          wallet: json.wallet ?? null,
          capabilities: json.capabilities,
        });
      } else {
        setSession(null);
      }
    } catch (e) {
      if (request !== generation.current) return;
      setSession(null);
      setError(e instanceof Error ? e.message : 'Session check failed');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const update = () => {
      void refresh();
    };
    window.addEventListener('arcuex-session-changed', update);
    window.addEventListener('focus', update);
    return () => {
      generation.current++;
      window.removeEventListener('arcuex-session-changed', update);
      window.removeEventListener('focus', update);
    };
  }, [refresh, address, chainId]);

  return { session, loading, error, refresh };
}
