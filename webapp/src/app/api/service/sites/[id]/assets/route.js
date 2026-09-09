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

    /* 🔴 **ไซต์คลังรับเครื่องเข้าตรง ๆ ไม่ได้อีกแล้ว (mig 0344)** — เส้นนี้ผูก `siteId`
       ให้เสมอ ⇒ สองสถานะที่เป็นไปได้ล้มทั้งคู่ที่ชั้นฐานข้อมูล:
         · `in_stock` ผิด CHECK `service_assets_place_by_status` (ว่าง ⇒ ต้องไม่มีไซต์)
         · `active`  โดน trigger ของ mig 0332 ('เครื่องที่อยู่ในคลังใช้สถานะ "ใช้งาน" ไม่ได้')
       🔄 ของเดิมเติม `in_stock` ให้เมื่อเป็นคลัง — ถูกตอน 0332 (คลังเป็นไซต์จริง) และ
          กลายเป็น **500 ที่การันตี** ตั้งแต่ 0344 ⇒ ตอบเป็นภาษาคนพร้อมทางออกแทน */
    if (isWarehouseSite(access.site)) {
      return badRequest('ไซต์คลังรับเครื่องเข้าตรง ๆ ไม่ได้ — ขึ้นทะเบียนที่หน้าทะเบียนเครื่อง แล้วใช้คำสั่ง "ติดตั้งเข้าไซต์"');
    }

    /* เครื่องที่เพิ่มจากหน้าไซต์ = เครื่องที่ **ติดตั้งอยู่ที่ไซต์นั้น** เสมอ · สถานะอื่น
       (ว่าง · ซ่อม · ปลดระวาง) เป็นผลของคำสั่ง ⇒ ตีกลับ ไม่ใช่เมินเงียบ
       ⚠️ ฟอร์มไม่ส่ง `status` มาแล้ว — ด่านนี้กันเส้นที่ยิง API ตรง */
    if (body.status && body.status !== 'active') {
      return badRequest('เพิ่มเครื่องจากหน้าไซต์ได้เฉพาะเครื่องที่ติดตั้งอยู่ — สถานะอื่นตั้งที่หน้าทะเบียนเครื่อง หรือใช้คำสั่งย้าย');
    }

    const { value, error } = normalizeAssetInput(body);
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
