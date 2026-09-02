// ── API เครื่องกระจายกลิ่นในไซต์ (mig 0187) ──────────────────────────────
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { isWarehouseSite, normalizeAssetInput } from '@/lib/service/sites';
import { findZone, loadAssets, requireSite } from '@/lib/service/sitesRepo';

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

// POST { label, kind?, qty?, zoneId?, model?, serial?, colour?, floor?, spot?,
//        settings?, productId?, bottleMl?, mlPerDay?, installedAt?, status? }
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id, edit: true });
    if (access.response) return access.response;

    const body = await req.json().catch(() => ({}));
    /* 🐞 **สถานะตั้งต้นต้องเดินตามประเภทไซต์** (UAT 2026-09-02) — `normalizeAssetInput`
       ตั้ง `active` เมื่อไม่ได้ส่งมา ⇒ สร้างเครื่องใน **ไซต์คลัง** โดนตีกลับด้วย
       500 + ข้อความของ trigger (mig 0332) ทั้งที่ผู้ใช้ไม่ได้ทำอะไรผิด
       ⚠️ ต้องอยู่ที่ **server** ไม่ใช่แค่ค่าตั้งต้นในฟอร์ม — เส้นที่ยิง API ตรง
          (ตัวนำเข้า · สคริปต์ · เครื่องมือภายนอก) ไม่ได้เดินผ่านฟอร์ม */
    const withDefaults = body.status
      ? body
      : { ...body, status: isWarehouseSite(access.site) ? 'in_stock' : 'active' };
    const { value, error } = normalizeAssetInput(withDefaults);
    if (error) return badRequest(error);

    // ⚠️ โซนต้องเป็นของไซต์เดียวกัน — เชื่อ id จาก client ตรง ๆ ไม่ได้
    // (normalizeAssetInput ส่งผ่านอย่างเดียว ด่านความเป็นเจ้าของอยู่ที่นี่)
    if (value.zoneId && !(await findZone(supabase, id, value.zoneId))) {
      return badRequest('โซนที่เลือกไม่อยู่ในไซต์นี้');
    }

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
