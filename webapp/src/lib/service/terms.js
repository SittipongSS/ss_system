// ── รอบขายของโซน (mig 0297 · service_zone_terms) — ตัวตัดสินเดียว ─────────
//
// ⭐ **สะพานเส้นเดียวระหว่างฝ่ายขายกับฝ่ายบริการ**: รอบขาย = (บรรทัดใบสั่งขาย × โซน)
//   · ต่อสัญญา = ใบสั่งขายใบใหม่ ผูกโซน **เดิม** ⇒ ประวัติและยอดการใช้ของโซนต่อเนื่อง
//   ไม่ขาดตอนตอนเปลี่ยนรอบ (มติผู้ใช้ 2026-08-27)
//
// 🔄 **ใครสร้าง term** — เดิม TS "ผูก/จัดสรร" บรรทัดลงโซนที่หน้างานเข้าใหม่ (mig 0297/0312) · ใบย้อนหลังเกิด term ตอน
//   AE Sup อนุมัติ (mig 0374) · **ตั้งแต่ mig 0392 ใบ pipeline เกิด term ตอนอนุมัติ** จากโซนที่ฝ่ายขายเลือกในใบ
//   (`sales_order_line_zones` → `sales_order_open_service_terms` · `packageQty` = แพ็คต่อรอบ · หน่วย 'แพ็ค')
//   ⇒ ทางผูกของ TS ปิดแล้ว (409) · ตัวช่วย "จัดสรร" ที่เหลือในไฟล์นี้ใช้ **อ่าน** ใบเดิมเท่านั้น (สรุปงานบริการของใบ)
//
// ⚠️ **term ไม่มีคอลัมน์ status โดยเจตนา** (mig 0297:83-85) — "รอบนี้ยังมีผลไหม"
//   คำนวณจากใบสั่งขายแม่เสมอ: `status = 'approved' AND supersededById IS NULL`
//   ใบถูก Rev. ⇒ ใบเก่าได้ supersededById ⇒ term เก่าตายเองโดยไม่ต้องไปแตะแถว
//   ⇒ เงื่อนไขนี้ต้องอยู่ **ที่ไฟล์นี้ที่เดียว** ห้ามเขียนซ้ำในหน้าจอหรือ API
//   (โรคเดียวกับ "live visit" ที่เคยมี 5 นิยามพร้อมกันใน 5 ไฟล์)
//
// ⚠️ คนละชั้นกับ "ช่วงบริการ" — ใบมีผล ≠ รอบยังไม่หมดอายุ · ใบสั่งขายที่อนุมัติแล้ว
//   ยังอยู่ตลอดไป แต่ startDate/endDate ของ term บอกว่ารอบนั้นครอบเดือนไหนบ้าง
//   สองคำถามนี้แยกกันตอบ (`termOrderActive` กับ `termInWindow`)
import { businessDate } from '@/lib/businessDate';
import { lineUnitsTotal } from '@/lib/sales/linePacks';
import { lineUnitsUnit } from '@/lib/sales/linePackView';

/* ── ชั้นที่ 1: ใบสั่งขายแม่ยังมีผลไหม ─────────────────────────────────── */
export function termOrderActive(order) {
  if (!order) return false;
  return order.status === 'approved' && !order.supersededById;
}

/* ── ชั้นที่ 2: วันนี้อยู่ในช่วงบริการของรอบนี้ไหม ───────────────────────
   ไม่ระบุวัน = ยังไม่รู้ ไม่ใช่ "หมดอายุ" — ของจริงกรอกวันทีหลังเสมอ */
export function termInWindow(term, todayIso = businessDate()) {
  if (!term) return false;
  if (term.startDate && todayIso < term.startDate) return false;
  if (term.endDate && todayIso > term.endDate) return false;
  return true;
}

/* รอบนี้ "มีผล" = ใบแม่ยังมีผล **และ** วันนี้อยู่ในช่วง
   ⚠️ ต้องส่งใบสั่งขายมาด้วยเสมอ — ไม่ส่ง = ตอบ false ไม่ใช่เดาว่าใช่
   (การเดาว่าใช่คือที่มาของ "ส่งเจ้าหน้าที่ไปที่ที่หมดสัญญา 25 จุด") */
