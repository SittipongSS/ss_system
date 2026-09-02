// ── API รอบบริการรายใบ (mig 0188) ────────────────────────────────────────
// PATCH  : แก้รอบ · ?generate=1 = เติมนัดล่วงหน้าให้ครบ horizon ด้วย
// DELETE : ลบรอบ — **รอบที่มีนัดปิดงานแล้วลบไม่ได้** (แอดมินบังคับได้ด้วย ?force=1)
//          นัดที่ gen ไว้แล้วยังอยู่เสมอ (FK เป็น SET NULL) กลายเป็นงานนอกรอบ
import { recordAudit } from '@/lib/audit';
import { canForceDelete, isDryRun, isForceRequest } from '@/lib/forceDelete';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { planForceManifest } from '@/lib/service/forceDeleteService';
import { generateVisitsForPlan } from '@/lib/service/planGen';
import { normalizePlanInput } from '@/lib/service/rounds';
import { isClosedVisit, planDeleteBlocker } from '@/lib/service/visitStatus';
import { requirePlan } from '@/lib/service/visitsRepo';

export const dynamic = 'force-dynamic';

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requirePlan({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.plan;

    const body = await req.json().catch(() => ({}));
    const { value, error } = normalizePlanInput({ ...before, ...body });
    if (error) return badRequest(error);

    const { data, error: updateError } = await supabase
      .from('service_plans')
      .update({ ...value, updatedAt: new Date().toISOString() })
      .eq('id', id).select().single();
    if (updateError) return fail(updateError.message, 500);

    // ⚠️ **ไม่แตะนัดที่ gen ไปแล้ว** ตอนแก้รอบ — นัดที่ผู้ใช้ย้ายวัน/มอบหมายคนไปแล้ว
    // จะถูกลบทิ้งแล้ว gen ใหม่ ซึ่งคือการลบงานที่คนจัดไว้ด้วยมือ · เติมเพิ่มได้อย่างเดียว
    let generated = [];
    if (new URL(req.url).searchParams.get('generate') === '1') {
      generated = await generateVisitsForPlan({ supabase, plan: data, user, req });
    }

    await recordAudit({
      user, action: 'update', entityType: 'service_plan', entityId: id, before, after: data,
      summary: `แก้รอบบริการทุก ${data.everyDays} วัน${generated.length ? ` · เติมนัด ${generated.length} ครั้ง` : ''}`,
      request: req,
    });
    return ok({ plan: data, generated });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requirePlan({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.plan;

    // ⭐ ทางลัดผู้ดูแลระบบ — เหตุผลเต็มที่ lib/service/forceDeleteService.js
    const admin = canForceDelete(user);
    if (isDryRun(req) && admin) return ok(await planForceManifest(supabase, id));

    /* 🔴 **ด่านที่หายไป** — การลบ *นัด* ห้ามแตะนัดที่ปิดงานแล้ว ("ประวัติการเข้าไซต์
       คือของมีค่าที่สุดของโมดูล") แต่การลบ *รอบ* ซึ่งเป็นแม่ของนัดพวกนั้นกลับไม่มี
       ด่านอะไรเลย ⇒ ได้ผลเสียแบบเดียวกันผ่านประตูหลัง เพราะ FK เป็น SET NULL
       ⚠️ ตัวตัดสินอยู่ที่ `planDeleteBlocker` ตัวเดียว — จอถามตัวเดียวกันก่อนเปิดปุ่ม */
    const visits = await fetchAll(() => supabase
      .from('service_visits').select('id, status')
      .eq('planId', id).order('id', { ascending: true }));
    const blocked = planDeleteBlocker(visits || []);
    if (blocked && !(isForceRequest(req) && admin)) return conflict(blocked);

    // FK ของนัดเป็น SET NULL — นัดที่ gen ไว้แล้วอยู่ต่อในฐานะงานนอกรอบ
    // (ตั้งใจ: นัดที่ลูกค้ารู้แล้วว่าเจ้าหน้าที่จะมา ห้ามหายไปเพราะแอดมินลบรอบ)
    const { error } = await supabase.from('service_plans').delete().eq('id', id);
    if (error) return fail(error.message, 500);

    /* รอยที่เขียนต้องบอก **ผลจริง** ไม่ใช่แค่ว่าลบอะไร — ใบที่ถูกบังคับลบทั้งที่มี
       ประวัติ คือใบที่คนตามหาทีหลังว่า "ทำไมรอบที่เดินเป็นศูนย์" */
    const closed = (visits || []).filter(isClosedVisit).length;
    await recordAudit({
      user, action: 'delete', entityType: 'service_plan', entityId: id, before,
      summary: blocked
        ? `ลบรอบบริการทุก ${before.everyDays} วัน (แอดมินข้ามด่านประวัติ) — นัดที่ปิดงานแล้ว ${closed} ครั้งขาดจากรอบ ไม่ถูกนับเป็นรอบตามข้อผูกพันอีก`
        : `ลบรอบบริการทุก ${before.everyDays} วัน — นัดที่สร้างไว้แล้วยังอยู่ในฐานะงานนอกรอบ`,
      request: req,
    });
    return ok({ ok: true, forced: !!blocked });
  } catch (e) {
    return fail(e.message, 500);
  }
});
