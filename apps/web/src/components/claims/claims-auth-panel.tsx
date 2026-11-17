'use client';

import { useState } from 'react';
import { Panel } from '@/components/panel';
import { storeClaimsTokens } from '@/lib/claims/claims-api';

/**
 * Ops-only token entry for testnet beta. Tokens never become actor strings —
 * they are sent as Authorization Bearer and mapped server-side.
 */
export function ClaimsAuthPanel() {
  const [claimantToken, setClaimantToken] = useState('');
  const [reviewerToken, setReviewerToken] = useState('');
  const [authorityToken, setAuthorityToken] = useState('');
  const [wallet, setWallet] = useState('0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760');
  const [policyholderId, setPolicyholderId] = useState('');
  const [saved, setSaved] = useState(false);

  return (
    <Panel title="Claims API auth (server-enforced)">
      <p className="mb-3 text-xs text-zinc-600">
        Paste Bearer tokens from server env (<code>CLAIMS_*_API_TOKEN</code>). Actor/role fields in
        requests are ignored. Without tokens, privileged APIs return 401/403.
      </p>
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Claimant token</span>
          <input
            className="w-full rounded-md border border-zinc-200 px-2 py-1 font-mono text-xs"
            value={claimantToken}
            onChange={(e) => setClaimantToken(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Reviewer token</span>
          <input
            className="w-full rounded-md border border-zinc-200 px-2 py-1 font-mono text-xs"
            value={reviewerToken}
            onChange={(e) => setReviewerToken(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Authority token</span>
          <input
            className="w-full rounded-md border border-zinc-200 px-2 py-1 font-mono text-xs"
            value={authorityToken}
            onChange={(e) => setAuthorityToken(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Wallet (ownership)</span>
          <input
            className="w-full rounded-md border border-zinc-200 px-2 py-1 font-mono text-xs"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs text-zinc-500">Policyholder id (optional)</span>
          <input
            className="w-full rounded-md border border-zinc-200 px-2 py-1 font-mono text-xs"
            value={policyholderId}
            onChange={(e) => setPolicyholderId(e.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white"
        onClick={() => {
          storeClaimsTokens({
            claimantToken,
            reviewerToken,
            authorityToken,
            wallet,
            policyholderId,
          });
          setSaved(true);
        }}
      >
        Store tokens in session
      </button>
      {saved ? <p className="mt-2 text-xs text-emerald-700">Saved for this browser session.</p> : null}
    </Panel>
  );
}