export function termIsActive(term, order, todayIso = businessDate()) {
  return termOrderActive(order) && termInWindow(term, todayIso);
}

/* ── ชั้นที่ 3 (ตัวรวมเท่านั้น): ช่วงบริการของใบที่เปิดงานแล้ว (PR-C · review 29/09) ─────────────────────
   🐞 term ที่ 0392 เปิดไม่มี startDate/endDate (mig 0392 "⛔ ไม่เขียน startDate / endDate") ⇒ `termIsActive` ตอบ true
      ตราบที่ใบยังอนุมัติ แม้ช่วงบริการของใบจบไปแล้ว · ต่อสัญญา = ใบใหม่ผูกโซนเดิม (หัวไฟล์) ⇒ ใบเก่ากับใบต่อสัญญามีผล
      พร้อมกัน แล้ว **ตัวรวม** (มาตรฐาน มล. ของโซน · ป้าย "ขายแล้ว n แพ็ค/รอบ") นับซ้ำสองเท่า
   ⭐ ใบที่ประทับ (`serviceTermsOpenedAt`) รู้ช่วงของตัวเองที่หัวใบ (`servicePeriodFrom/To`) ⇒ ใช้เป็นหน้าต่าง
   ⚠️ ใบไม่ประทับ = ช่วงร่างของงานตั้งย้อนหลัง (ผู้จัดการยังไม่ตรวจ) ไม่ใช่ข้อเท็จจริง ⇒ 'current' เสมอ ·
      ไม่รู้วัน = ไม่รู้ ไม่ใช่ "จบแล้ว" (กติกาเดียวกับ `termInWindow`)
   ⚠️ ไม่แตะ `termIsActive` — ด่านนัด/คิว/ฟิลด์เดิมของทะเบียนยังถามชั้น 1+2 ตามเดิม · ตัวนี้ใช้กับ "ผลรวมข้ามใบ" เท่านั้น */
const isoDay = (value) => (/^\d{4}-\d{2}-\d{2}/.test(String(value ?? '')) ? String(value).slice(0, 10) : null);
const pick = (map, key) => (key == null ? null : (map instanceof Map ? map.get(key) : map?.[key]) || null);

/* ── ช่วงบริการของ **รอบขาย** (mig 0400 · ช่วงบริการแยกรายรายการ) ────────────────────────────────────────
   ⭐ ใบโหมด 'line' (`servicePeriodMode`): แต่ละรายการมีช่วงของตัวเอง (`sales_order_lines."servicePeriodFrom"/"servicePeriodTo"`)
      และช่วงของใบเป็นแค่ **ช่วงรวม** (เริ่มแรกสุด → จบสุดท้าย) ⇒ รอบขายของสาขาที่จบก่อน ถ้าอ่านช่วงรวมจะ "ยังไม่จบ" ผิดไปเป็นเดือน
   ⭐ term ไม่มีวันของตัวเอง (0392/0400 ไม่เขียน startDate/endDate — สองช่องนั้นเป็นหน้าต่างของ `termInWindow`: ใส่แล้วรายการที่ยังไม่ถึง
      วันเริ่มจะหายจากคิว "รอตั้งรอบ") ⇒ **ตัวโหลดแนบช่วงของบรรทัดให้ term** (`withLinePeriods` · `termPeriodRepo.attachLinePeriods`)
      แล้วตัวตัดสินล้วนอ่านจาก term
   ⚠️ ทางถอย: ใบโหมด 'line' ที่ term ไม่มีช่วงแนบมา (ตัวโหลดลืมแนบ) = ช่วงรวมของใบ — ประมาณเกินอย่างปลอดภัย (ไม่มีวัน "จบแล้ว" ก่อนจริง)
      ใบที่ประทับแล้วมีช่วงครบทุกรายการแพ็คเกจ (ด่านของ 0400) ⇒ ทางถอยทำงานเฉพาะตอนตัวโหลดลืม · ยาม: termPeriodLoaders.test.mjs */

