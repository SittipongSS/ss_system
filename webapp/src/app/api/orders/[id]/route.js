import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// GET /api/orders/[id]
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('orders')
    .select('*, product:products(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });
  return Response.json(data);
}

// PATCH /api/orders/[id]
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: order, error: findErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!order) return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });

  const body = await request.json();
  const updates = {};

  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === 'cleared') updates.clearedAt = new Date().toISOString();
  }

  if (body.quantity !== undefined) {
    const qty = parseInt(body.quantity);
    updates.quantity = qty;
    const { data: product } = await supabase
      .from('products')
      .select('exciseTax, localTax')
      .eq('id', order.productId)
      .maybeSingle();
    if (product) {
      updates.totalExciseTax = product.exciseTax * qty;
      updates.totalLocalTax = product.localTax * qty;
      updates.totalTax = updates.totalExciseTax + updates.totalLocalTax;
    }
  }

  if (body.quotationRef !== undefined) updates.quotationRef = body.quotationRef;
  if (body.deliveryDate !== undefined) updates.deliveryDate = body.deliveryDate;
  if (body.remarks !== undefined) updates.remarks = body.remarks;
  if (body.assignee !== undefined) updates.assignee = body.assignee;

  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// DELETE /api/orders/[id]
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('orders').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: 'ไม่พบใบสั่งซื้อนี้' }, { status: 404 });
  return Response.json({ success: true, message: 'ลบใบสั่งซื้อเรียบร้อยแล้ว' });
}
