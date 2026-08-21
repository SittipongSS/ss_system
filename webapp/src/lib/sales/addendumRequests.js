// ── หาคำร้องพัฒนากลิ่นของสัญญาใบหนึ่ง ────────────────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-22: *"คำร้องมันมาจาก SO อยู่แล้ว แล้วสัญญาหลักก็มาจาก SO
//    งั้นก็ไม่ต้องเลือกคำร้องเลย เพราะมันเชื่อมโยงกันอยู่แล้ว"*
//    ⇒ **ไม่มีดรอปดาวน์** ระบบไล่สายให้เอง: สัญญา → ใบเสนอราคา → ใบสั่งขาย → คำร้อง
//
// สายที่ไล่ (ทุกขาเป็นคอลัมน์จริงในฐาน ไม่ใช่เดาจากชื่อ):
//   sales_contracts."quotationId" → sales_orders."quotationId"
//   → dept_requests."salesOrderId" (kind = scent_dev · 1 SO : 1 คำร้อง ตามด่านของ SA)
// ถ้าสัญญาไม่มีใบเสนอราคาผูก (ใบเก่า/ใบที่กรอกมือ) ตกลงมาที่ดีลของสัญญา
// แล้วยังกรองด้วยลูกค้าอีกชั้นเสมอ — บันทึกที่แนบสูตรของลูกค้ารายอื่นคือเอกสารที่ใช้ไม่ได้
import { sameCustomer } from '@/lib/sales/contractAddenda';

/* เลือกใบที่จะใช้ต่อไป — เก่าสุดก่อน เพื่อให้บันทึกครั้งที่ 1, 2, 3 … ไล่ตามลำดับที่
   คำร้องปิดเรื่องจริง (ไม่ใช่สลับไปมาแล้วอ่านย้อนหลังไม่รู้เรื่อง)
   ⚠️ ใบที่ไม่มีสูตรขึ้นทะเบียน = ไม่มีรหัสให้อ้างในตาราง ⇒ ข้ามไป ไม่ใช่เลือกแล้วพังตอนสร้าง */
export function pickAddendumRequest(candidates = []) {
  return [...candidates]
    .filter((request) => request.formulaCount > 0 && !request.taken)
    .sort((a, b) => String(a.closedAt || '').localeCompare(String(b.closedAt || '')))[0] || null;
}

/* คำร้องทั้งหมดที่สายของสัญญาใบนี้พาไปถึง พร้อมสถานะว่าใบไหนถูกใช้ไปแล้ว
   คืน { candidates, error } — ตัวเรียกเป็นคนตัดสินใจว่าจะโชว์อะไร */
export async function loadAddendumRequestCandidates(supabase, contract) {
  if (!contract?.id) return { candidates: [], error: null };

  let orderNoById = new Map();
  if (contract.quotationId) {
    const { data: orders, error } = await supabase
      .from('sales_orders').select('id, "orderNumber"').eq('quotationId', contract.quotationId);
    if (error) return { candidates: [], error: error.message };
    orderNoById = new Map((orders || []).map((order) => [order.id, order.orderNumber]));
  }

  let query = supabase
    .from('dept_requests')
    .select('id, "docNo", "closedAt", "customerId", "customerName", "salesOrderId"')
    .eq('kind', 'scent_dev')
    .eq('status', 'closed');
  query = orderNoById.size
    ? query.in('salesOrderId', [...orderNoById.keys()])
    : query.eq('dealId', contract.dealId);

  const { data: requests, error: requestError } = await query;
  if (requestError) return { candidates: [], error: requestError.message };

  // ⚠️ ด่านลูกค้าอยู่ท้ายสายเสมอ — ต่อให้ไล่สายมาถูก ใบที่ชื่อลูกค้าไม่ตรงก็ใช้ไม่ได้
  const rows = (requests || []).filter((request) => sameCustomer(contract, request));
  const ids = rows.map((request) => request.id);
  if (!ids.length) return { candidates: [], error: null };

  const { data: items, error: itemError } = await supabase
    .from('dept_request_items').select('"requestId", "producedFormulaId"').in('requestId', ids);
  if (itemError) return { candidates: [], error: itemError.message };
  const formulaCount = (items || []).reduce((map, item) => {
    if (!item.producedFormulaId) return map;
    map.set(item.requestId, (map.get(item.requestId) || 0) + 1);
    return map;
  }, new Map());

  /* ใบที่ถูกใช้ไปแล้ว (มติผู้ใช้: หนึ่งคำร้อง = หนึ่งบันทึก)
     ⚠️ นับเฉพาะบันทึกที่ยังไม่ถูกยกเลิก — ยกเลิกแล้วคำร้องต้องกลับมาใช้ได้อีก */
  const { data: taken, error: takenError } = await supabase
    .from('sales_contract_addenda').select('"requestId", "docNo"')
    .in('requestId', ids).neq('status', 'cancelled');
  if (takenError) return { candidates: [], error: takenError.message };
  const takenBy = new Map((taken || []).map((row) => [row.requestId, row.docNo || 'ฉบับร่าง']));

  return {
    error: null,
    candidates: rows.map((request) => ({
      id: request.id,
      docNo: request.docNo,
      closedAt: request.closedAt,
      salesOrderNo: orderNoById.get(request.salesOrderId) || null,
      formulaCount: formulaCount.get(request.id) || 0,
      taken: takenBy.has(request.id),
      takenBy: takenBy.get(request.id) || null,
    })),
  };
}

/* เหตุผลที่ยังทำบันทึกไม่ได้ — เขียนให้บอก *ทางออก* ไม่ใช่แค่ปฏิเสธ
   (ลิสต์ว่างเพราะอะไรต้องอ่านออกจากหน้าจอ ไม่ต้องให้ไปเดาเอง) */
export function addendumSourceReason(candidates = []) {
  if (!candidates.length) return 'ใบสั่งขายของสัญญานี้ยังไม่มีคำร้องพัฒนากลิ่นที่ปิดเรื่อง';
  if (candidates.every((request) => request.taken)) {
    return 'คำร้องพัฒนากลิ่นของสัญญานี้ถูกใช้ทำบันทึกไปครบแล้ว — หนึ่งคำร้องออกบันทึกได้ครั้งเดียว';
  }
  return 'คำร้องที่ปิดเรื่องแล้วยังไม่มีสูตรขึ้นทะเบียน — บันทึกต้องมีรหัสสูตรให้อ้าง';
}
