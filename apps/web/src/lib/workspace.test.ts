import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_NAV,
  activeWorkspaceLink,
  workspaceForPath,
  defaultHrefForWorkspace,
  isWorkspaceId,
} from './workspace';

describe('workspace helpers', () => {
  it('accepts only protect/build/ops ids', () => {
    expect(isWorkspaceId('protect')).toBe(true);
    expect(isWorkspaceId('build')).toBe(true);
    expect(isWorkspaceId('ops')).toBe(true);
    expect(isWorkspaceId('admin')).toBe(false);
  });

  it('keeps privileged review out of protect nav', () => {
    const hrefs = WORKSPACE_NAV.protect.map((i) => i.href);
    expect(hrefs).not.toContain('/claims/review');
    expect(hrefs).not.toContain('/capital');
  });

  it('follows dedicated deep links and retains a valid preference on shared routes', () => {
    expect(workspaceForPath('/agent', 'protect', false)).toBe('build');
    expect(workspaceForPath('/coverage', 'build', false)).toBe('build');
    expect(workspaceForPath('/policies/policy-id', null, false)).toBe('protect');
    expect(workspaceForPath('/claims/review', 'protect', true)).toBe('ops');
    expect(workspaceForPath('/claims/review', 'ops', false)).toBe('protect');
    expect(workspaceForPath('/capital', 'ops', false)).toBe('protect');
    expect(activeWorkspaceLink('/claims/review', 'ops')?.label).toBe('Review queue');
    expect(activeWorkspaceLink('/claims/review', 'protect')).toBeUndefined();
    expect(activeWorkspaceLink('/claims/case-id', 'ops')?.label).toBe('Claims');
  });

  it('maps default entry hrefs per workspace', () => {
    expect(defaultHrefForWorkspace('protect')).toBe('/');
    expect(defaultHrefForWorkspace('build')).toBe('/agent');
    expect(defaultHrefForWorkspace('ops')).toBe('/claims/review');
  });
});
