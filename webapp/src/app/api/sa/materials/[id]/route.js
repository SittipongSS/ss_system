// ── API วัสดุรายตัวในทะเบียน (mig 0157) ─────────────────────────────────
// GET    : รายละเอียด + ประวัติรุ่นราคา (canViewCosting)
// PATCH  : accept (RD/PC รับวัสดุร่างเข้าทะเบียน) · archive/restore · edit
// DELETE : ลบได้เฉพาะร่างที่ยังไม่มีราคาและยังไม่มีใครอ้างถึง
//          ?dryRun=1 พรีวิวว่าจะกระทบอะไร (admin) · ?force=1 break-glass (admin)
//
// ⚠️ ด่านจริงอยู่ที่นี่ — proxy เห็นแค่ role ไม่รู้ว่าวัสดุตัวนี้เป็นของฝ่ายไหน
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canUser, canViewCosting } from '@/lib/permissions';
import { canQuoteMaterial, normalizeMaterialInput } from '@/lib/materialPrices';
import { acceptMaterial, findMaterial, formulaSnapshotFor } from '@/lib/materialPricesAdmin';
import { normalizePmType } from '@/lib/master/materialTypes';
import {
  canForceDelete, isDryRun, isForceRequest, materialForcePreview,
} from '@/lib/forceDelete';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// เซลที่เสนอร่างเข้ามาเองยังแก้ร่างของตัวเองได้ (ยังไม่มีใครรับ = ยังไม่มีราคา)
function canEditDraft(user, material) {
  return material.status === 'draft'
    && material.createdById === user?.id
    && canUser(user, 'costing:edit');
}

