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

/* ⭐ **คำเรียกจำนวนรอบที่ขายไว้ของบรรทัดแพ็คเกจบริการ** — มติเจ้าของ 29/09: *"ไปกี่รอบ เปลี่ยน เป็น คำว่า จำนวนรอบบริการ"*
   ที่เดียวของคำนี้: ช่องกรอกของบรรทัด (ขั้น ② ใบย้อนหลัง) · ป้ายฝั่งอ่าน (ขั้น ④ · หน้าใบสั่งขาย) · หัวคอลัมน์การ์ดโซน ·
   หน้าต่างเพิ่มหลายโซน · แถว "จำนวนรอบบริการ · แต่ละครั้งกี่แพ็ค" ของขั้น ④/โมดัลอนุมัติ ⇒ คอมโพเนนต์ห้ามสะกดคำนี้เอง (เทสต์ยึด)
   ⚠️ "จำนวนรอบบริการที่ขายไว้" ของการ์ดสัญญาบริการ (ServiceContractCard · mig 0326) เป็นหัวการ์ดเดิม — ไม่ใช่ป้ายช่อง
   ⚠️ คำเดียวกับ `SERVICE_SETUP_LINE_TEXT.roundsLabel` ของใบใหม่ (serviceSetup.js) — ไฟล์นี้ import serviceSetup.js ไม่ได้
     (กฎ 16 · serviceSetupImports.test.mjs) จึงเขียน literal · historicalOrderPlan.test.mjs ยึดให้เท่ากัน */
export const SERVICE_ROUNDS_LABEL = 'จำนวนรอบบริการ';

/* ⭐ **คำเรียกจำนวนแพ็คที่ใช้ต่อการเข้าโซนหนึ่งครั้ง** (`packsPerRound` · ค่าที่เก็บชื่อเดิม) — มติเจ้าของ 29/09:
   *"เรียงว่าไปกี่รอบก่อน แล้วค่อยบอกว่าแต่ละครั้งกี่แพ็ค"* · *"ลำดับนี้ใช้กับ SO ใหม่และ SO ย้อนหลัง"*
   ⇒ ทุกผิวของใบย้อนหลังเรียง `SERVICE_ROUNDS_LABEL` ก่อน แล้วค่อยคำนี้ (ช่องขั้น ② · ป้ายขั้น ④ · การ์ดโซน · โมดัลอนุมัติ)
   ⚠️ คำเดียวกับ `SERVICE_SETUP_LINE_TEXT.packsLabel` (serviceSetup.js) และ `ZONES_BULK_PACKS_LABEL` (หน้าต่างเพิ่มหลายโซน)
     — literal ด้วยเหตุเดียวกับข้างบน · historicalOrderPlan.test.mjs ยึดทั้งสามให้เท่ากัน */
export const SERVICE_PACKS_LABEL = 'แต่ละครั้งกี่แพ็ค';

/* ⭐ **รหัส FG ที่ด่านเงินอ่าน** (mig 0392 · PR-A · มติ r3 28/09) — FG ของบรรทัดก่อนเสมอ
   แล้วค่อยแพ็คเกจที่ฝ่ายขายเลือกให้บรรทัดพิมพ์เอง (`serviceFgCode`) **เฉพาะเมื่อใบประทับ `serviceTermsOpenedAt` แล้ว**
   🔴 ทำไมต้องรอประทับ (#1683): เกณฑ์แคบคือสวิตช์ของด่าน "ต้องมีช่วงครอบก่อนบัญชีรับรองงวด" — นับ `serviceFgCode`
     ตั้งแต่ร่าง = บัญชีรับรองงวดของใบที่กำลังตั้งค่าไม่ได้ทันที · ประทับเกิดตอนอนุมัติ (ใบใหม่) หรือผู้จัดการอนุมัติ
     งานบริการย้อนหลัง ซึ่งด่านยื่นตรวจแล้วว่างวดที่ยังไม่รับรองมีช่วงครอบครบ ⇒ ด่านเงินเปิดตอนที่ของพร้อมพอดี
   ⚠️ ตัวเรียกที่ไม่ส่งใบ (ตัวเลือกสินค้า · วัตถุสินค้าไม่มี serviceFgCode) ได้ผลเหมือนเดิมทุกตัว
   ⚠️ ใบ Rev. ไม่สืบตราประทับ ⇒ ระหว่างร่าง Rev. ของใบที่มีบรรทัดพิมพ์เอง ด่านหลวมลงชั่วคราว (ไม่เคยเข้มขึ้น · D13) */
