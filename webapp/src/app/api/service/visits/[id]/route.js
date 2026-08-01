// ── API นัดรายใบ (mig 0188) ──────────────────────────────────────────────
// PATCH  : แก้นัด · ปิดงาน (status=done) จะ **เสนอ** นัดรอบถัดไปกลับไปให้ผู้ใช้ยืนยัน
// DELETE : ลบนัด — ใช้ได้เฉพาะนัดที่ยังไม่เกิดขึ้น (ปิดงานแล้วคือประวัติ ห้ามลบ)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { appendUpdate, purgeUpdates } from '@/lib/master/updates';
import { isReschedule, nextAfterDone, normalizeVisitInput, rescheduleSummary } from '@/lib/service/rounds';
import { findPlan, loadVisitItems, requireVisit } from '@/lib/service/visitsRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id });
    if (access.response) return access.response;
    return ok({ visit: access.visit, items: await loadVisitItems(supabase, id) });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.visit;

    const body = await req.json().catch(() => ({}));
    const { value, error } = normalizeVisitInput({ ...before, ...body });
    if (error) return badRequest(error);

    // ⭐ เลื่อนนัดต้องมีเหตุผล (S-5) — ลูกค้าถามว่า "ทำไมช่างไม่มาสักที" ต้องตอบได้ว่า
    // เลื่อนกี่ครั้งเพราะอะไรบ้าง · เหตุผลลง**เธรด** ไม่ใช่คอลัมน์ เพราะคอลัมน์เดียว
    // ถูกเขียนทับทุกครั้งที่เลื่อน = ประวัติเลื่อน 5 ครั้งเหลือ 1
    const rescheduled = isReschedule(before, value);
    const reason = String(body.rescheduleReason ?? '').trim();
    if (rescheduled && !reason) {
      return badRequest('เลื่อนนัดต้องระบุเหตุผล — ประวัติการเลื่อนคือสิ่งที่ต้องตอบลูกค้าทีหลัง');
    }

    const { data, error: updateError } = await supabase
      .from('service_visits')
      .update({ ...value, updatedAt: new Date().toISOString() })
      .eq('id', id).select().single();
    if (updateError) return fail(updateError.message, 500);

    await recordAudit({
      user, action: 'update', entityType: 'service_visit', entityId: id, before, after: data,
      summary: `แก้นัดเข้าบริการ ${data.code || id} · ${data.scheduledDate}`, request: req,
    });

    // ── เหตุการณ์ที่ต้องเล่าย้อนหลังได้ ลงเธรดกลาง (S-5) ────────────────
    // ⚠️ เขียนหลัง update สำเร็จเท่านั้น — เธรดที่บอกว่าเลื่อนแล้วแต่วันไม่เปลี่ยนจริง
    // แย่กว่าไม่มีเธรด เพราะคนจะเชื่อเธรดมากกว่าตาราง
    if (rescheduled) {
      await appendUpdate(supabase, {
        entityType: 'service_visit', entityId: id, kind: 'reschedule',
        body: rescheduleSummary(before, data, reason), user,
      });
    }
    if (data.status === 'done' && before.status !== 'done') {
      await appendUpdate(supabase, {
        entityType: 'service_visit', entityId: id, kind: 'done',
        body: [`ปิดงาน · เข้าจริง ${data.actualDate}`, data.summary].filter(Boolean).join(' — '),
        user,
      });
    }
    if (data.status === 'cancelled' && before.status !== 'cancelled') {
      await appendUpdate(supabase, {
        entityType: 'service_visit', entityId: id, kind: 'cancel',
        body: reason || 'ยกเลิกนัด', user,
      });
    }

    // ⭐ ปิดงานแล้วเสนอนัดรอบถัดไป — **เสนอ ไม่สร้างให้เอง** เพราะรอบอาจถูกยกเลิก
    // ระหว่างทาง หรือช่างรู้ว่าลูกค้าจะย้ายไซต์ · ผู้ใช้กดยืนยันแล้วค่อย POST
    let suggestion = null;
    if (data.status === 'done' && before.status !== 'done' && data.planId) {
      const plan = await findPlan(supabase, data.planId);
      if (plan) suggestion = nextAfterDone(plan, data);
    }
    return ok({ visit: data, nextVisitSuggestion: suggestion });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.visit;

    // ⚠️ นัดที่ปิดงานแล้วคือ **ประวัติการเข้าไซต์** ซึ่งเป็นของมีค่าที่สุดของโมดูลนี้
    // ยกเลิกได้ (status) แต่ลบทิ้งไม่ได้
    if (before.status === 'done') {
      return conflict('นัดที่ปิดงานแล้วลบไม่ได้ — เป็นประวัติการเข้าไซต์ · ถ้าบันทึกผิดให้แก้ข้อมูลแทน');
    }

    const { error } = await supabase.from('service_visits').delete().eq('id', id);
    if (error) return fail(error.message, 500);

    // เธรด + แจ้งเตือนไม่มี FK — ไม่กวาดคู่กัน = กระดิ่งมีแถวที่กดแล้วไปเจอนัดที่ไม่มีแล้ว
    // (entity อื่นทั้ง 12 ตัวเรียกตัวนี้ตอนลบอยู่แล้ว นัดเข้าบริการเป็นตัวเดียวที่ตกหล่น)
    await purgeUpdates(supabase, 'service_visit', id);

    await recordAudit({
      user, action: 'delete', entityType: 'service_visit', entityId: id, before,
      summary: `ลบนัดเข้าบริการ ${before.code || id} · ${before.scheduledDate}`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
