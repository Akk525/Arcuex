import { describe, expect, it } from 'vitest';
import { activeNavHref, appNavGroups, canUseInsurerWorkspace, isInsurerRoute } from './app-nav';

const labels = (canUseInsurer: boolean, inInsurer = false) =>
  appNavGroups(canUseInsurer, inInsurer).map(({ items }) => items.map(({ label }) => label));

describe('app navigation', () => {
  it('shows the customer destinations and developer utilities', () => {
    expect(labels(false)).toEqual([
      ['Overview', 'Coverage', 'Agents', 'Claims'],
      ['Integrations & API', 'Settings', 'Help & documentation'],
    ]);
    expect(labels(true)[0]).toEqual(['Overview', 'Coverage', 'Agents', 'Claims', 'Insurer workspace']);
  });

  it('only switches to insurer navigation for reviewer and settlement authority roles', () => {
    for (const role of [null, 'claimant', 'system']) {
      expect(labels(canUseInsurerWorkspace(role), true)).toEqual(labels(false));
    }
    for (const role of ['reviewer', 'authority']) {
      expect(labels(canUseInsurerWorkspace(role), true)).toEqual([
        ['Portfolio overview', 'Underwriting', 'Claims review', 'AI investigations', 'Settlements', 'Capital & exposure'],
      ]);
    }
  });

  it('selects the parent workspace for contextual tab, action and legacy URLs', () => {
    const customer = appNavGroups(false);
    for (const path of ['/coverage', '/coverage/applications', '/policies', '/policies/example']) {
      expect(activeNavHref(path, customer)).toBe('/coverage');
    }
    for (const path of ['/claims', '/claims/new', '/claims/example']) {
      expect(activeNavHref(path, customer)).toBe('/claims');
    }
    for (const path of ['/', '/claimsx', '/replay/oracle-liquidation']) {
      expect(activeNavHref(path, customer)).toBeNull();
    }
  });

  it('recognizes insurer URLs and preserves the originating queue on dossiers', () => {
    const insurer = appNavGroups(true, true);
    const customer = appNavGroups(false);
    for (const path of ['/insurer', '/insurer/investigations', '/insurer/settlements', '/claims/review', '/underwriting/review', '/capital']) {
      expect(isInsurerRoute(path)).toBe(true);
      expect(activeNavHref(path, customer)).toBeNull();
      expect(activeNavHref(path, insurer)).toBe(path);
    }
    expect(isInsurerRoute('/claims/reviewer')).toBe(false);
    expect(activeNavHref('/claims/example', insurer)).toBe('/claims/review');
    expect(activeNavHref('/claims/example', insurer, '/insurer/investigations')).toBe('/insurer/investigations');
    expect(activeNavHref('/claims/example', customer, '/insurer/investigations')).toBe('/claims');
  });
});