export function effectiveServiceFgCode(line, order = null) {
  return line?.fgCode || (order?.serviceTermsOpenedAt ? line?.serviceFgCode : null) || null;
}

/* บรรทัดนี้เป็นแพ็คเกจบริการไหม — เทียบด้วย `categoryOf` ตัวกลาง ไม่ใช่ startsWith เอง
   เพราะรหัส FG จริงมีทั้ง FG-AAAA-02-001-DDDDD และ FG-AAA-02-001-DDDD (ออโต้/กรอกมือ)
   ⚠️ มีอาร์กิวเมนต์ที่สอง (`order`) แล้ว — ห้ามส่งแบบ point-free ที่ใบจริงผ่าน (`.filter(lineIsServicePackage)`
     ส่ง index มาเป็น order) · ใช้ลูกศร `(l) => lineIsServicePackage(l, order)` เสมอ */
export const lineIsServicePackage = (line, order = null) =>
  categoryOf(effectiveServiceFgCode(line, order)) === SERVICE_ROUND_CATEGORY;

export const hasServicePackageLine = (lines = [], order = null) =>
  (Array.isArray(lines) ? lines : []).some((l) => lineIsServicePackage(l, order));

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

/* ⭐ เกณฑ์ "ใบมีรอบบริการ" — ตัวตัดสินเดียวของคำถามนี้ ห้ามเขียนเงื่อนไขซ้ำที่จอไหน
   รับ `lines` แยกจาก `order` เพื่อให้ฟอร์มที่ยังไม่บันทึกส่งบรรทัดที่กำลังพิมพ์เข้ามาได้

   ผู้ใช้วันนี้: แผงงวดบนหน้า SO · ทะเบียนการชำระของบัญชี (ตัวกรอง + คอลัมน์จ่ายถึง)
   จะเพิ่ม: ฟอร์มสร้าง SO (คอลัมน์จำนวนรอบ · PR-D) · แท็บงานบริการบนหน้า SO (PR-F)

   ⚠️ **คิว `/service/intake` ของ TS ยังไม่ได้ใช้ตัวนี้ และตั้งใจให้ต่างกันไปก่อน** —
   คิวนั้นถามคำถามที่กว้างกว่า ("ใบไหนต้องไปตั้งไซต์/โซน") จึงตัดสินด้วยสายธุรกิจล้วน
   (`bindQueue` ใน lib/service/intake.js) ⇒ ใบสาย SERVICE ที่ไม่มีบรรทัดหมวด 02-001
   จะขึ้นคิว TS แต่ไม่นับเป็น "ใบมีรอบบริการ" ที่ฝั่งเงิน · ถ้าจะยุบให้เหลือเกณฑ์เดียว
   ต้องทำพร้อมกับตอนที่ intake รับชิปสัญญา/จ่ายถึงใน PR-C ไม่ใช่แอบเปลี่ยนที่นี่ */
/* ⭐ **จำนวนรอบที่ขายไว้ของชุดบรรทัด** (mig 0326) — ตัวรวมเดียวของคำถามนี้
   ใช้ทั้งฝั่งขาย (คอลัมน์ "รอบที่เดิน" บนทะเบียน) และฝั่ง TS (คิวรับงาน · ฟอร์มวางรอบ)

   ⚠️ **null ไม่ใช่ 0** — บรรทัดที่ยังไม่กรอกรอบคือ "ยังไม่ระบุ" ⇒ ถ้าไม่มีบรรทัดไหน
   กรอกเลย ตอบ null เพื่อให้จอโชว์ขีด · ตอบ 0 จะอ่านเป็น "ขายไว้ศูนย์รอบ" ซึ่งผิด
   ⚠️ รวมทุกบรรทัดในชุดที่ส่งมา ไม่กรองหมวดซ้ำ — บรรทัดที่ไม่ใช่งานบริการถูกล้างค่า
   ตั้งแต่ตอนบันทึกแล้ว (normalizeServiceRounds) ⇒ กรองซ้ำที่นี่ = สองที่ที่เพี้ยนหากันได้ */
export function serviceRoundsSold(lines = []) {
  const rows = Array.isArray(lines) ? lines : [];
  let total = 0;
  let seen = false;
  for (const line of rows) {
    const rounds = Number(line?.serviceRounds);
    if (Number.isFinite(rounds) && rounds > 0) { total += rounds; seen = true; }
  }
  return seen ? total : null;
}

