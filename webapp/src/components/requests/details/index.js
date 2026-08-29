// ── ทะเบียนเนื้อหน้ารายละเอียดรายหัวข้อ (P3b · ม-34) ─────────────────────
//
// ⭐ **แกนที่สามของโมดูลแยกฝ่าย** — `kinds/registry.js` ตอบว่า "ใบนี้ขออะไร" ·
// `kinds/lineShapes.js` ตอบว่า "แถวหน้าตาแบบไหน" · ไฟล์นี้ตอบว่า **"หน้ารายละเอียด
// ของหัวข้อนี้แสดงอะไร"**
//
// ⚠️ **แยกจาก `lib/requests/kinds/` โดยตั้งใจ** — ทะเบียนที่นั่นถูก import จากฝั่ง
// server (route · permissions) ซึ่งแตะ React ไม่ได้ · ผูก component เข้าไปเมื่อไร
// จะลาก React เข้า server bundle ทั้งสาย
//
// ⚠️ เพิ่มหัวข้อใหม่ **ไม่ต้องแก้หน้า `/requests/[id]`** — ลงทะเบียนที่นี่พอ
import DocumentDetail from './DocumentDetail';
import DocumentPanel from './DocumentPanel';
import BillingDocPanel from './BillingDocPanel';
import FormulaPanel from './FormulaPanel';
import ScentPanel from './ScentPanel';
import FormulaDevDetail from './FormulaDevDetail';
import ScentDevDetail from './ScentDevDetail';
import SurveyDetail from './SurveyDetail';
import SharedRequestDetail from './SharedRequestDetail';

const BY_KIND = {
  scent_dev: ScentDevDetail,
  formula_dev: FormulaDevDetail,
  // ⭐ ของกลางสองฝ่าย — คำศัพท์ต่างกัน (IFRA/COA/MSDS vs ใบวางบิล/ใบกำกับ) แต่กฎ
  // ของบรรทัดเหมือนกันทุกข้อ ⇒ จอเดียวกัน (ดู docVocabulary)
  document: DocumentDetail,
  billing_doc: DocumentDetail,
  // ประเมินพื้นที่ (mig 0314) — ไม่มีบรรทัด `dept_request_items` เลย เนื้ออยู่ที่
  // ตารางลูก `service_survey_zones` ⇒ ตัวกลางจะแสดงหน้าว่าง
  site_survey: SurveyDetail,
};

// ── การ์ด panel รายหัวข้อ (ม-94) — ใต้การ์ด control กลางบนรางขวา ──────────
// หัวข้อที่ไม่มีของตัวเอง = ไม่มีการ์ดเพิ่ม (การ์ด control กลาง + การ์ดบริบท
// โครงการ/ดีล มาจากเปลือกอยู่แล้ว) · ลงทะเบียนคู่กับ BY_KIND — ที่เดียวกัน
// เพื่อไม่ให้มีทะเบียนที่สามงอกมา drift
// ⚠️ **panel แยกฝ่าย ต่างจาก BY_KIND ข้างบนที่ใช้จอเดียวกัน** (ม-96) — เนื้อกลางหน้า
// ตอบ "บรรทัดเดินถึงไหน" ซึ่งกฎเหมือนกันทุกข้อ · ส่วน panel ตอบ "คนเปิดใบต้องใช้อะไร
// ถึงจะลงมือได้" ซึ่ง RD กับบัญชีคนละเรื่องกันจริง ๆ (บัญชีต้องมีตัวตนสำหรับออกบิล)
const PANEL_BY_KIND = {
  document: DocumentPanel,
  billing_doc: BillingDocPanel,
  formula_dev: FormulaPanel,
  scent_dev: ScentPanel,
};

// หัวข้อที่ยังไม่มีจอของตัวเองใช้ตัวกลาง — **ถอยได้ ไม่โยน** เพราะใบเก่าของหัวข้อ
// ที่ถูกถอดไปแล้วต้องยังเปิดอ่านได้ (ถอยไปเป็นเธรดล้วนดีกว่าจอขาว)
export function detailForKind(kind) {
  return BY_KIND[kind] || SharedRequestDetail;
}

export function panelForKind(kind) {
  return PANEL_BY_KIND[kind] || null;
}

export { DocumentDetail, FormulaDevDetail, ScentDevDetail, SharedRequestDetail };