export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const { id } = await params;
    const material = await findMaterial(getSupabaseAdmin(), id);
    if (!material) return Response.json({ error: 'ไม่พบวัสดุในทะเบียน' }, { status: 404 });
    return Response.json(material, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findMaterial(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบวัสดุในทะเบียน' }, { status: 404 });
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = body.action || 'edit';
  const owner = canQuoteMaterial(user, before.kind);
  const nowIso = new Date().toISOString();

  try {
    if (action === 'accept') {
      if (!owner) {
        return Response.json({
          error: `รับวัสดุเข้าทะเบียนได้เฉพาะฝ่าย ${before.sourceDept}`,
        }, { status: 403 });
      }
      if (before.status !== 'draft') {
        return Response.json({ error: 'วัสดุนี้ไม่ได้อยู่ในสถานะร่าง' }, { status: 409 });
      }
      await acceptMaterial(supabase, { materialId: id, user });
    } else if (action === 'archive' || action === 'restore') {
      if (!owner) {
        return Response.json({
          error: `จัดการวัสดุนี้ได้เฉพาะฝ่าย ${before.sourceDept}`,
        }, { status: 403 });
      }
      const next = action === 'archive' ? 'archived' : 'active';
      if (before.status === next) {
        return Response.json({ error: 'สถานะเดิมอยู่แล้ว' }, { status: 409 });
      }
      const { error } = await supabase.from('material_prices')
        .update({ status: next, updatedAt: nowIso }).eq('id', id);
      if (error) throw error;
    } else if (action === 'edit') {
      if (!owner && !canEditDraft(user, before)) {
        return Response.json({
          error: `แก้ข้อมูลวัสดุนี้ได้เฉพาะฝ่าย ${before.sourceDept}`,
        }, { status: 403 });
      }
      // ชนิดวัสดุเปลี่ยนไม่ได้ — ฝ่ายเจ้าของและหน่วยราคาผูกกับชนิด rev เก่าจะเพี้ยน
      const { value, error: inputError } = normalizeMaterialInput({ ...body, kind: before.kind });
      if (inputError) return Response.json({ error: inputError }, { status: 400 });
      const { error } = await supabase.from('material_prices').update({
        label: value.label,
        customerId: value.customerId,
        customerName: value.customerName,
        formulaId: value.formulaId,
        // snapshot ชื่อ/รหัสสูตรตามทะเบียน ณ เวลาที่ผูก (mig 0181) — ไม่ได้มาจาก
        // ที่ผู้ใช้พิมพ์อีกแล้ว จึง drift จากทะเบียนไม่ได้
        ...(await formulaSnapshotFor(supabase, value.formulaId)),
        supplierNote: value.supplierNote,
        pmType: normalizePmType(before.kind, body.pmType),
        updatedAt: nowIso,
      }).eq('id', id);
      if (error) {
        // ชนตัวตนซ้ำ (unique index) — บอกให้ชัดแทน error ดิบของ Postgres
        if (error.code === '23505') {
          return Response.json({
            error: 'มีวัสดุชื่อนี้ (ชนิด/สูตร/ลูกค้าเดียวกัน) ในทะเบียนอยู่แล้ว',
          }, { status: 409 });
        }
        throw error;
      }
    } else {
      return Response.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 });
    }

    const after = await findMaterial(supabase, id);
    const summaries = {
      accept: `รับวัสดุ "${before.label}" เข้าทะเบียน`,
      archive: `เก็บวัสดุ "${before.label}" เข้ากรุ`,
      restore: `นำวัสดุ "${before.label}" กลับมาใช้งาน`,
      edit: `แก้ข้อมูลวัสดุ "${before.label}"`,
    };
    await recordAudit({
      user, action: 'update', entityType: 'material_price', entityId: id, before, after,
      summary: summaries[action], request,
    });
    return Response.json(after);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findMaterial(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบวัสดุในทะเบียน' }, { status: 404 });
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  // ── บังคับลบ (break-glass ของผู้ดูแลระบบ) ──────────────────────────────
  // ทะเบียนกลิ่น/สูตร/คำร้องมีเส้นนี้แล้ว (#779/#915) — ทะเบียนวัสดุเป็นตัวสุดท้าย
  // ⚠️ FK สองตัวเป็น RESTRICT (บรรทัดคำร้อง 0158 · บรรทัดใบขอราคาผลิต 0159) ซึ่ง
  // break-glass ข้ามไม่ได้ · `materialForcePreview` ตอบ blocked:true ให้ตั้งแต่พรีวิว
  // เพื่อไม่ให้ไปพังกลางทางด้วย error ดิบจาก Postgres
  const force = isForceRequest(request);
  const dryRun = isDryRun(request);
  if (force || dryRun) {
    if (!canForceDelete(user)) {
      return Response.json({ error: 'บังคับลบต้องเป็นผู้ดูแลระบบ (admin)' }, { status: 403 });
    }
    const preview = await materialForcePreview(supabase, before);
    if (dryRun) return Response.json(preview);
    if (preview.blocked) {
      return Response.json({ error: preview.notes[0] }, { status: 409 });
    }
  } else {
    if (!canQuoteMaterial(user, before.kind) && !canEditDraft(user, before)) {
      return Response.json({ error: 'ไม่มีสิทธิ์ลบวัสดุนี้' }, { status: 403 });
    }
    // มีราคาแล้ว = เป็นประวัติของงานที่ผ่านมา ลบไม่ได้ (ซ่อนแทน)
    if ((before.revisions || []).length) {
      return Response.json({
        error: 'วัสดุนี้มีประวัติราคาแล้ว ลบไม่ได้ — ใช้ "เก็บเข้ากรุ" แทน',
      }, { status: 409 });
    }
    // ยังมีบรรทัดในใบขอราคาผลิตอ้างอยู่ = ลบแล้วใบจะชี้ไปที่ว่าง
    const { count, error: refError } = await supabase
      .from('costing_item_components')
      .select('id', { count: 'exact', head: true })
      .eq('materialId', id);
    if (refError) return Response.json({ error: refError.message }, { status: 500 });
    if (count) {
      return Response.json({
        error: `มีใบขอราคาผลิตอ้างวัสดุนี้อยู่ ${count} บรรทัด — ใช้ "เก็บเข้ากรุ" แทน`,
      }, { status: 409 });
    }
  }

  // ลูกทั้งหมดมี FK จริง (CASCADE ประวัติราคา / SET NULL ของเข้า) ตั้งแต่ migration
  // และวัสดุไม่มีเธรดกับไฟล์แนบของตัวเอง (ไม่อยู่ใน updateAccess/attachmentTypes)
  // → ลบตัวแม่พอ ไม่ต้องเก็บกวาดเพิ่ม
  const { error } = await supabase.from('material_prices').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await recordAudit({
    user, action: 'delete', entityType: 'material_price', entityId: id, before,
    summary: force
      ? `[admin force] ลบวัสดุ "${before.label}" (สถานะ ${before.status}, ${(before.revisions || []).length} รุ่นราคา)`
      : `ลบวัสดุร่าง "${before.label}"`,
    request,
  });
  return Response.json({ ok: true, forced: force });
}
