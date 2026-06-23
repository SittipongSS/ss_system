import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { viewScope } from '@/lib/permissions';
import { ORDER_SELECT, attachRegistrations, insertOrderItems } from '@/lib/tax/orders';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const dynamic = 'force-dynamic';
export async function GET() {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  // A PO embeds its line items, each with the master product. Registrations are
  // joined in JS (no FK to embed) — see @/lib/tax/orders.
  let query = supabase
    .from('orders')
    .select(ORDER_SELECT)
    .order('createdAt', { ascending: false });
  // Team-scoped roles only see their own team's orders; 'all' sees everything.
  if (viewScope(user?.role) === 'team') query = query.eq('team', user?.team ?? null);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await attachRegistrations(supabase, data);
  return Response.json(data);
}

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();

  // Accept the multi-item shape: { quotationRef, poReference, deliveryDate,
  // remarks, assignee, items: [{ registrationId, quantity }] }. A line refers
  // to an approved excise registration (binds product + customer + tax).
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return Response.json({ error: 'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
  }

  // One quotation = one customer. customerId is required for new orders.
  if (!body.customerId) {
    return Response.json({ error: 'กรุณาเลือกลูกค้า' }, { status: 400 });
  }
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', body.customerId)
    .maybeSingle();
  if (custErr) return Response.json({ error: custErr.message }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบลูกค้าที่เลือก' }, { status: 404 });

  // Fetch all referenced registrations in one query.
  const regIds = [...new Set(items.map((it) => it.registrationId).filter(Boolean))];
  const { data: regs, error: regErr } = await supabase
    .from('excise_registrations')
    .select('*')
    .in('id', regIds);
  if (regErr) return Response.json({ error: regErr.message }, { status: 500 });
  const regMap = new Map((regs || []).map((r) => [r.id, r]));

  // Every line's registration must be APPROVED and belong to this customer.
  for (const r of regMap.values()) {
    if (r.customerId !== customer.id) {
      return Response.json({ error: `ทะเบียน ${r.fgCode} ไม่ใช่ของลูกค้า ${customer.name}` }, { status: 400 });
    }
    if (r.status !== 'approved') {
      return Response.json({ error: `ทะเบียน ${r.fgCode} ยังไม่ได้รับการอนุมัติ` }, { status: 400 });
    }
  }

  const orderId = 'PO-' + Date.now().toString().slice(-6);

  // Build line items + accumulate rollup totals (tax from the registration).
  let totalExciseTax = 0;
  let totalLocalTax = 0;
  const itemRows = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const reg = regMap.get(it.registrationId);
    if (!reg) return Response.json({ error: `ไม่พบทะเบียน ${it.registrationId}` }, { status: 404 });
    const qty = parseInt(it.quantity);
    if (!qty || qty < 1) return Response.json({ error: 'จำนวนต้องมากกว่า 0' }, { status: 400 });
    // Per-unit tax rounded to 2 decimals, THEN × qty — so ภาษี/ชิ้น × จำนวน
    // reconciles with the line total everywhere (form, bill, reports).
    const excisePer = r2(reg.exciseTax);
    const localPer = r2(reg.localTax);
    const itemExcise = r2(excisePer * qty);
    const itemLocal = r2(localPer * qty);
    totalExciseTax += itemExcise;
    totalLocalTax += itemLocal;
    itemRows.push({
      id: `OIT-${orderId.slice(3)}-${i + 1}`,
      orderId,
      registrationId: reg.id,
      productId: reg.productId,
      quantity: qty,
      salePrice: it.salePrice != null && it.salePrice !== '' ? Number(it.salePrice) : null,
      exciseRatePerUnit: excisePer,
      localTaxRatePerUnit: localPer,
      totalExciseTax: itemExcise,
      totalLocalTax: itemLocal,
      totalTax: itemExcise + itemLocal,
    });
  }
  const totalTax = totalExciseTax + totalLocalTax;

  const newOrder = {
    id: orderId,
    customerId: customer.id,
    customerName: customer.name,
    customerTaxId: customer.taxId,
    quotationRef: body.quotationRef || '-',
    poReference: body.poReference || null,
    deliveryDate: body.deliveryDate || '-',
    remarks: body.remarks || '-',
    assignee: body.assignee || user?.name || 'Sales',
    team: user?.team ?? null,
    ownerId: user?.id ?? null,
    totalExciseTax,
    totalLocalTax,
    totalTax,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const { error: orderErr } = await supabase.from('orders').insert(newOrder);
  if (orderErr) return Response.json({ error: orderErr.message }, { status: 500 });

  const { error: itemsErr } = await insertOrderItems(supabase, itemRows);
  if (itemsErr) {
    // Roll back the header so we don't leave an order with no items.
    await supabase.from('orders').delete().eq('id', orderId);
    return Response.json({ error: itemsErr.message }, { status: 500 });
  }

  // Return the full PO with its items embedded. Registrations have no FK, so
  // attach them in JS (see @/lib/tax/orders) rather than a PostgREST embed.
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await attachRegistrations(supabase, data);
  return Response.json(data, { status: 201 });
}
