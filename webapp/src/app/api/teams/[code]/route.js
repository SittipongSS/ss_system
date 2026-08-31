// ── แก้ทีมรายใบ (mig 0310) ───────────────────────────────────────────────
//
// ⚠️ **DELETE มีแล้ว แต่แคบมาก** (มติผู้ใช้ 2026-08-30 ขอปุ่มลบให้แอดมิน) — รหัสทีม
//   ถูกก๊อปเป็นข้อความลงหลายสิบคอลัมน์ในหลายตาราง และอยู่ในกุญแจของ unique index
//   ⇒ ลบทีมที่ **ถูกใช้ไปแล้ว** = ป้ายในรายงานย้อนหลังกลายเป็นรหัสดิบทันที
//   ⭐ สิ่งที่ต้องลบจริง ๆ คือทีมที่ **ตั้งผิดแล้วยังไม่มีใครใช้** ⇒ ด่านถามฐานก่อนเสมอ
//      (`TEAM_STAMPED_COLUMNS` + สมาชิก + สังกัดใน app_metadata) · มีของค้างแม้แถวเดียว
//      ให้ปิดทีมแทน (`isActive = false`)
//
// ⚠️ **รหัสทีมแก้ไม่ได้** — เปลี่ยนรหัส = แถวเก่าทั้งหมดชี้ทีมที่ไม่มีอยู่
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound } from '@/lib/http';
import { TEAMS, canManageTeams } from '@/lib/permissions';
import { TEAM_STAMPED_COLUMNS, deleteTeamBlocker } from '@/lib/master/teamUsage';
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


/* ── ลบทีม — **แอดมินเท่านั้น** และเฉพาะทีมที่ยังไม่มีใครใช้ ─────────────────
   ⚠️ ไม่ใช้ `canManageTeams` เหมือน PATCH — หัวหน้าฝ่ายปิดทีมได้ แต่ **ลบ** เป็นงาน
      ที่ย้อนกลับไม่ได้และกระทบรายงานของทั้งบริษัท ⇒ เหลือคนเดียวตามมติ "admin
      ทำได้ทุกอย่าง" ที่คู่กับ "งานที่ลบแล้วกู้ไม่ได้ต้องแคบที่สุด" */
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { code } = await ctx.params;
  try {
    if (user?.role !== 'admin') return forbidden('ลบทีมได้เฉพาะผู้ดูแลระบบ');
    const team = await findTeam(supabase, code);
    if (!team) return notFound('ไม่พบทีม');

    /* 🔴 **นับของจริงทุกตาราง ก่อนตัดสิน** — ไม่ใช่ถามแค่จำนวนสมาชิก · ตกหล่นตารางไหน
       คือลบทีมที่ยังถูกอ้างอยู่ได้เงียบ ๆ (ลิสต์อยู่ที่ `TEAM_STAMPED_COLUMNS`) */
    const usage = [];
    for (const { table, column, label } of TEAM_STAMPED_COLUMNS) {
      const { count, error } = await supabase
        .from(table).select('*', { count: 'exact', head: true }).eq(column, code);
      // อ่านไม่ได้ = **ไม่รู้ว่าว่างจริงไหม** ⇒ ห้ามเดาว่าว่าง (ลบผิดแล้วย้อนไม่ได้)
      if (error) return fail(`ตรวจการใช้งานทีมที่ตาราง ${table} ไม่สำเร็จ: ${error.message}`, 500);
      usage.push({ label, count: count || 0 });
    }

    // ทีมขาย: สังกัดอยู่ที่ `app_metadata` ของผู้ใช้ ไม่ใช่ตาราง ⇒ ต้องไล่จาก Auth
    const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const memberUserIds = (userList?.users || [])
      .filter((u) => {
        const meta = u.app_metadata || {};
        const teams = Array.isArray(meta.teams) ? meta.teams : [];
        return meta.team === code || teams.includes(code);
      })
      .map((u) => u.id);

    const blocker = deleteTeamBlocker(team, {
      usage, memberUserIds, protectedCode: TEAMS.includes(code),
    });
    if (blocker) return conflict(blocker);

    const { error: deleteError } = await supabase.from('teams').delete().eq('code', code);
    if (deleteError) return fail(deleteError.message, 500);

    await recordAudit({
      user, action: 'delete', entityType: 'team', entityId: code, before: team,
      summary: `ลบทีม ${team.name} (${team.department})`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
