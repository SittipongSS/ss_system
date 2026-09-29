// ── ตัวอ่านฝั่ง server ของทางเขียนวันงวด (รุ่นสี่ "ต้องวางบิลไหม" · mig 0393 · system-design §7.1–7.3) ───────────────
//
// ผู้เรียก: PATCH งวด (`schedule` · `schedule-many`) · PATCH กติกาลูกค้า (`ruleChange` = งวดที่วันจะเปลี่ยน) ·
//          POST จัดวันใหม่ตามกติกาลูกค้า (`/api/customers/[id]/billing-rule/redate`)
// ⭐ ตัวอ่านชุดเดียว ⇒ งวด/คำร้อง/กติกาที่จอ "งวดที่วันจะเปลี่ยน" เห็น = ชุดที่ด่านของ redate ตรวจ (ต่างชุด = 409 วนไม่จบ)
// ⚠️ ไฟล์นี้แตะฐาน (รับ `supabase` จากผู้เรียก) — ตรรกะล้วนอยู่ที่ installmentScheduleMany.js / customerRuleChange.js (มีเทสต์)
// ⚠️ supabase ไม่ throw เอง — ทุกตัวอ่าน `error` แล้วโยนเอง (อ่านพลาด ≠ ไม่มีข้อมูล) ยกเว้นตัวอ่านกติกาที่ตั้งใจไม่โยน (ข้างล่าง)
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { inSalesViewScope } from '@/lib/salesPlanning';
import { billingRequestedIds } from '@/lib/sales/salesOrderPayments';
import { billingSkipReadyOf, probeBillingSkip } from '@/lib/sales/billingPolicySchema';

/* ใบที่ตายแล้ว (ยกเลิก · ถูกออก Rev. ทับ) — ไม่มีงวดให้ตามเก็บ ⇒ ไม่อยู่ในจอ "งวดที่วันจะเปลี่ยน" (ชุดเดียวกับ installmentVoid) */
const DEAD_ORDER_STATUSES = Object.freeze(['cancelled', 'revised']);

/* คำร้องขอใบวางบิลที่งวดผูกอยู่ (0260) → id ของงวดที่ "ขอใบวางบิลแล้ว" (billingRequestedIds → billingRequestLive ตัวเดียว)
   ⚠️ อ่านสดทุกครั้ง · เอาแค่ id + สถานะ · ไล่หน้า + ซอยก้อน (dept_requests อยู่ใน check:rowcap · ท่าเดียวกับทะเบียน FN)
   ⚠️ อ่านพลาด = โยน (→ 500) ห้ามถือว่า "ยังไม่ขอ" — ไม่งั้นงวดที่บัญชีออกใบตามวันเดิมไปแล้วถูกย้ายวันเงียบ ๆ
   ⚠️ ไม่กรองสถานะที่ query — ยกเลิกคำร้องไม่ล้างลิงก์บนงวด ตัวตัดสินต้องเห็นสถานะจริงเอง
   ⚠️ กรอง `kind` ชุดเดียวกับที่หน้าใบโหลดให้แผง (route ของใบ: คำร้อง billing_doc เท่านั้น) — แผนที่จอส่งมาคิดจากชุดนั้น
     ต่างชุดกันเมื่อไร = 409 วนไม่จบ */
export async function loadBillingRequestedIds(supabase, rows) {
  const ids = [...new Set((rows || []).map((row) => row.billingRequestId).filter(Boolean))];
  if (!ids.length) return new Set();
  const { data, error } = await fetchInChunks(ids, (chunk) => fetchAllResult(() => supabase
    .from('dept_requests').select('id, status').in('id', chunk).eq('kind', 'billing_doc')
    .order('id', { ascending: true })));
  if (error) throw error;
  return billingRequestedIds(rows, new Map((data || []).map((request) => [request.id, request])));
}

