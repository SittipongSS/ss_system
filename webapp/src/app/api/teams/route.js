// ── API ทะเบียนทีม (mig 0309 · docs/team-management-plan.md) ─────────────
//
// ⭐ **มติผู้ใช้ 2026-08-28**: จัดทีมเองได้ไม่ต้องรอแอดมิน · แยกเฉพาะฝ่าย
//
// ⚠️ ด่านคือ `canManageTeams(user, department)` — ถือ cap แล้วยังจัดได้เฉพาะ
//   **ฝ่ายตัวเอง** (admin ข้ามได้) · ฝ่ายมาจาก query ไม่ใช่จากตัวผู้ใช้ เพราะ
//   หน้าเดียวกันถูกเรียกจากสองระบบ (/sa/teams · /service/teams)
//
// ⚠️ อ่านได้กว้างกว่าเขียน — คนในฝ่ายเดียวกันดูรายชื่อทีมได้ (ไม่งั้นหน้าจัดคิว
//   จะเอาชื่อทีมมาแสดงไม่ได้เลย) แต่แก้ได้เฉพาะคนที่ถือ cap
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden } from '@/lib/http';
import { canManageTeams, departmentOf } from '@/lib/permissions';
import { normalizeTeamInput, suggestTeamCode } from '@/lib/master/teams';
import { loadTeamMembers, loadTeams } from '@/lib/master/teamsRepo';
import { loadUserDirectory } from '@/lib/usersRepo';

export const dynamic = 'force-dynamic';

const departmentFromQuery = (req, user) => {
  const asked = String(new URL(req.url).searchParams.get('department') ?? '').trim();
  return asked || departmentOf(user) || '';
};

export const GET = withUser(async ({ user, supabase, req }) => {
  const department = departmentFromQuery(req, user);
  if (!department) return badRequest('ต้องระบุฝ่าย');
  /* อ่าน: คนในฝ่ายเดียวกันอ่านได้ · คนถือ cap อ่านได้ · admin อ่านได้ทุกฝ่าย */
  const mine = departmentOf(user);
  if (!canManageTeams(user, department) && mine !== department && user?.role !== 'admin') {
    return forbidden('ดูทีมของฝ่ายอื่นไม่ได้');
  }

  try {
    const teams = await loadTeams(supabase, { department });
    const [members, directory] = await Promise.all([
      loadTeamMembers(supabase, { teamCodes: teams.map((t) => t.code) }),
      loadUserDirectory(supabase),
    ]);

    /* คนของฝ่ายนี้ — บัญชีที่ปิดแล้วไม่นับ (คนที่ลาออกไม่ควรค้างอยู่ในทีม)
       ⚠️ อ่าน `teams` (พหูพจน์) ไม่ใช่ `team` — คนอยู่ได้หลายทีม (ADR 0015) */
    const people = [...directory.values()]
      .filter((u) => u.department === department && !u.disabled)
      .map((u) => ({ id: u.id, name: u.name, role: u.role, team: u.team, teams: u.teams }));

    return ok({ department, teams, members, people, canManage: canManageTeams(user, department) });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const POST = withUser(async ({ user, supabase, req }) => {
  const body = await req.json().catch(() => ({}));
  const department = String(body.department ?? '').trim() || departmentOf(user) || '';
  if (!canManageTeams(user, department)) return forbidden('จัดทีมของฝ่ายนี้ไม่ได้');

  const { value, error } = normalizeTeamInput(body, { department });
  if (error) return badRequest(error);

  try {
    const existing = await loadTeams(supabase, {});
    /* รหัสออกจากชื่อ + ฝ่ายนำหน้า · **รหัสเปลี่ยนทีหลังไม่ได้** เพราะถูกก๊อปเป็น
       ข้อความลง 19 ตารางทันทีที่มีคนใช้ทีมนี้ */
    const code = suggestTeamCode(department, value.name, existing.map((t) => t.code));

    const { data, error: insertError } = await supabase.from('teams').insert({
      code,
      ...value,
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    }).select().single();
    if (insertError) {
      if (insertError.code === '23505') return conflict(`ฝ่ายนี้มีทีมชื่อ “${value.name}” อยู่แล้ว`);
      return fail(insertError.message, 500);
    }

    await recordAudit({
      user, action: 'create', entityType: 'team', entityId: code, after: data,
      summary: `สร้างทีม ${value.name} (${department})`, request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
