import { describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { ProcurementService } from '@arcuex/agent-sdk';
import { ProcurementStore } from '@arcuex/persistence';
import { toPolicyIdBytes32 } from '@arcuex/onchain';
import { GET as me } from '@/app/api/session/me/route';
import { GET as lifecycle } from '@/app/api/policies/[policyId]/lifecycle/route';
import { GET as reconciliation } from '@/app/api/policies/reconciliation/route';
import { getDb, getRepo } from './db';
import {
  createOpsSessionFromBearer,
  issueClaimsNonce,
  verifyWalletAndCreateSession,
  sessionStoreId,
} from './claims-session';
import { reconciliationScope } from './policy-reconciliation';
import { procurementPool } from './procurement-chain';
async function walletSession() {
  const account = privateKeyToAccount(generatePrivateKey());
  const wallet = account.address.toLowerCase();
  const c = issueClaimsNonce(getRepo(), wallet);
  const session = await verifyWalletAndCreateSession(getRepo(), {
    wallet,
    nonce: c.nonce,
    signature: await account.signMessage({ message: c.message }),
  });
  return { wallet, sessionId: session.sessionId, cookie: `arcuex_claims_sid=${session.sessionId}` };
}
const request = (url: string, cookie?: string, extra?: Record<string, string>) =>
  new Request(`http://localhost${url}`, { headers: { ...(cookie ? { cookie } : {}), ...extra } });
function makePolicy(wallet: string) {
  const now = Math.floor(Date.now() / 1000);
  const store = new ProcurementStore(getDb());
  const svc = new ProcurementService(store, procurementPool, `0x${'11'.repeat(20)}`, () => now);
  const agent = svc.register(wallet, {
    idempotencyKey: crypto.randomUUID(),
    label: 'test',
    signer: wallet,
    position: 'synthetic',
    exposureMicros: '1000000',
    ownerAttestsControl: true,
  });
  const q = svc.quote(wallet, {
    idempotencyKey: crypto.randomUUID(),
    agentId: agent.id,
    limitMicros: '1000000',
    durationDays: 1,
    eligibility: {
      positionHealthy: true,
      noKnownIncident: true,
      syntheticOnly: true,
      ownerAttestsControl: true,
    },
  });
  return svc.prepare(wallet, { quoteId: q.terms.quoteId, acceptedDigest: q.digest }).policy;
}
function evidence(policyId: string) {
  const transactionHash = `0x${policyId.replace(/-/g, '').repeat(2)}`;
  const owner = new ProcurementStore(getDb()).policy(policyId)!.terms.owner;
  const now = Math.floor(Date.now() / 1000);
  getDb().transaction(() => {
    getDb()
      .prepare(
        'INSERT OR REPLACE INTO policy_reconciliation_scopes(scope,healthy,checked_at) VALUES (?,1,?)',
      )
      .run(reconciliationScope, now);
    getDb()
      .prepare(`INSERT INTO policy_bind_events VALUES (?,?,?,?,'VERIFIED_LINKED',1,'10','block',?)`)
      .run(
        policyId,
        reconciliationScope,
        toPolicyIdBytes32(policyId),
        policyId,
        JSON.stringify({
          transactionHash,
          premiumPayer: owner,
          beneficiary: owner,
          blockNumber: '10',
          blockHash: 'block',
          logIndex: 3,
        }),
      );
    new ProcurementStore(getDb()).confirm(policyId, transactionHash, now);
  })();
}
describe('shared read APIs', () => {
  it('returns anonymous on missing/forged/expired/revoked sessions and ignores wallet/workspace/bearer privilege assertions', async () => {
    const anonymous = await (
      await me(
        request('/api/session/me', undefined, {
          authorization: 'Bearer reviewer',
          'x-wallet-address': `0x${'11'.repeat(20)}`,
          'x-workspace': 'authority',
        }),
      )
    ).json();
    expect(anonymous).toMatchObject({
      state: 'anonymous',
      wallet: null,
      role: null,
      capabilities: [],
    });
    expect(
      (await (await me(request('/api/session/me', 'arcuex_claims_sid=forged'))).json()).state,
    ).toBe('anonymous');
    const s = await walletSession();
    const signed = await me(request('/api/session/me', s.cookie, { 'x-workspace': 'authority' }));
    expect(signed.headers.get('cache-control')).toBe('no-store');
    expect(await signed.json()).toEqual({
      version: 1,
      state: 'authenticated',
      wallet: s.wallet,
      chainId: 5042002,
      role: 'claimant',
      capabilities: ['procurement:read', 'claims:intake'],
    });
    getDb().transaction(() =>
      getDb()
        .prepare("UPDATE claims_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?")
        .run(sessionStoreId(s.sessionId)),
    )();
    expect((await (await me(request('/api/session/me', s.cookie))).json()).state).toBe('anonymous');
    const revoked = await walletSession();
    getDb().transaction(() =>
      getDb()
        .prepare('UPDATE claims_sessions SET revoked_at=? WHERE id=?')
        .run(new Date().toISOString(), sessionStoreId(revoked.sessionId)),
    )();
    expect((await (await me(request('/api/session/me', revoked.cookie))).json()).state).toBe(
      'anonymous',
    );
  });
  it.each(['reviewer', 'authority'] as const)(
    'projects server-issued %s capability without disclosing credentials',
    async (role) => {
      const s = createOpsSessionFromBearer(getRepo(), role);
      const response = await (
        await me(request('/api/session/me', `arcuex_claims_sid=${s.sessionId}`))
      ).json();
      expect(response.role).toBe(role);
      expect(response.wallet).toBeNull();
      expect(response.chainId).toBeNull();
      expect(response.capabilities).toContain(
        role === 'reviewer' ? 'claims:review' : 'settlement:prepare',
      );
      expect(JSON.stringify(response)).not.toContain(s.sessionId);
      expect(response).not.toHaveProperty('token');
      expect(response.capabilities).not.toContain('claims:intake');
    },
  );
  it('distinguishes prepared, pending, confirmed and expired from owned evidence; rejects wrong wallets and malicious IDs', async () => {
    const s = await walletSession(),
      other = await walletSession(),
      p = makePolicy(s.wallet);
    const read = async (cookie = s.cookie, id = p.terms.policyId) =>
      lifecycle(request(`/api/policies/${id}/lifecycle`, cookie), {
        params: Promise.resolve({ policyId: id }),
      });
    const changes = getDb().prepare('SELECT total_changes() AS n').get();
    expect((await (await read()).json()).state).toBe('prepared');
    expect(getDb().prepare('SELECT total_changes() AS n').get()).toEqual(changes);
    for (const id of [
      "' OR 1=1 --",
      '../session/me',
      toPolicyIdBytes32(p.terms.policyId),
      '0x1234',
    ])
      expect((await read(s.cookie, id)).status).toBe(404);
    expect((await read(other.cookie)).status).toBe(404);
    expect(
      (
        await lifecycle(request('/api/policies/x/lifecycle'), {
          params: Promise.resolve({ policyId: p.terms.policyId }),
        })
      ).status,
    ).toBe(401);
    evidence(p.terms.policyId);
    const transactionHash = `0x${p.terms.policyId.replace(/-/g, '').repeat(2)}`;
    const confirmed = await (await read()).json();
    expect(confirmed).toMatchObject({
      state: 'confirmed',
      claimsEligible: false,
      confirmation: {
        transactionHash,
        blockNumber: '10',
        logIndex: 3,
      },
    });
    expect(confirmed.confirmation.explorerUrl).toBe(
      `https://explorer.testnet.arc.io/tx/${transactionHash}`,
    );
    expect(confirmed.settlements).toEqual([]);
    const caseId = crypto.randomUUID();
    const stamp = new Date().toISOString();
    getDb().transaction(() => {
      getDb()
        .prepare(
          `INSERT INTO claims_cases(id,schema_version,status,policy_id,exposure_id,claimant_ref,idempotency_key,synthetic_demo,evidence_authenticity,coverage_determination,settlement_authorization,deductible_micros,prior_compensation_micros,created_at,updated_at,procurement_policy_id)
        VALUES (?,1,'PAID',?,?,?, ?,1,'synthetic','covered','authorized','100000','0',?,?,?)`,
        )
        .run(
          caseId,
          p.terms.policyId,
          p.terms.agentId,
          s.wallet,
          caseId,
          stamp,
          stamp,
          p.terms.policyId,
        );
      getDb()
        .prepare(
          `INSERT INTO claims_case_events VALUES (?,?,'SETTLEMENT_PENDING','PAID','authority:fixture','SETTLEMENT_RECONCILED',?,?)`,
        )
        .run(crypto.randomUUID(), caseId, JSON.stringify({ receiptRef: transactionHash }), stamp);
    })();
    expect((await (await read()).json()).settlements).toEqual([
      {
        caseId,
        state: 'Payment unconfirmed',
        receiptRef: null,
        explorerUrl: null,
      },
    ]);

    const future = vi.spyOn(Date, 'now').mockReturnValue((p.terms.expiresAt + 1) * 1000);
    try {
      getDb().transaction(() =>
        getDb()
          .prepare('UPDATE claims_sessions SET expires_at=? WHERE id=?')
          .run(
            new Date((p.terms.expiresAt + 86400) * 1000).toISOString(),
            sessionStoreId(s.sessionId),
          ),
      )();
      getDb().transaction(() =>
        getDb()
          .prepare('UPDATE policy_reconciliation_scopes SET checked_at=? WHERE scope=?')
          .run(p.terms.expiresAt + 1, reconciliationScope),
      )();
      expect((await (await read()).json()).state).toBe('expired');
    } finally {
      future.mockRestore();
    }

    getDb().transaction(() =>
      getDb()
        .prepare('UPDATE policy_reconciliation_scopes SET healthy=0 WHERE scope=?')
        .run(reconciliationScope),
    )();
    expect((await (await read()).json()).state).toBe('reconciliation_pending');
    getDb().transaction(() =>
      getDb()
        .prepare(
          "UPDATE policy_bind_events SET canonical=0,status='ORPHANED' WHERE local_policy_id=?",
        )
        .run(p.terms.policyId),
    )();
    expect(await (await read()).json()).toMatchObject({
      state: 'reconciliation_pending',
      completeness: 'ORPHANED',
      claimsEligible: false,
      confirmation: { transactionHash },
    });

    getDb().transaction(() =>
      getDb()
        .prepare('UPDATE policy_reconciliation_scopes SET healthy=1,checked_at=? WHERE scope=?')
        .run(Math.floor(Date.now() / 1000) - 301, reconciliationScope),
    )();
    expect((await (await read()).json()).claimsEligible).toBe(false);
  });
  it('shows incomplete records separately, without enabling claims or disclosing them to another wallet', async () => {
    const s = await walletSession(),
      other = await walletSession(),
      p = makePolicy(s.wallet);
    evidence(p.terms.policyId);
    getDb().transaction(() =>
      getDb()
        .prepare("UPDATE policy_bind_events SET status='INCOMPLETE' WHERE local_policy_id=?")
        .run(p.terms.policyId),
    )();
    const read = async (cookie: string) =>
      (await reconciliation(request('/api/policies/reconciliation', cookie))).json();
    const mine = (await read(s.cookie)).records;
    expect(mine).toContainEqual(
      expect.objectContaining({
        policyId: p.terms.policyId,
        completeness: 'INCOMPLETE',
        claimsEligible: false,
      }),
    );
    expect(
      (await read(other.cookie)).records.some(
        (r: { policyId: string }) => r.policyId === p.terms.policyId,
      ),
    ).toBe(false);
    expect(new ProcurementStore(getDb()).claimsEligible(p.terms.policyId)).toBe(false);
  });
});
