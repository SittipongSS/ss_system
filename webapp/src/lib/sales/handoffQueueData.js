// ตัวโหลดข้อมูลคิว "รอยต่อเอกสาร" — ใช้ร่วมกันระหว่างแดชบอร์ดส่วนตัว (my-dashboard)
// กับการ์ดสรุปเช้าเข้า Google Chat (cron/daily-digest) เพื่อให้สองที่นับด้วยข้อมูล
// ชุดเดียวกัน. ตรรกะการตัดสินอยู่ใน lib/sales/handoffQueue.js (บริสุทธิ์ + มีเทสต์)
// ไฟล์นี้ทำแค่ "ไปเอาข้อมูลมาให้ครบ" เท่านั้น
//
// รับ supabase client มาเป็นพารามิเตอร์ (ไม่ import เอง) — my-dashboard ส่งตัวที่ผูก
// สิทธิ์ผู้ใช้มา ส่วน cron ส่ง service-role มา
import { resolveSoFiling } from '@/lib/excise/soFiling';
import { quotesAwaitingSalesOrder, salesOrdersAwaitingFiling } from '@/lib/sales/handoffQueue';

const LIST_CAP = 100;

const raise = (label, error) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

// ใบเสนอราคา Won ที่ยังไม่มี Sale Order ที่ใช้งานอยู่
// dealIds = null → ทั้งระบบ (การ์ดสรุปเช้า) · array → เฉพาะดีลชุดนั้น (แดชบอร์ดของฉัน)
async function loadAwaitingSalesOrder(supabase, dealIds) {
  let query = supabase
    .from('quotations')
    .select('id, quoteNumber, customerName, dealId, totalAmount, acceptedAt')
    .eq('status', 'accepted');
  if (dealIds) query = query.in('dealId', dealIds);
  const { data: quotations, error } = await query;
  raise('โหลดใบเสนอราคา Won ไม่สำเร็จ', error);
  if (!quotations?.length) return [];

  // ต้องดึง SO ของใบเหล่านี้ "ทุกสถานะ" — ตัวที่ยกเลิก/ถูกแทนที่ไม่กันคิว แต่จะรู้ว่า
  // ไม่กันได้ก็ต่อเมื่อเห็นมัน (ดูนิยาม isLiveSalesOrder ที่ผูกกับ migration 0169)
  const { data: salesOrders, error: orderError } = await supabase
    .from('sales_orders')
    .select('id, quotationId, status, supersededById')
    .in('quotationId', quotations.map((quote) => quote.id));
  raise('โหลด Sale Order ของใบเสนอราคาไม่สำเร็จ', orderError);

  return quotesAwaitingSalesOrder({ quotations, salesOrders: salesOrders || [] })
    .sort((a, b) => String(a.acceptedAt || '').localeCompare(String(b.acceptedAt || '')))
    .slice(0, LIST_CAP);
}

// Sale Order ที่อนุมัติแล้วและยังไม่มีใบยื่นชำระภาษี — เฉพาะใบที่ "มีสินค้าสรรพสามิต
// ให้ยื่นจริง" (resolveSoFiling().eligible) ไม่งั้น SO ที่ขายของนอกพิกัดจะค้างคิวถาวร
async function loadAwaitingFiling(supabase, dealIds) {
  let query = supabase
    .from('sales_orders')
    .select('id, orderNumber, customerId, customerName, dealId, status, supersededById, approvedAt, totalAmount')
    .eq('status', 'approved')
    .is('supersededById', null);
  if (dealIds) query = query.in('dealId', dealIds);
  const { data: approved, error } = await query;
  raise('โหลด Sale Order ที่อนุมัติแล้วไม่สำเร็จ', error);
  if (!approved?.length) return [];

  const { data: filings, error: filingError } = await supabase
    .from('orders')
    .select('salesOrderId')
    .not('salesOrderId', 'is', null);
  raise('โหลดใบยื่นชำระภาษีไม่สำเร็จ', filingError);

  const candidates = salesOrdersAwaitingFiling({ salesOrders: approved, filings: filings || [] });
  if (!candidates.length) return [];

  const { data: lines, error: lineError } = await supabase
    .from('sales_order_lines')
    .select('id, salesOrderId, productId, fgCode, description, qty')
    .in('salesOrderId', candidates.map((order) => order.id));
  raise('โหลดรายการสินค้าใน Sale Order ไม่สำเร็จ', lineError);

  const productIds = [...new Set((lines || []).map((line) => line.productId).filter(Boolean))];
  const [productResult, typeResult, registrationResult] = await Promise.all([
    productIds.length
      ? supabase.from('products').select('*').in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('product_types').select('mainCategoryCode, typeCode, isExcise, requiresFdaNotice'),
    productIds.length
      ? supabase.from('excise_registrations').select('id, productId, customerId, status').eq('status', 'approved').in('productId', productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  raise('โหลดข้อมูลสินค้าไม่สำเร็จ', productResult.error);
  raise('โหลดหมวดสินค้าไม่สำเร็จ', typeResult.error);
  raise('โหลดทะเบียนสรรพสามิตไม่สำเร็จ', registrationResult.error);

  const linesByOrder = new Map();
  (lines || []).forEach((line) => {
    if (!linesByOrder.has(line.salesOrderId)) linesByOrder.set(line.salesOrderId, []);
    linesByOrder.get(line.salesOrderId).push(line);
  });

  return candidates
    .map((order) => {
      const resolved = resolveSoFiling({
        salesOrder: order,
        lines: linesByOrder.get(order.id) || [],
        products: productResult.data || [],
        productTypes: typeResult.data || [],
        registrations: registrationResult.data || [],
      });
      return { ...order, filingItemCount: resolved.lines.length, filingTotalTax: resolved.totalTax, eligible: resolved.eligible };
    })
    .filter((order) => order.eligible)
    .sort((a, b) => String(a.approvedAt || '').localeCompare(String(b.approvedAt || '')))
    .slice(0, LIST_CAP);
}

export async function loadHandoffQueue(supabase, { dealIds = null } = {}) {
  // ไม่มีดีลในขอบเขต = ไม่มีอะไรให้ค้น (กัน .in() ด้วยลิสต์ว่างที่คืนทุกแถว)
  if (Array.isArray(dealIds) && !dealIds.length) {
    return { awaitingSalesOrder: [], awaitingFiling: [] };
  }
  const [awaitingSalesOrder, awaitingFiling] = await Promise.all([
    loadAwaitingSalesOrder(supabase, dealIds),
    loadAwaitingFiling(supabase, dealIds),
  ]);
  return { awaitingSalesOrder, awaitingFiling };
}
