/* ── ดึงใบเสนอราคาสำหรับพิมพ์ลงสัญญา (ตัวโหลดตัวเดียวของทั้งสองเส้นทาง) ────────
 *
 * ⭐ **สัญญาบริการพิมพ์เนื้อของใบเสนอราคาลงกระดาษจริง** — ตารางข้อ 2 (เลขที่ใบ ·
 *   รายละเอียด · ค่าบริการ) และรายการงวดข้อ 3 มาจากใบนี้ทั้งหมด ไม่ใช่จากช่องกรอก
 *
 * 🐞 **เหตุที่ต้องมีไฟล์นี้** — เส้นทางที่เรนเดอร์สัญญามีสองทาง (ออกสัญญา = ตรึงเนื้อ ·
 *   เปิดเอกสารร่าง = เรนเดอร์สด) และทั้งคู่เคยส่งให้ `buildContractHTML` แค่
 *   `{ quoteNumber }` ⇒ บนกระดาษ **ช่องค่าบริการว่าง · ไม่มีบรรทัดงวด · ไม่มีรายละเอียด**
 *   ทั้งที่ฟังก์ชันประกอบถูกต้อง · เทสต์ที่ป้อนใบเต็มเข้าไปเองมองรูนี้ไม่เห็น
 *   ⇒ รวมเป็นตัวโหลดตัวเดียว: เพิ่มช่องที่แม่แบบใช้ทีหลังแล้วได้ครบทั้งสองทางพร้อมกัน
 *
 * ⚠️ ไฟล์นี้ไม่ตัดสินสิทธิ์/สถานะใด ๆ — ผู้เรียกเป็นคนตรวจว่าใบยังอนุมัติอยู่ไหม
 *   (ด่านนั้นมีเฉพาะตอน "ออกสัญญา" · ร่างเปิดดูได้เสมอ)
 */

/** ช่องของ `quotations` ที่แม่แบบสัญญาใช้ — ด่านตรวจใช้ `status`/`approvalStatus`
 *  ส่วน `subtotal`/`paymentPlan` คือของที่ลงกระดาษ */
export const CONTRACT_QUOTATION_COLUMNS = 'id, "quoteNumber", status, "approvalStatus", subtotal, "paymentPlan"';

/** ช่องของ `quotation_lines` ที่ลงกระดาษ — ช่อง "รายละเอียด" ในตารางข้อ 2 (มติผู้ใช้
 *  2026-09-04: ดึงจากใบเสนอราคา ไม่ใช่ช่องกรอก "บริการที่รับจ้าง") */
export const CONTRACT_QUOTATION_LINE_COLUMNS = 'id, description, qty, unit, "sortOrder"';

/**
 * @returns `{ quotation, error }` — `quotation` เป็น `null` เมื่อไม่มี `quotationId`
 *   หรือหาแถวไม่เจอ · `quotation.lines` เป็นบรรทัดของใบเรียงตาม `sortOrder`
 */
export async function loadContractQuotation(supabase, quotationId) {
  if (!quotationId) return { quotation: null, error: null };
  const { data: row, error } = await supabase
    .from('quotations')
    .select(CONTRACT_QUOTATION_COLUMNS)
    .eq('id', quotationId)
    .maybeSingle();
  if (error) return { quotation: null, error };
  if (!row) return { quotation: null, error: null };

  const { data: lines, error: lineError } = await supabase
    .from('quotation_lines')
    .select(CONTRACT_QUOTATION_LINE_COLUMNS)
    .eq('quotationId', quotationId)
    .order('sortOrder', { ascending: true });
  if (lineError) return { quotation: null, error: lineError };

  return { quotation: { ...row, lines: lines || [] }, error: null };
}
