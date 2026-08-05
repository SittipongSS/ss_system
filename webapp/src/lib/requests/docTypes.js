// ── ชนิดเอกสารที่ขอได้ (P5) — ทะเบียนเดียวของระบบ ────────────────────────
//
// ⚠️ **ไม่เดาโครงสร้างล่วงหน้า** — ของจริงที่ผู้ใช้ระบุคือ IFRA · COA · MSDS ของ
// *สินค้า* และบอกไว้ว่าจริง ๆ ต้องอ้างใบเสนอราคา + ล็อตการผลิตด้วย ซึ่ง **ยังไม่มี
// ที่เก็บทั้งสองอย่าง** ⇒ รอบนี้เก็บแค่ชนิด + รายละเอียด แล้วค่อยออกแบบรอบถัดไป
// เพิ่มชนิดที่ผู้ใช้ไม่ได้พูดถึงเองตอนนี้ = เดาแทนเขา
export const REQUEST_DOC_TYPES = [
  { value: 'ifra', label: 'IFRA Certificate' },
  { value: 'coa', label: 'COA — Certificate of Analysis' },
  { value: 'msds', label: 'MSDS / SDS' },
  // ⭐ ทางออกที่ต้องมี — ชนิดที่ยังไม่อยู่ในลิสต์เกิดได้เสมอ และการไม่มีทางออก
  // แปลว่าคนจะเลือกชนิดที่ใกล้เคียงที่สุดแล้วอธิบายในรายละเอียด ซึ่งทำให้ตัวเลข
  // "ขอ IFRA กี่ครั้ง" ผิดไปโดยไม่มีใครรู้
  { value: 'other', label: 'อื่น ๆ — ระบุในรายละเอียด' },
];

const BY_VALUE = new Map(REQUEST_DOC_TYPES.map((t) => [t.value, t]));

export const REQUEST_DOC_TYPE_VALUES = REQUEST_DOC_TYPES.map((t) => t.value);

// ⚠️ ชนิดที่ไม่รู้จัก **คืนค่าดิบ ไม่ใช่ค่าว่าง** — ของเก่าที่บันทึกด้วยชุดอื่นต้อง
// ยังอ่านออก (บทเรียนเดียวกับ requestItemStatusLabel)
export function docTypeLabel(value) {
  return BY_VALUE.get(value)?.label || String(value ?? '') || '—';
}

// "อื่น ๆ" ต้องมีรายละเอียด ไม่งั้นแถวนั้นไม่ได้บอกอะไรเลยว่าขออะไร
export function docTypeNeedsDetail(value) {
  return value === 'other';
}
