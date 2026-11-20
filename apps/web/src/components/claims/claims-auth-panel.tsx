'use client';

import { useState } from 'react';
import { LockKey } from '@phosphor-icons/react';
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
    <section
      aria-labelledby="ops-access"
      className="max-w-3xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]"
    >
      <header className="flex items-start gap-3 border-b border-[var(--line)] px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] bg-[var(--surface-inset)] text-[var(--ink-secondary)]">
          <LockKey size={18} weight="duotone" aria-hidden="true" />
        </span>
        <div>
          <h2 id="ops-access" className="text-sm font-semibold text-[var(--ink)]">
            Reviewer access
          </h2>
          <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-muted)]">
            The queue opens for a provisioned reviewer or settlement authority. Exchange your token
            once for a session; the token is not stored in this browser.
          </p>
        </div>
      </header>
      <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2">
        {(
          [
            [
              'reviewer',
              reviewerToken,
              setReviewerToken,
              'Reviewer',
              'Request proof, resolve requests and record coverage decisions.',
            ],
            [
              'authority',
              authorityToken,
              setAuthorityToken,
              'Authority',
              'Prepare settlement for approved, independently verified claims.',
            ],
          ] as const
        ).map(([role, token, setToken, name, help]) => (
          <form
            key={role}
            className="min-w-0 space-y-2 bg-[var(--surface)] px-5 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (token.trim()) void exchange(role, token);
            }}
          >
            <label className="block">
              <span className="field-label">{name} API token (one-shot exchange)</span>
              <span className="field-hint mt-0.5 block">{help}</span>
              <input
                className="field-control mt-1.5 w-full font-mono"
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
      {(pending || error) && (
        <div className="border-t border-[var(--line)] px-5 py-3">
          {pending && (
            <p role="status" className="text-sm text-[var(--ink-muted)]">
              Exchanging session…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
