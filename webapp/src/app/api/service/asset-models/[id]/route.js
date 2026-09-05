// ── API รุ่นเครื่องรายใบ (mig 0344) ───────────────────────────────────────
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, notFound } from '@/lib/http';
import { canEditService } from '@/lib/permissions';
import { assetModelError, normalizeModelInput } from '@/lib/service/assetModels';
import { countAssetsOfModel, findAssetModel } from '@/lib/service/assetModelsRepo';
import { requireService } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;
  const { id } = await ctx.params;
  try {
    const before = await findAssetModel(supabase, id);
    if (!before) return notFound('ไม่พบรุ่นนี้ในทะเบียน');

    const body = await req.json().catch(() => ({}));
    /* ⚠️ **รวมค่าเดิมก่อนตรวจ** — ฟอร์มแก้ส่งมาเฉพาะช่องที่แตะ (กติกาเดียวกับ
       PATCH ของเครื่อง) · ตรวจจากของที่ส่งมาอย่างเดียวจะฟ้อง "ต้องระบุชื่อรุ่น"
       ให้คนที่แค่กดปิดใช้งาน */
    const merged = { ...before, ...body };
    const usedBy = await countAssetsOfModel(supabase, id);
    const gate = assetModelError('update', merged, { canEdit: canEditService(user), before, usedBy });
    if (gate) return badRequest(gate);
    const { value } = normalizeModelInput(merged);

    const { data, error } = await supabase.from('service_asset_models')
      .update({ ...value, updatedAt: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) {
      if (error.code === '23505') {
        return conflict(`รหัส ${value.modelCode} หรือชื่อรุ่น ${value.name} มีอยู่แล้วในทะเบียน`);
      }
      return fail(error.message, 500);
    }

    await recordAudit({
      user, action: 'update', entityType: 'service_asset_model', entityId: id,
      before, after: data, summary: `แก้รุ่นเครื่อง ${data.name}`, request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;
  const { id } = await ctx.params;
  try {
    const before = await findAssetModel(supabase, id);
    if (!before) return notFound('ไม่พบรุ่นนี้ในทะเบียน');
    const usedBy = await countAssetsOfModel(supabase, id);
    const gate = assetModelError('delete', {}, { canEdit: canEditService(user), before, usedBy });
    if (gate) return badRequest(gate);

    const { error } = await supabase.from('service_asset_models').delete().eq('id', id);
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'delete', entityType: 'service_asset_model', entityId: id,
      before, summary: `ลบรุ่นเครื่อง ${before.name}`, request: req,
    });
    return ok({ id });
  } catch (e) {
    return fail(e.message, 500);
  }
});