/** ช่วงของรอบขายหนึ่ง → `{ from: iso|null, to: iso|null }` — ใบโหมด 'line' + ตัวโหลดแนบช่วงของบรรทัดมา = ช่วงของบรรทัด
 *  · อย่างอื่น (โหมดทั้งใบ · ใบย้อนหลัง · ตัวโหลดไม่ได้แนบ · ไม่ส่ง term) = ช่วงของใบ */
export function termPeriodOf(term, order) {
  if (termHasLinePeriod(term, order)) return { from: isoDay(term.linePeriodFrom), to: isoDay(term.linePeriodTo) };
  return { from: isoDay(order?.servicePeriodFrom), to: isoDay(order?.servicePeriodTo) };
}

/** ช่วงของรอบขายนี้มาจาก **ช่วงของรายการ** ไหม (ใบโหมด 'line' + ตัวโหลดแนบช่วงของบรรทัดมาครบคู่) — false = `termPeriodOf` ตอบช่วงของใบ
 *  ⭐ ผู้เรียกที่ต้องบอกผู้ใช้ว่าวันที่เห็นเป็นของรายการหรือของใบ (ทะเบียนต่อสัญญา) ถามที่นี่ — กติกาเดียวกับ `termPeriodOf` */
export function termHasLinePeriod(term, order) {
  return order?.servicePeriodMode === 'line' && !!isoDay(term?.linePeriodFrom) && !!isoDay(term?.linePeriodTo);
}

/** ช่วงบริการของรอบขาย ณ วันนี้ — 'future' | 'current' | 'ended' (กติกาเดียวกับ `orderPeriodPhase`:
 *  ใบไม่ประทับ = 'current' เสมอ · ไม่รู้วัน = ไม่รู้ ไม่ใช่ "จบแล้ว") */
export function termPeriodPhase(term, order, todayIso = businessDate()) {
  if (!order?.serviceTermsOpenedAt) return 'current';
  const { from, to } = termPeriodOf(term, order);
  if (from && todayIso < from) return 'future';
  if (to && todayIso > to) return 'ended';
  return 'current';
}

/** ช่วงบริการของใบ ณ วันนี้ — 'future' | 'current' | 'ended' (= `termPeriodPhase` แบบไม่มี term: ช่วงของใบเสมอ) */
export function orderPeriodPhase(order, todayIso = businessDate()) {
  return termPeriodPhase(null, order, todayIso);
}

/**
 * แนบช่วงของบรรทัดให้รอบขาย (mig 0400) → อาร์เรย์ใหม่ · term ของใบโหมด 'line' ที่รู้ช่วงของบรรทัด = `{ ...term, linePeriodFrom, linePeriodTo }`
 *   · term อื่นทุกตัวคืน **ออบเจ็กต์เดิม** (ใบโหมดทั้งใบ = ไม่มีอะไรเปลี่ยน)
 * @param ordersById      Map/ออบเจ็กต์ ใบสั่งขาย (ต้องพก `servicePeriodMode`)
 * @param linePeriodsById Map/ออบเจ็กต์ lineId → แถวที่มี `servicePeriodFrom`/`servicePeriodTo` (แถว `sales_order_lines` ส่งมาได้ตรง ๆ)
 */
export function withLinePeriods(terms = [], ordersById = new Map(), linePeriodsById = new Map()) {
  return (Array.isArray(terms) ? terms : []).map((term) => {
    if (!term || pick(ordersById, term.salesOrderId)?.servicePeriodMode !== 'line') return term;
    const row = pick(linePeriodsById, term.salesOrderLineId);
    const from = isoDay(row?.servicePeriodFrom);
    const to = isoDay(row?.servicePeriodTo);
    return from && to ? { ...term, linePeriodFrom: from, linePeriodTo: to } : term;
  });
}

