import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export async function GET() {
  const supabase = getSupabaseAdmin();
  // A PO embeds its line items, each with the related product.
  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*, product:products(*))')
    .order('createdAt', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  // Accept the new multi-item shape: { quotationRef, poReference, deliveryDate,
  // remarks, assignee, items: [{ productId, quantity }] }.
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return Response.json({ error: 'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
  }

  // Fetch all referenced products in one query.
  const productIds = [...new Set(items.map((it) => it.productId).filter(Boolean))];
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('*')
    .in('id', productIds);
  if (prodErr) return Response.json({ error: prodErr.message }, { status: 500 });
  const productMap = new Map((products || []).map((p) => [p.id, p]));

  const orderId = 'PO-' + Date.now().toString().slice(-6);

  // Build line items + accumulate rollup totals.
  let totalExciseTax = 0;
  let totalLocalTax = 0;
  const itemRows = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const product = productMap.get(it.productId);
    if (!product) return Response.json({ error: `ไม่พบสินค้า ${it.productId}` }, { status: 404 });
    const qty = parseInt(it.quantity);
    if (!qty || qty < 1) return Response.json({ error: 'จำนวนต้องมากกว่า 0' }, { status: 400 });
    const itemExcise = (product.exciseTax || 0) * qty;
    const itemLocal = (product.localTax || 0) * qty;
    totalExciseTax += itemExcise;
    totalLocalTax += itemLocal;
    itemRows.push({
      id: `OIT-${orderId.slice(3)}-${i + 1}`,
      orderId,
      productId: it.productId,
      quantity: qty,
      totalExciseTax: itemExcise,
      totalLocalTax: itemLocal,
      totalTax: itemExcise + itemLocal,
    });
  }
  const totalTax = totalExciseTax + totalLocalTax;

  const newOrder = {
    id: orderId,
    quotationRef: body.quotationRef || '-',
    poReference: body.poReference || null,
    deliveryDate: body.deliveryDate || '-',
    remarks: body.remarks || '-',
    assignee: body.assignee || 'Sales',
    totalExciseTax,
    totalLocalTax,
    totalTax,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const { error: orderErr } = await supabase.from('orders').insert(newOrder);
  if (orderErr) return Response.json({ error: orderErr.message }, { status: 500 });

  const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
  if (itemsErr) {
    // Roll back the header so we don't leave an order with no items.
    await supabase.from('orders').delete().eq('id', orderId);
    return Response.json({ error: itemsErr.message }, { status: 500 });
  }

  // Return the full PO with its items embedded.
  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*, product:products(*))')
    .eq('id', orderId)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
