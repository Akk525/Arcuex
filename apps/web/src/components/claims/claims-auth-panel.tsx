'use client';

import { useState } from 'react';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { claimsOpsLogin } from '@/lib/claims/claims-api';

export function ClaimsAuthPanel() {
  const [reviewerToken, setReviewerToken] = useState('');
  const [authorityToken, setAuthorityToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function exchange(role: 'reviewer' | 'authority', token: string) {
    setError(null);
    setPending(true);
    try {
      const result = await claimsOpsLogin(role, token);
      if (!result.ok) {
        setError(result.error ?? 'Session exchange failed. Check the token and retry.');
        return;
      }
      window.location.reload();
    } catch {
      setError('Session exchange is unavailable. Retry when the connection returns.');
    } finally {
      setReviewerToken('');
      setAuthorityToken('');
      setPending(false);
    }
  }

  return (
    <Panel title="Ops access">
      <p className="mb-3 text-sm text-[var(--ink-muted)]">
        Exchange a provisioned token for the reviewer or settlement authority session.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ['reviewer', reviewerToken, setReviewerToken, 'Reviewer'],
            ['authority', authorityToken, setAuthorityToken, 'Authority'],
          ] as const
        ).map(([role, token, setToken, name]) => (
          <form
            key={role}
            className="min-w-0 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (token.trim()) void exchange(role, token);
            }}
          >
            <label className="block text-sm font-medium">
              {name} API token (one-shot exchange)
              <input
                className="mt-1 w-full rounded-[var(--radius)] border border-[var(--line-strong)] px-3 font-mono text-sm"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
              />
            </label>
            <Button variant="secondary" type="submit" size="sm" disabled={pending || !token.trim()}>
              Exchange {role} session
            </Button>
          </form>
        ))}
      </div>
      {pending && (
        <p role="status" className="mt-2 text-sm">
          Exchanging session…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </Panel>
  );
}
