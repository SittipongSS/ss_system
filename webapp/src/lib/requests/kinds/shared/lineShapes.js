// ── รูปร่างบรรทัดที่ไม่ได้เป็นของฝ่ายไหน ────────────────────────────────
// `document` ใช้ได้ทุกฝ่าย — RD ขอ IFRA/COA/MSDS · บัญชีขอใบวางบิล/ใบกำกับ
//
// ⚠️ **รูปร่าง `material` ถูกถอดพร้อมหัวข้อขอราคาใน mig 0219** (มติ ม-28) — มันมี
// อยู่เพื่อ `price_f`/`price_fb`/`price_pm` เท่านั้น · โมเดลใหม่ให้ RD ใส่ราคาลงใน
// ใบเดิมที่ขั้นสุดท้าย ไม่มีบรรทัดวัสดุอีกแล้ว ⇒ ตัวตรวจ `normalizeRequestItems`
// และ `normalizeRequestTiers` ถูกลบตามไปด้วย ไม่ใช่แค่เลิกเรียก
import { normalizeDocumentItems } from '../../lines';

const documentLine = {
  key: 'document',
  labels: { pending: 'รอเอกสาร', done: 'ได้รับแล้ว', declined: 'ปฏิเสธ' },
  normalize: (input) => normalizeDocumentItems(input),
};

const SHARED_LINE_SHAPES = [documentLine];

export default SHARED_LINE_SHAPES;
