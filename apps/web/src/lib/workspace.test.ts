import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_NAV,
  activeWorkspaceLink,
  workspaceForPath,
  defaultHrefForWorkspace,
  isWorkspaceId,
} from './workspace';

describe('workspace helpers', () => {
  it('accepts protect/claims/build/ops ids', () => {
    expect(isWorkspaceId('protect')).toBe(true);
    expect(isWorkspaceId('claims')).toBe(true);
    expect(isWorkspaceId('build')).toBe(true);
    expect(isWorkspaceId('ops')).toBe(true);
    expect(isWorkspaceId('admin')).toBe(false);
  });

  it('keeps privileged review out of protect and claims nav', () => {
    expect(WORKSPACE_NAV.protect.map((i) => i.href)).toEqual([
      '/dashboard',
      '/coverage',
      '/policies',
    ]);
    expect(WORKSPACE_NAV.protect.map((i) => i.href)).not.toContain('/claims/review');
    expect(WORKSPACE_NAV.protect.map((i) => i.href)).not.toContain('/capital');
    expect(WORKSPACE_NAV.claims.map((i) => i.href)).toEqual(['/claims', '/claims/new']);
    expect(WORKSPACE_NAV.claims.map((i) => i.href)).not.toContain('/claims/review');
  });

  it('follows dedicated deep links and retains a valid preference on shared routes', () => {
    // `/` is marketing. AppShell may still fall back to Protect, but Overview no longer owns `/`.
    expect(workspaceForPath('/', null, false)).toBe('protect');
    expect(activeWorkspaceLink('/', 'protect')).toBeUndefined();
    expect(workspaceForPath('/dashboard', null, false)).toBe('protect');
    expect(activeWorkspaceLink('/dashboard', 'protect')?.label).toBe('Overview');
    expect(workspaceForPath('/agent', 'protect', false)).toBe('build');
    expect(workspaceForPath('/coverage', 'build', false)).toBe('build');
    expect(workspaceForPath('/policies/policy-id', null, false)).toBe('protect');
    expect(workspaceForPath('/claims', 'protect', false)).toBe('claims');
    expect(workspaceForPath('/claims/case-id', 'protect', false)).toBe('claims');
    expect(workspaceForPath('/claims/new', null, false)).toBe('claims');
    expect(workspaceForPath('/claims/review', 'protect', true)).toBe('ops');
    expect(workspaceForPath('/claims/review', 'ops', false)).toBe('protect');
    expect(workspaceForPath('/capital', 'ops', false)).toBe('protect');
    expect(activeWorkspaceLink('/claims/review', 'ops')?.label).toBe('Review queue');
    expect(activeWorkspaceLink('/claims/review', 'protect')).toBeUndefined();
    expect(activeWorkspaceLink('/claims/review', 'claims')).toBeUndefined();
    expect(activeWorkspaceLink('/claims/case-id', 'claims')?.href).toBe('/claims');
    expect(activeWorkspaceLink('/claims/case-id', 'ops')?.label).toBe('Claims');
  });

  it('maps default entry hrefs per workspace', () => {
    expect(defaultHrefForWorkspace('protect')).toBe('/dashboard');
    expect(defaultHrefForWorkspace('claims')).toBe('/claims');
    expect(defaultHrefForWorkspace('build')).toBe('/agent');
    expect(defaultHrefForWorkspace('ops')).toBe('/claims/review');
  });
});
