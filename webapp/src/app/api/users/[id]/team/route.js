// ── ย้ายทีมขายของผู้ใช้หนึ่งคน (docs/team-management-plan.md §3.3) ────────
//
// ⭐ **เส้นใหม่ที่แคบ ไม่ใช่การเปิด PATCH /api/users/[id] เดิมให้กว้างขึ้น** —
//   เส้นเดิมเขียน role / department / extraCaps / รหัสผ่านได้ด้วย ซึ่งไม่ควรอยู่ใน
//   มือหัวหน้าทีม · เส้นนี้แตะได้อย่างเดียวคือ `team` กับ `teams`
//
// ⚠️ **สังกัดทีมขายอยู่ที่ Supabase Auth `app_metadata` ไม่ใช่ตารางแอป** — ทุกด่าน
//   สิทธิ์อ่านมันแบบ sync ตอน render ⇒ ห้ามย้ายที่เก็บ (ADR 0015 ทั้งฉบับตั้งอยู่บนนี้)
//
// ⚠️ **ระบบไม่ย้ายดีล/เป้าให้อัตโนมัติ** — จอต้องบอกจำนวนที่ค้างก่อนกด (teamMoveImpact)
//   ย้ายให้เอง = เขียนทับเจ้าของงานหลายสิบใบในคลิกเดียว และมติเดิมบอกว่าดีลเดือนเก่า
//   รายงานใต้ทีมเดิมถูกต้องแล้ว
import { recordAudit } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { withUser, ok, fail, badRequest, forbidden, notFound } from '@/lib/http';
import { TEAM_ROLES, canManageTeams, resolveTeamAssignment, userAuditSnapshot } from '@/lib/permissions';
import { loadTeams } from '@/lib/master/teamsRepo';

export const dynamic = 'force-dynamic';

export const PATCH = withUser(async ({ user, req, ctx }) => {
  const { id } = await ctx.params;
  const admin = getSupabaseAdmin();

  try {
    const { data: found, error: findError } = await admin.auth.admin.getUserById(id);
    if (findError || !found?.user) return notFound('ไม่พบผู้ใช้');
    const target = found.user;
    const department = target.app_metadata?.department || null;
    const role = target.app_metadata?.role || null;

    /* ⚠️ ตรวจ **ฝ่ายของคนที่จะถูกย้าย** ไม่ใช่ฝ่ายที่ผู้เรียกส่งมา — ไม่งั้นหัวหน้า
       ฝ่ายหนึ่งส่ง department ของตัวเองมาแล้วย้ายคนของอีกฝ่ายได้ */
    if (!canManageTeams(user, department)) return forbidden('ย้ายทีมของคนฝ่ายนี้ไม่ได้');

    /* ทีมขายมีได้เฉพาะตำแหน่งฝ่ายขาย — กติกาเดิมที่ validateIdentity บังคับอยู่แล้ว
       ถ้าจะจัดทีมให้ฝ่ายอื่น ต้องใช้ทีมปฏิบัติงาน (team_members) ไม่ใช่เส้นนี้ */
    if (!TEAM_ROLES.includes(role)) {
      return badRequest('ตำแหน่งนี้ไม่มีทีมขาย — ฝ่ายอื่นใช้ทีมปฏิบัติงานแทน');
    }

    const body = await req.json().catch(() => ({}));
    const registry = await loadTeams(getSupabaseAdmin(), { department: 'SA', includeInactive: false });
    const active = new Set(registry.map((t) => t.code));

    const asked = Array.isArray(body.teams) ? body.teams : (body.team ? [body.team] : []);
    if (!asked.length) return badRequest('ต้องเลือกอย่างน้อยหนึ่งทีม');
    /* ⚠️ ย้ายเข้าทีมที่ปิดแล้วไม่ได้ — ทีมที่ปิดยังอ่านป้ายได้ แต่ไม่รับคนใหม่
       (ตรวจกับทะเบียนจริง ไม่ใช่ค่าคงที่ในโค้ด) */
    const unknown = asked.filter((code) => !active.has(code));
    if (unknown.length) return badRequest(`ทีมไม่ถูกต้องหรือปิดใช้งานแล้ว: ${unknown.join(', ')}`);

    const { team, teams } = resolveTeamAssignment(role, { team: body.team || asked[0], teams: asked });
    if (!teams.length) return badRequest('ทีมไม่ถูกต้อง');

    const before = userAuditSnapshot(target);
    const { data, error } = await admin.auth.admin.updateUserById(id, {
      // ⚠️ Supabase **merge** app_metadata ไม่ replace — ส่งทั้งสองช่องเสมอ
      //    ไม่งั้นขอบเขตเดิมค้างอยู่เงียบ ๆ (ADR 0015 บันทึกกับดักนี้ไว้)
      app_metadata: { ...target.app_metadata, team, teams },
    });
    if (error) return fail(error.message, 400);

    await recordAudit({
      user, action: 'update', entityType: 'user', entityId: id,
      before, after: userAuditSnapshot(data.user),
      summary: `ย้ายทีมของ ${target.email} เป็น ${teams.join(', ')} (ทีมหลัก ${team})`,
      request: req,
    });
    return ok({ id, team, teams });
  } catch (e) {
    return fail(e.message, 500);
  }
});