export function orderHasServiceRounds(order, lines, ctx = {}) {
  const rows = Array.isArray(lines) ? lines : order?.lines;
  if (!hasServicePackageLine(rows, order)) return false;
  return orderBusinessLineOf(order, ctx) === 'SERVICE';
}

/* ⭐ **จำนวนครั้งที่ต้องไปหน้างานที่ขายไว้** (mig 0392 · D23) — n/N ของ TS สำหรับใบที่ตั้งงานบริการรายบรรทัดแล้ว
   หนึ่งไซต์ไปครั้งเดียวต่อรอบ ไม่ว่าจะมีกี่บรรทัด/กี่โซน ⇒ ต่อไซต์ = รอบสูงสุดของบรรทัด (ไม่ซ้ำ) ที่ผูกไซต์นั้น
   · ทั้งใบ = Σ ต่อไซต์ · `mixed` = บรรทัดในไซต์เดียวกันขายรอบไม่เท่ากัน (จอบอก "รอบไม่เท่ากัน" ไม่ใช่เดา)
   @param links     terms หรือ allocations `[{ salesOrderLineId, zoneId }]`
   @param zonesById Map zoneId → { siteId } — โซนที่ไม่รู้ไซต์ข้าม (นับไม่ได้ว่าไปไซต์ไหน)
   → `{ bySite: Map<siteId, { rounds: number|null, mixed, values: number[] }>, total: number|null, mixed }`
     `values` = รอบที่ไม่ซ้ำของบรรทัดในไซต์นั้น เรียงมากไปน้อย — จอบอก "12 · 8 รอบ (ต่างกันรายรายการ)" ไม่ใช่แค่ตัวมากสุด
   ⚠️ null ไม่ใช่ 0 (กติกาเดียวกับ `serviceRoundsSold`) — ไม่มีไซต์ไหนมีรอบเลย ตอบ null ให้จอขีด
   ⚠️ ใบเก่าที่ยังไม่ประทับยังใช้ `serviceRoundsSold` (Σ รายบรรทัด) ตามเดิม */
export function serviceVisitsSold({ lines = [], links = [], zonesById = new Map() } = {}) {
  const roundsByLine = new Map((Array.isArray(lines) ? lines : []).map((line) => [line?.id, line?.serviceRounds]));
  const linesBySite = new Map();
  for (const link of Array.isArray(links) ? links : []) {
    const zone = zonesById instanceof Map ? zonesById.get(link?.zoneId) : null;
    const siteId = zone?.siteId;
    if (!siteId || !link?.salesOrderLineId) continue;
    if (!linesBySite.has(siteId)) linesBySite.set(siteId, new Set());
    linesBySite.get(siteId).add(link.salesOrderLineId);
  }
  const bySite = new Map();
  let total = 0;
  let seen = false;
  let mixed = false;
  for (const [siteId, lineIds] of linesBySite) {
    const values = [...lineIds]
      .map((id) => Number(roundsByLine.get(id)))
      .filter((n) => Number.isFinite(n) && n > 0);
    const rounds = values.length ? Math.max(...values) : null;
    const distinct = [...new Set(values)].sort((a, b) => b - a);
    const siteMixed = distinct.length > 1;
    bySite.set(siteId, { rounds, mixed: siteMixed, values: distinct });
    if (rounds !== null) { total += rounds; seen = true; }
    if (siteMixed) mixed = true;
  }
  return { bySite, total: seen ? total : null, mixed };
}

/**
 * ขายไว้กี่รอบของ **ไซต์เดียว** (หน้าไซต์ · ServicePlanModal) — ตัวนับเดียวกับแถว "รอตั้งรอบ" (D23)
 *   ต่อใบที่ยังมีผล: ใบที่ประทับแล้ว (`serviceTermsOpenedAt`) = รอบสูงสุดของบรรทัดที่ลงไซต์นี้ (`serviceVisitsSold`)
 *   · ใบเดิมที่ยังไม่ประทับ = Σ รายบรรทัด (`serviceRoundsSold` ตามเดิม) · หลายใบที่ยังมีผล (ต่ออายุซ้อน) = รวมกัน
 * 🐞 เดิมบวกทุกบรรทัดเสมอ ⇒ สองบรรทัด 12 กับ 4 รอบที่ไซต์เดียวขึ้น 16 ที่หน้าไซต์ แต่แถวรอตั้งรอบขึ้น 12
 * @param orders ใบที่ยังมีผลเท่านั้น (ผู้เรียกกรอง `termOrderActive`) · select ต้องพก "serviceTermsOpenedAt"
 * @param terms รอบขายของโซนในไซต์นี้ `{ salesOrderId, salesOrderLineId, zoneId }` · @param zonesById Map zoneId → { siteId }
 * → จำนวน หรือ null (ไม่มีรอบให้นับ — ไม่ใช่ 0)
 */
