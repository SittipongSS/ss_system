export const SYSTEM_ORDER = ['salesplan', 'tax', 'sahamit', 'master', 'mgmt'];

export function sortSystems(groups) {
  return [...groups].sort((a, b) => SYSTEM_ORDER.indexOf(a.system) - SYSTEM_ORDER.indexOf(b.system));
}

export function systemForPathname(pathname) {
  if (pathname.startsWith('/database')) return 'master';
  if (pathname === '/sa' || pathname.startsWith('/sa/') || pathname.startsWith('/sales-planning') || pathname.startsWith('/pm')) return 'salesplan';
  if (pathname.startsWith('/sahamit')) return 'sahamit';
  if (pathname.startsWith('/mgmt')) return 'mgmt';
  if (pathname === '/users') return 'users';
  if (pathname === '/audit') return 'audit';
  return 'tax';
}
