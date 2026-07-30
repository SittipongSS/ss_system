// ── ลบค่ากำลังผลิตของวันหนึ่ง (mig 0186) — วันนั้นกลับไปใช้กำลังมาตรฐานของไลน์
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, notFound } from '@/lib/http';
import { requireProduction } from '@/lib/pm/productionLinesRepo';

export const dynamic = 'force-dynamic';

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const access = requireProduction({ user, edit: true });
  if (access.response) return access.response;
  const { id, date } = await ctx.params;

  try {
    const { data: before, error: findError } = await supabase
      .from('production_capacity_days').select('*')
      .eq('lineId', id).eq('date', date).maybeSingle();
    if (findError) return fail(findError.message, 500);
    if (!before) return notFound('ไม่พบค่ากำลังผลิตของวันนี้');

    const { error } = await supabase
      .from('production_capacity_days').delete().eq('id', before.id);
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'delete', entityType: 'production_capacity_day', entityId: before.id, before,
      summary: `ลบค่ากำลังผลิตวันที่ ${date}`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
