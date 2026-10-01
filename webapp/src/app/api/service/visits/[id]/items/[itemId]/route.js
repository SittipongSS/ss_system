// ── API ของที่ใช้รายบรรทัด (mig 0188 · S-3) ──────────────────────────────
// PATCH  : แก้บรรทัด (แผน operation-crew R9 — หน้างานของช่างแก้ของที่ใช้จากฟอร์มตัวเดียวกับตอนเพิ่ม)
// DELETE : ลบบรรทัด
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, notFound } from '@/lib/http';
import { requireVisit } from '@/lib/service/visitsRepo';
import { normalizeVisitItem } from '@/lib/service/visitItems';

export const dynamic = 'force-dynamic';

// ⚠️ ผูก visitId ใน where ด้วย — id ของบรรทัดเดาได้ ถ้าไม่ผูก คนที่แก้นัด A ได้
// จะแก้/ลบบรรทัดของนัด B ได้ด้วยการยิง id ตรง ๆ
async function findItem(supabase, id, itemId) {
  return supabase.from('service_visit_items').select('*').eq('id', itemId).eq('visitId', id).maybeSingle();
}

// PATCH { label?, qty?, unit?, assetId?, productId?, note? } — ช่องที่ไม่ส่งมา = ค่าเดิม
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, itemId } = await ctx.params;
  try {
    /* ⭐ ด่านเดียวกับ POST — `requireVisit({ edit: true, running: true })` ⇒ ใบของคนอื่น 403 · ช่างบนใบที่ส่งงานแล้ว 409
       (มติ 28/09 Q3) · ช่างบนงานที่ยังไม่ได้ทำ (ยังไม่รับงาน · ร่าง · ยกเลิก · เลื่อน) 409 · ด่านอยู่ที่ requireVisit ไม่ใช่ที่นี่ */
    const access = await requireVisit({ user, supabase, id, edit: true, running: true });
    if (access.response) return access.response;

    const { data: before, error: findError } = await findItem(supabase, id, itemId);
    if (findError) return fail(findError.message, 500);
    if (!before) return notFound('ไม่พบรายการของที่ใช้ในนัดนี้');

    const body = await req.json().catch(() => ({}));
    /* ⭐ ตัวตรวจตัวเดียวกับ POST (`normalizeVisitItem`) บนค่าที่รวมแล้ว — ส่งมาแค่จำนวน ชื่อเดิมยังผ่านด่านชื่อ
       ⚠️ ตารางนี้ไม่มี `updatedAt` (mig 0188 · เดิมเป็นตาราง append + delete) ⇒ ไม่มีด่านชนกัน — คนหลังทับคนแรก
          ยอมรับได้: บรรทัดเดียวแก้พร้อมกันสองเครื่องแทบไม่เกิด และ audit เก็บค่าก่อนหน้าไว้ทุกครั้ง */
    const { value, error: invalid } = normalizeVisitItem({ ...before, ...body });
    if (invalid) return badRequest(invalid);

    const { data, error } = await supabase.from('service_visit_items')
      .update(value).eq('id', itemId).eq('visitId', id).select().maybeSingle();
    if (error) return fail(error.message, 500);
    // ถูกลบไประหว่างที่แก้ (อีกเครื่องกดลบ) — บอกตรง ๆ ไม่ใช่ตอบสำเร็จทั้งที่ไม่มีแถวให้แก้
    if (!data) return notFound('ไม่พบรายการของที่ใช้ในนัดนี้ — อาจถูกลบไปแล้ว');

    await recordAudit({
      user, action: 'update', entityType: 'service_visit', entityId: id, before, after: data,
      summary: `แก้ของที่ใช้ ${data.label} ในนัด ${access.visit.code || id}`, request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, itemId } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id, edit: true, running: true });
    if (access.response) return access.response;

    const { data: before, error: findError } = await findItem(supabase, id, itemId);
    if (findError) return fail(findError.message, 500);
    if (!before) return notFound('ไม่พบรายการของที่ใช้ในนัดนี้');

    const { error } = await supabase.from('service_visit_items').delete().eq('id', itemId).eq('visitId', id);
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'delete', entityType: 'service_visit', entityId: id, before,
      summary: `ลบของที่ใช้ ${before.label} ออกจากนัด ${access.visit.code || id}`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
