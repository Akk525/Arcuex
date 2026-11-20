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

  it('does not highlight reviewer routes for non-ops sessions', () => {
    // Falls back to the generic claims entry rather than a hidden item.
    expect(activeNavHref('/claims/review', appNavGroups(false))).toBe('/claims');
    expect(activeNavHref('/capital', appNavGroups(false))).toBeNull();
  });

  it('maps hrefs to owning workspaces', () => {
    const ops = appNavGroups(true);
    expect(workspaceForNavHref('/coverage', ops)).toBe('protect');
    expect(workspaceForNavHref('/agent', ops)).toBe('build');
    expect(workspaceForNavHref('/claims/review', ops)).toBe('ops');
    expect(workspaceForNavHref('/dashboard', ops)).toBe('protect');
  });
});
