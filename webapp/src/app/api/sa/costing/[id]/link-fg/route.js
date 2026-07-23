// ผูกสินค้า (FG) เข้ารายการในใบขอราคาผลิตทีหลัง (มติ 2026-07-23)
//
// "ไปต่อ" = เซลกดขึ้นทะเบียน FG (หรือเลือก FG เดิม) แล้วผูกกลับรายการ — รหัส FG
// เกิดเฉพาะของที่ไปต่อจริง. snapshot สูตรจากสินค้า (mig 0112) ลงรายการตอนนี้
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { canEditCostingRequest } from '@/lib/costing';
import { findCostingRequest } from '@/lib/costingAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;
  if (!can(user?.role, 'costing:edit')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const before = await findCostingRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });
  // ผูก FG ได้แม้ใบอนุมัติแล้ว (นั่นคือจังหวะ "ไปต่อ") — จึงไม่ใช้ canEditCostingRequest
  // ที่ปิดตายหลังอนุมัติ; ใช้ scope เจ้าของใบเอง
  const canOwn = canEditCostingRequest(user, before)
    || ['approved', 'linked'].includes(before.status);
  if (!canOwn) return Response.json({ error: 'ไม่มีสิทธิ์แก้ใบนี้' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const item = (before.items || []).find((i) => i.id === body.itemId);
  if (!item) return Response.json({ error: 'ไม่พบรายการสินค้า' }, { status: 404 });
  if (item.productId) return Response.json({ error: 'รายการนี้ผูกสินค้าไว้แล้ว' }, { status: 409 });

  const { data: product } = await supabase
    .from('products').select('id, fgCode, customerId, formulaName, formulaCode, formulaDate')
    .eq('id', body.productId).maybeSingle();
  if (!product) return Response.json({ error: 'ไม่พบสินค้าที่เลือก' }, { status: 404 });

  // สินค้าต้องเป็นของลูกค้าเดียวกับใบ (ถ้าใบผูกลูกค้าไว้) — กันผูกข้ามลูกค้า
  if (before.customerId && product.customerId !== before.customerId) {
    return Response.json({ error: `สินค้า ${product.fgCode} ไม่ใช่ของลูกค้าเจ้าของใบนี้` }, { status: 409 });
  }

  const { error } = await supabase.from('costing_request_items').update({
    productId: product.id,
    formulaName: product.formulaName ?? null,
    formulaCode: product.formulaCode ?? null,
    formulaDate: product.formulaDate ?? null,
    updatedAt: new Date().toISOString(),
  }).eq('id', item.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const after = await findCostingRequest(supabase, id);
  await recordAudit({
    user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
    summary: `ผูกสินค้า ${product.fgCode} เข้ารายการ "${item.productLabel}" ในใบ ${before.docNo || id}`, request,
  });
  return Response.json(after);
}
