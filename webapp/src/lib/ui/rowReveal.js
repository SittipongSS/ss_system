/* พาลูกตัวหนึ่งของ "แถวที่เลื่อนแนวนอนได้" เข้ามาอยู่ในกรอบเต็มตัว — ใช้กับแถบแท็บ (`Tabs`)
 *
 * ทำไมต้องมี (🐞 UAT PR-3 · D16): แถบแท็บเลื่อนแนวนอนได้แต่ **ซ่อนสกอร์ลบาร์** (`.tabs-header { scrollbar-width: none }`)
 * พอแท็บล้นกรอบ คนใช้เมาส์เห็นแท็บสุดท้ายแค่ครึ่งตัว กดส่วนที่เห็นแล้วแท็บถูกเลือกจริง แต่ป้ายยังขาดอยู่อย่างเดิม
 * (วัดจริงที่ 1440px: แท็บที่เจ็ดของหน้ามาตรฐานเอกสารเห็น 85 จาก 226px ทั้งก่อนและหลังกด) · คีย์บอร์ดไม่เจอเพราะ
 * `focus()` ของลูกศรเลื่อนให้เอง — เมาส์/นิ้วไม่มีอะไรเลื่อนให้
 *
 * ⚠️ ขยับ **`scrollLeft` ของแถวเท่านั้น** ไม่ใช้ `scrollIntoView` — ตัวนั้นเลื่อนทุกกล่องที่ครอบอยู่รวมทั้งตัวหน้า
 *    การเลือกแท็บต้องไม่ดันหน้าขึ้นลงเอง (เรื่องแนวตั้งเป็นของ `scrollToTopOf`)
 * ⚠️ แถวที่ไม่ล้น: ค่าที่ได้อาจไม่ใช่ศูนย์ (แท็บแรกชิดขอบ) แต่ `scrollLeft` ถูกหนีบไว้ที่ 0 เอง ⇒ ไม่มีอะไรขยับ
 */

// เผื่อให้เห็นขอบของแท็บข้าง ๆ — แถวไม่มีสกอร์ลบาร์ ชิ้นของแท็บถัดไปที่โผล่มาคือสัญญาณเดียวว่า "ยังมีต่อ" และเป็นที่ให้กด
export const ROW_REVEAL_PEEK = 40;

/**
 * ระยะที่ต้องบวกเข้า `scrollLeft` ของแถว เพื่อให้ลูกอยู่ในกรอบเต็มตัว (พร้อมระยะเผื่อ `peek` สองข้าง)
 * รับพิกัดจอ (`getBoundingClientRect`) ของแถวกับของลูก · 0 = อยู่ในกรอบแล้ว ไม่ต้องขยับ
 * ลูกที่กว้างกว่ากรอบ: ชิดขอบซ้าย (ป้ายอ่านจากซ้าย)
 */
export function rowRevealDelta(row, item, peek = ROW_REVEAL_PEEK) {
  const rowLeft = Number(row?.left);
  const rowRight = Number(row?.right);
  const itemLeft = Number(item?.left);
  const itemRight = Number(item?.right);
  if (![rowLeft, rowRight, itemLeft, itemRight].every(Number.isFinite)) return 0;
  if (rowRight <= rowLeft || itemRight <= itemLeft) return 0; // กล่องที่ยังไม่ถูกวาด (display: none) ไม่มีอะไรให้เลื่อน
  const room = rowRight - rowLeft;
  const width = itemRight - itemLeft;
  if (width >= room) return Math.round(itemLeft - rowLeft);
  // ระยะเผื่อห้ามกินจนลูกเองไม่พอกรอบ — กรอบแคบกว่าลูก + เผื่อสองข้าง = ลดระยะเผื่อลง
  const margin = Math.max(0, Math.min(Number(peek) || 0, (room - width) / 2));
  if (itemLeft - margin < rowLeft) return Math.round(itemLeft - margin - rowLeft);
  if (itemRight + margin > rowRight) return Math.round(itemRight + margin - rowRight);
  return 0;
}

/** เลื่อนแถว (element) ให้ลูก (element) อยู่ในกรอบเต็มตัว — ไม่มีแถว/ลูก หรืออยู่ในกรอบแล้ว = ไม่ทำอะไร */
export function revealInRow(row, item, peek = ROW_REVEAL_PEEK) {
  if (!row || !item) return 0;
  const delta = rowRevealDelta(row.getBoundingClientRect(), item.getBoundingClientRect(), peek);
  if (delta) row.scrollLeft += delta;
  return delta;
}
