import { withUser, ok, unauthorized, forbidden } from '@/lib/http';
import { can } from '@/lib/permissions';
import { generateProjectCode } from '@/lib/pm/projectsRepo';

export const dynamic = 'force-dynamic';

// ใช้ตอนสร้างโปรเจกต์เท่านั้น — เดิมไม่เช็คสิทธิ์เลย; gate ด้วย pm:edit (คนที่สร้างได้)
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:edit')) return forbidden();
  return ok({ nextCode: await generateProjectCode(supabase) });
});
