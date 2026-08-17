// ── ใบเสนอราคาไม่มีบล็อก "ผู้รับผิดชอบเอกสาร" แล้ว (มติผู้ใช้ 2026-08-18) ──────
//
// เคยมีสามช่องให้เลือกคน บังคับ role ทุกช่อง และสแกน auth directory ทั้งก้อนทุกครั้ง
// ที่กดบันทึก — ถอดออกทั้งหมดเพราะทุกบทบาทบนใบมีคำตอบอยู่ที่อื่นแล้ว:
//
//   ผู้ดูแล / ผู้เสนอราคา = เจ้าของดีล (`deal.ownerId` / `ownerName`) อ่านสด
//   ผู้จัดทำ             = คนที่กดยื่น (`approvalRequestedByName`, mig 0156)
//   ผู้ตรวจสอบ           = ไม่มีบนใบเสนอราคา — ขั้นตรวจอยู่ที่ใบสั่งขาย
//                          (`isSalesOrderReviewer` + `finance_*`)
//   ผู้ประสานงาน (AC)     = เคยเก็บไว้เฉย ๆ **ไม่เคยขึ้นเอกสารเลย** ⇒ ตัดทิ้ง
//
// ตารางกลาง role ของสามบทบาทนี้ย้ายไปอยู่กับเจ้าของจริงคือเอกสารโครงการแล้ว
// (`lib/pm/projectPeople.js`) — ฝั่งโครงการยังมีช่องลงนามครบทั้งสาม
//
// ⚠️ คีย์เก่ายังค้างใน `metadata` ของใบที่ออกไปแล้ว: ไม่มีใครอ่าน แต่ต้องปอกทิ้งทุกครั้ง
// ที่เขียน metadata ไม่งั้นมันกลับมาเป็นช่อง free-text ที่ client ยัดอะไรก็ได้และไม่มี
// ใคร validate (ทั้งสามช่องเคยผ่านด่าน role มาก่อน — ตอนนี้ไม่มีด่านนั้นแล้ว)
export const QUOTATION_RETIRED_PEOPLE_KEYS = ['aeOwner', 'preparedBy', 'aeSupervisor'];

// ตัดคีย์ที่ปลดระวางออกจาก metadata ที่ client ส่งมา — คืนก้อนใหม่ ไม่แก้ของเดิม
export function stripRetiredPeople(metadata = {}) {
  const next = { ...(metadata || {}) };
  for (const key of QUOTATION_RETIRED_PEOPLE_KEYS) delete next[key];
  return next;
}

// ค่าที่ต้องเขียนทับเมื่อออกฉบับใหม่ (Rev.) — ฉบับ Rev. สืบทอด metadata ของใบเดิมทั้งก้อน
// จึงต้องล้างคีย์เก่าให้เป็น null ไม่งั้นค่าที่ปลดระวางแล้วเดินตามไปเรื่อย ๆ ทุกฉบับ
export const RETIRED_PEOPLE_CLEARED = Object.freeze(
  Object.fromEntries(QUOTATION_RETIRED_PEOPLE_KEYS.map((key) => [key, null])),
);
