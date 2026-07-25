// RD/PC ยืนยันราคาบรรทัดที่เกินอายุในใบขอราคาผลิต (costing:quote)
//
// เกิดเมื่อเซลดึงราคาจากคลังแล้วราคาเกินอายุ → บรรทัดติดธง confirmStatus='pending'
// RD/PC เปิดใบมายืนยัน (ราคาเดิม) หรือแก้ (ราคาใหม่) → สร้าง rev ใหม่ในคลัง
// (ต่ออายุให้งานถัดไปด้วย) + refresh snapshot บนบรรทัด เป็น priceSource='confirmed'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewCosting } from '@/lib/permissions';
import { canQuoteMaterial, normalizeQuotedPrice } from '@/lib/materialPrices';
import { componentFillFromRevision } from '@/lib/costingLibrary';
import { findCostingRequest } from '@/lib/costingAdmin';
import { appendMaterialRevision } from '@/lib/materialPricesAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findCostingRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const component = (before.items || [])
    .flatMap((i) => i.components || []).find((c) => c.id === body.componentId);
  if (!component) return Response.json({ error: 'ไม่พบบรรทัดที่ระบุ' }, { status: 404 });
  if (component.confirmStatus !== 'pending') {
    return Response.json({ error: 'บรรทัดนี้ไม่ได้รอยืนยันราคา' }, { status: 409 });
  }
  if (!canQuoteMaterial(user, component.kind)) {
    return Response.json({
      error: `ไม่มีสิทธิ์ยืนยันราคา "${component.label}" — เป็นของฝ่าย ${component.sourceDept}`,
    }, { status: 403 });
  }

  // ราคาที่ยืนยัน: ส่ง price มา = แก้เป็นราคาใหม่; ไม่ส่ง = ยืนยันราคาเดิมบนบรรทัด
  const currentPrice = component.unitBasis === 'per_kg' ? component.pricePerKg : component.pricePerUnit;
  const rawPrice = body.price == null || body.price === '' ? currentPrice : body.price;
  const { value, error: priceError } = normalizeQuotedPrice(component.kind, rawPrice);
  if (priceError) return Response.json({ error: priceError }, { status: 400 });

  // ออก rev ใหม่ในคลัง (ต่ออายุ) — ผูกวัสดุเดิมถ้าบรรทัดเคยอ้างไว้
  const { revision } = await appendMaterialRevision(supabase, {
    materialId: component.materialId || null,
    kind: component.kind,
    label: component.label,
    sourceDept: component.sourceDept,
    customerId: before.customerId || null,
    customerName: before.customerName || null,
    price: value,
    note: `ยืนยันจากใบขอราคาผลิต ${before.docNo || id}`,
    user,
  });

  // refresh snapshot บนบรรทัดให้ตรง rev ที่เพิ่งยืนยัน + ปลดธงรอยืนยัน
  const nowIso = new Date().toISOString();
  const fill = componentFillFromRevision(revision, { confirmed: true });
  const { error } = await supabase.from('costing_item_components').update({
    ...fill,
    quotedById: user?.id ?? null,
    quotedByName: user?.name ?? null,
    quotedAt: nowIso,
    updatedAt: nowIso,
  }).eq('id', component.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const after = await findCostingRequest(supabase, id);
  await recordAudit({
    user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
    summary: `ยืนยันราคาวัสดุ "${component.label}" (${value}) ในใบ ${after.docNo || id} → คลัง rev.${revision.revisionNo}`,
    request,
  });
  return Response.json(after);
}
