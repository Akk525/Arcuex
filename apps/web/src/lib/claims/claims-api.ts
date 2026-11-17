'use client';

const CLAIMANT_KEY = 'arcuex.claims.claimantToken';
const REVIEWER_KEY = 'arcuex.claims.reviewerToken';
const AUTHORITY_KEY = 'arcuex.claims.authorityToken';
const WALLET_KEY = 'arcuex.claims.wallet';
const POLICYHOLDER_KEY = 'arcuex.claims.policyholderId';

export function storeClaimsTokens(input: {
  claimantToken?: string;
  reviewerToken?: string;
  authorityToken?: string;
  wallet?: string;
  policyholderId?: string;
}) {
  if (input.claimantToken !== undefined) {
    sessionStorage.setItem(CLAIMANT_KEY, input.claimantToken);
  }
  if (input.reviewerToken !== undefined) {
    sessionStorage.setItem(REVIEWER_KEY, input.reviewerToken);
  }
  if (input.authorityToken !== undefined) {
    sessionStorage.setItem(AUTHORITY_KEY, input.authorityToken);
  }
  if (input.wallet !== undefined) sessionStorage.setItem(WALLET_KEY, input.wallet);
  if (input.policyholderId !== undefined) {
    sessionStorage.setItem(POLICYHOLDER_KEY, input.policyholderId);
  }
}

export function claimsFetch(
  role: 'claimant' | 'reviewer' | 'authority' | 'any',
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token =
    role === 'any'
      ? sessionStorage.getItem(AUTHORITY_KEY) ||
        sessionStorage.getItem(REVIEWER_KEY) ||
        sessionStorage.getItem(CLAIMANT_KEY) ||
        ''
      : (sessionStorage.getItem(
          role === 'claimant' ? CLAIMANT_KEY : role === 'reviewer' ? REVIEWER_KEY : AUTHORITY_KEY,
        ) ?? '');
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  const wallet = sessionStorage.getItem(WALLET_KEY);
  const policyholderId = sessionStorage.getItem(POLICYHOLDER_KEY);
  if (wallet) headers.set('x-arcuex-wallet', wallet);
  if (policyholderId) headers.set('x-arcuex-policyholder-id', policyholderId);
  return fetch(input, { ...init, headers });
}
