// ── ชนิดเอกสารการเงินที่ขอจากฝ่ายบัญชีได้ ───────────────────────────────
//
// มาจากข้อความจริงของผู้ใช้ที่ docs/service-business-system-plan.md §5 ยกมา:
// *"ขอใบวางบิล 50 % ก่อนผลิต ออกใบกำกับภาษี"*
//
// ⚠️ **คนละลิสต์กับ REQUEST_DOC_TYPES ของ RD** — เอามารวมลิสต์เดียวเมื่อไร คำร้อง
// ขอเอกสารของ RD จะมีตัวเลือก "ใบกำกับภาษี" โผล่ขึ้นมา ซึ่งไม่ใช่ของที่ RD ออกให้ได้
import { docVocabulary } from '../../docTypes';

export const BILLING_DOC_TYPES = [
  { value: 'billing_note', label: 'ใบวางบิล' },
  { value: 'invoice', label: 'ใบแจ้งหนี้' },
  { value: 'tax_invoice', label: 'ใบกำกับภาษี' },
  { value: 'receipt', label: 'ใบเสร็จรับเงิน' },
  // ทางออกที่ต้องมี — เหตุผลเดียวกับชุดของ RD: ไม่มีทางออกแปลว่าคนจะเลือกตัวที่
  // ใกล้เคียงที่สุดแล้วอธิบายในรายละเอียด ทำให้ตัวเลข "ขอใบกำกับกี่ครั้ง" ผิดเงียบ ๆ
  { value: 'other', label: 'อื่น ๆ — ระบุในรายละเอียด' },
];

export const BILLING_DOC_VOCABULARY = docVocabulary({
  lineKind: 'billing_doc', types: BILLING_DOC_TYPES,
});
