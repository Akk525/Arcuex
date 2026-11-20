import type { WorkspaceId } from '@/lib/workspace';

export type AppNavIcon =
  | 'overview'
  | 'coverage'
  | 'policies'
  | 'claims'
  | 'file-claim'
  | 'agents'
  | 'integrations'
  | 'review'
  | 'capital';

export type AppNavItem = { href: string; label: string; icon: AppNavIcon };
export type AppNavGroup = { id: 'home' | WorkspaceId; label: string | null; items: readonly AppNavItem[] };

const HOME: AppNavGroup = {
  id: 'home',
  label: null,
  items: [{ href: '/dashboard', label: 'Overview', icon: 'overview' }],
};

const PROTECT: AppNavGroup = {
  id: 'protect',
  label: 'Protect',
  items: [
    { href: '/coverage', label: 'Buy coverage', icon: 'coverage' },
    { href: '/policies', label: 'Policies', icon: 'policies' },
  ],
};

const CLAIMS: AppNavGroup = {
  id: 'claims',
  label: 'Claims',
  items: [
    { href: '/claims', label: 'All claims', icon: 'claims' },
    { href: '/claims/new', label: 'File a claim', icon: 'file-claim' },
  ],
};

const BUILD: AppNavGroup = {
  id: 'build',
  label: 'Build',
  items: [
    { href: '/agent', label: 'Agents', icon: 'agents' },
    { href: '/integrations', label: 'Integrations', icon: 'integrations' },
  ],
};

/** Reviewer / authority surfaces. Shown only for ops sessions; the server still enforces roles. */
const OPS: AppNavGroup = {
  id: 'ops',
  label: 'Ops',
  items: [
    { href: '/claims/review', label: 'Review queue', icon: 'review' },
    { href: '/capital', label: 'Capital', icon: 'capital' },
  ],
};

export function appNavGroups(opsSession: boolean): readonly AppNavGroup[] {
  return opsSession ? [HOME, PROTECT, CLAIMS, BUILD, OPS] : [HOME, PROTECT, CLAIMS, BUILD];
}

const matches = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * Longest href that equals the path or is a path-segment prefix of it.
 * Routes owned by a restricted (Ops) item that is not in `groups` highlight
 * nothing, so a hidden reviewer route never lights up a visible parent.
 */
export function activeNavHref(pathname: string, groups: readonly AppNavGroup[]): string | null {
  const visible = new Set(groups.flatMap((g) => g.items.map((i) => i.href)));
  if (OPS.items.some((item) => !visible.has(item.href) && matches(pathname, item.href))) return null;
  let best: string | null = null;
  for (const group of groups) {
    for (const { href } of group.items) {
      if (matches(pathname, href)) {
        if (!best || href.length > best.length) best = href;
      }
    }
  }
  return best;
}

/** Workspace that owns a nav href, for keeping the stored workspace preference coherent. */
export function workspaceForNavHref(href: string, groups: readonly AppNavGroup[]): WorkspaceId | null {
  for (const group of groups) {
    if (group.id === 'home') continue;
    if (group.items.some((item) => item.href === href)) return group.id;
  }
  return href === '/dashboard' ? 'protect' : null;
}