/* รอบขายที่ "ขายอยู่ตอนนี้" ของชุด term (โซนหนึ่ง) — ตัวรวมข้ามใบทุกตัวถามที่นี่ ห้ามกรองซ้ำที่จอ
   · ตัดรอบที่ช่วงจบแล้ว (ใบเก่าก่อนต่อสัญญา) เสมอ
   · มีรอบที่อยู่ในช่วง ⇒ นับเฉพาะรอบในช่วง (ใบขายเพิ่มที่ซ้อนช่วงนับรวม · ใบต่อสัญญาที่ยังไม่เริ่มรอก่อน)
   · ไม่มีรอบในช่วงเลย ⇒ รอบที่เริ่มก่อนสุด (ใบแรกของโซนที่รอวันเริ่ม — "ขายแล้ว" ต้องไม่หายระหว่างรอ)
   ⭐ mig 0400: ช่วง = ช่วงของ **รอบขาย** (`termPeriodPhase` — ใบแยกรายรายการใช้ช่วงของบรรทัดที่ตัวโหลดแนบมา · ใบอื่นใช้ช่วงของใบเหมือนเดิม) */
export function termsSoldNow(terms = [], ordersById = new Map(), todayIso = businessDate()) {
  const orderOf = (id) => (ordersById instanceof Map ? ordersById.get(id) : ordersById?.[id]) || null;
  const live = (Array.isArray(terms) ? terms : [])
    .filter((t) => t && termIsActive(t, orderOf(t.salesOrderId), todayIso))
    .map((t) => ({ term: t, order: orderOf(t.salesOrderId) }));
  const current = live.filter(({ term, order }) => termPeriodPhase(term, order, todayIso) === 'current');
  if (current.length) return current.map(({ term }) => term);
  const future = live.filter(({ term, order }) => termPeriodPhase(term, order, todayIso) === 'future');
  if (!future.length) return [];
  const first = future.map(({ term, order }) => termPeriodOf(term, order).from).sort()[0];
  return future.filter(({ term, order }) => termPeriodOf(term, order).from === first).map(({ term }) => term);
}

/* จำนวน **โซนไม่ซ้ำ** ของรอบขายของใบ เมื่อใบยังมีผล — บรรทัดด่านเงินในโมดัล FN รับรองงวด (PR-C C5 · C-D15)
   ⭐ สองบรรทัดของใบลงโซนเดียวกันได้ (SO-26090247-0: 2 term บน Office) ⇒ นับโซน ไม่ใช่นับ term
   ⚠️ ใบไม่มีผล/ไม่ส่งใบ = 0 (ชั้นที่ 1 ตัวเดียวของระบบ) · ไม่ดูช่วงวันของ term — ด่านเงินเปิดตาม "จ่ายถึง" ของใบ ไม่ใช่วันนี้ */
export function serviceTermZoneCount(terms = [], order = null) {
  if (!termOrderActive(order)) return 0;
  return new Set((Array.isArray(terms) ? terms : []).map((t) => t?.zoneId).filter(Boolean)).size;
}

/* 🔄 `termSnapshotFromLine` (ภาพนิ่งจากบรรทัดตอน TS ผูก) ถอดแล้ว (mig 0392) — ทางผูกของ TS ปิด ⇒ ไม่มีผู้เรียก
   · ภาพนิ่งของ term ใบ pipeline ก๊อปใน SQL ตอนอนุมัติ (`sales_order_open_service_terms`) */

/* ── จัดสรรบรรทัดขายลงโซน (mig 0312 · มติผู้ใช้ 2026-08-29) — **อ่านอย่างเดียว** ตั้งแต่ mig 0392 ─────────────────
   ⚠️ ใช้กับใบที่ยังไม่ประทับเท่านั้น (สรุปงานบริการของใบ · salesOrderServiceSummary) — ใบที่ประทับแล้วไม่มี "ของค้าง"
   > *"ไม่ต้องนับบรรทัดแล้ว นับแค่จำนวน FG พอ เพื่อให้ทาง TS จัดสรร ส่งโซนเอง"*

   "บรรทัด" เป็นรูปร่างของ **เอกสารขาย** (แยกตามราคา/ส่วนลด) ไม่ใช่รูปร่างของ **งาน**
   ของจริง: SO-26080077-0 มี 10 บรรทัด แต่เป็น FG แค่ 2 ชนิด รวม 13 หน่วย
   ⇒ หน่วยที่ TS ทำงานด้วยคือ **FG + จำนวน** ส่วนบรรทัดเป็นแค่ที่มา

   ⚠️ `packageQty` ของ term = **จำนวนที่จัดสรรลงโซนนั้น** ไม่ใช่จำนวนทั้งบรรทัด
      (เปลี่ยนความหมายที่ mig 0312 — แถวเก่าคือ "จัดสรรทั้งบรรทัดลงโซนเดียว"
      ซึ่งเป็นกรณีเฉพาะของกติกาใหม่อยู่แล้ว จึงไม่ต้องแปลงข้อมูล) */

