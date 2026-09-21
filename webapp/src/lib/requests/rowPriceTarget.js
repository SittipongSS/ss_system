// ── ขั้นใส่ราคาของแถวสายพัฒนา: ใส่ราคาอะไรได้บ้าง ลงทะเบียนตัวไหน ──────────────
//
// ⭐ **ตัดสินจาก pointer ของแถว ไม่ใช่จากหัวข้อ** (Q38 ก · ม-54 · ขยายใน ม-148)
//   · แถวผูก **สูตร** (`producedFormulaId`) = ใส่ได้ F · B · FB (ช่องตาม `priceSlotsFor`)
//     F ลงกลิ่นของสูตร: พัฒนากลิ่นที่ส่งเป็นสินค้า = กลิ่นที่เพิ่งเกิด (`producedScentId`) ·
//     พัฒนาสูตร = กลิ่นที่แถวอ้าง (`scentId`)
//   · แถวผูก **กลิ่น** อย่างเดียว (`producedScentId`) = ใส่ได้ F ช่องเดียว
//   ⚠️ แถวที่ไม่มี `producedFormulaId` ไม่ถอยไปใช้ `scentId` — กลิ่นที่แถว *อ้าง* ไม่ใช่ของที่แถวส่ง
//      (พัฒนาสูตรที่ยังไม่ส่งสูตร ต้องใส่ราคาไม่ได้ ไม่ใช่กลายเป็นราคา F ของกลิ่นที่ขอมา)
//
// ⭐ **จอกับ API ถามตัวเดียวกัน** — เดิมชนิดราคาอยู่ใน route อย่างเดียว แล้วโมดัลเขียน
// ตายตัวว่า "รุ่นใหม่ของกลิ่นตัวนี้" ⇒ คนใส่ราคาไม่มีทางรู้ว่ากำลังใส่ราคา F หรือ FB
// ⚠️ ไม่ใช่ราคาต่อชิ้นของสินค้าสำเร็จ — ราคานั้นรวมบรรจุภัณฑ์/ค่าผลิต เป็นงานของใบขอราคาผลิต
import { PRICE_SLOTS, primaryPriceSlot, priceSlotsFor } from '@/lib/master/priceSlots';

/** ป้ายของแต่ละชนิดราคา (ชุดเดียวกับช่องราคา) */
export const ROW_PRICE_LABELS = Object.freeze(Object.fromEntries(
  Object.values(PRICE_SLOTS).map((s) => [s.kind, s]),
));

/** ช่องราคาที่แถวนี้ใส่ได้ — `[]` เมื่อแถวยังไม่ผูกทะเบียน */
export function rowPriceSlots(row) {
  const formulaId = row?.producedFormulaId || null;
  const scentId = formulaId
    ? (row?.producedScentId || row?.scentId || null)
    : (row?.producedScentId || null);
  return priceSlotsFor({ scentId, formulaId });
}

/** ช่องหลักของแถว (FB ของสูตร / F ของกลิ่น) — `{ kind, stampColumn, id, short, text, registry }` หรือ null */
export function rowPriceTarget(row) {
  return primaryPriceSlot(rowPriceSlots(row));
}
