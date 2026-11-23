// ── ใบ "ไม่นับ Actual" ของดีล (mig 0439 · มติเจ้าของ 20/11/2026 ข้อ 3: แถวโชว์ Actual 0 + ป้าย + เหตุผล) ──
//
// 🐞 ตรวจ 23/11: รายการดีล · ลิ้นชักดีลของแดชบอร์ด · การ์ดดีลหน้าลีด — ดีล Won ที่ใบอนุมัติแบบไม่นับขึ้น ฿0.00 เฉย ๆ
//    เพราะสามจอนี้อ่าน cache บนดีล (wonValue / actualByMonth) ซึ่ง sync ของ 0439 ไม่บวกใบไม่นับ และไม่มีคีย์บอกว่ามีใบแบบนี้
// ⭐ ไม่แตะฐาน (ไม่มี migration): API ที่ส่งดีลให้สามจอนั้นแนบ `actualNone` = สรุปจากแถว sales_orders ของดีล Won ที่เห็น
//    (loadDealActualNone) · ตัวตัดสินใบ = salesOrderAmountKind = 'none' — ตัวเดียวกับทะเบียน SO / หน้าดีล / หน้าลูกค้า
//    · ใบที่ย้อนอนุมัติแล้ว: แบบ+เหตุผลยังค้างบนใบ (guard 0439) แต่ไม่ได้อนุมัติอยู่ ⇒ ไม่นับเป็นใบไม่นับ
// ⛔ ป้ายอย่างเดียว — ไม่บวกเข้ายอดไหน (Actual / FC / เป้า / รออนุมัติ) ทั้งสิ้น
import { salesOrderAmountKind } from '@/lib/sales/salesOrderWorkflow';
import { actualNoneReasonOf } from '@/lib/sales/salesOrderActualMode';
import { isKpiDeal, pipelineRowsOnly } from '@/lib/sales/historicalOrders';
import { isWonStage } from '@/lib/salesPlanning';

export const ACTUAL_NONE_LABEL = 'ไม่นับ Actual';

/* ป้ายของใบเดียว — "ไม่นับ Actual · เหตุผล" · ใบแบบอื่น = '' */
export function orderActualNoneText(order) {
  if (salesOrderAmountKind(order) !== 'none') return '';
  const reason = actualNoneReasonOf(order);
  return reason ? `${ACTUAL_NONE_LABEL} · ${reason}` : ACTUAL_NONE_LABEL;
}

/**
 * สรุปใบไม่นับของดีลหนึ่งใบ — null = ไม่มี
 * `text`  = ป้ายพร้อมเหตุผล (ใบเดียว) · หลายใบ = "ไม่นับ Actual n ใบ" — ช่องกว้าง (หน้าลูกค้า)
 * `short` = "ไม่นับ Actual" / "ไม่นับ Actual n ใบ" — ช่องเงินที่ห้ามขึ้นบรรทัดใหม่ (รายการดีล · ลิ้นชัก · การ์ดลีด) · เหตุผลอยู่ใน title
 * `reasons` = เหตุผลทุกใบ (title · ช่องค้นหา)
 */
export function summarizeActualNone(orders = []) {
  const none = (orders || []).filter((o) => salesOrderAmountKind(o) === 'none');
  if (!none.length) return null;
  const short = none.length === 1 ? ACTUAL_NONE_LABEL : `${ACTUAL_NONE_LABEL} ${none.length} ใบ`;
  return {
    count: none.length,
    text: none.length === 1 ? orderActualNoneText(none[0]) : short,
    short,
    reasons: none.map(actualNoneReasonOf).filter(Boolean),
  };
}

/* title ของป้าย — เหตุผลเต็ม (บรรทัดรองตัดคำ/ห้ามขึ้นบรรทัดใหม่) */
export const actualNoneTitle = (summary) => (summary?.reasons?.length
  ? `อนุมัติแล้วแบบไม่นับ Actual — ${summary.reasons.join(' / ')}`
  : 'อนุมัติแล้วแบบไม่นับ Actual');

/* คอลัมน์ที่ตัวสรุปต้องใช้ — select ขาดช่องไหน = ตัดสินผิดเงียบ (status/origin/actualMode) หรือป้ายไม่มีเหตุผล */
export const ACTUAL_NONE_ORDER_COLS = 'id, dealId, status, origin, actualMode, actualNoneReason';

/**
 * อ่านใบไม่นับของชุดดีล (ฝั่ง server) → `{ map: Map<dealId, summary>, error }`
 * ⭐ รับแถวดีล — ถามเฉพาะดีล Won (ใบอนุมัติมีได้แค่ดีล Won) ที่ไม่ใช่ดีลภาชนะของใบย้อนหลัง (isKpiDeal — ใบย้อนหลังไม่มีแบบนี้)
 *    · กรองที่ฐาน: ใบ pipeline (pipelineRowsOnly) + actualMode none + อนุมัติอยู่ ⇒ แถวที่ได้มีแต่ใบไม่นับ (น้อยมาก)
 * ⚠️ สามกับดักของการอ่านตารางที่โต (บทเรียน #1721): ซอยลิสต์ id (16 KB) · ไล่หน้า (เพดาน 1,000 แถว) · เช็ก error (supabase ไม่ throw)
 *    ⇒ ผู้เรียกส่ง fetchInChunks / fetchAllResult ตัวจริงเข้ามา (เทสต์ส่งตัวจำลอง — ห้ามต่อฐานจริง)
 */
export async function loadDealActualNone(supabase, deals, { fetchInChunks, fetchAllResult }) {
  const map = new Map();
  const ids = [...new Set((deals || []).filter((d) => isWonStage(d?.stage) && isKpiDeal(d)).map((d) => d.id).filter(Boolean))];
  if (!ids.length) return { map, error: null };
  const { data, error } = await fetchInChunks(ids, (chunk) => fetchAllResult(() => pipelineRowsOnly(supabase
    .from('sales_orders')
    .select(ACTUAL_NONE_ORDER_COLS)
    .in('dealId', chunk)
    .eq('actualMode', 'none')
    .eq('status', 'approved'))
    .order('id', { ascending: true })));
  if (error) return { map, error };
  const byDeal = new Map();
  for (const row of data || []) {
    if (!byDeal.has(row.dealId)) byDeal.set(row.dealId, []);
    byDeal.get(row.dealId).push(row);
  }
  for (const [dealId, orders] of byDeal) {
    const summary = summarizeActualNone(orders);
    if (summary) map.set(dealId, summary);
  }
  return { map, error: null };
}

/* แนบสรุปให้แถวดีล — `actualNone: null` เมื่อไม่มี (จอเช็กด้วย summary?.count) */
export const attachActualNone = (deals = [], map = new Map()) => (deals || []).map((d) => ({ ...d, actualNone: map.get(d.id) || null }));
