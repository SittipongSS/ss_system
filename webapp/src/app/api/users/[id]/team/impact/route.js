// ── ผลข้างเคียงของการย้ายทีม (อ่านอย่างเดียว) ────────────────────────────
//
// ⭐ คู่มือพนักงานเข้า-ออกบอกว่าย้ายทีมมี **4 ขั้น** และ 3 ขั้นเป็นงานมือ:
//   แก้บัญชี → แก้ทีมของดีลที่ยังเปิดทีละใบ → ย้ายเป้าเดือนอนาคต → ถอนสิทธิ์เอกสารร่วม
//   ⇒ ปุ่ม "ย้ายทีม" ที่แก้แค่ `app_metadata` จะทิ้งของค้างโดยไม่มีอะไรฟ้อง
//   เส้นนี้มีไว้ให้จอ **บอกจำนวนก่อนกด** ไม่ใช่ให้ระบบไปย้ายให้เอง
import { withUser, ok, fail, forbidden, notFound } from '@/lib/http';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageTeams } from '@/lib/permissions';
import { teamMoveEffects } from '@/lib/master/teams';
import { teamMoveImpact } from '@/lib/master/teamsRepo';
import { nextMonthKey } from '@/lib/usersTransfer';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    const admin = getSupabaseAdmin();
    const { data: found, error } = await admin.auth.admin.getUserById(id);
    if (error || !found?.user) return notFound('ไม่พบผู้ใช้');
    const department = found.user.app_metadata?.department || null;
    if (!canManageTeams(user, department)) return forbidden();

    /* เป้า "เดือนอนาคต" เริ่มที่เดือนถัดไป — เดือนปัจจุบันวัดที่ระดับทีมตามคู่มือ
       ⚠️ `nextMonthKey` เป็นตัวเดียวกับที่หน้าโอนงานใช้ ห้ามคำนวณเดือนเองที่นี่ */
    const counts = await teamMoveImpact(supabase, id, { fromMonth: nextMonthKey() });
    return ok({ effects: teamMoveEffects(counts), counts });
  } catch (e) {
    return fail(e.message, 500);
  }
});
