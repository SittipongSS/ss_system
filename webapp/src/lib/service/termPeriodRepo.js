// ── ตัวโหลด "ช่วงบริการของรอบขาย" (mig 0400 · ช่วงบริการแยกรายรายการ) — ฝั่ง server เท่านั้น ─────────────────────
//
// ⭐ ใบสั่งขายโหมด 'line' (`sales_orders."servicePeriodMode"`): ช่วงบริการอยู่ที่ **บรรทัด**
//   (`sales_order_lines."servicePeriodFrom"/"servicePeriodTo"`) · ช่วงของใบเป็นแค่ช่วงรวม (เริ่มแรกสุด → จบสุดท้าย)
//   ⇒ ตัวอ่านฝั่ง TS (ป้าย "ขายแล้ว" ของโซน · มาตรฐาน มล. · ทะเบียนต่อสัญญา) ต้องใช้ช่วงของบรรทัดที่รอบขายนั้นมาจาก
//   (`service_zone_terms."salesOrderLineId"`) · term เองไม่มีวัน (0392/0400 ไม่เขียน startDate/endDate โดยเจตนา)
// ⭐ ทางเดียวของทุกตัวอ่าน: โหลดช่วงของบรรทัดแล้ว **แนบให้ term** (`withLinePeriods` ของ terms.js) — ตัวตัดสินล้วนอ่านจาก term
//   (`termPeriodOf` / `termPeriodPhase`) · route ที่มีบรรทัดอยู่ในมือแล้ว (คิวงานเข้าใหม่) เรียก `withLinePeriods` ตรง ๆ ไม่ต้องผ่านไฟล์นี้
//
// ⚠️ กติกาการอ่าน:
//   · **ไม่มีใบโหมด 'line' = ไม่ยิงสักคำขอ** (ใบเกือบทั้งหมดเป็นโหมดทั้งใบ — ตัวโหลดเดิมต้องไม่จ่ายค่าคิวรีเพิ่ม)
//   · ลิสต์ id โตตามข้อมูล ⇒ `fetchAllInChunks` (ซอยก้อน 16 KB ข้างนอก + ไล่หน้าเพดาน 1,000 แถวข้างใน) + `order('id')` ปิดท้าย
//   · อ่านไม่ขึ้น = **โยน** ไม่ใช่ตอบว่า "ไม่มีช่วง" — ช่วงที่หายเงียบ = รอบขายถอยไปใช้ช่วงรวมของใบ (จบช้ากว่าจริง) โดยไม่มีใครรู้
//   · อ่าน `sales_order_lines` เท่านั้น — **ห้ามเพิ่มคำสั่งอ่าน `sales_orders` ที่นี่** (ยามเงินของใบย้อนหลังนับคำสั่งอ่านใบ
//     `historicalMoneyGuards.test.mjs`) · โหมดของใบมาจาก `ordersById` ที่ผู้เรียกมีอยู่แล้ว (ต่อท้าย select ตัวเดิม)
//   · 🔴 ทิศ import: ไฟล์นี้ import ได้แค่ `./terms` กับตัวซอยก้อน — ห้ามลากตัวตัดสินงานบริการของฝ่ายขาย (บิล/งวด/สิทธิ์ทั้งกราฟ)
//     เข้ามา (ยาม gateOrderChipsUi.test.mjs · termPeriodRepo.test.mjs)
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { withLinePeriods } from './terms';

const pick = (map, key) => (key == null ? null : (map instanceof Map ? map.get(key) : map?.[key]) || null);

/**
 * ช่วงของบรรทัดที่รอบขายของใบโหมด 'line' อ้างถึง → `Map<lineId, { id, servicePeriodFrom, servicePeriodTo }>`
 * @param terms      รอบขาย (`service_zone_terms` — อ่าน `salesOrderId` · `salesOrderLineId`)
 * @param ordersById Map/ออบเจ็กต์ ใบสั่งขายของรอบขาย (ต้องพก `servicePeriodMode`)
 * @returns Map ว่าง **โดยไม่ยิงคำขอ** เมื่อไม่มีรอบขายของใบโหมด 'line'
 * @throws error ของ supabase เมื่ออ่านไม่ขึ้น (ผู้เรียกตอบ 500 — ห้ามถือว่า "ไม่มีช่วง")
 */
export async function loadLinePeriodsOfTerms(supabase, terms, ordersById) {
  const lineIds = [...new Set((Array.isArray(terms) ? terms : [])
    .filter((term) => term?.salesOrderLineId && pick(ordersById, term.salesOrderId)?.servicePeriodMode === 'line')
    .map((term) => term.salesOrderLineId))];
  if (!lineIds.length) return new Map();
  const rows = await fetchAllInChunks(lineIds, (chunk) => supabase
    .from('sales_order_lines').select('id, "servicePeriodFrom", "servicePeriodTo"')
    .in('id', chunk).order('id', { ascending: true }));
  return new Map(rows.map((row) => [row.id, row]));
}

/** รอบขาย + ช่วงของบรรทัด (ใบโหมด 'line') — อาร์เรย์ใหม่ · term ของใบอื่นเป็นออบเจ็กต์เดิม (ดู `withLinePeriods`) */
export async function attachLinePeriods(supabase, terms, ordersById) {
  return withLinePeriods(terms, ordersById, await loadLinePeriodsOfTerms(supabase, terms, ordersById));
}
