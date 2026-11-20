export type AppNavIcon =
  | 'overview'
  | 'coverage'
  | 'claims'
  | 'agents'
  | 'integrations'
  | 'review'
  | 'capital'
  | 'investigations'
  | 'settlements'
  | 'settings'
  | 'help'
  | 'switch';

export type AppNavItem = { href: string; label: string; icon: AppNavIcon };
export type AppNavGroup = { label: string | null; items: readonly AppNavItem[] };

const CUSTOMER: AppNavGroup = {
  label: null,
  items: [
    { href: '/dashboard', label: 'Overview', icon: 'overview' },
    { href: '/coverage', label: 'Coverage', icon: 'coverage' },
    { href: '/agent', label: 'Agents', icon: 'agents' },
    { href: '/claims', label: 'Claims', icon: 'claims' },
  ],
};

const DEVELOPERS: AppNavGroup = {
  label: 'Developers',
  items: [
    { href: '/integrations', label: 'Integrations & API', icon: 'integrations' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
    { href: '/help', label: 'Help & documentation', icon: 'help' },
  ],
};

const INSURER_ENTRY: AppNavItem = {
  href: '/insurer',
  label: 'Insurer workspace',
  icon: 'switch',
};

const INSURER: AppNavGroup = {
  label: 'Insurer workspace',
  items: [
    { href: '/insurer', label: 'Portfolio overview', icon: 'overview' },
    { href: '/underwriting/review', label: 'Underwriting', icon: 'coverage' },
    { href: '/claims/review', label: 'Claims review', icon: 'review' },
    { href: '/insurer/investigations', label: 'AI investigations', icon: 'investigations' },
    { href: '/insurer/settlements', label: 'Settlements', icon: 'settlements' },
    { href: '/capital', label: 'Capital & exposure', icon: 'capital' },
  ],
};

const matches = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function isInsurerRoute(pathname: string): boolean {
  return INSURER.items.some(({ href }) => matches(pathname, href));
}

export function canUseInsurerWorkspace(role: string | null | undefined): boolean {
  return role === 'reviewer' || role === 'authority';
}

export function appNavGroups(canUseInsurer: boolean, inInsurer = false): readonly AppNavGroup[] {
  if (canUseInsurer && inInsurer) return [INSURER];
  const principal = canUseInsurer
    ? { ...CUSTOMER, items: [...CUSTOMER.items, INSURER_ENTRY] }
    : CUSTOMER;
  return [principal, DEVELOPERS];
}

export function activeNavHref(
  pathname: string,
  groups: readonly AppNavGroup[],
  claimQueue?: string,
): string | null {
  const inInsurer = groups.includes(INSURER);
  if (!inInsurer && isInsurerRoute(pathname)) return null;

  let route = pathname;
  if (matches(pathname, '/policies')) route = '/coverage';
  if (inInsurer && matches(pathname, '/claims') && !isInsurerRoute(pathname)) {
    route = claimQueue ?? '/claims/review';
  }

  const matching = groups.flatMap(({ items }) => items).filter(({ href }) => matches(route, href));
  return matching.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
