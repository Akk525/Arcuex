'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardOverview } from '@/lib/dashboard-overview-types';

export function useDashboardOverview() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`The overview service responded with ${res.status}.`);
      }
      const json = (await res.json()) as DashboardOverview;
      if (request === generation.current) setData(json);
    } catch (err) {
      if (request !== generation.current) return;
      // Keep the last good snapshot visible; the error is shown alongside it.
      setError(err instanceof Error ? err.message : 'The overview could not be loaded.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onSession = () => void refresh();
    window.addEventListener('arcuex-session-changed', onSession);
    return () => {
      generation.current++;
      window.removeEventListener('arcuex-session-changed', onSession);
    };
  }, [refresh]);

  return { data, error, loading, refresh };
}
