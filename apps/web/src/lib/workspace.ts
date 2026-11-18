export type WorkspaceId = 'protect' | 'build' | 'ops';

export const WORKSPACE_STORAGE_KEY = 'arcuex.workspace';

export const WORKSPACE_LABEL: Record<WorkspaceId, string> = {
  protect: 'Protect',
  build: 'Build',
  ops: 'Ops',
};

export type NavItem = { href: string; label: string };

export const WORKSPACE_NAV: Record<WorkspaceId, readonly NavItem[]> = {
  protect: [
    { href: '/', label: 'Overview' },
    { href: '/coverage', label: 'Coverage' },
    { href: '/policies', label: 'Policies' },
    { href: '/claims', label: 'Claims' },
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
  return value === 'protect' || value === 'build' || value === 'ops';
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
    case 'build':
      return '/agent';
    case 'ops':
      return '/claims/review';
  }
}