/**
 * กติกาวางบิลของลูกค้า (ค่าดิบ · ทุกรุ่น) สำหรับด่านเขียนวันงวด — อ่านสดจากทะเบียน ไม่เชื่อค่าที่จอส่งมา
 * @returns `{ rule, ruleUnavailable }`
 *   · ใบไม่ผูกลูกค้า / ไม่พบแถว = `rule: null` (ยังไม่ระบุ)
 *   · ก่อนรัน 0389 (42703 — ไม่มีคอลัมน์) = `rule: null` (ฐานไม่มีกติกาให้ใช้ · การเขียนวันวางบิลตกที่ด่าน 0389 ตอนเขียนเอง)
 *   · อ่านพลาดอย่างอื่น = `ruleUnavailable: true` — ⭐ **ไม่โยน** (system-design §9 ข้อ 5): ด่านปิดแค่การเปลี่ยนวันวางบิล/ติ๊ก
 *     กำหนดชำระยังบันทึกได้ · เดิม fill/redate-billing โยนเป็น 500 ทั้งคำขอ
 */
export async function loadScheduleRule(supabase, customerId) {
  if (!customerId) return { rule: null, ruleUnavailable: false };
  try {
    const { data, error } = await supabase
      .from('customers').select('id, "billingRule"').eq('id', customerId).maybeSingle();
    if (error?.code === '42703') return { rule: null, ruleUnavailable: false };
    if (error) {
      console.error('[billing-rule] อ่านกติกาวางบิลของลูกค้าไม่สำเร็จ', customerId, error.message || error.code);
      return { rule: null, ruleUnavailable: true };
    }
    return { rule: data?.billingRule ?? null, ruleUnavailable: false };
  } catch (err) {
    console.error('[billing-rule] อ่านกติกาวางบิลของลูกค้าไม่สำเร็จ', customerId, err?.message || err);
    return { rule: null, ruleUnavailable: true };
  }
}

/**
 * ฐานมีคอลัมน์ `billingSkip` แล้วหรือยัง (0393) — ถามจากแถวที่โหลดด้วย `select('*')` ก่อน · ไม่มีแถวให้ดู = ยิง probe
 * ⚠️ probe อ่านพลาดด้วยเหตุอื่น = ถือว่าพร้อม (billingPolicySchema.js) — ถ้าเขียนแล้วพังจริง ตัวแปล 0393 ยังบอกเหตุถูกตัว
 */
export async function billingSkipReady(supabase, rows) {
  const seen = billingSkipReadyOf(rows);
  if (seen !== null) return seen;
  return (await probeBillingSkip(supabase)).ready;
}

/**
 * ใบ + ดีล (ด่านขอบเขตการเห็น) + ใบเสนอราคา + งวดทั้งใบ + คำร้องที่งวดผูก — ของหลายใบในคำขอเดียว
 * ⭐ ด่านขอบเขต = `inSalesViewScope(user, deal)` ตัวเดียวกับ route งวดของใบ (loadOrderForUser) — ใบที่คนนี้มองไม่เห็น
 *   **ไม่ถูกอ่านงวด** และนับไว้ใน `hidden` (จอบอกว่ามีใบที่ไม่เห็น ไม่ใช่แสร้งว่าไม่มี)
 * ⭐ ใบเสนอราคาเอา `status`/`quoteNumber` (ล็อกร่างที่ QT ถูกถอด Won — pipelineInstallmentLock) + `paymentPlan` (ยอดสดของงวดร่าง)
 * ⚠️ ไม่โหลดสายโซ่ Rev. (`revisionHistory`) — ใบ revised ไม่มีงวดเหลือ (0376 ย้ายทั้งแถว) ⇒ ไม่มีงวดให้ล็อกบอกเลขใบ
 * @param orders แถว `sales_orders` (select '*')
 * @returns `{ orders: [{ ...order, deal, quotation }], hidden, installments, requestedIds }`
 */
