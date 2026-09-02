// ── API เครื่องรายตัว (mig 0187) ─────────────────────────────────────────
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, notFound } from '@/lib/http';
import { normalizeAssetInput } from '@/lib/service/sites';
import { findAsset, findZone, requireSite } from '@/lib/service/sitesRepo';

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

    // ⚠️ โซนต้องเป็นของไซต์เดียวกัน — เชื่อ id จาก client ตรง ๆ ไม่ได้
    if (value.zoneId && value.zoneId !== before.zoneId && !(await findZone(supabase, id, value.zoneId))) {
      return badRequest('โซนที่เลือกไม่อยู่ในไซต์นี้');
    }

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

    /* 🔴 **ด่านที่ไม่เคยมี** — ของเดิม `delete().eq('id', assetId)` ตรง ๆ ไม่ตรวจอะไรเลย
       และ `service_assets` ก็ไม่อยู่ใน REFERENCE_REGISTRY ⇒ ลบเครื่องที่มีประวัติได้ทันที
       ผลตามมาสองชั้นตอนที่ F-4 เปิดใช้ `assetId` จริง:
         · `service_visit_items.assetId` เป็น ON DELETE SET NULL ⇒ สายเชื่อม consumption
           ขาดเงียบ ๆ ยอด ml ของโซนหายไปโดยไม่มี error
         · `service_visit_assets.assetId` เป็น RESTRICT ⇒ Postgres จะโยน 23503 ดิบ ๆ
           ภาษาอังกฤษให้ผู้ใช้เห็นแทน
       ⇒ เช็คก่อนแล้วบอกทางออก (ปิดใช้งาน/ถอดออก) เหมือนที่ไซต์กับโซนทำอยู่แล้ว */
    /* 🐞 ต้องนับ `replacedByAssetId` ด้วย ไม่ใช่แค่ `assetId` — เครื่องสำรองที่เคยถูก
       เอาไปแทนเครื่องเสีย ไม่มีแถวที่ assetId ชี้หามันเลย ด่านจึงปล่อยผ่าน แล้วไปตาย
       ที่ FK SET NULL ของ 0301 ซึ่งดัน CHECK swap_needs_target ให้ล้ม ⇒ ผู้ใช้เห็น
       ข้อความ Postgres ดิบ ๆ (เจอตอนเก็บกวาดข้อมูลทดสอบ 2026-08-28 · mig 0303 ปิด
       รูฝั่ง DB ให้เป็น RESTRICT ตรงกับ assetId แล้ว ที่นี่คือชั้นที่พูดกับคน) */
    const [{ count: resultCount }, { count: itemCount }, { count: swapCount }] = await Promise.all([
      supabase.from('service_visit_assets').select('id', { count: 'exact', head: true }).eq('assetId', assetId),
      supabase.from('service_visit_items').select('id', { count: 'exact', head: true }).eq('assetId', assetId),
      supabase.from('service_visit_assets').select('id', { count: 'exact', head: true }).eq('replacedByAssetId', assetId),
    ]);
    const used = (resultCount || 0) + (itemCount || 0) + (swapCount || 0);
    if (used > 0) {
      return conflict(
        `อุปกรณ์นี้มีประวัติการเข้าบริการอยู่ ${used} รายการ ลบไม่ได้ — `
        + 'ถ้าถอดออกจากหน้างานจริงให้ใช้คำสั่ง “ถอนกลับคลัง” หรือ “ปลดระวาง” '
        + 'เพื่อไม่ให้ประวัติและยอดการใช้ของโซนหายไปด้วย',
      );
    }

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
