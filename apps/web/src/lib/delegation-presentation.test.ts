import { describe, expect, it } from 'vitest';
import type { ProcurementDelegationView } from '@arcuex/domain';
import { delegationPresentation } from './delegation-presentation';

const grant: ProcurementDelegationView = {
  id: 'grant',
  owner: 'owner',
  agentId: 'agent',
  productCode: 'demo',
  position: 'position',
  beneficiary: 'owner',
  premiumCapMicros: '10000',
  limitCapMicros: '1000000',
  expiresAt: 110,
  revoked: false,
  validity: 'active',
  limitation: null,
  checkedAt: 100,
  revokedAt: null,
  remainingPremiumMicros: '10000',
};
describe('effective delegation presentation', () => {
  it('uses server time and expires at the exact boundary', () => {
    expect(delegationPresentation(grant, 9.999, true)).toMatchObject({
      label: 'Active permission',
      active: true,
    });
    expect(delegationPresentation(grant, 10, true)).toMatchObject({
      label: 'Expired',
      active: false,
    });
  });

  it('keeps explicit expiry, revocation and missing scope inactive', () => {
    expect(delegationPresentation({ ...grant, validity: 'expired' }, 0, true).label).toBe(
      'Expired',
    );
    expect(
      delegationPresentation({ ...grant, validity: 'revoked', revoked: true }, 0, true).label,
    ).toBe('Revoked');
    expect(
      delegationPresentation(
        { ...grant, validity: 'unavailable', limitation: 'missing_scope' },
        0,
        true,
      ).active,
    ).toBe(false);
  });

  it('withholds positive validity when the session or projection is stale', () => {
    for (const [seconds, signedIn] of [
      [0, false],
      [30, true],
      [Infinity, true],
    ] as const)
      expect(
        delegationPresentation({ ...grant, expiresAt: 1000 }, seconds, signedIn),
      ).toMatchObject({
        label: 'Status needs refresh',
        active: false,
      });
  });
});
