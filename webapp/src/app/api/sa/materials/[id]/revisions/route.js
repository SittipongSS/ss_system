// ── API ออกราคารุ่นใหม่ให้วัสดุในทะเบียน (mig 0157) ─────────────────────
// POST { tiers: [{ qty?, price }], validUntil?, note? }
//
// "แก้ราคา" = ออก rev ใหม่เสมอ (ราคาเดิมเก็บเป็นประวัติ) — ราคา 1 rev มีได้หลายชั้น
// จำนวน (ขอราคาต่อชิ้นที่ 1000/3000/5000 = คนละราคา)
//
// ⚠️ ด่านจริงอยู่ที่นี่: RD ใส่ราคา RM ได้, PC ใส่ราคา PM ได้, สลับกันไม่ได้
// (proxy ปล่อยผ่านทั้ง costing:quote และ costing:edit — มันไม่รู้ว่าวัสดุเป็นของฝ่ายไหน)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewCosting } from '@/lib/permissions';
import { canQuoteMaterial, normalizeTiers } from '@/lib/materialPrices';
import { acceptMaterial, appendMaterialRevision, findMaterial } from '@/lib/materialPricesAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findMaterial(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบวัสดุในทะเบียน' }, { status: 404 });
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!canQuoteMaterial(user, before.kind)) {
    return Response.json({
      error: `ไม่มีสิทธิ์ใส่ราคาวัสดุนี้ — เป็นของฝ่าย ${before.sourceDept}`,
    }, { status: 403 });
  }
  if (before.status === 'archived') {
    return Response.json({
      error: 'วัสดุนี้เก็บเข้ากรุแล้ว — นำกลับมาใช้งานก่อนจึงจะออกราคาได้',
    }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const { tiers, error } = normalizeTiers(body.tiers);
  if (error) return Response.json({ error }, { status: 400 });

  try {
    // ใส่ราคาให้วัสดุร่าง = รับเข้าทะเบียนไปในตัว (RD/PC ตอบราคาคือการรับของ)
    if (before.status === 'draft') await acceptMaterial(supabase, { materialId: id, user });

    const { revision } = await appendMaterialRevision(supabase, {
      materialId: id,
      kind: before.kind,
      tiers,
      validUntil: body.validUntil || null,
      note: body.note || null,
      askItemId: body.askItemId || null,
      user,
    });

    const after = await findMaterial(supabase, id);
    await recordAudit({
      user, action: 'update', entityType: 'material_price', entityId: id, before, after,
      summary: `ออกราคา "${before.label}" รุ่นที่ ${revision.revisionNo}`
        + (tiers.length > 1 ? ` (${tiers.length} ชั้นจำนวน)` : ''),
      request,
    });
    return Response.json(after, { status: 201 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
