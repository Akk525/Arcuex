import { withApiSecurity } from '@/lib/server/api-security';
import { claimListContext } from '@/lib/server/claims-list-context';
import { NextResponse } from 'next/server';
import { ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import {
  canAccessClaimsPolicy,
  listClaimsCases,
  outstandingProofRequests,
} from '@arcuex/insurance';
import { ProcurementStore } from '@arcuex/persistence';
import {
  buildDashboardOverview,
  type DashboardOverviewInput,
} from '@/lib/server/dashboard-overview';
import { projectSettlementFinality } from '@/lib/server/claims-settlement-projection';
import { loadPrincipalFromSession, parseSessionCookie } from '@/lib/server/claims-session';
import { getDb, getRepo } from '@/lib/server/db';
import { configuredIndependentLiquidation } from '@/lib/server/independent-evidence';
import { ProcurementService } from '@/lib/server/procurement';
import { procurementPool } from '@/lib/server/procurement-chain';
import { reconciliationRows } from '@/lib/server/policy-reconciliation';
import { getRuntimeConfig } from '@/lib/server/runtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const responseHeaders = { 'Cache-Control': 'no-store', Vary: 'Cookie' };

const labels = {
  synthetic: 'Synthetic ledger / demo underwriting',
  live: 'Live Arc Testnet reads; on-chain finance only when pool is deployed',
};

function emptyInput(
  state: 'anonymous' | 'authenticated',
  role: string | null,
  wallet: string | null,
): DashboardOverviewInput {
  return {
    state,
    role,
    wallet,
    policies: [],
    agents: [],
    delegations: [],
    claims: [],
    evidenceRequests: [],
    reconciliation: [],
    recentActivity: [],
    labels,
  };
}

async function GETHandler(request: Request) {
  const repo = getRepo();
  const db = getDb();
  const sessionId = parseSessionCookie(request.headers.get('cookie'));
  const principal = sessionId ? loadPrincipalFromSession(repo, sessionId) : null;

  if (!principal) {
    return NextResponse.json(buildDashboardOverview(emptyInput('anonymous', null, null)), {
      headers: responseHeaders,
    });
  }

  const store = new ProcurementStore(db);
  const now = Math.floor(Date.now() / 1000);
  const chainSource = getRuntimeConfig().chainSource;

  const accessiblePolicies = repo
    .listPolicies(50)
    .filter((p) => canAccessClaimsPolicy(repo, principal, p.id));
  // Most recent recorded lifecycle time — never the request time.
  const policyActivityAt = new Map(
    accessiblePolicies.map((p) => [
      p.id,
      [p.activatedAt, p.boundAt, p.fundingVerifiedAt, p.createdAt]
        .filter((t): t is string => Boolean(t))
        .sort()
        .at(-1) ?? p.createdAt,
    ]),
  );
  const policies = accessiblePolicies.map((p) => ({
    id: p.id,
    status: chainSource === 'fixture' ? 'Rehearsal' : p.status,
    synthetic: chainSource === 'fixture' || Boolean(p.terms.synthetic),
    claimsEligible: chainSource !== 'fixture' && store.claimsEligible(p.id, now),
    label: p.terms.synthetic ? 'Synthetic policy' : `Policy ${p.id.slice(0, 8)}`,
  }));

  let agents: DashboardOverviewInput['agents'] = [];
  let delegations: DashboardOverviewInput['delegations'] = [];
  if (principal.walletAddress) {
    const svc = new ProcurementService(
      store,
      procurementPool,
      ARC_USDC_ERC20_ADDRESS,
      undefined,
      configuredIndependentLiquidation(),
    );
    const listed = svc.list(principal.walletAddress.toLowerCase());
    agents = listed.agents.map((a) => ({
      id: a.id,
      label: a.label || a.id.slice(0, 8),
      status: 'registered',
    }));
    delegations = listed.delegations.map((d) => ({
      id: d.id,
      agentId: d.agentId,
      validity: d.validity,
      synthetic: undefined,
    }));
  }

  const cases = listClaimsCases(repo, { limit: 50 }).filter((c) =>
    canAccessClaimsPolicy(repo, principal, c.policyId),
  );

  const evidenceRequests: DashboardOverviewInput['evidenceRequests'] = [];
  const claims: DashboardOverviewInput['claims'] = [];
  const recentActivity: DashboardOverviewInput['recentActivity'] = [];

  for (const claim of cases) {
    const href = `/claims/${claim.id}`;
    const outstanding = outstandingProofRequests(repo, claim.id);
    for (const req of outstanding) {
      evidenceRequests.push({ caseId: claim.id, id: req.id, href });
    }
    const payment = await projectSettlementFinality(db, chainSource, claim);
    const confirmedPayment =
      payment.paymentFinality === 'confirmed' && Boolean(payment.confirmedSettlementReceipt);
    const status =
      claim.status === 'PAID' && !confirmedPayment ? 'SETTLEMENT_PENDING' : claim.status;
    const activityStatus = confirmedPayment
      ? 'payment confirmed'
      : payment.paymentFinality === 'reorged'
        ? 'payment reorged'
        : payment.paymentFinality === 'unverified'
          ? 'payment unconfirmed'
          : status === 'SETTLEMENT_PENDING'
            ? 'intent prepared'
            : status;
    // Label from what is persisted: the insured agent or exposure the claim was filed against.
    const context = claimListContext(repo, claim);
    claims.push({
      id: claim.id,
      title: context.insured.label?.trim() || null,
      filedAt: claim.createdAt,
      synthetic: claim.syntheticDemo,
      status,
      reason:
        claim.status === 'COLLECTING_EVIDENCE'
          ? 'Evidence collection in progress'
          : claim.status === 'DRAFT'
            ? 'Draft claim needs submission'
            : `Claim status ${activityStatus}`,
      href,
      hasConfirmedSettlement: confirmedPayment,
    });
    recentActivity.push({
      at: claim.updatedAt ?? claim.createdAt,
      kind: 'claim',
      summary: `Claim ${activityStatus}`,
      href,
    });
  }

  for (const policy of policies.slice(0, 10)) {
    recentActivity.push({
      at: policyActivityAt.get(policy.id) ?? new Date(0).toISOString(),
      kind: 'policy',
      summary: `${policy.synthetic ? 'Synthetic' : 'Policy'} ${policy.status}`,
      href: `/policies/${policy.id}`,
    });
  }

  recentActivity.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const wallet = principal.walletAddress?.toLowerCase() ?? null;
  const reconciliation = reconciliationRows(db)
    .filter((r) => {
      if (principal.role !== 'claimant') return r.status !== 'VERIFIED_LINKED';
      if (!wallet) return false;
      try {
        const evidence = JSON.parse(r.payload) as {
          premiumPayer?: string;
          beneficiary?: string;
        };
        const local = r.local_policy_id ? store.policy(r.local_policy_id) : null;
        const owner = local?.terms?.owner?.toLowerCase();
        return (
          r.status !== 'VERIFIED_LINKED' &&
          (owner === wallet ||
            evidence.premiumPayer?.toLowerCase() === wallet ||
            evidence.beneficiary?.toLowerCase() === wallet)
        );
      } catch {
        return false;
      }
    })
    .map((r) => ({
      policyId: r.local_policy_id,
      onchainPolicyId: r.onchain_policy_id,
      completeness: r.status,
      href: r.local_policy_id ? `/policies/${r.local_policy_id}` : '/policies',
    }));

  const overview = buildDashboardOverview({
    state: 'authenticated',
    role: principal.role,
    wallet,
    policies,
    agents,
    delegations,
    claims,
    evidenceRequests,
    reconciliation,
    recentActivity: recentActivity.slice(0, 20),
    labels,
  });

  return NextResponse.json(overview, { headers: responseHeaders });
}

export const GET = withApiSecurity(GETHandler);
