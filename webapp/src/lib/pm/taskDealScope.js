import { isSuperuser } from '@/lib/permissions';

export function canLinkTaskToDeal(user, deal) {
  if (!user || !deal) return false;
  if (isSuperuser(user.role)) return true;
  return !!user.team && !!deal.team && user.team === deal.team;
}

export function taskDealScope(user) {
  if (!user) return { kind: 'none', team: null };
  if (isSuperuser(user.role)) return { kind: 'all', team: null };
  return user.team ? { kind: 'team', team: user.team } : { kind: 'none', team: null };
}
