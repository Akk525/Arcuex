'use client';

import { useCallback, useEffect, useState } from 'react';

export type ClaimsSession = {
  role: 'claimant' | 'reviewer' | 'authority' | 'system';
  wallet: string | null;
};

type SessionState = {
  session: ClaimsSession | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useClaimsSession(): SessionState {
  const [session, setSession] = useState<ClaimsSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/claims/auth/session', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        setSession(null);
        return;
      }
      if (!res.ok) {
        setSession(null);
        setError(`Session check failed (${res.status})`);
        return;
      }
      const json = (await res.json()) as { role?: string; wallet?: string | null };
      if (
        json.role === 'claimant' ||
        json.role === 'reviewer' ||
        json.role === 'authority' ||
        json.role === 'system'
      ) {
        setSession({ role: json.role, wallet: json.wallet ?? null });
      } else {
        setSession(null);
      }
    } catch (e) {
      setSession(null);
      setError(e instanceof Error ? e.message : 'Session check failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { session, loading, error, refresh };
}
