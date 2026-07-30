// ── API ไซต์บริการรายตัว (mig 0185) ──────────────────────────────────────
// GET    : ไซต์ + เครื่องทั้งหมดในไซต์
// PATCH  : แก้ข้อมูลไซต์
// DELETE : ลบไซต์ — บล็อกถ้ายังมีเครื่องอยู่ (ให้ปิดใช้งานแทน)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { normalizeSiteInput } from '@/lib/service/sites';
import { findCustomer, loadAssets, requireSite } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id });
    if (access.response) return access.response;
    return ok({ site: access.site, assets: await loadAssets(supabase, id) });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.site;

    // ฟอร์มเดียวกับตอนสร้าง (กฎ AGENTS.md) → validate ชุดเดียวกัน โดยรวมค่าเดิม
    // เข้าไปก่อน เพื่อให้ PATCH ที่ส่งมาบางช่องไม่ถูกอ่านว่า "ล้างช่องที่เหลือ"
    const body = await req.json().catch(() => ({}));
    const { value, error } = normalizeSiteInput({ ...before, ...body });
    if (error) return badRequest(error);

    // ย้ายไซต์ข้ามลูกค้าได้ (สาขาถูกโอนกิจการเกิดขึ้นจริง) แต่ปลายทางต้องมีจริง
    let customerName = before.customerName;
    if (value.customerId !== before.customerId) {
      const customer = await findCustomer(supabase, value.customerId);
      if (!customer) return badRequest('ไม่พบลูกค้าที่ระบุ');
      customerName = customer.name || null;
    }

    const { data, error: updateError } = await supabase
      .from('service_sites')
      .update({ ...value, customerName, updatedAt: new Date().toISOString() })
      .eq('id', id).select().single();
    if (updateError) return fail(updateError.message, 500);

    await recordAudit({
      user, action: 'update', entityType: 'service_site', entityId: id, before, after: data,
      summary: `แก้ไซต์บริการ ${data.code || id} · ${data.name}`, request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const before = access.site;

    // ⚠️ FK ของเครื่องเป็น CASCADE — ลบไซต์ = เครื่องหายทั้งชุดพร้อมประวัติ
    // ปิดใช้งานคือสิ่งที่ผู้ใช้ต้องการจริงเกือบทุกครั้ง (ของจริงยังอยู่หน้างาน)
    const assets = await loadAssets(supabase, id);
    if (assets.length) {
      return conflict(`ไซต์นี้ยังมีเครื่องอยู่ ${assets.length} เครื่อง — ปิดใช้งานแทนการลบ`);
    }

    const { error } = await supabase.from('service_sites').delete().eq('id', id);
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'delete', entityType: 'service_site', entityId: id, before,
      summary: `ลบไซต์บริการ ${before.code || id} · ${before.name}`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
