// RD/PC ตอบราคาบรรทัดในใบขอราคาวัสดุ → สร้างรุ่นราคาในคลัง (mig 0143)
//
// ตอบที่เดียว ราคาเข้าคลังเลย: คลังโตเองจากการถาม-ตอบ ไม่มีใครกรอกคลังมือ
// ด่านสำคัญ: proxy เห็นแค่ role — ฝ่ายเจ้าของบรรทัดต้องเช็ครายบรรทัดที่นี่
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewCosting } from '@/lib/permissions';
import { canQuoteMaterial, normalizeQuotedPrice } from '@/lib/materialPrices';
import { appendMaterialRevision, findMaterialRequest } from '@/lib/materialPricesAdmin';
import { chatCard, sendChat } from '@/lib/chat';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findMaterialRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคาวัสดุ' }, { status: 404 });
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (before.status !== 'pending' && before.status !== 'answered') {
    return Response.json({ error: 'ใบนี้ไม่อยู่ในขั้นตอนที่ตอบราคาได้' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const entries = Array.isArray(body.prices) ? body.prices : [];
  if (!entries.length) return Response.json({ error: 'ไม่มีราคาที่จะบันทึก' }, { status: 400 });

  const itemsById = new Map((before.items || []).map((i) => [i.id, i]));

  // ตรวจทั้งชุดก่อนเขียน
  const validated = [];
  for (const entry of entries) {
    const item = itemsById.get(entry?.itemId);
    if (!item) return Response.json({ error: 'ไม่พบบรรทัดที่ระบุ' }, { status: 404 });
    if (!canQuoteMaterial(user, item.kind)) {
      return Response.json({
        error: `ไม่มีสิทธิ์ตอบราคา "${item.label}" — เป็นของฝ่าย ${item.sourceDept}`,
      }, { status: 403 });
    }
    const { value, error } = normalizeQuotedPrice(item.kind, entry.price);
    if (error) return Response.json({ error: `บรรทัด "${item.label}": ${error}` }, { status: 400 });
    validated.push({ item, price: value });
  }

  const nowIso = new Date().toISOString();
  for (const { item, price } of validated) {
    // สร้าง/หาวัสดุในคลัง + เพิ่มรุ่นราคา — ราคาเฉพาะลูกค้าถ้าใบระบุลูกค้า
    const { revision } = await appendMaterialRevision(supabase, {
      materialId: item.materialId || null,
      kind: item.kind,
      label: item.label,
      sourceDept: item.sourceDept,
      customerId: before.customerId || null,
      customerName: before.customerName || null,
      price,
      sourceRequestId: id,
      user,
    });
    const { error } = await supabase.from('material_price_request_items').update({
      materialId: revision.materialId,
      answeredRevisionId: revision.id,
      priceStatus: 'quoted',
      updatedAt: nowIso,
    }).eq('id', item.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // ทุกบรรทัดตอบครบ → ใบเป็น answered
  const afterItems = await findMaterialRequest(supabase, id);
  const allQuoted = (afterItems.items || []).every((i) => i.priceStatus === 'quoted');
  if (allQuoted && afterItems.status !== 'answered') {
    await supabase.from('material_price_requests')
      .update({ status: 'answered', updatedAt: nowIso }).eq('id', id);
  }

  const after = await findMaterialRequest(supabase, id);
  await recordAudit({
    user, action: 'update', entityType: 'material_price_request', entityId: id, before, after,
    summary: `ตอบราคาวัสดุ ${validated.length} รายการในใบ ${after.docNo || id}`, request,
  });

  if (allQuoted && afterItems.status !== 'answered') {
    sendChat('sales', chatCard({
      title: `ราคาวัสดุครบแล้ว ${after.docNo || ''}`,
      subtitle: after.customerName || 'ราคากลาง',
      rows: [{ label: 'ผู้ขอ', value: after.requestedByName || '' }],
      linkPath: `/sa/materials/requests/${id}`,
      linkLabel: 'เปิดใบขอราคาวัสดุ',
    }));
  }
  return Response.json(after);
}
