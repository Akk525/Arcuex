import { NextResponse } from 'next/server';
import { hasAllowedOrigin, canonicalSigningOrigin } from './request-boundary';
import { getRuntimeConfig } from './runtime-config';
import { PROCUREMENT_OFFERINGS, type ProcurementCapacity } from '@arcuex/domain';
import { configuredIndependentLiquidation } from './independent-evidence';
import { ProcurementStore } from '@arcuex/persistence';
import { hasProcurementBindAuthority } from '@arcuex/agent-sdk';
import { ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import { authenticateClaimsRequest } from './claims-auth';
import {
  issueClaimsNonce,
  verifyWalletAndCreateSession,
  claimsSessionCookieOptions,
  CLAIMS_SESSION_COOKIE,
} from './claims-session';
import { getRepo, getDb } from '@/lib/server/db';
import { ProcurementService, ProcurementError, check, text } from '@/lib/server/procurement';
import { readFixture } from './fixture-source';
import {
  preflightPayment,
  readProcurementCapacity,
  transactions,
  verifyReceipt,
  verifyApproval,
  verifyIndependentProductRuntime,
  reconcile,
  txHash,
  procurementPool,
} from '@/lib/server/procurement-chain';
export async function handle(request: Request, path: string) {
  try {
    const runtime = getRuntimeConfig();
    const profile = configuredIndependentLiquidation();
    const svc = new ProcurementService(
      new ProcurementStore(getDb()),
      procurementPool,
      ARC_USDC_ERC20_ADDRESS,
      undefined,
      profile,
    );
    if (request.method === 'GET' && path === 'products') {
      let independentIssuable = false;
      if (profile) {
        try {
          await verifyIndependentProductRuntime(profile);
          independentIssuable = true;
        } catch {
          // A configured profile alone does not make a protocol issuable.
        }
      }
      return NextResponse.json(
        {
          products: PROCUREMENT_OFFERINGS.filter((p) => p.synthetic || independentIssuable),
          chainId: 5042002,
          pool: procurementPool,
          paymentMode:
            runtime.chainSource === 'fixture'
              ? 'fixture_offline'
              : 'arc_testnet_preflight_required',
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (request.method === 'GET' && path === 'capacity') {
      let capacity: ProcurementCapacity = {
        status: runtime.chainSource === 'fixture' ? 'offline' : 'unavailable',
        availableMicros: null,
        checkedAt: null,
      };
      if (runtime.chainSource === 'arc-testnet') {
        try {
          const available = await readProcurementCapacity();
          capacity = {
            status: 'verified',
            availableMicros: available.toString(),
            checkedAt: new Date().toISOString(),
          };
        } catch {
          /* Quote pricing stays available without RPC; no payment can be prepared. */
        }
      }
      return NextResponse.json(capacity, { headers: { 'Cache-Control': 'no-store' } });
    }
    const origin = canonicalSigningOrigin(request, runtime);
    if (!hasAllowedOrigin(request, runtime))
      throw new ProcurementError('ORIGIN', 'Cross-origin requests rejected', 403);
    const raw = request.method === 'POST' ? await request.text() : '{}';
    if (raw.length > 16000) throw new ProcurementError('TOO_LARGE', 'Request too large', 413);
    let b: Record<string, unknown>;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new ProcurementError('INVALID_JSON', 'Expected JSON object');
    }
    check(b && typeof b === 'object' && !Array.isArray(b), 'JSON object required');
    if (request.method === 'POST' && path === 'auth/challenge') {
      check(typeof b.address === 'string', 'Wallet address required');
      const c = issueClaimsNonce(getRepo(), b.address, origin);
      return NextResponse.json(
        { id: c.nonce, message: c.message, expiresAt: c.expiresAt },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (request.method === 'POST' && path === 'auth/verify') {
      const nonce = text(b.id, 'Nonce'),
        record = getRepo().getClaimsAuthNonce(nonce);
      check(record && typeof b.signature === 'string', 'Invalid nonce/signature');
      const session = await verifyWalletAndCreateSession(getRepo(), {
        wallet: record.walletAddress,
        nonce,
        signature: b.signature as `0x${string}`,
      });
      const response = NextResponse.json(
        { address: session.principal.walletAddress, expiresAt: session.expiresAt },
        { headers: { 'Cache-Control': 'no-store' } },
      );
      response.cookies.set(
        CLAIMS_SESSION_COOKIE,
        session.sessionId,
        claimsSessionCookieOptions(session.expiresAt),
      );
      return response;
    }
    const auth = authenticateClaimsRequest(request, ['claimant']);
    if (!auth.ok) throw new ProcurementError('UNAUTHORIZED', auth.error, auth.status);
    check(auth.principal.walletAddress, 'Wallet-authenticated session required');
    const principal = auth.principal.walletAddress.toLowerCase();
    let result: unknown;
    if (request.method === 'GET') {
      if (path === 'list') result = svc.list(principal);
      else if (path === 'agents') result = svc.list(principal).agents;
      else if (path === 'delegations') result = svc.list(principal).delegations;
      else if (path === 'policies') result = svc.visible(principal);
      else if (path.startsWith('policies/')) {
        const policy = svc.visible(principal).find((p) => p.terms.policyId === path.slice(9));
        check(policy, 'Policy not found', 'NOT_FOUND');
        try {
          result = {
            policy,
            approvals: svc.store
              .list<{ policyId: string }>('approval', policy.terms.owner)
              .filter((a) => a.policyId === policy.terms.policyId),
            reconciliation: await reconcile(policy),
          };
        } catch {
          result = {
            policy,
            reconciliation: null,
            reconciliationError:
              runtime.chainSource === 'fixture'
                ? 'Configured fixture unavailable or inconsistent; no fallback or live confirmation.'
                : 'Arc RPC unavailable. The immutable record is available; current chain state is unverified.',
          };
        }
      } else throw new ProcurementError('NOT_FOUND', 'Unknown endpoint', 404);
    } else if (request.method === 'POST') {
      check(
        runtime.chainSource !== 'fixture' ||
          !['accept', 'payment', 'procure', 'approvals', 'confirm'].includes(path),
        'Financial preparation and receipt confirmation disabled in fixture mode',
        'FIXTURE_FINANCIAL_DISABLED',
      );
      if (path === 'list') result = svc.list(principal);
      else if (path === 'agents') result = svc.register(principal, b);
      else if (path === 'delegations') result = svc.delegate(principal, b);
      else if (path === 'delegations/revoke')
        result = svc.revoke(principal, text(b.id, 'Delegation ID'));
      else if (path === 'authority') result = svc.authority(principal, b.delegationId);
      else if (path === 'quotes') {
        const quote = svc.quote(principal, b);
        if (quote.terms.independentProfile)
          await verifyIndependentProductRuntime(quote.terms.independentProfile);
        let capacityStatus: 'offline' | 'verified' | 'unavailable' | 'insufficient' =
          runtime.chainSource === 'fixture' ? 'offline' : 'unavailable';
        if (runtime.chainSource === 'arc-testnet') {
          try {
            const capacity = await readProcurementCapacity();
            capacityStatus =
              capacity >= BigInt(quote.terms.limitMicros) ? 'verified' : 'insufficient';
          } catch {
            // An immutable quote can be retained during an RPC outage. Payment still needs preflight.
          }
        }
        result = { ...quote, capacityStatus };
      } else if (path === 'accept') {
        const policy = svc.accept(principal, b);
        result = { policy, state: 'accepted_offchain' };
      } else if (path === 'payment') {
        const stage = b.stage;
        check(stage === 'approve' || stage === 'bind', 'Select an exact payment step');
        const policy = svc.authorizedPayment(principal, b.policyId, b.acceptedDigest);
        if (policy.state !== 'confirmed') await preflightPayment(policy, stage);
        const current = svc.authorizedPayment(principal, b.policyId, b.acceptedDigest);
        result = {
          policy: current,
          transaction:
            current.state === 'confirmed'
              ? null
              : transactions(current)[stage === 'approve' ? 0 : 1],
          stage,
          chainId: 5042002,
        };
      } else if (path === 'procure') {
        const accepted = svc.accept(principal, b);
        if (accepted.state !== 'confirmed') await preflightPayment(accepted, 'approve');
        const policy = svc.authorizedPayment(principal, accepted.terms.policyId, b.acceptedDigest);
        result = {
          policy,
          transactions: policy.state === 'confirmed' ? [] : transactions(policy),
          chainId: 5042002,
        };
      } else if (path === 'approvals') {
        const policy = svc.inspect(principal, b.policyId);
        check(policy.payer === principal, 'Only the payer may register an approval', 'FORBIDDEN');
        const hash = txHash(b.hash),
          at = await verifyApproval(policy, hash);
        const existing = svc.store.get<{ policyId: string }>('approval', hash);
        check(
          !existing || existing.policyId === policy.terms.policyId,
          'Approval receipt is already linked to another policy',
          'DUPLICATE_APPROVAL_RECEIPT',
        );
        if (!existing)
          svc.store.insert('approval', hash, policy.terms.owner, {
            policyId: policy.terms.policyId,
            hash,
            at,
          });
        result = { hash, at };
      } else if (path === 'confirm') {
        const policy = svc.visible(principal).find((p) => p.terms.policyId === b.policyId);
        check(policy, 'Policy not found', 'NOT_FOUND');
        const hash = txHash(b.hash);
        check(
          !policy.bindTx || policy.bindTx === hash,
          'Policy already confirmed with another receipt',
          'ALREADY_BOUND',
        );
        const at = await verifyReceipt(policy, hash);
        if (!hasProcurementBindAuthority(svc.store, policy, at))
          throw new ProcurementError(
            'BIND_AUTHORITY_INVALID',
            'The payer lacked authority at the bind block',
            409,
          );
        const current = await reconcile(policy);
        check(
          current.matches,
          'Deployed contract differs from accepted policy',
          'RECONCILIATION_MISMATCH',
        );
        svc.store.confirm(policy.terms.policyId, hash, at);
        const confirmed = svc.store.policy(policy.terms.policyId);
        check(
          confirmed?.bindTx === hash,
          'Policy is linked to a different receipt',
          'ALREADY_BOUND',
        );
        result = confirmed;
      } else throw new ProcurementError('NOT_FOUND', 'Unknown endpoint', 404);
    } else throw new ProcurementError('METHOD_NOT_ALLOWED', 'Unsupported method', 405);
    if (runtime.chainSource === 'fixture') {
      const { source } = readFixture(getDb(), runtime);
      if (Array.isArray(result)) result = result.map((row) => ({ ...row, source }));
      else if (result && typeof result === 'object') result = { ...result, source };
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof ProcurementError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    // RPC errors can contain secret-bearing URLs. Never return raw exception strings.
    return NextResponse.json(
      {
        error:
          'Request could not be completed. Check inputs or retry; no server transaction was sent.',
        code: 'REQUEST_FAILED',
      },
      { status: 503 },
    );
  }
}
