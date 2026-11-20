export type WorkspaceId = 'protect' | 'claims' | 'build' | 'ops';

export const WORKSPACE_STORAGE_KEY = 'arcuex.workspace';

export const WORKSPACE_LABEL: Record<WorkspaceId, string> = {
  protect: 'Protect',
  claims: 'Claims',
  build: 'Build',
  ops: 'Ops',
};

export type NavItem = { href: string; label: string };

export const WORKSPACE_NAV: Record<WorkspaceId, readonly NavItem[]> = {
  protect: [
    { href: '/', label: 'Overview' },
    { href: '/coverage', label: 'Coverage' },
    { href: '/policies', label: 'Policies' },
  ],
  claims: [
    { href: '/claims', label: 'Cases' },
    { href: '/claims/new', label: 'Submit' },
  ],
  build: [
    { href: '/agent', label: 'Agents' },
    { href: '/integrations', label: 'Integrations' },
    { href: '/coverage', label: 'Coverage' },
    { href: '/policies', label: 'Policies' },
  ],
  ops: [
    { href: '/claims/review', label: 'Review queue' },
    { href: '/claims', label: 'Claims' },
    { href: '/capital', label: 'Capital' },
    { href: '/integrations', label: 'Integrations' },
  ],
};

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return value === 'protect' || value === 'claims' || value === 'build' || value === 'ops';
}

export function readStoredWorkspace(): WorkspaceId | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return isWorkspaceId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredWorkspace(workspace: WorkspaceId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace);
  } catch {
    /* ignore quota / private mode */
  }
}

export function defaultHrefForWorkspace(workspace: WorkspaceId): string {
  switch (workspace) {
    case 'protect':
      return '/';
    case 'claims':
      return '/claims';
    case 'build':
      return '/agent';
    case 'ops':
      return '/claims/review';
  }
}

export function workspaceForPath(
  pathname: string,
  preferred: WorkspaceId | null,
  mayUseOps: boolean,
): WorkspaceId {
  if (pathname === '/') return 'protect';
  if (pathname === '/claims/review' || pathname === '/capital')
    return mayUseOps ? 'ops' : 'protect';
  // Claim routes are Claims-owned unless Ops holds a valid preference on /claims list.
  if (
    pathname === '/claims' ||
    pathname === '/claims/new' ||
    (pathname.startsWith('/claims/') && pathname !== '/claims/review')
  ) {
    if (pathname === '/claims' && preferred === 'ops' && mayUseOps) return 'ops';
    return 'claims';
  }
  if (preferred && (preferred !== 'ops' || mayUseOps) && activeWorkspaceLink(pathname, preferred))
    return preferred;
  if (activeWorkspaceLink(pathname, 'build') && !activeWorkspaceLink(pathname, 'protect'))
    return 'build';
  return 'protect';
}

export function activeWorkspaceLink(pathname: string, workspace: WorkspaceId): NavItem | undefined {
  if (pathname === '/claims/review' && workspace !== 'ops') return undefined;
  if (
    (pathname === '/claims/new' ||
      (pathname.startsWith('/claims/') && pathname !== '/claims/review')) &&
    workspace === 'ops'
  ) {
    // Ops secondary "Claims" highlights for case deep-links via /claims prefix.
    return WORKSPACE_NAV.ops.find((i) => i.href === '/claims');
  }
  return WORKSPACE_NAV[workspace]
    .filter(({ href }) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
