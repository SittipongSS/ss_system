import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { caretakerTeamsOf, viewScopeUser } from '@/lib/permissions';
import { ORDER_SELECT, attachRegistrations, insertOrder, insertOrderItems } from '@/lib/tax/orders';
import { billedTaxTotals, exciseTaxLineForRegistration, exciseTaxTotals } from '@/lib/tax/exciseBilling';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// ?slim=1 — โหมดประหยัด traffic สำหรับจอที่ใช้แค่ตัวเลขสรุป/คิวงาน (เช่น /tax
// command center): เลือกเฉพาะคอลัมน์ที่ใช้จริง + นับจำนวนรายการแทนการฝัง
// order_items ทั้งแถวพร้อม master product เต็มตัว และไม่ join registrations เลย.
// โหมดเต็ม (ไม่ส่ง param) พฤติกรรมเดิมทุกประการ.
const ORDER_SELECT_SLIM =
  'id, status, createdAt, totalTax, quotationRef, customerName, rejectionReason, team, items:order_items(count)';

export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const slim = new URL(request.url).searchParams.get('slim') === '1';

  // A PO embeds its line items, each with the master product. Registrations are
  // joined in JS (no FK to embed) — see @/lib/tax/orders.
  let query = supabase
    .from('orders')
    .select(slim ? ORDER_SELECT_SLIM : ORDER_SELECT)
    .order('createdAt', { ascending: false });
  // Team-scoped roles only see their own team's orders; 'all' sees everything.
  // ใบยื่นที่ไม่มีทีม (team = null) เป็น "ของกลาง" ทุกทีมเห็น — กฎเดียวกับ /api/customers
  // GET · เดิม `.eq('team', user?.team ?? null)` พลาดสองชั้น: (1) ซ่อนแถว team = null จาก
  // **ทุกทีม** ซึ่งเกิดทุกครั้งที่คนไม่มีทีม (admin/legal/staff — prod มี 10 บัญชี) เป็นคน
  // สร้าง เพราะ POST ตรึง team = user.team · (2) คนที่ scope 'team' แต่ไม่มีทีมจะได้
  // `team=eq.null` ซึ่ง PostgREST แปลเป็น `= NULL` = ไม่มีอะไรตรงเลย → 0 แถว (ต้อง is.null)
  // → scope ไม่ได้ ก็แสดงทั้งหมด
  if (viewScopeUser(user) === 'team' && user?.team) {
    query = query.or(`team.eq.${user.team},team.is.null`);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (slim) {
    // count embed คืน items: [{ count: n }] — แปลงเป็น itemCount ตัวเลขเดียว
    return Response.json((data || []).map(({ items, ...row }) => ({ ...row, itemCount: items?.[0]?.count ?? 0 })));
  }
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

  // Duplicate quotation = hard block (เลขที่ใบเสนอราคา ห้ามซ้ำ). One quotation =
  // one filing. The '-' placeholder (legacy / blank) is exempt from the check.
  const quotationRef = (body.quotationRef || '').trim();
  if (quotationRef && quotationRef !== '-') {
    const { data: dupQuote, error: dupQuoteError } = await supabase
      .from('orders').select('id').eq('quotationRef', quotationRef).maybeSingle();
    if (dupQuoteError) return Response.json({ error: dupQuoteError.message }, { status: 500 });
    if (dupQuote) {
      return Response.json({ error: `เลขที่ใบเสนอราคานี้ถูกใช้แล้วในใบยื่น ${dupQuote.id} — ห้ามซ้ำ` }, { status: 409 });
    }
  }

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

  // อัตราภาษีมาจาก **สินค้า** (ราคาขายปลีกของ FG) ไม่ใช่ snapshot บนทะเบียน — ทะเบียน
  // ทำหน้าที่เป็นหลักฐานว่า FG นี้ขึ้นทะเบียนให้ลูกค้ารายนี้แล้ว ส่วนตัวเลขอ่านจากแหล่งเดียว
  // กับทางที่ออกใบยื่นจาก Sale Order (มติผู้ใช้ 2026-07-29)
  const productIds = [...new Set([...regMap.values()].map((r) => r.productId).filter(Boolean))];
  const { data: taxProducts, error: taxProdErr } = productIds.length
    ? await supabase.from('products').select('id, fgCode, exciseTax, localTax').in('id', productIds)
    : { data: [], error: null };
  if (taxProdErr) return Response.json({ error: taxProdErr.message }, { status: 500 });
  const productMap = new Map((taxProducts || []).map((p) => [p.id, p]));

  const orderId = 'PO-' + Date.now().toString().slice(-6);

  // ทีมของใบยื่น: ปกติคือทีมของคนกด แต่คนที่ไม่มีทีม (admin/legal/staff) กดสร้างได้ด้วย
  // — เดิมใบนั้นจะได้ team = null แล้วหายจากลิสต์ของทุกทีม จึงถอยไปใช้ทีมที่ดูแลลูกค้า
  // เจ้าของใบแทน · เอาเฉพาะกรณีลูกค้ามีทีมดูแล **ทีมเดียว**: หลายทีมแปลว่าเดาไม่ได้ว่า
  // ใบนี้เป็นของใคร ปล่อย null (= ของกลาง ทุกทีมเห็น) ดีกว่าตรึงผิดทีมแล้วทีมจริงมองไม่เห็น
  const caretakerTeams = caretakerTeamsOf(customer);
  const orderTeam = user?.team ?? (caretakerTeams.length === 1 ? caretakerTeams[0] : null);

  // Build line items + accumulate rollup totals.
  const itemRows = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const reg = regMap.get(it.registrationId);
    if (!reg) return Response.json({ error: `ไม่พบทะเบียน ${it.registrationId}` }, { status: 404 });
    const qty = parseInt(it.quantity);
    if (!qty || qty < 1) return Response.json({ error: 'จำนวนต้องมากกว่า 0' }, { status: 400 });
    // สินค้าหาย = คิดภาษีไม่ได้ · เด้งดีกว่าถอยไปใช้ snapshot เก่าบนทะเบียนเงียบ ๆ
    // แล้วได้ใบที่ตัวเลขไม่ตรงกับทางที่ออกจาก Sale Order
    const product = productMap.get(reg.productId);
    if (!product) {
      return Response.json({ error: `ไม่พบสินค้าของทะเบียน ${reg.fgCode || reg.id} — คิดอัตราภาษีไม่ได้` }, { status: 400 });
    }
    const taxLine = exciseTaxLineForRegistration({ registration: reg, product, quantity: qty });
    itemRows.push({
      id: `OIT-${orderId.slice(3)}-${i + 1}`,
      orderId,
      registrationId: reg.id,
      productId: reg.productId,
      salePrice: it.salePrice != null && it.salePrice !== '' ? Number(it.salePrice) : null,
      ...taxLine,
    });
  }
  const rollup = exciseTaxTotals(itemRows);
  const totalExciseTax = rollup.totalExciseTax;
  const totalLocalTax = rollup.totalLocalTax;
  const totalTax = rollup.totalTax;

  const newOrder = {
    id: orderId,
    customerId: customer.id,
    customerName: customer.name,
    customerTaxId: customer.taxId,
    // ตรึงที่อยู่ลงใบ (mig 0167) — เอกสารต้องพิมพ์เหมือนกันไม่ว่าใครกด
    customerAddress: customer.address || null,
    quotationRef: quotationRef || '-',
    poReference: body.poReference || null,
    deliveryDate: body.deliveryDate || '-',
    remarks: body.remarks || '-',
    assignee: body.assignee || user?.name || 'Sales',
    team: orderTeam,
    ownerId: user?.id ?? null,
    totalExciseTax,
    totalLocalTax,
    totalTax,
    // ยอดที่เรียกเก็บจากลูกค้า = ค่าภาษี + VAT 7% (มติผู้ใช้ 2026-07-26) สูตรเดียว
    // กับเอกสารที่พิมพ์ — เดิมทางนี้ไม่เคยเก็บค่านี้เลย จอจึงตกไปโชว์ยอดก่อน VAT
    amountToCollect: billedTaxTotals(itemRows).amountToCollect,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const { error: orderErr } = await insertOrder(supabase, newOrder);
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
  // Audit เก็บ header แบบ plain (newOrder ที่เพิ่ง insert) — ไม่ฝัง items/registrations
  // ที่ ORDER_SELECT ดึงมา (ของจริงอยู่ในตาราง order_items แล้ว ไม่เก็บซ้ำใน log).
  await recordAudit({ user, action: 'create', entityType: 'order', entityId: orderId, after: newOrder, request });
  return Response.json(data, { status: 201 });
}
