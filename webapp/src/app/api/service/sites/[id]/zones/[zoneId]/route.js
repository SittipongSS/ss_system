// ── API โซนรายตัว (mig 0297) ──────────────────────────────────────────────
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, notFound } from '@/lib/http';
import { normalizeZoneInput } from '@/lib/service/zones';
import { findZone, requireSite } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, zoneId } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id, edit: true });
    if (access.response) return access.response;

    const before = await findZone(supabase, id, zoneId);
    if (!before) return notFound('ไม่พบโซนในไซต์นี้');

    const body = await req.json().catch(() => ({}));
    const { value, error } = normalizeZoneInput({ ...before, ...body });
    if (error) return badRequest(error);

    const { data, error: updateError } = await supabase
      .from('service_zones')
      .update({ ...value, updatedAt: new Date().toISOString() })
      .eq('id', zoneId).select().single();
    if (updateError) {
      if (updateError.code === '23505') return conflict(`ไซต์นี้มีโซนชื่อ "${value.name}" อยู่แล้ว`);
      return fail(updateError.message, 500);
    }

    await recordAudit({
      user, action: 'update', entityType: 'service_zone', entityId: zoneId, before, after: data,
      summary: `แก้โซน ${data.name} ที่ไซต์ ${access.site.name}`, request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, zoneId } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id, edit: true });
    if (access.response) return access.response;

    const before = await findZone(supabase, id, zoneId);
    if (!before) return notFound('ไม่พบโซนในไซต์นี้');

    const { error } = await supabase.from('service_zones').delete().eq('id', zoneId);
    if (error) {
      // FK RESTRICT จาก service_zone_terms — โซนที่มีประวัติการขายลบไม่ได้ (ปิดใช้แทน)
      // ส่วนเครื่อง (service_assets.zoneId) เป็น SET NULL: หลุดกลับกอง "ยังไม่ระบุโซน"
      if (error.code === '23503') {
        return conflict('โซนนี้มีรอบขายผูกอยู่ ลบไม่ได้ — ปิดใช้งานแทนเพื่อเก็บประวัติ');
      }
      return fail(error.message, 500);
    }

    await recordAudit({
      user, action: 'delete', entityType: 'service_zone', entityId: zoneId, before,
      summary: `ลบโซน ${before.name} ออกจากไซต์ ${access.site.name}`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
