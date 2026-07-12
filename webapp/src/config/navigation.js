export const MOBILE_PRIMARY_LIMIT = 4;

export function systemForPathname(pathname) {
  if (pathname.startsWith('/database')) return 'master';
  if (pathname === '/sa' || pathname.startsWith('/sa/') || pathname.startsWith('/sales-planning') || pathname.startsWith('/pm')) return 'salesplan';
  if (pathname.startsWith('/sahamit')) return 'sahamit';
  if (pathname.startsWith('/mgmt')) return 'mgmt';
  if (pathname === '/users') return 'users';
  if (pathname === '/audit') return 'audit';
  return 'tax';
}

export function splitMobileNavigation(items, limit = MOBILE_PRIMARY_LIMIT) {
  return {
    primary: items.slice(0, limit),
    more: items.slice(limit),
  };
}
