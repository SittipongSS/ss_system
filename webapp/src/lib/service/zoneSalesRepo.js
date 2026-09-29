// ── ตัวโหลด "การขายของโซน" (PR-C · C2 · r2 R1) — ฝั่ง server เท่านั้น ─────────────────────────────────
//
// สองคำถามของแถวโซน:
//   ① ขายแล้วเท่าไร (รอบขายที่มีผล + ใบของมัน) — ป้าย "ขายแล้ว n แพ็ค/รอบ (SO-…)" (`zoneSaleFacts`)
//   ② ใบไหนยังถือโซนนี้ไว้โดยยังไม่เปิดงานบริการ — ป้าย "อยู่ในใบที่ยังไม่อนุมัติ: SO-… (ฉบับร่าง)" + คำเตือนตอนปิดใช้งาน
//      และชิปใบสั่งขายบนด่านนัดที่ติด (D15 · `withOwners`)
//
// ⚠️ กติกาการอ่านทุกก้อนในไฟล์นี้:
//   · ลิสต์ id โตตามข้อมูล ⇒ `fetchAllInChunks` (ซอยก้อน PostgREST 16 KB ข้างนอก + ไล่หน้าเพดาน 1,000 แถวข้างใน)
//     และ `order('id')` ปิดท้ายทุกคำสั่ง (ไล่หน้าให้นิ่ง) · `sales_order_line_zones` อยู่ในด่าน check:rowcap (เพดาน 0)
//   · อ่านไม่ขึ้น = **โยน** (fetchAll โยน error ตัวแรก) ไม่ใช่ตอบว่า "ไม่มีใบ" — ป้ายที่หายเพราะ query พัง
//     หน้าตาเหมือน "ไม่มีใบถือโซน" ทุกประการ แล้ว TS จะปิดโซนที่ใบร่างกำลังใช้อยู่
//   · 🪤 ใบสั่งขายอ่านด้วย **id ล้วน + คอลัมน์ตามชื่อ** แล้วตัดสินสถานะใน JS (`setupOrderState`) — ห้ามกรองสถานะที่ query
//     ห้าม select('*') ห้ามแตะยอดเงิน (ยามเงินของใบย้อนหลัง `historicalMoneyGuards.test.mjs` จะนับเป็นผู้ต้องสงสัย)
import { byColumns, fetchAllInChunks } from '@/lib/supabaseInChunks';
import { loadTerms } from '@/lib/service/termsRepo';
import { pendingSetupOrdersByZone, setupOrderState } from '@/lib/service/zoneSetupOrders';

const uniqueIds = (list) => [...new Set((Array.isArray(list) ? list : []).filter(Boolean))];

/**
 * ใบที่ถือแต่ละโซนไว้โดยยังไม่เปิดงานบริการ — `Map<zoneId, Chip[]>` (ดู `pendingSetupOrdersByZone`)
 * @param zoneIds    โซนที่อยากรู้
 * @param withOwners อ่านชื่อ AE เจ้าของดีลด้วย (ชิปด่านนัด D15) — ป้ายบนแถวโซนไม่ใช้ ⇒ ปิดไว้เป็นค่าตั้งต้น
 */
export async function loadSetupOrdersByZone(supabase, zoneIds, { withOwners = false } = {}) {
  const ids = uniqueIds(zoneIds);
  if (!ids.length) return new Map();

  /* รายการโซนของงานบริการในใบ (mig 0392) — ใบหนึ่งเลือกโซนเดียวกันได้หลายบรรทัด (ตัวติดป้ายรวบให้) */
  const allocations = await fetchAllInChunks(ids, (chunk) => supabase
    .from('sales_order_line_zones').select('id, "salesOrderId", "zoneId"')
    .in('zoneId', chunk).order('id', { ascending: true }), { sort: byColumns('id') });
  if (!allocations.length) return new Map();

  /* คอลัมน์ชุดนี้คือทั้งหมดที่ `setupOrderState` → `serviceBackfillState` อ่าน (serviceSetup.js) + เลขที่ใบ + ดีล */
  const orders = await fetchAllInChunks(uniqueIds(allocations.map((a) => a.salesOrderId)), (chunk) => supabase
    .from('sales_orders').select('id, "orderNumber", status, "supersededById", "serviceTermsOpenedAt", "serviceSetupState", origin, "dealId"')
    .in('id', chunk).order('id', { ascending: true }));
  const ordersById = new Map(orders.map((o) => [o.id, o]));

  let dealsById = null;
  if (withOwners) {
    /* อ่านเฉพาะดีลของใบที่ได้ป้ายจริง — ใบที่ประทับแล้ว/ยกเลิกไม่ขึ้นชิป ไม่ต้องรู้ชื่อ AE */
    const dealIds = uniqueIds(orders.filter((o) => setupOrderState(o)).map((o) => o.dealId));
    const deals = await fetchAllInChunks(dealIds, (chunk) => supabase
      .from('sales_deals').select('id, "ownerName"')
      .in('id', chunk).order('id', { ascending: true }));
    dealsById = new Map(deals.map((d) => [d.id, d]));
  }

  return pendingSetupOrdersByZone({ allocations, ordersById, dealsById });
}

/**
 * บริบทการขายของชุดโซน (หน้าไซต์) — อ่าน term **ครั้งเดียว** ให้ทั้งป้ายโซนและตัวช่วยเดิมของ route (critique L8)
 * @returns `{ terms, ordersById, pendingOrdersByZone }` — ส่งต่อเข้า `zoneSaleFacts(zone.id, …)` ทีละโซน
 */
export async function loadZoneSaleContext(supabase, zones = []) {
  const zoneIds = uniqueIds((Array.isArray(zones) ? zones : []).map((z) => z?.id));
  if (!zoneIds.length) return { terms: [], ordersById: new Map(), pendingOrdersByZone: new Map() };

  const [terms, pendingOrdersByZone] = await Promise.all([
    loadTerms(supabase, { zoneIds }),
    loadSetupOrdersByZone(supabase, zoneIds),
  ]);
  /* ใบแม่ของรอบขาย — ตัวตัดสิน "มีผลไหม" (`termIsActive`) + ตราประทับ (แพ็คต่อรอบ) + เลขที่ใบบนป้าย
     + ช่วงบริการ (review 29/09 · `termsSoldNow`: ใบที่ช่วงจบแล้วไม่รวมกับใบต่อสัญญา) */
  const orders = await fetchAllInChunks(uniqueIds(terms.map((t) => t.salesOrderId)), (chunk) => supabase
    .from('sales_orders').select('id, "orderNumber", status, "supersededById", "serviceTermsOpenedAt", "servicePeriodFrom", "servicePeriodTo"')
    .in('id', chunk).order('id', { ascending: true }));

  return { terms, ordersById: new Map(orders.map((o) => [o.id, o])), pendingOrdersByZone };
}
