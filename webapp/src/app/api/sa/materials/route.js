// ── API ทะเบียนวัสดุ (mig 0143 + 0157) — ค้นหา + เพิ่มวัสดุ ─────────────
// GET  : ทุกคนที่เห็นระบบขอราคา (canViewCosting) — เซลดูราคาอ้างอิง, RD/PC ดูของฝ่ายตน
// POST : เพิ่มวัสดุเข้าทะเบียน — เซล (costing:edit) ได้เป็น "ร่าง" รอ RD/PC รับ;
//        RD/PC (canQuoteMaterial ของชนิดนั้น) ได้เป็น "ใช้งาน" และใส่ราคา rev.1 ได้เลย
//        ⚠️ ด่านจริงอยู่ที่นี่ — proxy เห็นแค่ role ไม่รู้ว่าวัสดุเป็นของฝ่ายไหน
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canUser, canViewCosting } from '@/lib/permissions';
import {
  canQuoteMaterial, normalizeMaterialInput, normalizeTiers,
} from '@/lib/materialPrices';
import { appendMaterialRevision, ensureMaterial, loadMaterials } from '@/lib/materialPricesAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/sa/materials?kind=PM&status=active,draft&customerId=CUS-1
// ชุดข้อมูลเล็ก — การค้นชื่อ/กรองประเภททำที่ client เพื่อให้ bestPriceFor เลือก
// ราคาทับรายลูกค้าได้ครบมือ
export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const data = await loadMaterials(getSupabaseAdmin(), {
      kind: url.searchParams.get('kind') || null,
      // ไม่ระบุ = ทุกสถานะ (หน้าทะเบียนกรองเอง) · 'active' = เฉพาะที่ใช้ได้จริง
      status: statusParam ? statusParam.split(',').filter(Boolean) : null,
    });
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/sa/materials
// { kind, label, customerId?, customerName?, formulaCode?, formulaName?, pmType?,
//   supplierNote?, tiers?: [{ qty?, price }], validUntil?, note? }
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { value, error } = normalizeMaterialInput(body);
  if (error) return Response.json({ error }, { status: 400 });

  const owner = canQuoteMaterial(user, value.kind);
  if (!owner && !canUser(user, 'costing:edit')) {
    return Response.json({ error: 'ไม่มีสิทธิ์เพิ่มวัสดุ' }, { status: 403 });
  }

  // คนใส่ราคาคือ RD/PC เท่านั้นเสมอ — เซลเสนอได้แต่ตัววัสดุ
  const wantsPrice = Array.isArray(body.tiers) && body.tiers.length > 0;
  if (wantsPrice && !owner) {
    return Response.json({
      error: `ไม่มีสิทธิ์ใส่ราคาวัสดุชนิดนี้ — เป็นของฝ่าย ${value.sourceDept}`,
    }, { status: 403 });
  }
  let tiers = null;
  if (wantsPrice) {
    const parsed = normalizeTiers(body.tiers);
    if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });
    tiers = parsed.tiers;
  }

  try {
    const { material, created } = await ensureMaterial(supabase, {
      ...value,
      pmType: body.pmType,
      status: owner ? 'active' : 'draft',
      user,
    });
    if (!created) {
      return Response.json({
        error: `มีวัสดุชื่อนี้ในทะเบียนอยู่แล้ว — แก้ราคาที่ตัวเดิมแทน`,
        materialId: material.id,
      }, { status: 409 });
    }

    if (tiers) {
      await appendMaterialRevision(supabase, {
        materialId: material.id,
        kind: material.kind,
        tiers,
        validUntil: body.validUntil || null,
        note: body.note || null,
        user,
      });
    }

    const after = await loadMaterials(supabase, { status: null })
      .then((rows) => rows.find((m) => m.id === material.id) || material);
    await recordAudit({
      user, action: 'create', entityType: 'material_price', entityId: material.id, after,
      summary: owner
        ? `เพิ่มวัสดุ "${material.label}" เข้าทะเบียน${tiers ? ` พร้อมราคา ${tiers.length} ชั้น` : ''}`
        : `เสนอวัสดุ "${material.label}" เข้าทะเบียน (ร่าง รอ ${value.sourceDept} รับ)`,
      request,
    });
    return Response.json(after, { status: 201 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
