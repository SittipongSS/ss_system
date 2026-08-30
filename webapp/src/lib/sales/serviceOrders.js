// ── เกณฑ์ "ใบสั่งขายใบไหนมีรอบบริการ" ────────────────────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-30** (docs/service-contract-phase-plan.md §0 ข้อ 7):
//   *"ดีล สายบริการ + มี 02-001 ใบไหนมีอย่างน้อย 1 รายการ ทั้งใบคือมีรอบบริการ"*
//
//      สายของใบ === 'SERVICE'  และ  มีบรรทัดหมวด 02-001 อย่างน้อยหนึ่งบรรทัด
//
// ⚠️ **ตัดสินระดับใบ ไม่ใช่รายบรรทัด** — ใบเดียวกันมีค่าติดตั้ง ค่าขนส่ง หรือขายน้ำหอม
//   เป็นขวดปนอยู่ได้ ทั้งใบยังนับเป็นใบมีรอบบริการเหมือนกัน (บรรทัดอื่นจัดสรรลงโซนได้ตามเดิม)
//
// ⚠️ **อ่านหมวดจาก `fgCode` ที่ตรึงอยู่บนบรรทัด ไม่อ่าน products สด** — สินค้าถูกย้ายหมวด
//   หรือถูกลบทีหลังได้ ใบที่ออกไปแล้วต้องตอบเหมือนเดิมตลอดกาล (โรคเดียวกับกระจกชื่อลูกค้า)
//
// ⚠️ **สายมีสามค่า ไม่ใช่สองค่า**: PRODUCT · SERVICE · **null (ยังไม่ระบุ)** ซึ่งเป็นสถานะ
//   ที่ถูกต้องและมีจริงเยอะ ⇒ ที่นี่ตอบแค่ "ใช่/ไม่ใช่ใบมีรอบบริการ" · ใครต้องแยก
//   "ไม่ใช่" ออกจาก "ยังไม่รู้" ให้เรียก `orderBusinessLineOf()` เอาค่าดิบไปตัดสินเอง
//
// ⚠️ **ไม่ตัดสินจาก `service_zone_terms`** — term เกิดหลังจาก TS จัดสรรลงโซน ซึ่งเป็น
//   ปลายทางของเกณฑ์นี้ ไม่ใช่ต้นทาง · ถ้าเอา term มาเป็นเกณฑ์ ใบใหม่ที่ยังไม่มีใครจัดสรร
//   จะไม่เข้าคิวบริการเลยตลอดกาล (ไก่กับไข่)
import { categoryOf } from '@/lib/master/categoryOf';
import { orderBusinessLine } from '@/lib/service/intake';

/* หมวดสินค้าที่ทำให้ใบเข้าเส้นบริการ — ค่าเดียว ประกาศที่นี่ที่เดียว
   (02 = ธุรกิจบริการ · 001 = ระบบกระจายกลิ่น SDS — ทะเบียน product_types mig 0007) */
export const SERVICE_ROUND_CATEGORY = '02-001';

/* บรรทัดนี้เป็นแพ็คเกจบริการไหม — เทียบด้วย `categoryOf` ตัวกลาง ไม่ใช่ startsWith เอง
   เพราะรหัส FG จริงมีทั้ง FG-AAAA-02-001-DDDDD และ FG-AAA-02-001-DDDD (ออโต้/กรอกมือ) */
export const lineIsServicePackage = (line) => categoryOf(line?.fgCode) === SERVICE_ROUND_CATEGORY;

export const hasServicePackageLine = (lines = []) =>
  (Array.isArray(lines) ? lines : []).some(lineIsServicePackage);

const oneEntryMap = (row) => (row?.id ? new Map([[row.id, row]]) : new Map());

/* สายธุรกิจของใบ — **ยืมตัวตัดสินเดียวของระบบ** (`orderBusinessLine`: โครงการก่อน แล้วดีล)
   ต่างกันแค่ทางเข้า: คิวงานมี Map ของหลายใบอยู่แล้ว ส่วนหน้ารายละเอียดมีแค่ก้อน
   `order.project` / `order.deal` ที่ API แนบมาให้ใบเดียว ⇒ ห่อเป็น Map ชั่วคราวให้แทน
   ⚠️ ห้ามเขียนลำดับ "โครงการก่อนแล้วดีล" ขึ้นใหม่ที่นี่ — วันหนึ่งสองที่จะตอบไม่ตรงกัน */
export function orderBusinessLineOf(order, ctx = {}) {
  return orderBusinessLine(order, {
    projectsById: ctx.projectsById || oneEntryMap(order?.project),
    dealsById: ctx.dealsById || oneEntryMap(order?.deal),
  });
}

/* ⭐ เกณฑ์เข้าเส้น — ตัวตัดสินเดียวที่ฟอร์ม SO · ทะเบียน · คิว intake · แท็บงานบริการ
   ต้องเรียกตัวนี้ตัวเดียว ห้ามเขียนเงื่อนไขซ้ำที่จอไหน
   รับ `lines` แยกจาก `order` เพื่อให้ฟอร์มที่ยังไม่บันทึกส่งบรรทัดที่กำลังพิมพ์เข้ามาได้ */
export function orderHasServiceRounds(order, lines, ctx = {}) {
  const rows = Array.isArray(lines) ? lines : order?.lines;
  if (!hasServicePackageLine(rows)) return false;
  return orderBusinessLineOf(order, ctx) === 'SERVICE';
}
