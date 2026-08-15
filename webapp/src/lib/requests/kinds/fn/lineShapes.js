// ── รูปร่างบรรทัดที่ฝ่ายบัญชีเป็นเจ้าของ ────────────────────────────────
// กฎของบรรทัดเหมือนบรรทัดขอเอกสารของ RD ทุกข้อ — ต่างแค่ชุดคำศัพท์ จึงใช้ตัวตรวจ
// ตัวเดียวกันผ่าน vocab ไม่ใช่ก๊อปฟังก์ชันมาแก้ลิสต์
import { normalizeDocLines } from '../../lines';
import { BILLING_DOC_VOCABULARY } from './billingDocTypes';

const billingDocLine = {
  key: 'billing_doc',
  labels: { pending: 'รอเอกสาร', done: 'ออกให้แล้ว', declined: 'ออกให้ไม่ได้' },
  vocab: BILLING_DOC_VOCABULARY,
  normalize: (input) => normalizeDocLines(input, BILLING_DOC_VOCABULARY),
};

const FN_LINE_SHAPES = [billingDocLine];

export default FN_LINE_SHAPES;
