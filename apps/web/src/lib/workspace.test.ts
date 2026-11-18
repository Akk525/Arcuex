import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_NAV,
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

  it('maps default entry hrefs per workspace', () => {
    expect(defaultHrefForWorkspace('protect')).toBe('/');
    expect(defaultHrefForWorkspace('build')).toBe('/agent');
    expect(defaultHrefForWorkspace('ops')).toBe('/claims/review');
  });
});
