// ── API เครื่องกระจายกลิ่นในไซต์ (mig 0185) ──────────────────────────────
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { normalizeAssetInput } from '@/lib/service/sites';
import { loadAssets, requireSite } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id });
    if (access.response) return access.response;
    return ok(await loadAssets(supabase, id));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST { label, model?, serial?, productId?, bottleMl?, mlPerDay?, installedAt?, status? }
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id, edit: true });
    if (access.response) return access.response;

    const body = await req.json().catch(() => ({}));
    const { value, error } = normalizeAssetInput(body);
    if (error) return badRequest(error);

    const row = {
      id: genId('SVA'),
      siteId: id,
      ...value,
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    };
    const { data, error: insertError } = await supabase
      .from('service_assets').insert(row).select().single();
    if (insertError) {
      // unique index บน lower(btrim(serial)) — เครื่องเดียวโผล่สองไซต์แปลว่าลืม
      // ย้ายทะเบียนตอนถอดไปติดที่ใหม่ ซึ่งทำให้ประวัติการเข้าบริการแยกร่าง
      if (insertError.code === '23505') {
        return conflict(`Serial ${value.serial} ถูกใช้กับเครื่องอื่นแล้ว — ถ้าย้ายเครื่อง ให้แก้ไซต์ของเครื่องเดิมแทนการสร้างใหม่`);
      }
      return fail(insertError.message, 500);
    }

    await recordAudit({
      user, action: 'create', entityType: 'service_asset', entityId: data.id, after: data,
      summary: `เพิ่มเครื่อง ${data.label} ที่ไซต์ ${access.site.name}`, request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
