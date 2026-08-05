// แท็บของหน้ารายละเอียดสายขาย
//
// ⚠️ ดีล/ลีด กับ โครงการ ใช้ "คนละชุด" โดยเจตนา (มติผู้ใช้ 2026-08-05):
// โครงการยุบ ใบเสนอราคา+Sale Order เป็นแท็บ "เอกสาร" และยุบ งาน+คำร้อง เป็นแท็บ
// "งาน" เพราะของสองอย่างในคู่นั้นถูกเปิดพร้อมกันเสมอ — หน้าดีลยังไม่ได้ยุบ
// ⇒ เพิ่มแท็บใหม่ให้ชุดไหน ให้ดูก่อนว่าอีกชุดต้องตามหรือไม่ อย่าแก้ทั้งสองโดยอัตโนมัติ
export const SALES_DETAIL_TABS = [
  { key: "overview", label: "ภาพรวม" },
  { key: "timeline", label: "ไทม์ไลน์" },
  { key: "quotations", label: "ใบเสนอราคา" },
  { key: "tasks", label: "งาน" },
  { key: "inquiries", label: "คำร้อง" },
  { key: "activities", label: "ความเคลื่อนไหว" },
  // ⭐ เอกสารอยู่ **ท้ายสุด** (มติผู้ใช้) — รวมไฟล์ของดีลจาก 6 แหล่งไว้ที่เดียว
  // ⚠️ ชุดของโครงการมี `documents` อยู่แล้วแต่ **คนละความหมาย** (ยุบใบเสนอราคา+SO
  // มาไว้ด้วยกัน — มติ 2026-08-05) ⇒ ไม่แตะชุดนั้น ตามคำเตือนที่หัวไฟล์
  { key: "documents", label: "เอกสาร" },
];

export const PROJECT_DETAIL_TABS = [
  { key: "overview", label: "ภาพรวม" },
  { key: "timeline", label: "ไทม์ไลน์" },
  { key: "documents", label: "เอกสาร" },
  { key: "tasks", label: "งาน" },
  { key: "activities", label: "ความเคลื่อนไหว" },
];

/* ลิงก์เก่าที่ยังชี้แท็บที่ถูกยุบไปแล้ว — ต้องเด้งเข้าแท็บที่กลืนมันไป ไม่ใช่ตกลง
   "ภาพรวม" เงียบ ๆ (คนกดลิงก์จากอีเมล/แชทจะอ่านว่าของหาย ทั้งที่แค่ย้ายที่) */
export const PROJECT_TAB_ALIASES = { quotations: "documents", inquiries: "tasks" };

export function detailTabFromSearch(search = "", { tabs = SALES_DETAIL_TABS, aliases = {} } = {}) {
  const raw = new URLSearchParams(search).get("tab") || "overview";
  const key = aliases[raw] || raw;
  return tabs.some((tab) => tab.key === key) ? key : "overview";
}
