import type { ProcurementDelegationView } from '@arcuex/domain';

export const DELEGATION_FRESHNESS_SECONDS = 30;

export function delegationPresentation(
  grant: ProcurementDelegationView,
  elapsedSeconds: number,
  authenticated: boolean,
) {
  if (grant.validity === 'revoked')
    return { label: 'Revoked', detail: 'The owner revoked this grant.', active: false };
  if (
    grant.validity === 'expired' ||
    (grant.validity === 'active' &&
      Number.isFinite(grant.checkedAt) &&
      Number.isFinite(elapsedSeconds) &&
      grant.checkedAt + elapsedSeconds >= grant.expiresAt)
  )
    return {
      label: 'Expired',
      detail: 'The grant reached its expiry. The owner can issue a new grant.',
      active: false,
    };
  if (grant.validity === 'unavailable')
    return {
      label: 'Scope unavailable',
      detail: 'The registered agent or approved exposure does not match this grant.',
      active: false,
    };
  if (
    grant.validity !== 'active' ||
    !authenticated ||
    !Number.isFinite(grant.checkedAt) ||
    !Number.isFinite(elapsedSeconds) ||
    elapsedSeconds >= DELEGATION_FRESHNESS_SECONDS
  )
    return {
      label: 'Status needs refresh',
      detail: 'Refresh agents to check current permission before acting.',
      active: false,
    };
  if (grant.limitation === 'budget_exhausted')
    return {
      label: 'Budget exhausted',
      detail:
        'The remaining premium budget cannot fund a new quote. Existing accepted purchases follow their own checks.',
      active: true,
    };
  return {
    label: 'Active permission',
    detail: 'Valid for the listed exposure, beneficiary and caps.',
    active: true,
  };
}
