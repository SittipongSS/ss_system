// ── แก้ทีมรายใบ (mig 0310) ───────────────────────────────────────────────
//
// ⚠️ **DELETE มีแล้ว แต่แคบมาก** (มติผู้ใช้ 2026-08-30 ขอปุ่มลบให้แอดมิน) — รหัสทีม
//   ถูกก๊อปเป็นข้อความลงหลายสิบคอลัมน์ในหลายตาราง และอยู่ในกุญแจของ unique index
//   ⇒ ลบทีมที่ **ถูกใช้ไปแล้ว** = ป้ายในรายงานย้อนหลังกลายเป็นรหัสดิบทันที
//   ⭐ สิ่งที่ต้องลบจริง ๆ คือทีมที่ **ตั้งผิดแล้วยังไม่มีใครใช้** ⇒ ด่านถามฐานก่อนเสมอ
//      (`TEAM_STAMPED_COLUMNS` + สมาชิก + สังกัดใน app_metadata) · มีของค้างแม้แถวเดียว
//      ให้ปิดทีมแทน (`isActive = false`)
//
// ⭐ **รหัสทีมแก้ได้แล้ว — แต่เฉพาะทีมที่ยังไม่มีใครใช้** (มติผู้ใช้ 2026-09-07)
//   เหตุผลเดิมที่ห้ามยังจริงทุกคำ: รหัสถูกก๊อปเป็น *ข้อความ* ลง 20+ คอลัมน์ ไม่ใช่ FK
//   ⇒ เปลี่ยนรหัสของทีมที่ถูกใช้แล้ว = แถวเก่าทั้งหมดชี้ทีมที่ไม่มีอยู่
//   ⇒ ด่านเดียวกับ "ลบทีม" เป๊ะ (`scanTeamUsage` + คนที่ถือรหัสใน Auth) — พิมพ์รหัสผิด
//      ตอนสร้างแล้วแก้ไม่ได้เลย คือเหตุที่คนไปสร้างทีมใหม่ทิ้งของเก่าไว้เกลื่อนทะเบียน
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound } from '@/lib/http';
import { TEAMS, canManageTeams } from '@/lib/permissions';
import { deleteTeamBlocker, scanTeamUsage } from '@/lib/master/teamUsage';
import { closeTeamBlocker, normalizeTeamCode, normalizeTeamInput } from '@/lib/master/teams';
import { findTeam, loadTeamHolderIds, loadTeamMembers, loadTeams } from '@/lib/master/teamsRepo';

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

    /* ── เปลี่ยนรหัสทีม — เฉพาะทีมที่ยังไม่มีใครใช้ ────────────────────────
       ⚠️ `code` ไม่ได้อยู่ใน `normalizeTeamInput` โดยตั้งใจ (มันเป็น key ไม่ใช่ field)
       ⚠️ **ไม่ส่ง code มา = ไม่แตะ** — ส่งมาเท่าเดิมก็ไม่ถือว่าเปลี่ยน */
    const askedCode = String(body.code ?? '').trim().toUpperCase();
    const nextCode = askedCode && askedCode !== code ? askedCode : null;
    if (nextCode) {
      /* 🔴 สามทีมตั้งต้นห้ามแตะรหัส — ถูกอ้างในข้อมูลเก่าทั้งระบบ และเป็นค่าถอยของฝั่งจอ */
      if (TEAMS.includes(code)) {
        return conflict(`${before.name} เป็นทีมตั้งต้นของระบบ — เปลี่ยนรหัสไม่ได้`);
      }
      const all = await loadTeams(supabase, {});
      const parsed = normalizeTeamCode(nextCode, {
        department: before.department,
        existingCodes: all.map((t) => t.code),
      });
      if (parsed.error) return badRequest(parsed.error);

      /* ด่านเดียวกับ "ลบทีม" — รหัสที่ถูกใช้ไปแล้วเปลี่ยนไม่ได้ เพราะแถวเก่าถือ *ข้อความ*
         ไม่ใช่ FK ⇒ เปลี่ยนแล้วมันชี้ทีมที่ไม่มีอยู่ โดยไม่มีอะไรพัง ให้เห็น */
      const usage = await scanTeamUsage(supabase, code);
      const used = usage.filter((u) => u.count > 0);
      const holders = await loadTeamHolderIds(supabase, code);
      const crew = await loadTeamMembers(supabase, { teamCodes: [code] });
      if (holders.length || crew.length) {
        return conflict(`ทีมนี้มีสมาชิกอยู่ ${holders.length || crew.length} คน — เปลี่ยนรหัสไม่ได้`);
      }
      if (used.length) {
        const detail = used.map((u) => `${u.label} ${u.count}`).join(' · ');
        return conflict(`ทีมนี้ถูกใช้ไปแล้ว (${detail}) — เปลี่ยนรหัสไม่ได้ เพราะข้อมูลเก่าเก็บรหัสเดิมไว้เป็นข้อความ`);
      }
    }

    /* ปิดทีมที่ยังมีคนอยู่ไม่ได้ — คนจะหลุดออกจากทุกจอเงียบ ๆ
       ⚠️ นับสมาชิกจากของจริง ไม่ใช่จากตัวเลขที่จอส่งมา
       🐞 **และต้องนับให้ถูกตาราง** — ของเดิมนับจาก `team_members` ซึ่งเป็นของทีม
          **ปฏิบัติงาน** เท่านั้น ⇒ ทีมขายได้ 0 เสมอ ปิดทีมที่มีคนอยู่ได้เงียบ ๆ
          แล้วคนกลุ่มนั้นค้างอยู่กับรหัสทีมที่ปิดไปแล้ว ซึ่งทำให้ทุกการแก้บัญชีของเขา
          โดนตีกลับทีหลังโดยไม่มีจอไหนบอกว่าเกิดอะไรขึ้น (ตรวจย้อน 2026-09-07) */
    if (before.isActive && value.isActive === false) {
      const memberCount = before.kind === 'sales'
        ? (await loadTeamHolderIds(supabase, code)).length
        : (await loadTeamMembers(supabase, { teamCodes: [code] })).length;
      const blocker = closeTeamBlocker(before, { memberCount });
      if (blocker) return conflict(blocker);
    }

    const { data, error: updateError } = await supabase.from('teams')
      .update({
        ...value,
        ...(nextCode ? { code: nextCode } : {}),
        department: before.department,
        kind: before.kind,
        updatedAt: new Date().toISOString(),
      })
      .eq('code', code).select().single();
    if (updateError) {
      /* ⚠️ 23505 มาได้จากสองกุญแจ (รหัส · ฝ่าย+ชื่อ) — ตอบผิดกุญแจ = คนไล่แก้ผิดช่อง */
      if (updateError.code === '23505') {
        return conflict(/teams_pkey|\(code\)/i.test(`${updateError.message} ${updateError.details || ''}`)
          ? `รหัส ${nextCode || code} ถูกใช้ไปแล้ว — ตั้งรหัสอื่น`
          : `ฝ่ายนี้มีทีมชื่อ “${value.name}” อยู่แล้ว`);
      }
      return fail(updateError.message, 500);
    }

    await recordAudit({
      user, action: 'update', entityType: 'team', entityId: code, before, after: data,
      summary: nextCode
        ? `เปลี่ยนรหัสทีม ${before.name}: ${code} → ${nextCode}`
        : (before.isActive && !data.isActive
          ? `ปิดทีม ${data.name} (${data.department})`
          : `แก้ทีม ${data.name} (${data.department})`),
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
       คือลบทีมที่ยังถูกอ้างอยู่ได้เงียบ ๆ (ลิสต์อยู่ที่ `TEAM_STAMPED_COLUMNS`)
       ⚠️ ตัวสแกนตัวเดียวกับที่ด่าน "เปลี่ยนรหัสทีม" ใช้ — อ่านไม่ได้มันโยน error เอง
       (ห้ามเดาว่าว่าง: ลบผิดแล้วย้อนไม่ได้) */
    const usage = await scanTeamUsage(supabase, code);

    // ทีมขาย: สังกัดอยู่ที่ `app_metadata` ของผู้ใช้ ไม่ใช่ตาราง ⇒ ต้องไล่จาก Auth
    // (ตัวเดียวกับที่ด่านปิดทีมใช้ — เขียนสองที่เมื่อไรมันเพี้ยนหากัน)
    const memberUserIds = await loadTeamHolderIds(supabase, code);

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
