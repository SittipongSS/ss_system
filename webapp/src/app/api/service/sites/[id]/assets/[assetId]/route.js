// ── API เครื่องรายตัว (mig 0187) ─────────────────────────────────────────
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, notFound } from '@/lib/http';
import { normalizeAssetInput } from '@/lib/service/sites';
import { findAsset, requireSite } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, assetId } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id, edit: true });
    if (access.response) return access.response;

    const before = await findAsset(supabase, id, assetId);
    if (!before) return notFound('ไม่พบเครื่องในไซต์นี้');

    const body = await req.json().catch(() => ({}));
    const { value, error } = normalizeAssetInput({ ...before, ...body });
    if (error) return badRequest(error);

    const { data, error: updateError } = await supabase
      .from('service_assets')
      .update({ ...value, updatedAt: new Date().toISOString() })
      .eq('id', assetId).select().single();
    if (updateError) {
      if (updateError.code === '23505') return conflict(`Serial ${value.serial} ถูกใช้กับเครื่องอื่นแล้ว`);
      return fail(updateError.message, 500);
    }

    await recordAudit({
      user, action: 'update', entityType: 'service_asset', entityId: assetId, before, after: data,
      summary: `แก้เครื่อง ${data.label} ที่ไซต์ ${access.site.name}`, request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, assetId } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id, edit: true });
    if (access.response) return access.response;

    const before = await findAsset(supabase, id, assetId);
    if (!before) return notFound('ไม่พบเครื่องในไซต์นี้');

    const { error } = await supabase.from('service_assets').delete().eq('id', assetId);
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'delete', entityType: 'service_asset', entityId: assetId, before,
      summary: `ลบเครื่อง ${before.label} ออกจากไซต์ ${access.site.name}`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
