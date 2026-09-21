// ── หาคำร้องพัฒนากลิ่นของสัญญาใบหนึ่ง ────────────────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-22: *"คำร้องมันมาจาก SO อยู่แล้ว แล้วสัญญาหลักก็มาจาก SO
//    งั้นก็ไม่ต้องเลือกคำร้องเลย เพราะมันเชื่อมโยงกันอยู่แล้ว"*
//    ⇒ **ไม่มีดรอปดาวน์** ระบบหาให้เอง
//
// ⭐ เส้นที่ใช้ผูกคือ **`dealId`** (มติผู้ใช้ 2026-08-22 รอบสอง) — ทั้ง QT · SO · คำร้อง
//    ต่างถือ `dealId` ของตัวเอง และสัญญาก็ถือ `dealId` (NOT NULL) ⇒ ถามคำถามเดียวจบ
//    ⚠️ เคยไล่สาย quotationId → sales_orders → dept_requests."salesOrderId" มาก่อน
//       ซึ่งแคบกว่าและขาดง่าย: ใบสั่งขายที่ไม่ได้ออกจากใบเสนอราคาใบที่ผูกกับสัญญา
//       (ออกหลายใบ · ออกมือ) ทำให้ลิสต์ว่างทั้งที่คำร้องมีอยู่ในดีลเดียวกัน
// เลขใบสั่งขายยังอ่านมาโชว์อยู่ (จาก `dept_requests."salesOrderId"`) เพื่อให้คนกดเห็นที่มา
import { sameCustomer } from '@/lib/sales/contractAddenda';

/* ⭐ **สูตรที่เข้าบันทึกเพิ่มเติม = สูตรของ direction ที่ลูกค้าคอนเฟิร์ม** (รีวิว ม-148 · 2026-09-22)
   ก่อน ม-148 แถวพัฒนากลิ่นไม่เคยมีสูตร ⇒ เส้นนี้ไม่เคยเจอของจริง · พอส่งเป็นสินค้าได้สูตรพร้อมกลิ่น
   ทุก direction มีสูตร ⇒ ไม่กรอง = ตารางที่ผูกพันลูกค้ามีสูตรของตัวที่ลูกค้าปฏิเสธ และสูตรรอบแรกที่ถูก
   รอบแก้แทนไปแล้ว (แถวต้นทางค้าง `outcome = 'revise'`)
   ⚠️ ตัวนับของตัวเลือกกับ POST ถามตัวนี้ตัวเดียว — ไม่งั้นปุ่มบอกว่ามีสูตรแต่กดแล้ว 409
   ⚠️ direction ที่ส่งเป็นหัวน้ำหอมไม่มีสูตร ⇒ ไม่อยู่ในตาราง (ยังไม่มีมติว่าจะลงเป็นรหัสกลิ่นไหม) */
export function addendumFormulaIds(items = []) {
  return [...new Set((items || [])
    .filter((item) => item?.producedFormulaId && item.outcome === 'confirmed')
    .map((item) => item.producedFormulaId))];
}

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
  if (!contract?.id || !contract?.dealId) return { candidates: [], error: null };

  const { data: requests, error: requestError } = await supabase
    .from('dept_requests')
    .select('id, "docNo", "closedAt", "customerId", "customerName", "salesOrderId"')
    .eq('dealId', contract.dealId)
    .eq('kind', 'scent_dev')
    .eq('status', 'closed');
  if (requestError) return { candidates: [], error: requestError.message };

  // ⚠️ ด่านลูกค้าอยู่ท้ายเสมอ — ดีลเดียวกันแล้วยังต้องเป็นลูกค้ารายเดียวกับสัญญา
  const rows = (requests || []).filter((request) => sameCustomer(contract, request));
  const ids = rows.map((request) => request.id);
  if (!ids.length) return { candidates: [], error: null };

  const { data: items, error: itemError } = await supabase
    .from('dept_request_items').select('"requestId", "producedFormulaId", outcome').in('requestId', ids);
  if (itemError) return { candidates: [], error: itemError.message };
  const formulaCount = new Map(ids.map((requestId) => [
    requestId, addendumFormulaIds((items || []).filter((item) => item.requestId === requestId)).length,
  ]));

  // เลขใบสั่งขายไว้โชว์ที่มาเฉย ๆ — ไม่ใช่เงื่อนไขคัดเลือก (ใบที่ไม่มีก็ยังใช้ได้)
  const orderIds = [...new Set(rows.map((request) => request.salesOrderId).filter(Boolean))];
  let orderNoById = new Map();
  if (orderIds.length) {
    const { data: orders, error: orderError } = await supabase
      .from('sales_orders').select('id, "orderNumber"').in('id', orderIds);
    if (orderError) return { candidates: [], error: orderError.message };
    orderNoById = new Map((orders || []).map((order) => [order.id, order.orderNumber]));
  }

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
  if (!candidates.length) return 'ดีลของสัญญานี้ยังไม่มีคำร้องพัฒนากลิ่นที่ปิดเรื่อง';
  if (candidates.every((request) => request.taken)) {
    return 'คำร้องพัฒนากลิ่นของสัญญานี้ถูกใช้ทำบันทึกไปครบแล้ว — หนึ่งคำร้องออกบันทึกได้ครั้งเดียว';
  }
  return 'คำร้องที่ปิดเรื่องแล้วยังไม่มีสูตรขึ้นทะเบียน — บันทึกต้องมีรหัสสูตรให้อ้าง';
}
