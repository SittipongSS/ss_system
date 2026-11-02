// ── แถวของใบค่าสรรพสามิตในตารางรายการ QT / SO (มติเจ้าของ 29/10 จากทะเบียน QT ของใบทดลอง) ─────────────────────
// ใบค่าสรรพสามิตไม่มีดีล ⇒ เดิมคอลัมน์ "ลูกค้า / ดีล" กับ "ประเภท" เป็นขีด · ตอนนี้บรรทัดดีล = "ค่าสรรพสามิต · <ดีลของ SO ต้นทาง>"
// ประเภท = OTHER (คำเดียวกับกระดาษ — EXCISE_PAPER_PROJECT_TYPE) · ผู้ดูแล/ตัวกรอง/คำค้นใช้ดีลต้นทาง
// ⚠️ ดีลต้นทาง (`row.sourceDeal` ที่ route แนบมา) ใช้แสดงผลและจัดกลุ่มเท่านั้น — ห้ามเอาไปใส่ `row.deal` (แผน หมวด 3.7)
// ⚠️ ไฟล์บริสุทธิ์ — จอ import ได้
import { isExciseOrder } from '@/lib/sales/historicalOrders';
import { dealTypeOf } from '@/lib/salesPlanning';

export const EXCISE_LIST_LABEL = 'ค่าสรรพสามิต';
export const EXCISE_LIST_DEAL_TYPE = 'OTHER';

/** ดีลที่ตารางรายการใช้แสดง/จัดกลุ่ม — ใบปกติ = ดีลของใบ · ใบค่าสรรพสามิต = ดีลของ SO ต้นทาง */
export const listDealOf = (row) => row?.deal || (isExciseOrder(row) ? row?.sourceDeal || null : null);

/** ประเภทที่ตารางรายการใช้ — ใบค่าสรรพสามิต = OTHER เสมอ · ไม่มีดีล (ใบเก่า) = null */
export const listDealTypeOf = (row) => (row?.deal ? dealTypeOf(row.deal) : isExciseOrder(row) ? EXCISE_LIST_DEAL_TYPE : null);

/** บรรทัดดีลของแถว — `{ prefix, dealId, title }` · prefix = "ค่าสรรพสามิต" เฉพาะใบค่าสรรพสามิต */
export function listDealLine(row) {
  const deal = listDealOf(row);
  return {
    prefix: isExciseOrder(row) ? EXCISE_LIST_LABEL : null,
    dealId: deal?.id || null,
    title: deal?.title || null,
  };
}
