// ── สายธุรกิจของโครงการ (mig 0191) ───────────────────────────────────────
//
// ⭐ มติ 2026-08-02 (docs/business-line-level-and-handoff.md §1):
// **แกนสายธุรกิจอยู่ที่โครงการ ไม่ใช่ดีล** — โครงการตัดสินว่า "งานนี้จบยังไง"
//   PRODUCT = ส่งของออกจากบริษัทแล้วจบ
//   SERVICE = ของไปตั้งค้างที่หน้างานลูกค้า ต้องกลับไปดูอีกตลอดกาล
// ส่วนดีลถือ `dealType` (SCENT/NPD/RE-ORDER) ที่ตัดสินว่า "ใบนี้เติมช่วงไหน"
// ⇒ แม่แบบไทม์ไลน์ = คู่ (project.line, deal.type)
//
// ⚠️ ค่านี้ **ไม่มีค่าตั้งต้น** — NULL คือ "ยังไม่ระบุ" ซึ่งเป็นสถานะที่ถูกต้อง
// ไม่ใช่ข้อผิดพลาด · ห้ามเติมค่าให้เองที่ชั้นไหนก็ตาม (ดูเหตุผลในหัว mig 0191:
// `projects.type` มี default 'NPD' แล้วโครงการทั้ง 11 ใบบน prod เป็น NPD หมด)
//
// ⚠️ ชื่อค่า `PRODUCT` ไม่ใช่ `ODM` — `ODM` ชนกับชื่อทีมใน TEAMS (มติ #868)

export const BUSINESS_LINES = ['PRODUCT', 'SERVICE'];

// ⚠️ มติผู้ใช้ 2026-08-02: **ป้ายสั้น ไม่ต้องอธิบาย** — เดิมเป็น
// "สายสินค้า (ส่งมอบของแล้วจบ)" ซึ่งฟุ่มเฟือยบนตัวเลือกที่มีแค่สองค่า
// ⇒ ถ้าจะอธิบายความหมาย ให้ไปอยู่ในเอกสาร ไม่ใช่ในทุก dropdown
export const BUSINESS_LINE_LABELS = {
  PRODUCT: 'สินค้า (Products)',
  SERVICE: 'บริการ (Services)',
};

// คำอธิบายบรรทัดรองของ **แผ่นเลือก** (OptionTiles) — คนละเรื่องกับมติป้ายสั้น
// ข้างบน: มตินั้นห้ามยัดคำอธิบายปนใน *ป้ายบรรทัดเดียว* ของ dropdown/badge
// ส่วนแผ่นเลือกมีบรรทัดรองเป็นที่ของมันเอง (แบบเดียวกับแผ่นประเภทดีล
// SCENT · พัฒนากลิ่น) — ใจความจากหัวไฟล์นี้: โครงการตัดสินว่า "งานนี้จบยังไง"
export const BUSINESS_LINE_HINTS = {
  PRODUCT: 'ส่งมอบของแล้วจบ',
  SERVICE: 'มีงานดูแลต่อเนื่องที่หน้างาน',
};

export const UNSET_BUSINESS_LINE_LABEL = 'ยังไม่ระบุสาย';

// ป้ายสำหรับแสดงผล — NULL/ค่าที่ไม่รู้จักคืนป้าย "ยังไม่ระบุสาย" ไม่ใช่สตริงว่าง
// (ช่องว่างบนตารางอ่านเป็น "ไม่มีข้อมูล" ซึ่งกลืนกับคอลัมน์อื่นที่ว่างจริง ๆ)
export function businessLineLabel(line) {
  return BUSINESS_LINE_LABELS[line] || UNSET_BUSINESS_LINE_LABEL;
}

export const isBusinessLine = (line) => BUSINESS_LINES.includes(line);

// ค่าที่ยอมให้เขียนลง DB: ค่าจริง หรือ null เท่านั้น
// สตริงว่างจากฟอร์มต้องกลายเป็น null ไม่ใช่ '' (CHECK ของ 0191 ปฏิเสธ '')
export function normalizeBusinessLine(value) {
  if (value === null || value === undefined || value === '') return null;
  const upper = String(value).trim().toUpperCase();
  return isBusinessLine(upper) ? upper : undefined; // undefined = ค่าผิด ให้ผู้เรียกปฏิเสธ
}

// ── ตัวนับ "ยังไม่ระบุสาย" (logic ล้วน) ──────────────────────────────────
// ⭐ ตัวนับนี้คือสิ่งที่แทนการใส่ default — ถ้าไม่มีมัน โครงการที่ยังไม่ระบุจะ
// หายไปเงียบ ๆ แบบเดียวกับที่ `projects.type` หายไปใต้ค่า 'NPD' มาสามปี
export function countUnsetBusinessLine(projects = []) {
  return projects.filter((project) => !isBusinessLine(project?.line)).length;
}

// สรุปจำนวนต่อสาย — ใช้บนหน้ารวมและหน้าภาพรวม
export function summarizeBusinessLines(projects = []) {
  const counts = { PRODUCT: 0, SERVICE: 0, unset: 0 };
  for (const project of projects) {
    if (isBusinessLine(project?.line)) counts[project.line] += 1;
    else counts.unset += 1;
  }
  return counts;
}
