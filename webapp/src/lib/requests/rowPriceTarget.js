// ── ขั้นใส่ราคาของแถวสายพัฒนา: ราคานี้เป็นราคาอะไร ลงทะเบียนตัวไหน ──────────
//
// ⭐ **ตัดสินจาก pointer ของแถว ไม่ใช่จากหัวข้อ** (Q38 ก · ม-54 · ขยายใน ม-148)
//   · แถวผูก **สูตร** (`producedFormulaId`) = ราคา **FB** เบสที่ใส่กลิ่น ต่อกิโล → ประทับ `formulaId`
//   · แถวผูก **กลิ่น** อย่างเดียว (`producedScentId`) = ราคา **F** หัวน้ำหอม ต่อกิโล → ประทับ `scentId`
//   ⚠️ สูตรชนะเสมอเมื่อมีทั้งคู่ — พัฒนากลิ่นที่ส่งเป็นสินค้า (ม-148) ได้ทั้งกลิ่นและสูตร
//      และราคาที่ RD ใส่คือราคาเนื้อของสินค้า ไม่ใช่ของหัวน้ำหอม
//
// ⭐ **จอกับ API ถามตัวเดียวกัน** — เดิมชนิดราคาอยู่ใน route อย่างเดียว แล้วโมดัลเขียน
// ตายตัวว่า "รุ่นใหม่ของกลิ่นตัวนี้" ⇒ คนใส่ราคาไม่มีทางรู้ว่ากำลังใส่ราคา F หรือ FB
// ⚠️ ไม่ใช่ราคาต่อชิ้นของสินค้าสำเร็จ — ราคานั้นรวมบรรจุภัณฑ์/ค่าผลิต เป็นงานของใบขอราคาผลิต
export const ROW_PRICE_LABELS = Object.freeze({
  RM_F: { short: 'F', text: 'ราคาหัวน้ำหอม (F)', registry: 'กลิ่น' },
  RM_FB: { short: 'FB', text: 'ราคาเบสที่ใส่กลิ่น (FB)', registry: 'สูตร' },
});

/** คืน `{ kind, stampColumn, id, ...ROW_PRICE_LABELS[kind] }` หรือ null เมื่อแถวยังไม่ผูกทะเบียน */
export function rowPriceTarget(row) {
  if (row?.producedFormulaId) {
    return { kind: 'RM_FB', stampColumn: 'formulaId', id: row.producedFormulaId, ...ROW_PRICE_LABELS.RM_FB };
  }
  if (row?.producedScentId) {
    return { kind: 'RM_F', stampColumn: 'scentId', id: row.producedScentId, ...ROW_PRICE_LABELS.RM_F };
  }
  return null;
}
