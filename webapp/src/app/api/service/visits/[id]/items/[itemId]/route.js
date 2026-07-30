// ── API ของที่ใช้รายบรรทัด (mig 0188 · S-3) ──────────────────────────────
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, notFound } from '@/lib/http';
import { requireVisit } from '@/lib/service/visitsRepo';

export const dynamic = 'force-dynamic';

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, itemId } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id, edit: true });
    if (access.response) return access.response;

    // ⚠️ ผูก visitId ใน where ด้วย — id ของบรรทัดเดาได้ ถ้าไม่ผูก คนที่แก้นัด A ได้
    // จะลบบรรทัดของนัด B ได้ด้วยการยิง id ตรง ๆ
    const { data: before, error: findError } = await supabase
      .from('service_visit_items').select('*').eq('id', itemId).eq('visitId', id).maybeSingle();
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
