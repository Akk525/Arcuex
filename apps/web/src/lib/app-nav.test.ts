import { describe, expect, it } from 'vitest';
import { activeNavHref, appNavGroups, workspaceForNavHref } from './app-nav';

const hrefs = (ops: boolean) => appNavGroups(ops).flatMap((g) => g.items.map((i) => i.href));

describe('app navigation', () => {
  it('keeps reviewer and capital surfaces out of non-ops navigation', () => {
    expect(hrefs(false)).not.toContain('/claims/review');
    expect(hrefs(false)).not.toContain('/capital');
    expect(hrefs(true)).toContain('/claims/review');
    expect(hrefs(true)).toContain('/capital');
  });

  it('selects the most specific matching item', () => {
    const ops = appNavGroups(true);
    expect(activeNavHref('/dashboard', ops)).toBe('/dashboard');
    expect(activeNavHref('/claims', ops)).toBe('/claims');
    expect(activeNavHref('/claims/new', ops)).toBe('/claims/new');
    expect(activeNavHref('/claims/review', ops)).toBe('/claims/review');
    expect(activeNavHref('/claims/abc-123', ops)).toBe('/claims');
    expect(activeNavHref('/policies/abc', ops)).toBe('/policies');
  });

  it('does not treat sibling prefixes as matches', () => {
    expect(activeNavHref('/claimsx', appNavGroups(true))).toBeNull();
    expect(activeNavHref('/', appNavGroups(true))).toBeNull();
  });

  it('highlights nothing on restricted routes for non-ops sessions', () => {
    // The reviewer item is hidden, so no visible item may claim the route.
    expect(activeNavHref('/claims/review', appNavGroups(false))).toBeNull();
    expect(activeNavHref('/claims/review/anything', appNavGroups(false))).toBeNull();
    expect(activeNavHref('/capital', appNavGroups(false))).toBeNull();
    // Ordinary claim routes are unaffected.
    expect(activeNavHref('/claims/abc-123', appNavGroups(false))).toBe('/claims');
  });

  it('maps hrefs to owning workspaces', () => {
    const ops = appNavGroups(true);
    expect(workspaceForNavHref('/coverage', ops)).toBe('protect');
    expect(workspaceForNavHref('/agent', ops)).toBe('build');
    expect(workspaceForNavHref('/claims/review', ops)).toBe('ops');
    expect(workspaceForNavHref('/dashboard', ops)).toBe('protect');
  });

  it('groups navigation into Protect, Claims, Insurer and Mission Control', () => {
    expect(appNavGroups(true).map((g) => g.label)).toEqual([
      'Protect',
      'Claims',
      'Insurer',
      'Mission Control',
    ]);
    expect(appNavGroups(false).map((g) => g.label)).toEqual(['Protect', 'Claims', 'Mission Control']);
    expect(hrefs(false)).toContain('/replay/oracle-liquidation');
  });
});
