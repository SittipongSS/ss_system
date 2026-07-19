import { SYSTEM_ORDER } from './systems.js';

export { SYSTEM_ORDER };

export const SETTINGS_PATHS = ['/settings', '/database/holidays', '/database/chat-webhooks', '/users', '/audit'];

export function isSettingsPathname(pathname) {
  return SETTINGS_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function sortSystems(groups) {
  return [...groups].sort((a, b) => SYSTEM_ORDER.indexOf(a.system) - SYSTEM_ORDER.indexOf(b.system));
}

export function systemForPathname(pathname) {
  if (isSettingsPathname(pathname)) return 'settings';
  if (pathname.startsWith('/database')) return 'master';
  if (pathname === '/sa' || pathname.startsWith('/sa/') || pathname.startsWith('/sales-planning') || pathname.startsWith('/pm')) return 'salesplan';
  if (pathname.startsWith('/sahamit')) return 'sahamit';
  if (pathname.startsWith('/mgmt')) return 'mgmt';
  return 'tax';
}
