// ── ผลลัพธ์ของคำร้องที่ "มีของออกมา" (มติ 3) ─────────────────────────────
// บรีฟกลิ่นไม่ได้จบแค่ตอบกลับ — จบเมื่อ **มีกลิ่นอยู่ในทะเบียน** ถ้าปิดเรื่องได้
// โดยไม่ต้องบอกว่าได้กลิ่นอะไร ทะเบียนกลิ่นก็จะว่างต่อไปเรื่อย ๆ เหมือนที่ผ่านมา
//
// ⚠️ **ไม่เดาชื่อกลิ่นจากหัวเรื่องคำร้อง** — หัวเรื่องเป็นข้อความบรีฟ ("บรีฟกลิ่น
// ชุดใหม่ ลูกค้า X") ไม่ใช่ชื่อกลิ่น · สร้าง master data ผิดแย่กว่าไม่สร้าง
// (บทเรียนตรงจาก prod: มีสินค้า 10 แถวที่เอาชื่อกลิ่นไปกรอกช่องชื่อสูตร)
export const REQUEST_OUTCOMES = ['link', 'create', 'none'];

// หัวข้อที่ต้องระบุผลลัพธ์ตอนปิดเรื่อง → ทะเบียนปลายทาง
export const OUTCOME_REGISTRY_BY_KIND = { scent_brief: 'scent' };

export function requestNeedsOutcome(kind) {
  return !!OUTCOME_REGISTRY_BY_KIND[kind];
}

// ตรวจรูปร่างของผลลัพธ์ก่อนแตะ DB — ใช้ร่วมทั้ง API และโมดัลปิดเรื่อง
// คืนข้อความไทย หรือ null ถ้าผ่าน
export function closeOutcomeError(request, outcome = {}) {
  if (!requestNeedsOutcome(request?.kind)) return null;
  // เคยผูกไว้แล้วตั้งแต่ตอนเปิด/ระหว่างทาง = ไม่ต้องถามซ้ำ
  if (request?.scentId) return null;

  const mode = outcome?.mode;
  if (!REQUEST_OUTCOMES.includes(mode)) return 'ต้องระบุว่าบรีฟนี้ได้กลิ่นตัวไหน';
  if (mode === 'link' && !outcome.scentId) return 'ต้องเลือกกลิ่นจากทะเบียน';
  if (mode === 'create') {
    const name = String(outcome.scentName ?? '').trim();
    if (!name) return 'ต้องระบุชื่อกลิ่นที่จะเพิ่มเข้าทะเบียน';
    if (name.length > 200) return 'ชื่อกลิ่นยาวเกิน 200 ตัวอักษร';
    // กลิ่นผูกลูกค้าเสมอ (มติ 9) — บรีฟที่ไม่มีลูกค้าสร้างกลิ่นไม่ได้
    if (!request?.customerId) return 'คำร้องนี้ไม่มีลูกค้า จึงเพิ่มกลิ่นเข้าทะเบียนไม่ได้';
  }
  return null;
}
