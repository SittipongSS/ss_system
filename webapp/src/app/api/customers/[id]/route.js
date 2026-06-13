import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord, canEditRecord, canDeleteRecord } from '@/lib/permissions';
import { listForCustomer } from '@/lib/excise/registrations';

export const dynamic = 'force-dynamic';

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

  // The customer's registered products = its excise registrations (team-scoped).
  // Merge each with its master product so the detail UI can show spec/price.
  const regs = (await listForCustomer(id)).filter((r) => canViewRecord(user, 'registrations', r));
  const regProductIds = [...new Set(regs.map((r) => r.productId).filter(Boolean))];
  let productMap = new Map();
  if (regProductIds.length) {
    const { data: prods } = await supabase.from('products').select('*').in('id', regProductIds);
    productMap = new Map((prods || []).map((p) => [p.id, p]));
  }
  // Shape kept backward-compatible with the customer-detail page: product spec
  // fields from master + the registration's status/tax snapshot.
  const products = regs.map((r) => {
    const p = productMap.get(r.productId) || {};
    return {
      ...p,
      id: r.productId || p.id,
      registrationId: r.id,
      fgCode: r.fgCode ?? p.fgCode,
      productDescription: r.productName ?? p.productDescription,
      brandName: r.brandName ?? p.brandName,
      status: r.status,
      isExciseTaxable: r.isExciseTaxable,
      exciseTax: r.exciseTax,
      localTax: r.localTax,
    };
  });

  // Collect this customer's orders: direct link (orders.customerId) +
  // registrations of this customer referenced by any order line.
  const orderIds = new Set();
  const { data: directOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('customerId', id);
  (directOrders || []).forEach((o) => orderIds.add(o.id));

  const regIds = regs.map((r) => r.id);
  if (regIds.length) {
    const { data: itemRows } = await supabase
      .from('order_items')
      .select('orderId')
      .in('registrationId', regIds);
    (itemRows || []).forEach((r) => orderIds.add(r.orderId));
  }

  let orders = [];
  const ids = [...orderIds];
  if (ids.length) {
    const { data: ord } = await supabase
      .from('orders')
      .select('*, items:order_items(*, product:products(*), registration:excise_registrations(*))')
      .in('id', ids)
      .order('createdAt', { ascending: false });
    orders = (ord || []).filter((o) => canViewRecord(user, 'orders', o));
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
  for (const k of [
    'arCode', 'name', 'taxId', 'phone', 'address', 'brands', 'mapFileUrl',
    'contactPerson', 'contactPhone', 'email', 'creditTerms', 'jubiliId', 'metadata',  // master-data fields (0005, 0025)
    'team', 'ownerId',
  ]) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  updates.updatedAt = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Cascade name/taxId changes to this customer's excise registrations
  // (they snapshot the customer for display/history).
  const cascade = { customerName: updated.name, taxId: updated.taxId };
  await supabase.from('excise_registrations').update(cascade).eq('customerId', id);
  void oldName; void oldTaxId;

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

  // ข้อ 3: guard ก่อนลบ — กันไม่ให้เกิด record กำพร้า (live DB ไม่มี FK constraint จริง).
  // ถ้าลูกค้ารายนี้ยังถูกอ้างใน โปรเจกต์/ออเดอร์/การขึ้นทะเบียน → ห้ามลบ.
  const [projRef, orderRef, regRef] = await Promise.all([
    supabase.from('projects').select('id').eq('customerId', id),
    supabase.from('orders').select('id').eq('customerId', id),
    supabase.from('excise_registrations').select('id', { count: 'exact', head: true }).eq('customerId', id),
  ]);
  const refs = [];
  const projIds = (projRef.data || []).map((r) => r.id);
  const orderIds = (orderRef.data || []).map((r) => r.id);
  if (projIds.length) refs.push(`${projIds.length} โปรเจกต์ (${projIds.join(', ')})`);
  if (orderIds.length) refs.push(`${orderIds.length} ออเดอร์ (${orderIds.join(', ')})`);
  if (regRef.count) refs.push(`${regRef.count} การขึ้นทะเบียน`);
  if (refs.length) {
    return Response.json(
      { error: `ลบไม่ได้: ลูกค้ารายนี้ยังถูกใช้งานอยู่ใน ${refs.join(', ')} — กรุณาจัดการรายการเหล่านั้นก่อน` },
      { status: 409 },
    );
  }

  const { data, error } = await supabase.from('customers').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });
  }
  return Response.json({ success: true, message: 'ลบข้อมูลลูกค้าเรียบร้อยแล้ว' });
}