export function siteRoundsSoldOf({ orders = [], terms = [], lines = [], zonesById = new Map() } = {}) {
  const linesById = new Map((Array.isArray(lines) ? lines : []).map((line) => [line?.id, line]));
  const termList = Array.isArray(terms) ? terms : [];
  let total = 0;
  let seen = false;
  for (const order of Array.isArray(orders) ? orders : []) {
    const orderTerms = termList.filter((term) => term?.salesOrderId === order?.id);
    const orderLines = [...new Set(orderTerms.map((term) => term?.salesOrderLineId).filter(Boolean))]
      .map((id) => linesById.get(id)).filter(Boolean);
    const rounds = order?.serviceTermsOpenedAt
      ? serviceVisitsSold({ lines: orderLines, links: orderTerms, zonesById }).total
      : serviceRoundsSold(orderLines);
    if (rounds !== null && rounds !== undefined) { total += rounds; seen = true; }
  }
  return seen ? total : null;
}

/* ⭐ **"ใบนี้อยู่บนเส้นบริการไหม" — กว้างกว่าตัวบน และตั้งใจให้กว้าง**
 *
 * 🐞 **ทำไมต้องมีตัวที่สอง** — วัดบนฐานจริง 08/09/2026: ใบที่ยังมีผลบนเส้นบริการ **30 ใบ**
 *   แต่เข้าเกณฑ์ "มีรอบบริการ" แค่ **8 ใบ** ⇒ อีก 22 ใบ **แท็บสัญญาไม่ขึ้น และช่อง
 *   "ครอบคลุมบริการ" ไม่มีให้กรอก** ทั้งที่เป็นงานบริการจริง
 *   เหตุที่ `fgCode` ว่าง: ใบเสนอราคามีชนิดบรรทัด "พิมพ์เอง" ที่ตั้ง `fgCode = null`
 *   โดยตั้งใจ แล้ว RPC สร้าง SO ก๊อปค่าดิบมา ⇒ เป็นทรงการทำงานปกติ ไม่ใช่ข้อมูลเก่าเสีย
 *
 * 🔴 **ห้ามแก้ด้วยการขยาย `orderHasServiceRounds` แทน** — ตัวนั้นไม่ใช่แค่สวิตช์โชว์
 *   มันคือสวิตช์ของ **ด่านเงิน**: "ใบบริการต้องมีช่วงครอบก่อนบัญชีรับรองงวด"
 *   (`installmentActionError`) ⇒ ขยายเมื่อไร 22 ใบจริงบน production **รับรองงวดไม่ได้
 *   ทันทีจนกว่าจะกรอกช่วงครอบ** = หยุดรับเงินบนโมดูลที่ใช้งานอยู่
 *
 * ⇒ แยกสองคำถามที่วันนี้ยุบเป็นสวิตช์เดียว:
 *     **โชว์ที่ให้กรอกไหม**  → ตัวนี้ (กว้าง · เส้นบริการล้วน)
 *     **บล็อกการรับรองไหม** → `orderHasServiceRounds` (แคบ · ไม่แตะ)
 *   ปลอดภัยเพราะ API ของช่องครอบคลุมบริการ **ไม่เคยถามเกณฑ์บริการอยู่แล้ว** —
 *   กรอกได้โดยไม่ต้องผ่านด่านนี้ · จอเป็นตัวเดียวที่ปิดไว้
 *
 * ⚠️ **ไม่ใช้กับแท็บ "งานบริการ"** — ตารางกรอกจำนวนรอบตีกลับบรรทัดที่ไม่ใช่หมวด 02-001
 *   (`validateServiceRoundsPatch`) ⇒ เปิดแท็บให้ใบที่ไม่มีบรรทัดหมวดนั้น = แท็บที่เปิดได้
 *   แต่ไม่มีแถวให้กรอก · แท็บนั้นยังใช้เกณฑ์แคบต่อไป
 */
export function orderOnServiceLine(order, ctx = {}) {
  return orderBusinessLineOf(order, ctx) === 'SERVICE';
}
