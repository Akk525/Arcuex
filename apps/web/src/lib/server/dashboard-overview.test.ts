import { describe, expect, it } from 'vitest';
import {
  buildDashboardOverview,
  type DashboardOverviewInput,
} from './dashboard-overview';

const labels = {
  synthetic: 'Synthetic ledger / demo underwriting',
  live: 'Live Arc Testnet reads; on-chain finance only when pool is deployed',
};

function emptyAuthenticated(overrides: Partial<DashboardOverviewInput> = {}): DashboardOverviewInput {
  return {
    state: 'authenticated',
    role: 'claimant',
    wallet: '0xabc',
    policies: [],
    agents: [],
    delegations: [],
    claims: [],
    evidenceRequests: [],
    reconciliation: [],
    recentActivity: [],
    labels,
    ...overrides,
  };
}

describe('buildDashboardOverview', () => {
  it('returns anonymous empty portfolio without inventing holdings', () => {
    const overview = buildDashboardOverview({
      state: 'anonymous',
      role: null,
      wallet: null,
      policies: [],
      agents: [],
      delegations: [],
      claims: [],
      evidenceRequests: [],
      reconciliation: [],
      recentActivity: [],
      labels,
    });
    expect(overview.state).toBe('anonymous');
    expect(overview.portfolio.total).toBe(0);
    expect(overview.portfolio.items).toEqual([]);
    expect(overview.claimsNeedingAttention).toEqual([]);
    expect(overview.agents).toEqual([]);
    expect(overview.nextAction).toMatchObject({
      label: 'Explore coverage',
      href: '/coverage?tab=products',
    });
  });

  it('points authenticated empty portfolio at coverage', () => {
    const overview = buildDashboardOverview(emptyAuthenticated());
    expect(overview.state).toBe('authenticated');
    expect(overview.nextAction).toEqual({
      label: 'Get coverage',
      href: '/coverage?tab=products',
      reason: 'No policies in this session yet.',
    });
  });

  it('surfaces synthetic policy + evidence claim without inventing eligibility', () => {
    const overview = buildDashboardOverview(
      emptyAuthenticated({
        policies: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            status: 'BOUND',
            synthetic: true,
            claimsEligible: false,
            label: 'Demo policy',
          },
        ],
        claims: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            status: 'COLLECTING_EVIDENCE',
            reason: 'Evidence collection in progress',
            href: '/claims/22222222-2222-4222-8222-222222222222',
            hasConfirmedSettlement: false,
          },
        ],
        evidenceRequests: [
          {
            caseId: '22222222-2222-4222-8222-222222222222',
            id: 'req-1',
            href: '/claims/22222222-2222-4222-8222-222222222222',
          },
        ],
      }),
    );

    expect(overview.portfolio.total).toBe(1);
    expect(overview.portfolio.items[0]?.claimsEligible).toBe(false);
    expect(overview.portfolio.items[0]?.synthetic).toBe(true);
    expect(overview.claimsNeedingAttention[0]?.status).toBe('COLLECTING_EVIDENCE');
    expect(overview.evidenceRequests).toHaveLength(1);
    expect(overview.nextAction?.href).toBe('/claims/22222222-2222-4222-8222-222222222222');
  });

  it('never marks claimsEligible true when input says false', () => {
    const overview = buildDashboardOverview(
      emptyAuthenticated({
        policies: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            status: 'ACTIVE',
            synthetic: false,
            claimsEligible: false,
            label: 'Unreconciled policy',
          },
        ],
      }),
    );
    expect(overview.portfolio.items.every((p) => p.claimsEligible === false)).toBe(true);
  });

  it('labels approved claims without settlement as payment not confirmed', () => {
    const overview = buildDashboardOverview(
      emptyAuthenticated({
        claims: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            status: 'APPROVED',
            reason: 'placeholder',
            href: '/claims/44444444-4444-4444-8444-444444444444',
            hasConfirmedSettlement: false,
          },
        ],
      }),
    );
    expect(overview.claimsNeedingAttention[0]?.reason).toBe(
      'Approved — payment not confirmed',
    );
  });

  it('passes persisted claim labels through and never invents one', () => {
    const overview = buildDashboardOverview(
      emptyAuthenticated({
        claims: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            status: 'DRAFT',
            reason: 'Draft claim needs submission',
            href: '/claims/55555555-5555-4555-8555-555555555555',
            hasConfirmedSettlement: false,
            title: 'Research agent compute exposure',
            filedAt: '2026-11-19T10:24:00.000Z',
            synthetic: true,
          },
          {
            id: '66666666-6666-4666-8666-666666666666',
            status: 'COLLECTING_EVIDENCE',
            reason: 'Evidence collection in progress',
            href: '/claims/66666666-6666-4666-8666-666666666666',
            hasConfirmedSettlement: false,
          },
        ],
      }),
    );
    expect(overview.claimsNeedingAttention[0]).toMatchObject({
      title: 'Research agent compute exposure',
      filedAt: '2026-11-19T10:24:00.000Z',
      synthetic: true,
    });
    expect(overview.claimsNeedingAttention[1]?.title).toBeNull();
    expect(overview.claimsNeedingAttention[1]?.filedAt).toBeNull();
  });
});
