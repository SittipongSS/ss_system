import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord, canEditRecord, canDeleteRecord } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
// Products are linked to a customer by matching name OR taxId (denormalized,
// same as the original logic). We run two queries and merge to avoid issues
// with commas/special chars in PostgREST `.or()` filter strings.
async function findLinkedProducts(supabase, customer) {
  // Run both lookups in parallel — they're independent, so awaiting them
  // sequentially just doubles the DB round-trip latency.
  const [byNameRes, byTaxRes] = await Promise.all([
    customer.name
      ? supabase.from('products').select('*').eq('customerName', customer.name)
      : Promise.resolve({ data: [] }),
    customer.taxId
      ? supabase.from('products').select('*').eq('taxId', customer.taxId)
      : Promise.resolve({ data: [] }),
  ]);
  const byName = byNameRes.data || [];
  const byTax = byTaxRes.data || [];
  const map = new Map();
  for (const p of [...byName, ...byTax]) map.set(p.id, p);
  return [...map.values()];
}

// GET /api/customers/[id]
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });

  // Customer is viewable by all, but only show linked products/orders the
  // viewer is allowed to see (team scope).
  const products = (await findLinkedProducts(supabase, customer)).filter((p) =>
    canViewRecord(user, 'products', p)
  );
  const productIds = products.map((p) => p.id);

  let orders = [];
  if (productIds.length) {
    // PO -> items -> products. Find the line items referencing this customer's
    // products, then fetch the distinct parent POs with all items embedded.
    const { data: itemRows } = await supabase
      .from('order_items')
      .select('orderId')
      .in('productId', productIds);
    const orderIds = [...new Set((itemRows || []).map((r) => r.orderId))];
    if (orderIds.length) {
      const { data: ord } = await supabase
        .from('orders')
        .select('*, items:order_items(*, product:products(*))')
        .in('id', orderIds)
        .order('createdAt', { ascending: false });
      orders = (ord || []).filter((o) => canViewRecord(user, 'orders', o));
    }
  }

  return Response.json({ customer, products, orders });
}

// PATCH /api/customers/[id]
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: customer, error: findErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });

  if (!canEditRecord(user, 'customers', customer)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();

  if (body.arCode && body.arCode !== customer.arCode) {
    const { data: dup } = await supabase
      .from('customers')
      .select('id')
      .eq('arCode', body.arCode)
      .maybeSingle();
    if (dup) return Response.json({ error: 'รหัสลูกค้านี้มีในระบบแล้ว' }, { status: 409 });
  }

  const oldName = customer.name;
  const oldTaxId = customer.taxId;

  const updates = {};
  // 'team'/'ownerId' allow transferring a customer to another team (gated above
  // by canEditRecord — supervisor cross-team, team roles within their scope).
  for (const k of ['arCode', 'name', 'taxId', 'phone', 'address', 'brands', 'mapFileUrl', 'team', 'ownerId']) {
    if (body[k] !== undefined) updates[k] = body[k];
  }

  const { data: updated, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Cascade name/taxId changes to linked products
  const cascade = { customerName: updated.name, taxId: updated.taxId };
  if (oldName) await supabase.from('products').update(cascade).eq('customerName', oldName);
  if (oldTaxId) await supabase.from('products').update(cascade).eq('taxId', oldTaxId);

  return Response.json(updated);
}

// DELETE /api/customers/[id] — supervisor only (enforced here + by proxy cap).
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: customer, error: findErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });
  if (!canDeleteRecord(user, 'customers', customer)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase.from('customers').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });
  }
  return Response.json({ success: true, message: 'ลบข้อมูลลูกค้าเรียบร้อยแล้ว' });
}
