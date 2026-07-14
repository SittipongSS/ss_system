import { withUser, ok, unauthorized, forbidden } from '@/lib/http';
import { can } from '@/lib/permissions';
import { peekNextEntityCode } from '@/lib/entityCode';

export const dynamic = 'force-dynamic';

// พรีวิวรหัสถัดไปตอนเปิดฟอร์มสร้างโครงการ — ต้อง "ไม่กินเลข" (peek) ไม่งั้นเปิดฟอร์ม
// เฉย ๆ ก็เผาเลขทิ้ง. เลขจริงออกตอน insert ด้วย generateProjectCode (RPC atomic).
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:edit')) return forbidden();
  return ok({ nextCode: await peekNextEntityCode(supabase, 'PJ') });
});