/* สิ่งที่จัดสรรไปแล้วของแต่ละบรรทัด — Map<lineId, { qty, whole }>
   ⚠️ **`whole`** = มี term ที่ไม่ได้ระบุจำนวน ⇒ ถือว่ากินทั้งบรรทัด
      แถวที่เกิดก่อน mig 0312 เป็นแบบนี้ทั้งหมด (ตอนนั้น 1 บรรทัด = 1 โซนเสมอ
      และ `packageQty` เป็น snapshot ที่บรรทัดอาจไม่มีค่า) · ถ้านับเป็น 0
      ใบเก่าทุกใบจะเด้งกลับเข้าคิวพร้อมกันทั้งกอง */
export function allocatedByLine(terms = []) {
  const map = new Map();
  for (const term of terms) {
    const lineId = term.salesOrderLineId;
    if (!lineId) continue;
    const entry = map.get(lineId) || { qty: 0, whole: false };
    const qty = Number(term.packageQty);
    if (Number.isFinite(qty) && qty > 0) entry.qty += qty;
    else entry.whole = true;
    map.set(lineId, entry);
  }
  return map;
}

/* จำนวนของบรรทัดที่ "ยังไม่ถูกจัดสรร" — ตัวช่วยภายในของ `fgSummary` (ไม่ export แล้ว · mig 0392 ไม่มีผู้เรียกข้างนอก)
   ⚠️ บรรทัดที่ไม่มีจำนวน (qty ว่าง/0) ถือว่า **จัดสรรครบเมื่อมีอย่างน้อยหนึ่งโซน** —
      ของแบบนี้มีจริง (บริการรายเดือน "1 งาน") การบังคับให้กรอกจำนวนจะทำให้ผูกไม่ได้เลย
   ⭐ เลขแพ็คของบรรทัด (mig 0407 · งวด PR-2): จำนวนของบรรทัด = **หน่วยรวม** `lineUnitsTotal` (แพ็ค × จำนวน)
      บรรทัด 2 แพ็ค × 12 เดือน ต้องจัดสรร 24 — เลขเดียวกับที่คนขายพิมพ์ 24 ไว้ในช่องจำนวนแบบเดิม ไม่ใช่ 2 (แพ็คต่อเดือน)
      บรรทัดที่ไม่มีเลขแพ็ค (ทุกบรรทัดก่อนงวด PR-3) ได้ `qty` ตามเดิมทุกค่า
   ⚠️ ขีดจำกัดที่รู้ (งวด PR-5 เป็นเจ้าของ): ใบที่ **ยังไม่ประทับ** แต่ term เก็บ "แพ็คต่อรอบ" ใน `packageQty`
      (ใบย้อนหลังของ mig 0374/0394) จะเทียบ แพ็ค × เดือน กับ แพ็คต่อรอบ = คนละหน่วย · เกิดได้เฉพาะใบย้อนหลังที่มีเลขแพ็ค
      ซึ่งยังไม่มีทางเกิดจนกว่าฟอร์มใบย้อนหลังจะรับเลขแพ็ค — ถึงตอนนั้นต้องแก้ที่นี่ด้วย (docs/qt-pack-column.md) */
function remainingOfLine(line = {}, allocated = 0) {
  const entry = typeof allocated === 'object' && allocated
    ? allocated
    : { qty: Number(allocated) || 0, whole: false };
  if (entry.whole) return 0;
  const qty = lineUnitsTotal(line);
  if (!Number.isFinite(qty) || qty <= 0) return entry.qty > 0 ? 0 : 1;
  return Math.max(0, qty - entry.qty);
}

