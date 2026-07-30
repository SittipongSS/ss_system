// ── API รอบบริการรายใบ (mig 0188) ────────────────────────────────────────
// PATCH  : แก้รอบ · ?generate=1 = เติมนัดล่วงหน้าให้ครบ horizon ด้วย
// DELETE : ลบรอบ — นัดที่ gen ไว้แล้วยังอยู่ (FK เป็น SET NULL) กลายเป็นงานนอกรอบ
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { generateVisitsForPlan } from '@/lib/service/planGen';
import { normalizePlanInput } from '@/lib/service/rounds';
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

    // FK ของนัดเป็น SET NULL — นัดที่ gen ไว้แล้วอยู่ต่อในฐานะงานนอกรอบ
    // (ตั้งใจ: นัดที่ลูกค้ารู้แล้วว่าช่างจะมา ห้ามหายไปเพราะแอดมินลบรอบ)
    const { error } = await supabase.from('service_plans').delete().eq('id', id);
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'delete', entityType: 'service_plan', entityId: id, before,
      summary: `ลบรอบบริการทุก ${before.everyDays} วัน — นัดที่สร้างไว้แล้วยังอยู่ในฐานะงานนอกรอบ`,
      request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
