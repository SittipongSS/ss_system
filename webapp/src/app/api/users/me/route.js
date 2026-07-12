import { withUser, ok, unauthorized } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user }) => {
  if (!user) return unauthorized();
  return ok({
    id: user.id,
    name: user.name,
    role: user.role,
    team: user.team,
  });
});