/* สรุป "ของที่ต้องจัดสรร" ของใบหนึ่ง — รวมตาม **FG** ไม่ใช่ตามบรรทัด
   คืน [{ key, fgCode, description, unit, installationPoint, qty, remaining, lines: [...] }]
   ⚠️ จัดกลุ่มด้วย fgCode ก่อน ถ้าไม่มีจึงใช้คำบรรยาย — บรรทัดที่ไม่มีรหัสมีจริง
      (บริการ/ค่าออกแบบ) และต้องไม่ถูกยุบรวมกับของคนละอย่างที่บังเอิญไม่มีรหัสเหมือนกัน
   ⭐ **จุดติดตั้งแยกกลุ่ม** (ใบสั่งขายย้อนหลัง · mig 0360 · มติข้อ 8 + 17) — ใบย้อนหลังหนึ่งบรรทัด = หนึ่ง
      จุดติดตั้งตามชีต (`sales_order_lines.installationPoint`) และ FG เดียวกันอยู่คนละสาขาได้ ⇒ ยุบรวมเมื่อไร
      TS เห็น "FG-1 · 6 หน่วย" ก้อนเดียว แล้วไม่รู้ว่าต้องไปหาไซต์ไหนบ้าง
      ⚠️ บรรทัดที่ไม่มีจุดติดตั้ง (ใบปกติทั้งหมด) คีย์เดิมเป๊ะ — การยุบตาม FG ของมติ 2026-08-29 ไม่ขยับ
   🔄 mig 0392: ผู้อ่านเหลือตารางสรุปงานบริการของใบ (salesOrderServiceSummary) — คิวผูกโซนของ TS
      (`lineNeedsAllocation` · `spreadAllocation`) ถอดพร้อมทางผูก
   ⭐ เลขแพ็คของบรรทัด (mig 0407 · งวด PR-2): จำนวนของกลุ่ม = Σ `lineUnitsTotal` และหน่วยของบรรทัดที่มีเลขแพ็ค = "แพ็ค"
      (`lineUnitsUnit` — แพ็คต่อเดือน × เดือน = แพ็ค · ไม่ใช่ "24 เดือน") · บรรทัดที่มีเลขแพ็คกับบรรทัดเดิมของ FG เดียวกัน
      ที่หน่วยไม่ใช่ "แพ็ค" อยู่กลุ่มเดียวกัน = "ปนหน่วย" ตามกติกาเดิม · บรรทัดที่ไม่มีเลขแพ็คไม่ถูกแตะ */
export function fgSummary(lines = [], allocatedMap = new Map()) {
  const groups = new Map();
  for (const line of lines) {
    const point = String(line.installationPoint ?? '').trim();
    const key = (line.fgCode || `desc:${line.description || line.id}`) + (point ? `|pt:${point}` : '');
    const unit = lineUnitsUnit(line, line.unit);
    const row = groups.get(key) || {
      key,
      fgCode: line.fgCode || null,
      description: line.description || null,
      unit: unit || null,
      installationPoint: point || null,
      qty: 0,
      remaining: 0,
      lines: [],
    };
    const qty = lineUnitsTotal(line);
    row.qty += Number.isFinite(qty) && qty > 0 ? qty : 0;
    row.remaining += remainingOfLine(line, allocatedMap.get(line.id));
    row.lines.push(line);
    /* หน่วยต่างกันในกลุ่มเดียวกัน = บวกกันไม่ได้ ⇒ บอกว่าปนหน่วย ไม่ใช่เงียบ
       (กติกาเดียวกับตัวนำเข้าข้อมูลเก่า: แปลงไม่ได้ต้องบอก ห้ามเดา) */
    if (row.unit && unit && row.unit !== unit) row.unit = 'ปนหน่วย';
    groups.set(key, row);
  }
  return [...groups.values()];
}

