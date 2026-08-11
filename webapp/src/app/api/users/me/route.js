import { withUser, ok, unauthorized } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user }) => {
  if (!user) return unauthorized();
  return ok({
    id: user.id,
    name: user.name,
    role: user.role,
    team: user.team,     // ทีมหลัก (ยอดของใหม่เข้าทีมนี้)
    teams: user.teams,   // ทุกทีมที่สังกัด (ขอบเขตการเห็น/แก้)
  });
});
