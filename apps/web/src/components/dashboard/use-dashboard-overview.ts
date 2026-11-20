'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DashboardOverview } from '@/lib/server/dashboard-overview';

export function useDashboardOverview() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Dashboard request failed (${res.status})`);
      }
      const json = (await res.json()) as DashboardOverview;
      setData(json);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, error, loading, refresh };
}