/* ── มาตรฐานการใช้ต่อเดือน ──────────────────────────────────────────────
   ⚠️ **ไม่มีสูตรที่เป็นทางการ** — บรรทัดขายไม่มีคอลัมน์ ml และไม่มีเอกสารไหน
   กำหนดที่มาไว้ · หลักฐานเดียวที่มีคือชีตของทีม: 10 จาก 13 แถว "แพ็ค = ลิตร/เดือน"
   เป๊ะ ส่วนจำนวนเครื่องต่อแพ็คแกว่ง (docs/service-field-operations.md:84-96)
   ⇒ ที่นี่ให้ได้แค่ **ข้อเสนอที่คนต้องกดรับ** ห้ามเขียนลงแถวเอง
   กติกางานนำเข้าเขียนไว้ชัด: แถวที่แปลงไม่ได้ต้องค้างให้คนตัดสิน ห้ามใส่ค่า
   default แล้วเงียบ (business-line-level-and-handoff.md:349) */
export const ML_PER_PACK_HINT = 1000;

/* หน่วยที่หลักฐาน "1 แพ็ค = 1 ลิตร/เดือน" ใช้ได้ — บรรทัดที่ขายเป็นกิโลกรัม/ชิ้น/ขวด
   ไม่เข้าข่าย
   🐞 ของเดิมเสนอทุกบรรทัดที่มีจำนวน ⇒ บรรทัด "แฮนด์เจล 240 กิโลกรัม" ขึ้นข้อเสนอ
      "ใช้ 240,000 ml" ซึ่งไม่มีความหมายเลย · ข้อเสนอที่ผิดบ่อยกว่าถูก แย่กว่าไม่มี
      ข้อเสนอ เพราะคนจะกดรับโดยไม่คิด แล้วตัวเลขผิดจะกลายเป็นฐานเทียบยอดใช้จริง */
const PACK_UNITS = ['แพ็ค', 'แพ็ก', 'pack', 'ชุด', 'set'];

export const isPackUnit = (unit) => {
  const value = String(unit ?? '').trim().toLowerCase();
  if (!value) return false;
  return PACK_UNITS.some((u) => value.includes(u.toLowerCase()));
};

export function suggestStandardMl(packageQty, unit = null) {
  // ไม่รู้หน่วย = ไม่เสนอ · รู้ว่าเป็นหน่วยอื่นที่ไม่ใช่แพ็ค = ไม่เสนอ
  if (!isPackUnit(unit)) return null;
  const qty = Number(packageQty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return Math.round(qty * ML_PER_PACK_HINT);
}

/* 🔄 `normalizeTermInput` (ตรวจแถวก่อน TS เขียน term) ถอดแล้ว (mig 0392) — ทางผูกปิด ไม่มีผู้เขียน term ฝั่ง JS
   · ข้อความใบ้ `STANDARD_ML_HINT_TEXT` ถอดพร้อมกัน (ผู้ใช้คือวิซาร์ดที่ถูกลบ) */

/* ── ตัวช่วยอ่าน ─────────────────────────────────────────────────────── */

/* รอบล่าสุดของโซน — เรียงตามวันเริ่ม แล้วค่อยวันสร้าง (รอบที่ยังไม่ระบุวันเริ่ม
   ถือว่าใหม่สุดเพราะเพิ่งผูก) */
export function latestTermOfZone(terms = []) {
  const sorted = [...terms].sort((a, b) => {
    const byStart = String(b.startDate || '9999-99-99').localeCompare(String(a.startDate || '9999-99-99'));
    if (byStart !== 0) return byStart;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  return sorted[0] || null;
}

export function termsByZone(terms = []) {
  const map = new Map();
  for (const term of terms) {
    const list = map.get(term.zoneId) || [];
    list.push(term);
    map.set(term.zoneId, list);
  }
  return map;
}

/* โซนที่ยังไม่มีรอบที่มีผลเลย — แท็บพื้นที่บริการของลูกค้า · ทะเบียนโซน
   ⚠️ "ไม่มีรอบ" ต่างจาก "รอบหมดอายุ" — ทั้งคู่ต้องตามต่อ แต่คนละข้อความ */
export function zoneTermState(zoneId, terms = [], ordersById = new Map(), todayIso = businessDate()) {
  const rows = terms.filter((t) => t.zoneId === zoneId);
  if (!rows.length) return { state: 'none', term: null };
  const active = rows.find((t) => termIsActive(t, ordersById.get(t.salesOrderId), todayIso));
  if (active) return { state: 'active', term: active };
  return { state: 'ended', term: latestTermOfZone(rows) };
}
