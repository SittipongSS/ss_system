import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord, canEditRecord, canDeleteRecord } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
// GET /api/orders/[id]
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*, product:products(*))')
    .eq('id', id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });
  if (!canViewRecord(user, 'orders', data)) {
    return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });
  }
  return Response.json(data);
}

// PATCH /api/orders/[id] — PO-header / workflow fields only.
// Editing line items (qty/add/remove) is not supported in v1.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: order, error: findErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!order) return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });

  if (!canEditRecord(user, 'orders', order)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const updates = {};

  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === 'complete') updates.clearedAt = new Date().toISOString();
  }

  if (body.receiptNumber !== undefined) updates.receiptNumber = body.receiptNumber;
  if (body.exciseReceiptFileUrl !== undefined) updates.exciseReceiptFileUrl = body.exciseReceiptFileUrl;

  if (body.quotationRef !== undefined) updates.quotationRef = body.quotationRef;
  if (body.poReference !== undefined) updates.poReference = body.poReference;
  if (body.deliveryDate !== undefined) updates.deliveryDate = body.deliveryDate;
  if (body.remarks !== undefined) updates.remarks = body.remarks;
  if (body.assignee !== undefined) updates.assignee = body.assignee;

  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select('*, items:order_items(*, product:products(*))')
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// DELETE /api/orders/[id] — order_items cascade via FK on delete cascade.
// Scope: supervisor (any team) or senior_ae (own team). Orders already in the
// tax workflow (filed / has receipt / completed) may be deleted by supervisor
// only.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: order, error: findErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!order) return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });

  if (!canDeleteRecord(user, 'orders', order)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  // Tax-locked orders: supervisor only.
  const locked = order.receiptNumber || order.clearedAt || order.status === 'complete';
  if (locked && user?.role !== 'ae_supervisor') {
    return Response.json(
      { error: 'รายการนี้เข้าสู่ขั้นตอนภาษีแล้ว ต้องเป็นผู้ดูแลระบบจึงจะลบได้' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase.from('orders').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });
  return Response.json({ success: true, message: 'ลบใบสั่งซื้อเรียบร้อยแล้ว' });
}
