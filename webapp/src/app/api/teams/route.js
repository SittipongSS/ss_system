// ── API ทะเบียนทีม (mig 0310 · docs/team-management-plan.md) ─────────────
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
import { normalizeTeamCode, normalizeTeamInput, suggestTeamCode } from '@/lib/master/teams';
import { loadTeamMembers, loadTeams } from '@/lib/master/teamsRepo';
import { loadUserDirectory } from '@/lib/usersRepo';

export const dynamic = 'force-dynamic';

const departmentFromQuery = (req, user) => {
  const asked = String(new URL(req.url).searchParams.get('department') ?? '').trim();
  return asked || departmentOf(user) || '';
};

/* ── อ่าน "ป้ายชื่อทีม" อย่างเดียว — เปิดให้ทุกคนที่ล็อกอิน ────────────────────
   ⭐ มติผู้ใช้ 2026-09-07 (ทะเบียนทีมฝั่งจอ): ทีมขายที่สร้างใหม่ต้องขึ้น **ชื่อจริง**
   ไม่ใช่รหัสดิบ ⇒ ทุกจอต้องอ่านทะเบียนได้ ไม่ใช่แค่คนในฝ่ายนั้น

   ⚠️ **ด่านฝ่ายที่มีอยู่ไม่ได้ปกป้องชื่อทีม — มันปกป้องอีกสองก้อน** คือ `members`
   (รายชื่อสมาชิกทีมปฏิบัติงาน) กับ `people` (ไดเรกทอรีคนทั้งฝ่าย) ⇒ ตัดสองก้อนนั้นออก
   แล้วเปิดอ่านได้ทั้งบริษัท · รหัสทีมถูกก๊อปอยู่บนดีล/ใบเสนอราคา/รายงานที่คนส่วนใหญ่
   เห็นอยู่แล้ว การรู้ชื่อเต็มของรหัสไม่ได้เปิดอะไรใหม่
   ⚠️ **ไม่ส่ง `note` · `leadName` · `createdByName`** — สามช่องนั้นเป็นข้อความที่คนพิมพ์เอง
   และชื่อคน ซึ่งไม่ใช่ "ป้าย"
   ⚠️ ต้องคืน **ก่อน** ด่านฝ่ายเสมอ ห้ามหล่นไปเส้นเดิม */
const LABEL_COLUMNS = ['code', 'name', 'kind', 'isActive', 'sortOrder', 'department'];

export const GET = withUser(async ({ user, supabase, req }) => {
  const url = new URL(req.url);
  if (url.searchParams.get('labels') === '1') {
    try {
      const kind = String(url.searchParams.get('kind') ?? '').trim();
      const rows = await loadTeams(supabase, {});
      const teams = rows
        .filter((t) => !kind || t.kind === kind)
        .map((t) => Object.fromEntries(LABEL_COLUMNS.map((c) => [c, t[c]])));
      return ok({ teams });
    } catch (e) {
      return fail(e.message, 500);
    }
  }

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
    const existingCodes = existing.map((t) => t.code);
    /* ⭐ **รหัสตั้งเองได้แล้ว** (มติผู้ใช้ 2026-09-07) — ตัวสร้างอัตโนมัติเหลือเป็นค่าตั้งต้น
       ในช่อง ไม่ใช่คำตอบสุดท้าย · ชื่อไทยล้วนเคยได้รหัส `SA` · `SA-2` ซึ่งอ่านไม่ออกว่าทีมไหน
       ⚠️ ด่านอยู่ที่ **เซิร์ฟเวอร์** ไม่ใช่แค่จอ — จอเช็คให้รู้ตัวก่อนกด แต่คนยิง API ตรงได้
       ⚠️ รหัสนี้แก้ทีหลังได้ **เฉพาะตอนที่ยังไม่มีใครใช้** (PATCH ของ `[code]`) */
    const asked = String(body.code ?? '').trim();
    let code;
    if (asked) {
      const parsed = normalizeTeamCode(asked, { department, existingCodes });
      if (parsed.error) return badRequest(parsed.error);
      code = parsed.value;
    } else {
      code = suggestTeamCode(department, value.name, existingCodes);
    }

    const { data, error: insertError } = await supabase.from('teams').insert({
      code,
      ...value,
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    }).select().single();
    if (insertError) {
      /* ⚠️ 23505 มาได้จาก **สองกุญแจ** — primary key (`code`) กับ unique (ฝ่าย, ชื่อ)
         ตอบผิดกุญแจ = คนแก้ชื่อวนอยู่นาน ทั้งที่ตัวที่ชนคือรหัส (แข่งกันสร้างพร้อมกัน) */
      if (insertError.code === '23505') {
        return conflict(/teams_pkey|\(code\)/i.test(`${insertError.message} ${insertError.details || ''}`)
          ? `รหัส ${code} ถูกใช้ไปแล้ว — ตั้งรหัสอื่น`
          : `ฝ่ายนี้มีทีมชื่อ “${value.name}” อยู่แล้ว`);
      }
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
