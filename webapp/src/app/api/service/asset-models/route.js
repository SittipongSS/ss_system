// ── API ทะเบียนรุ่นเครื่อง (mig 0344) ─────────────────────────────────────
//
// ⭐ **ต้นทางของตัวเลือก "ชนิด/รุ่น/สี"** ในโมดัลเพิ่มเครื่อง — โมดัลนั้นเป็นที่ *ใช้*
//   ไม่ใช่ที่ *สร้าง* (กติกาเดียวกับที่ทะเบียนไซต์ไม่มีปุ่มสร้างในโมดัลนัด)
//
// ⚠️ **อ่านได้ทุกคนที่เข้าโมดูลบริการ · แก้ได้เฉพาะคนที่แก้ข้อมูลบริการได้** —
//   ช่างที่กรอกงานหน้างานต้องเห็นชื่อรุ่น แต่ไม่ควรตั้งรุ่นใหม่กลางหน้างาน
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { canEditService } from '@/lib/permissions';
import { assetModelError, normalizeModelInput } from '@/lib/service/assetModels';
import { assetCountByModel, loadAssetModels } from '@/lib/service/assetModelsRepo';
import { requireService } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

// GET → { models, usage } — จำนวนเครื่องต่อรุ่นมาด้วยเสมอ เพราะทุกจอที่แสดงทะเบียน
// ต้องรู้ว่ารุ่นไหนลบไม่ได้ ⇒ แยกเป็นสองเส้นแล้วจอจะโชว์ปุ่มลบที่กดแล้วเด้ง
export const GET = withUser(async ({ user, supabase }) => {
  const access = requireService({ user });
  if (access.response) return access.response;
  try {
    const [models, usage] = await Promise.all([
      loadAssetModels(supabase),
      assetCountByModel(supabase),
    ]);
    return ok({ models, usage });
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST { kind, name, modelCode, colours[], note? }
export const POST = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;
  try {
    const body = await req.json().catch(() => ({}));
    // 🔑 ด่านตัวเดียวกับที่จอใช้ปิดปุ่ม
    const gate = assetModelError('create', body, { canEdit: canEditService(user) });
    if (gate) return badRequest(gate);
    const { value } = normalizeModelInput(body);

    const { data, error } = await supabase.from('service_asset_models').insert({
      id: genId('SAM'),
      ...value,
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    }).select().single();
    if (error) {
      /* unique index เทียบด้วย upper()/lower() — `ov08` ชน `OV08` ซึ่งถูกต้อง
         แต่ error ดิบของ PostgREST อ่านไม่รู้เรื่อง ⇒ แปลเป็นภาษาคนที่นี่ */
      if (error.code === '23505') {
        return conflict(`รหัส ${value.modelCode} หรือชื่อรุ่น ${value.name} มีอยู่แล้วในทะเบียน`);
      }
      return fail(error.message, 500);
    }

    await recordAudit({
      user, action: 'create', entityType: 'service_asset_model', entityId: data.id, after: data,
      summary: `เพิ่มรุ่นเครื่อง ${data.name} (${data.modelCode})`, request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
