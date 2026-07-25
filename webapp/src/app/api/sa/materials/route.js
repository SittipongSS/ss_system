// ── API คลังราคาวัสดุ — ค้นหา + แก้ราคา (mig 0143) ──────────────────────
// GET: ทุกคนที่เห็นระบบขอราคา (canViewCosting) — เซลดูราคาอ้างอิง, RD/PC ดูของฝ่ายตน
// POST (revise): RD/PC เพิ่มรุ่นราคาใหม่ให้วัสดุที่มีอยู่ (แก้ราคา = ออก rev ใหม่)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewCosting } from '@/lib/permissions';
import { canQuoteMaterial, normalizeQuotedPrice } from '@/lib/materialPrices';
import { appendMaterialRevision, loadMaterials } from '@/lib/materialPricesAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/sa/materials?kind=PM&includeHidden=1
// คืนทั้งคลัง (กรองชนิด/ซ่อนที่ server) — ชุดข้อมูลเล็ก การกรองลูกค้า/ค้นชื่อทำที่
// client เพื่อให้ bestPriceFor เลือกราคาทับรายลูกค้าได้ครบมือ
export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const url = new URL(request.url);
    const data = await loadMaterials(getSupabaseAdmin(), {
      kind: url.searchParams.get('kind') || null,
      includeHidden: url.searchParams.get('includeHidden') === '1',
    });
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/sa/materials/{materialId}/revise ทำผ่าน route ย่อย; ที่นี่รับ revise
// แบบระบุ materialId ใน body (แก้ราคาจากหน้าคลังตรง ๆ)
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json().catch(() => ({}));

  const { data: material } = await supabase
    .from('material_prices').select('*').eq('id', body.materialId).maybeSingle();
  if (!material) return Response.json({ error: 'ไม่พบวัสดุในคลัง' }, { status: 404 });
  if (!canQuoteMaterial(user, material.kind)) {
    return Response.json({
      error: `ไม่มีสิทธิ์แก้ราคาวัสดุนี้ — เป็นของฝ่าย ${material.sourceDept}`,
    }, { status: 403 });
  }

  const { value, error: priceError } = normalizeQuotedPrice(material.kind, body.price);
  if (priceError) return Response.json({ error: priceError }, { status: 400 });

  try {
    const { revision } = await appendMaterialRevision(supabase, {
      materialId: material.id,
      kind: material.kind,
      label: material.label,
      sourceDept: material.sourceDept,
      customerId: material.customerId,
      customerName: material.customerName,
      price: value,
      validUntil: body.validUntil || null,
      note: body.note || null,
      user,
    });
    await recordAudit({
      user, action: 'update', entityType: 'material_price', entityId: material.id,
      summary: `ปรับราคาวัสดุ "${material.label}" เป็นรุ่นที่ ${revision.revisionNo} (${value})`, request,
    });
    const [updated] = await loadMaterials(supabase, { includeHidden: true, kind: material.kind })
      .then((rows) => rows.filter((m) => m.id === material.id));
    return Response.json(updated);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
