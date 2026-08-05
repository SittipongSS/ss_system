// ── รูปร่างบรรทัดที่ไม่ได้เป็นของฝ่ายไหน ────────────────────────────────
// `material` ใช้ทั้งขอราคา F/FB ของ RD และขอราคา PM ของ PC · `document` ใช้ได้ทุกฝ่าย
import { normalizeDocumentItems, normalizeRequestItems } from '../../lines';

const materialLine = {
  key: 'material',
  // ⚠️ ป้ายของบรรทัดวัสดุต้องเหมือนเดิม**ทุกตัวอักษร** — ผู้ใช้ที่ใช้เคสขอราคาอยู่
  // ต้องไม่รู้สึกว่าอะไรเปลี่ยนหลังรวมระบบ (นี่คือค่าตั้งต้นของ requestItemStatusLabel)
  labels: { pending: 'รอราคา', done: 'ตอบราคาแล้ว', declined: 'ตอบไม่ได้' },
  normalize: (input, { dept, hasTiers, materialKind, kindLabel } = {}) => {
    const normalized = normalizeRequestItems(input, { dept, hasTiers });
    if (normalized.error) return normalized;
    // ⭐ ชนิดวัสดุของบรรทัดต้องตรงกับชนิดคำร้อง — ปิดรอยที่เคยทำให้เปิดคำร้องจาก
    // บรรทัด RM_F ในใบขอราคาผลิตแล้วได้ `kind: price_pm` (หัวใบบอกบรรจุภัณฑ์ แต่
    // บรรทัดเป็นหัวน้ำหอม → เลขที่ออกผิด scope และช่องกลิ่นไม่เคยถูกถาม)
    //
    // ⚠️ กฎนี้เคยอยู่ใน route — ย้ายมาอยู่กับรูปร่างบรรทัดที่มันคุ้มครอง เพราะ
    // route ไม่ควรรู้ว่าบรรทัดวัสดุมีกฎพิเศษที่บรรทัดรูปร่างอื่นไม่มี
    const off = materialKind ? normalized.items.find((i) => i.kind !== materialKind) : null;
    if (off) {
      return {
        items: [],
        error: `"${kindLabel}" รับได้เฉพาะรายการชนิด ${materialKind} — พบ ${off.kind}`,
      };
    }
    return normalized;
  },
};

const documentLine = {
  key: 'document',
  labels: { pending: 'รอเอกสาร', done: 'ได้รับแล้ว', declined: 'ให้ไม่ได้' },
  normalize: (input) => normalizeDocumentItems(input),
};

const SHARED_LINE_SHAPES = [materialLine, documentLine];

export default SHARED_LINE_SHAPES;
