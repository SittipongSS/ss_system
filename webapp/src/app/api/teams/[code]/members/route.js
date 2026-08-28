// ── สมาชิกทีมปฏิบัติงาน (mig 0310 · งวด T-3) ─────────────────────────────
//
// ⭐ *"TS ก็มีแยกทีม"* (มติผู้ใช้ 2026-08-28) — ฝ่ายช่างแบ่งทีมกันจริงในหน้างาน
//
// ⚠️ **ใช้ได้เฉพาะทีม kind='crew'** — ทีมขายเก็บสมาชิกที่ `app_metadata.teams`
//   ของบัญชีผู้ใช้ (ที่เดียว) · ถ้ายอมให้เขียนทีมขายที่นี่ด้วย จะได้ทะเบียนสองเล่ม
//   ที่ไม่ตรงกันภายในเดือนเดียว: ด่านสิทธิ์อ่านเล่มหนึ่ง หน้าจัดทีมอ่านอีกเล่มหนึ่ง
//
// ⚠️ **ทีมปฏิบัติงานไม่แตะสิทธิ์เลย** — เป็นสมาชิกทีมช่างแล้วไม่ได้ cap อะไรเพิ่ม
//   (ด่านของโมดูลบริการยังเป็น `canEditService` ที่ดูจาก **ฝ่าย** เหมือนเดิม)
//   ถ้าวันหนึ่งอยากให้แตะสิทธิ์ ต้องเป็นมติใหม่ ไม่ใช่ผลข้างเคียงของหน้านี้
//
// ⚠️ **PUT ทั้งชุด ไม่ใช่ POST ทีละคน** — คนจัดทีมคิดเป็น "ทีมนี้มีใครบ้าง" แล้วกด
//   ครั้งเดียว · ยิงทีละคนแล้วล้มกลางทางจะเหลือทีมครึ่ง ๆ ที่คนกดไม่รู้ว่าถึงไหนแล้ว
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound } from '@/lib/http';
import { canManageTeams } from '@/lib/permissions';
import { findTeam, loadTeamMembers, loadTeams } from '@/lib/master/teamsRepo';
import { loadUserDirectory } from '@/lib/usersRepo';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

export const PUT = withUser(async ({ user, supabase, req, ctx }) => {
  const { code } = await ctx.params;
  try {
    const team = await findTeam(supabase, code);
    if (!team) return notFound('ไม่พบทีม');
    if (!canManageTeams(user, team.department)) return forbidden('จัดทีมของฝ่ายนี้ไม่ได้');
    if (team.kind !== 'crew') {
      return badRequest('ทีมขายเก็บสมาชิกที่บัญชีผู้ใช้ — ใช้เส้น /api/users/[id]/team แทน');
    }
    if (team.isActive === false) return badRequest('ทีมนี้ปิดใช้งานแล้ว — เปิดใช้งานก่อนจึงจะจัดคนได้');

    const body = await req.json().catch(() => ({}));
    const ids = [...new Set((Array.isArray(body.userIds) ? body.userIds : []).map((v) => String(v).trim()).filter(Boolean))];

    /* ⚠️ ทุกคนต้องเป็นคนของ **ฝ่ายเดียวกับทีม** — ไม่งั้นหัวหน้าฝ่ายหนึ่งจับคนของอีก
       ฝ่ายเข้าทีมตัวเองได้ แล้วหน้าจัดคิวจะนับคนที่ไม่ใช่ของฝ่ายนั้น */
    const directory = await loadUserDirectory(supabase);
    const outsiders = ids.filter((id) => directory.get(id)?.department !== team.department);
    if (outsiders.length) return badRequest('มีคนที่ไม่ได้อยู่ฝ่ายนี้ปนมาในรายชื่อ');

    /* คนหนึ่งอยู่ทีมปฏิบัติงานได้ทีมเดียวต่อฝ่าย — ต่างจากทีมขายที่ซ้อนกันได้
       (ทีมขาย = ขอบเขตการเห็นข้อมูล ซ้อนได้ · ทีมช่าง = วันนี้ไปทำงานอยู่กลุ่มไหน) */
    const deptTeams = await loadTeams(supabase, { department: team.department });
    const crewCodes = deptTeams.filter((t) => t.kind === 'crew').map((t) => t.code);
    const existing = await loadTeamMembers(supabase, { teamCodes: crewCodes });
    const clash = existing.filter((m) => m.teamCode !== code && ids.includes(m.userId));
    if (clash.length) {
      const names = clash.map((m) => m.userName || m.userId).join(', ');
      return badRequest(`${names} อยู่ทีมอื่นของฝ่ายนี้อยู่แล้ว — ย้ายออกจากทีมเดิมก่อน`);
    }

    const before = existing.filter((m) => m.teamCode === code);

    const { error: delError } = await supabase.from('team_members').delete().eq('teamCode', code);
    if (delError) return fail(delError.message, 500);

    if (ids.length) {
      const rows = ids.map((id) => ({
        teamCode: code,
        userId: id,
        userName: directory.get(id)?.name || null,
        joinedAt: businessDate(),
        addedById: user.id ? String(user.id) : null,
        addedByName: user.name || null,
      }));
      const { error: insError } = await supabase.from('team_members').insert(rows);
      if (insError) return fail(insError.message, 500);
    }

    await recordAudit({
      user, action: 'update', entityType: 'team_members', entityId: code,
      before: { userIds: before.map((m) => m.userId) }, after: { userIds: ids },
      summary: `จัดสมาชิกทีม ${team.name} (${team.department}) เป็น ${ids.length} คน`,
      request: req,
    });
    return ok({ teamCode: code, userIds: ids });
  } catch (e) {
    return fail(e.message, 500);
  }
});
