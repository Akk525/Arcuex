'use client';

/** Cookie-session claims API helper — credentials include httpOnly session. */

export async function claimsFetch(
  _role: 'claimant' | 'reviewer' | 'authority' | 'any',
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (response.status === 401) window.dispatchEvent(new Event('arcuex-session-changed'));
  return response;
}

export async function claimsOpsLogin(
  role: 'reviewer' | 'authority',
  apiToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/claims/auth/ops-login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const json = (await res.json()) as { error?: string };
    return { ok: false, error: json.error ?? 'Ops login failed' };
  }
  window.dispatchEvent(new Event('arcuex-session-changed'));
  return { ok: true };
}

export async function claimsWalletLogin(input: {
  wallet: string;
  signMessage: (message: string) => Promise<`0x${string}`>;
}): Promise<{ ok: boolean; error?: string }> {
  const nonceRes = await fetch('/api/claims/auth/nonce', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet: input.wallet }),
  });
  const nonceJson = await nonceRes.json();
  if (!nonceRes.ok) return { ok: false, error: nonceJson.error ?? 'Nonce failed' };

  let signature: `0x${string}`;
  try {
    signature = await input.signMessage(String(nonceJson.message));
  } catch {
    return { ok: false, error: 'Wallet signature rejected. Retry sign-in.' };
  }
  const verifyRes = await fetch('/api/claims/auth/verify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      wallet: input.wallet,
      nonce: nonceJson.nonce,
      signature,
    }),
  });
  const verifyJson = await verifyRes.json();
  if (!verifyRes.ok) return { ok: false, error: verifyJson.error ?? 'Verify failed' };
  window.dispatchEvent(new Event('arcuex-session-changed'));
  return { ok: true };
}

export async function claimsLogout(): Promise<void> {
  const response = await fetch('/api/claims/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Sign out failed');
  window.dispatchEvent(new Event('arcuex-session-changed'));
}