export async function loadOrdersBundle(supabase, user, orders = []) {
  const list = Array.isArray(orders) ? orders : [];
  if (!list.length) return { orders: [], hidden: 0, installments: [], requestedIds: new Set() };

  const dealIds = [...new Set(list.map((o) => o.dealId).filter(Boolean))];
  const { data: deals, error: dealError } = await fetchInChunks(dealIds, (chunk) => fetchAllResult(() => supabase
    .from('sales_deals').select('*').in('id', chunk).order('id', { ascending: true })));
  if (dealError) throw dealError;
  const dealById = new Map((deals || []).map((d) => [d.id, d]));

  const quoteIds = [...new Set(list.map((o) => o.quotationId).filter(Boolean))];
  const { data: quotes, error: quoteError } = await fetchInChunks(quoteIds, (chunk) => fetchAllResult(() => supabase
    .from('quotations').select('id, quoteNumber, status, paymentPlan').in('id', chunk).order('id', { ascending: true })));
  if (quoteError) throw quoteError;
  const quoteById = new Map((quotes || []).map((q) => [q.id, q]));

  const visible = list
    .map((order) => ({ ...order, deal: dealById.get(order.dealId) || null, quotation: quoteById.get(order.quotationId) || null }))
    .filter((order) => order.deal && inSalesViewScope(user, order.deal));

  const { data: installments, error: rowError } = await fetchInChunks(visible.map((o) => o.id), (chunk) => fetchAllResult(() => supabase
    .from('sales_order_installments').select('*').in('salesOrderId', chunk)
    .order('salesOrderId', { ascending: true })
    .order('seq', { ascending: true })
    .order('id', { ascending: true })));
  if (rowError) throw rowError;
  const rows = installments || [];
  return { orders: visible, hidden: list.length - visible.length, installments: rows, requestedIds: await loadBillingRequestedIds(supabase, rows) };
}

/**
 * ใบที่ยังมีชีวิตทั้งหมดของลูกค้า + งวดของใบที่คนนี้เห็น — ป้อน `ruleChange` ของ PATCH กติกาลูกค้า
 * ⚠️ ใบร่างรวมด้วย (งวดร่างมีวันที่ SA ตั้งไว้ได้ตั้งแต่ก่อนอนุมัติ) · ใบยกเลิก/ถูกออก Rev. ทับไม่รวม
 */
export async function loadCustomerOrdersBundle(supabase, user, customerId) {
  const { data, error } = await fetchAllResult(() => supabase
    .from('sales_orders').select('*').eq('customerId', customerId).order('id', { ascending: true }));
  if (error) throw error;
  const live = (data || []).filter((order) => !DEAD_ORDER_STATUSES.includes(order.status));
  return loadOrdersBundle(supabase, user, live);
}

/**
 * ใบของงวดที่ส่งมาให้จัดวันใหม่ (`redate`) — อ่านงวดตาม id ก่อน แล้วใบของงวดเหล่านั้น (ไม่กรองสถานะ: ใบที่ตายแล้วต้องให้ด่านล็อกตอบ)
 * @returns bundle เดียวกับ `loadOrdersBundle` + `sentRows` (แถวสดของงวดที่ส่งมา — ไม่พบ = ไม่อยู่ใน map)
 */
export async function loadRedateBundle(supabase, user, installmentIds = []) {
  const ids = [...new Set((installmentIds || []).filter(Boolean))];
  const { data: sentRows, error } = await fetchInChunks(ids, (chunk) => fetchAllResult(() => supabase
    .from('sales_order_installments').select('*').in('id', chunk).order('id', { ascending: true })));
  if (error) throw error;
  const orderIds = [...new Set((sentRows || []).map((row) => row.salesOrderId).filter(Boolean))];
  const { data: orders, error: orderError } = await fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase
    .from('sales_orders').select('*').in('id', chunk).order('id', { ascending: true })));
  if (orderError) throw orderError;
  const bundle = await loadOrdersBundle(supabase, user, orders || []);
  return { ...bundle, sentRows: new Map((sentRows || []).map((row) => [row.id, row])) };
}
