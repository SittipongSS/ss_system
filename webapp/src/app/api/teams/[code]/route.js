// ── แก้ทีมรายใบ (mig 0310) ───────────────────────────────────────────────
//
// ⚠️ **ไม่มี DELETE โดยเจตนา** — รหัสทีมถูกก๊อปเป็นข้อความลง 20 คอลัมน์ใน 19 ตาราง
//   และอยู่ในกุญแจของ unique index 3 ตัว ⇒ ลบแถวทะเบียนแล้วป้ายในรายงานย้อนหลัง
//   กลายเป็นรหัสดิบทันที · ปิดทีมคือ `isActive = false`
//
// ⚠️ **รหัสทีมแก้ไม่ได้** — เปลี่ยนรหัส = แถวเก่าทั้งหมดชี้ทีมที่ไม่มีอยู่
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound } from '@/lib/http';
import { canManageTeams } from '@/lib/permissions';
import { closeTeamBlocker, normalizeTeamInput } from '@/lib/master/teams';
import { findTeam, loadTeamMembers } from '@/lib/master/teamsRepo';

export const dynamic = 'force-dynamic';

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { code } = await ctx.params;
  try {
    const before = await findTeam(supabase, code);
    if (!before) return notFound('ไม่พบทีม');
    if (!canManageTeams(user, before.department)) return forbidden('จัดทีมของฝ่ายนี้ไม่ได้');

    const body = await req.json().catch(() => ({}));
    const { value, error } = normalizeTeamInput({ ...before, ...body }, { department: before.department });
    if (error) return badRequest(error);

    /* ปิดทีมที่ยังมีคนอยู่ไม่ได้ — คนจะหลุดออกจากทุกจอเงียบ ๆ
       ⚠️ นับสมาชิกจากตารางจริง ไม่ใช่จากตัวเลขที่จอส่งมา */
    if (before.isActive && value.isActive === false) {
      const members = await loadTeamMembers(supabase, { teamCodes: [code] });
      const blocker = closeTeamBlocker(before, { memberCount: members.length });
      if (blocker) return conflict(blocker);
    }

    const { data, error: updateError } = await supabase.from('teams')
      .update({ ...value, department: before.department, kind: before.kind, updatedAt: new Date().toISOString() })
      .eq('code', code).select().single();
    if (updateError) {
      if (updateError.code === '23505') return conflict(`ฝ่ายนี้มีทีมชื่อ “${value.name}” อยู่แล้ว`);
      return fail(updateError.message, 500);
    }

    await recordAudit({
      user, action: 'update', entityType: 'team', entityId: code, before, after: data,
      summary: before.isActive && !data.isActive
        ? `ปิดทีม ${data.name} (${data.department})`
        : `แก้ทีม ${data.name} (${data.department})`,
      request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});
