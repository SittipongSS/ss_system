// ── คิวงานเข้าใหม่ของฝ่าย TS (เฟส 4) — logic ล้วน ────────────────────────
//
// ⭐ **ที่มา**: ตัวเลขจากชีตของทีม — 102 จุดที่ลูกค้าจ่ายเงินแล้วแต่ไม่มีคิวบริการ
//   ไม่ได้ "หายไป" มันไม่เคยปรากฏเลย เพราะไม่มีอะไรพาใบสั่งขายมาถึงฝ่าย TS
//   (docs/business-line-level-and-handoff.md:157) ⇒ หน้านี้คือทางที่งานเดินมาถึง
//
// ⚠️ **TS ไม่ใช่ต้นทางของงาน** — ทุกแถวในคิวมีต้นเรื่องเป็นใบสั่งขายเสมอ
//   🔄 **mig 0392 (PR-A · D14): TS ไม่ผูกโซนอีกแล้ว** — ฝ่ายขายตั้งแพ็คเกจ · โซน · แพ็คต่อรอบ · รอบ · ช่วงบริการ
//      ที่หน้าใบสั่งขาย อนุมัติแล้วรอบขายของโซนเกิดเอง ⇒ งานแรกของ TS คือ "รอตั้งรอบ"
//      ถังผูกโซนเดิม (`bindQueue`) ถูกถอด · ใบที่อนุมัติไปก่อน 0392 อยู่ที่ `legacySetupQueue.js`
//      (แท็บ `bind` เดิม · ดูอย่างเดียว) — ไฟล์แยกเพราะต้องใช้ `serviceSetup.js` ซึ่งไฟล์นี้ **ห้าม** import (กฎ 16)
//
// ⚠️ **ใบที่ตอบไม่ได้ว่าสายอะไร ต้องขึ้นถังของมันเอง ห้ามเงียบและห้ามเดา**
//   สายธุรกิจเป็นของโครงการ (projects.line) ส่วน sales_deals.line เป็นสำเนาที่ดีล
//   ถือไว้ตอนยังไม่มีโครงการ · ทั้งคู่ NULL ได้จริง (99/356 ดีลวันนี้) ⇒ เดาเมื่อไร
//   ใบสายสินค้าจะไหลเข้าคิวบริการ หรือใบบริการจะหายไปเงียบ ๆ ทั้งสองทางแย่พอกัน
import { businessDate } from '@/lib/businessDate';
import { isBusinessLine } from '@/lib/master/businessLines';
import { termIsActive } from './terms';
import { serviceRoundsSold, serviceVisitsSold } from '@/lib/sales/serviceOrders';
import { coversDate, paidThrough } from '@/lib/sales/paymentCoverage';
import { paymentNotRequired } from '@/lib/sales/salesOrderPayments';
import { ORIGIN_PIPELINE } from '@/lib/sales/historicalOrders';
import { fmtNumber } from '@/lib/format';

/* แท็บของหน้างานเข้าใหม่ (mig 0392 · D14) — งานแรกของ TS คือ "รอตั้งรอบ" (ค่าตั้งต้นของหน้า)
   ⚠️ **คีย์ `bind` คงไว้** เพื่อ URL/ลิงก์เดิม แต่ความหมายเปลี่ยนเป็น "ใบเดิมที่รอฝ่ายขายตั้งงานบริการ" (ดูอย่างเดียว)
      และย้ายไปท้ายสุด · คีย์ชุดนี้ต้องตรงกันทั้ง route · หน้า · scheduleQueueView (แผน §4.1 ข้อ 9) */
export const INTAKE_TABS = ['plan', 'visit', 'bind'];

export const INTAKE_TAB_LABELS = {
  plan: 'รอตั้งรอบ',
  visit: 'ครบรอบยังไม่มีนัด',
  bind: 'รอฝ่ายขายตั้งงานบริการ (ใบเดิม)',
};

export const INTAKE_TAB_HINTS = {
  plan: 'โซนที่ขายแล้วแต่ยังไม่มีรอบเข้าบริการ — ขายแล้วไม่มีใครไปคือที่มาของ 102 จุด',
  visit: 'รอบที่เดินอยู่แต่ไม่มีนัดข้างหน้าเลย',
  bind: 'ใบที่อนุมัติก่อนฝ่ายขายตั้งงานบริการเอง — ฝ่ายขายตั้งค่าแล้วผู้จัดการฝ่ายขายตรวจ · ตรวจผ่านแล้วขึ้น ‘รอตั้งรอบ’ เอง · TS ไม่ต้องผูกโซน',
};

/**
 * ช่อง "ขายไว้" ของแถวรอตั้งรอบ (การ์ด · ตาราง ใช้ตัวเดียว) → `{ value, hint }` · ยังไม่ระบุ = null (จอขีด)
 *   บรรทัดในไซต์เดียวกันขายรอบไม่เท่ากัน (`roundsMixed`) = บอกทุกค่า + คำแนะนำ ไม่ใช่โชว์แค่ตัวมากสุดเงียบ ๆ (r2 §TS plan row)
 *   ⭐ PR-C (C1): ใบที่ฝ่ายขายตั้งโซนแล้ว (`row.stamped`) ขายเป็นรอบของทุกโซนในไซต์ ⇒ "12 รอบ/โซน" · ใบเดิม/ย้อนหลัง "12 รอบ" เท่าเดิม
 */
export function planRoundsSoldText(row) {
  if (!row?.roundsSold) return null;
  const values = Array.isArray(row.roundsValues) ? row.roundsValues : [];
  if (row.roundsMixed && values.length > 1) {
    return { value: `${values.map((n) => fmtNumber(n)).join(' · ')} รอบ (ต่างกันรายรายการ)`, hint: 'ตั้งรอบตามรายการที่มากที่สุด' };
  }
  return { value: `${fmtNumber(row.roundsSold)} ${row.stamped ? 'รอบ/โซน' : 'รอบ'}`, hint: null };
}

/* ── สายธุรกิจของใบสั่งขาย ────────────────────────────────────────────
   ลำดับการถาม: โครงการก่อน (เจ้าของค่าจริง) แล้วค่อยดีล (สำเนาที่ใช้ตอนยังไม่มี
   โครงการ) · ตอบไม่ได้ = null ไม่ใช่ 'PRODUCT' */
export function orderBusinessLine(order, { projectsById = new Map(), dealsById = new Map() } = {}) {
  const project = order?.projectId ? projectsById.get(order.projectId) : null;
  if (isBusinessLine(project?.line)) return project.line;
  const deal = order?.dealId ? dealsById.get(order.dealId) : null;
  if (isBusinessLine(deal?.line)) return deal.line;
  return null;
}

/* ใบที่ "รับได้" = อนุมัติแล้ว และยังไม่ถูก Rev. ทับ
   ⚠️ ตัวเดียวกับที่ terms.js ใช้ตัดสินว่ารอบยังมีผล — ใบที่ยังไม่อนุมัติผูกโซนไม่ได้
   เพราะยอด/ของยังขยับได้ แล้ว snapshot ที่ก๊อปไปจะกลายเป็นของปลอมทันที */
export const orderReceivable = (order) => order?.status === 'approved' && !order?.supersededById;

/* ── ปลายทางของการผูก: ไซต์ต้องเป็นของลูกค้าในใบ · เป็นไซต์ลูกค้า · โซน/ไซต์ยังเปิดใช้งาน ────────
   ⭐ เข้มขึ้นพร้อมใบสั่งขายย้อนหลัง (แผน P1 §3-K · มติข้อ 17) — บรรทัดของใบย้อนหลังมาจากชีตที่ตรงงานจริง
      แค่ 25% ⇒ TS หาไซต์/โซนเองแล้วผูก · ของเดิม server เชื่อ zoneId ที่จอส่งมาอย่างเดียว ⇒ ยิงตรงก็ผูกไซต์
      ของลูกค้าคนอื่น / คลังเครื่อง / โซนที่ปิดแล้วได้ (wizard กรองแค่ไซต์ตามลูกค้า และยังให้เลือกโซนที่ปิดใช้งาน)
   ⚠️ ใช้กับทุกใบ ไม่ใช่เฉพาะใบย้อนหลัง
   🔄 mig 0392: วิซาร์ดผูกโซนของ TS ถูกถอด — ผู้ถามวันนี้คือตัวตัดสินงานบริการของใบสั่งขาย (`serviceSetup.js`:
      ตรวจโซนที่ฝ่ายขายเลือก ทั้งตอนบันทึกและข้อที่ยังขาดตอนยื่น) ⇒ จอกับด่านยังพูดเรื่องเดียวกัน
   ⚠️ โซนไม่มี customerId ของตัวเอง — ตรวจผ่านไซต์ของโซนเสมอ
   ⚠️ ชนิดไซต์ตาม SITE_KINDS ของ sites.js (mig 0332) — คลังเครื่องเป็นไซต์จริงของบริษัท ไม่ใช่ที่ให้บริการ
   คืนข้อความไทยที่ขึ้นต้นด้วยชื่อของในบรรทัด (lineLabel) หรือ null */
export function bindTargetError({ order, zone, site, lineLabel = '' } = {}) {
  const prefix = lineLabel ? `${lineLabel}: ` : '';
  if (!zone) return `${prefix}ไม่พบโซนในทะเบียน — สร้างโซนก่อนแล้วค่อยผูก`;
  const zoneName = zone.name || zone.id;
  if (!site) return `${prefix}ไม่พบไซต์ของโซน ${zoneName} ในทะเบียน — โหลดหน้าใหม่แล้วลองอีกครั้ง`;
  const siteName = site.name || site.id;
  if (!order?.customerId || String(site.customerId ?? '') !== String(order.customerId)) {
    return `${prefix}โซน ${zoneName} อยู่ในไซต์ของลูกค้ารายอื่น — ผูกได้เฉพาะไซต์ของลูกค้าในใบสั่งขายนี้`;
  }
  if (site.kind !== 'customer') {
    return `${prefix}ไซต์ ${siteName} ไม่ใช่ไซต์ลูกค้า — ผูกงานบริการได้เฉพาะไซต์ลูกค้า`;
  }
  if (site.isActive === false) {
    return `${prefix}ไซต์ ${siteName} ถูกปิดใช้งาน — เปิดใช้งานไซต์ก่อน หรือเลือกไซต์อื่น`;
  }
  if (zone.isActive === false) {
    return `${prefix}โซน ${zoneName} ถูกปิดใช้งาน — เปิดใช้งานโซนที่หน้าไซต์ก่อน หรือเลือกโซนอื่น`;
  }
  return null;
}

/* ความพร้อมของใบสำหรับงานบริการ — ตอบสองคำถามที่ TS ถามบ่อยที่สุดตอนรับงาน:
   "ใบนี้มีสัญญายัง" กับ "จ่ายถึงเมื่อไร"
   ⚠️ **ไม่ใช่ด่าน** — ด่านจริงคือ `visitGate` ตอนนัดจะขึ้นตาราง · ที่นี่แค่บอกล่วงหน้า
      ให้ TS ทวงได้ตั้งแต่ยังไม่เสียเวลาวางรอบ
   ⭐ ผู้ใช้: ชิปสัญญาของแท็บใบเดิม (`legacySetupQueue`) · ชิปเงินของแท็บรอตั้งรอบ (`moneyReadiness`) */
const pickFrom = (map, key) => (map instanceof Map ? map.get(key) : map?.[key]) || null;

/* ความพร้อมเรื่องเงินของใบ — ชิป "เงินครอบถึง" ของถังตั้งรอบอ่านจากตัวนี้ตัวเดียว (ถังผูกโซนเดิมถอดแล้ว · mig 0392)
   ⭐ `paymentNotRequired` — ใบยอด 0 ไม่มีงวดให้เก็บ และผ่านด่านเข้าไซต์ข้อ② เอง (มติ 22/09 · mig 0374)
      ⇒ ชิปต้องพูดเรื่องเดียวกับ visitGate ข้อ② ไม่งั้นป้าย "ยังไม่มีงวดที่รับรอง" ส่ง TS ไปทวงเงินที่ไม่มีให้เก็บ
      🔄 แทนธงยกเว้นด่านเงินรายใบของใบย้อนหลัง (มติข้อ 13 · 0360) ที่ถอดแล้ว
   ⚠️ ผู้เรียกต้อง select `totalAmount` มาด้วย — ไม่ส่งมา = ไม่รู้ยอด ≠ ยอด 0 (ตอบ false · ชิปเดินตามงวด)
   ⚠️ คืนแค่ธง/วันที่ — ยอดเงินของใบไม่ออกไปกับแถวคิว (ฝ่ายบริการไม่เห็นราคาโดยตั้งใจ · หัวไฟล์ route คิว) */
function moneyReadiness(order, rows, todayIso) {
  return {
    paidThrough: paidThrough(rows),
    coveredToday: coversDate(rows, todayIso),
    paymentNotRequired: paymentNotRequired(order?.totalAmount),
  };
}

export function orderReadiness(order, { contractsById = new Map(), installmentsByOrderId = new Map(), todayIso = businessDate() } = {}) {
  const contract = order?.serviceContractId ? pickFrom(contractsById, order.serviceContractId) : null;
  const rows = pickFrom(installmentsByOrderId, order?.id) || [];
  return {
    contractNo: contract && contract.status === 'signed' ? (contract.contractNo || null) : null,
    hasContract: !!(contract && contract.status === 'signed'),
    ...moneyReadiness(order, rows, todayIso),
  };
}

/* ── ถังที่ 2: โซนที่ขายแล้วแต่ไซต์ยังไม่มีรอบ ──────────────────────────
   ⚠️ รอบ (service_plans) ผูกกับ **ไซต์** ไม่ใช่โซน (mig 0188) — เจ้าหน้าที่เข้าไซต์ทีเดียว
   ทำทุกโซน · คิวนี้จึงเป็น "ไซต์ที่มีโซนขายแล้วแต่ไม่มีรอบ" ไม่ใช่รายโซน */
/* ⚠️ `linesById` ไม่บังคับ — ไม่ส่งมา = แถวตอบ roundsSold: null (ยังไม่ระบุ)
   ไม่ใช่ 0 · ผู้เรียกที่มีบรรทัดอยู่แล้วส่งเข้ามาเพื่อให้จอบอก "ขายไว้กี่รอบ" ได้
   ⭐ `installmentsByOrderId` (มติ 22/09 · mig 0374) — แถวพก "เงินครอบถึง" (`paidThrough`) ให้ TS รู้ตั้งแต่ตอนตั้งรอบ
      ว่านัดถึงวันไหนจะขึ้นตารางได้เลย · ทุกใบมาถึง TS ที่ถังนี้ก่อน (รอบขายเกิดตอนอนุมัติ: ใบใหม่ = ฝ่ายขายตั้งโซนในใบ
      · mig 0392 · ใบย้อนหลัง = AE Sup อนุมัติ · mig 0374) ⇒ เงินครอบถึงคือคำถามแรกของมัน (ม็อก TsIntake)
   ⚠️ ไม่ส่งมา = `paidThrough: null` ("ยังไม่มีงวดที่รับรอง") — ตัวนับบนเมนูอ่านแค่จำนวนแถวจึงไม่ต้องส่ง */
export function planQueue({ zones = [], terms = [], plans = [], sites = [], ordersById = new Map(), linesById = new Map(), installmentsByOrderId = new Map(), todayIso = businessDate() } = {}) {
  /* ── หน่วยของคิวนี้คือ (ไซต์, ใบสั่งขาย) ไม่ใช่ "ไซต์" ────────────────────
     🔴 **ของเดิมเป็น Set ของ `siteId`** ⇒ ไซต์ที่มีรอบของใบ A อยู่แล้ว **หลุดจากคิว
       ตลอดกาล** แม้ใบ B จะขายรอบใหม่ที่ไซต์เดิม · TS ไม่มีทางรู้ว่ามีงานใหม่เข้ามา
       เพราะคิวคือช่องทางเดียวที่บอก
     ⭐ เคสที่เจอบ่อยที่สุดไม่ใช่ "ขายเพิ่ม" แต่คือ **ออก Rev.** — ใบเก่าได้
       `supersededById` ใบใหม่ได้ id ใหม่ แต่ **ไม่มีโค้ดไหนย้าย `service_plans.
       salesOrderId` ไปใบใหม่เลยทั้งระบบ** ⇒ รอบชี้ใบที่ตายแล้วตลอดไป
       ⇒ พอคีย์เป็นคู่ (ไซต์, ใบ) เคสนี้แก้ตัวเอง: term ของใบเก่าตกไปด้วย
         `termIsActive` อยู่แล้ว ส่วนใบใหม่ไม่มีรอบของตัวเอง ⇒ เข้าคิวตามที่ควร
     ⚠️ **รอบที่ `salesOrderId` เป็น null ไม่ครอบใบไหนเลย** — แต่มันเดินอยู่จริงที่
       ไซต์นั้น ⇒ ถ้าเงียบไว้ TS จะกดสร้างรอบใบที่สองทับของเดิม · แถวจึงพก
       `unboundPlans` ไปบอกเอง (กติกาเดียวกับ `hasForeignPlan` ของ #1594) */
  const livePlans = plans.filter((p) => p.isActive !== false);
  const coveredPairs = new Set(
    livePlans.filter((p) => p.salesOrderId).map((p) => `${p.siteId}\u0000${p.salesOrderId}`),
  );
  const unboundBySite = new Map();
  for (const plan of livePlans) {
    if (plan.salesOrderId) continue;
    unboundBySite.set(plan.siteId, (unboundBySite.get(plan.siteId) || 0) + 1);
  }
  /* ⭐ รอบของใบ **อื่น** ที่ยังเดินอยู่ที่ไซต์ (PR-C · review 29/09) — ใบที่ยกเลิก/ถูกแทน (รอบกำพร้า) หรือใบอื่นที่ยังมีผล
     ปุ่มตั้งรอบบนแถวสร้างรอบที่สองได้ในคลิกเดียว ⇒ แถวต้องบอกก่อน (กติกาเดียวกับ `hasForeignPlan` ของแท็บงานบริการของใบ)
     ⚠️ นับเฉพาะรอบที่ยังเปิดและยังไม่จบ (endDate ≥ วันนี้) · ไม่ตัด/ไม่รวมแถว (ตัวนับบนเมนูอ่านจำนวนแถว)
     ⚠️ แถวมีได้เฉพาะคู่ (ไซต์, ใบ) ที่ยังไม่มีรอบ ⇒ รอบที่ผูกใบทุกรอบของไซต์เป็น "ของใบอื่น" ของแถวนั้นเสมอ */
  const foreignBySite = new Map();
  for (const plan of livePlans) {
    if (!plan.salesOrderId) continue;
    if (plan.endDate && String(plan.endDate) < todayIso) continue;
    const list = foreignBySite.get(plan.siteId) || [];
    list.push(plan.salesOrderId);
    foreignBySite.set(plan.siteId, list);
  }
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const zonesById = new Map(zones.map((z) => [z.id, z]));

  const bySite = new Map();
  for (const term of terms) {
    if (!termIsActive(term, ordersById.get(term.salesOrderId), todayIso)) continue;
    const zone = zonesById.get(term.zoneId);
    if (!zone) continue;
    if (coveredPairs.has(`${zone.siteId}\u0000${term.salesOrderId}`)) continue;
    const key = `${zone.siteId}\u0000${term.salesOrderId}`;
    const order = ordersById.get(term.salesOrderId) || null;
    const row = bySite.get(key) || {
      /* ⚠️ `key` ต้องมาด้วย — จอใช้ `row.siteId` เป็น React key มาตลอด ซึ่งซ้ำทันที
         ที่ไซต์เดียวมีสองใบ (แถวจะกระพริบ/สลับค่ากันเวลา re-render) */
      key,
      siteId: zone.siteId,
      site: sitesById.get(zone.siteId) || null,
      salesOrderId: term.salesOrderId || null,
      orderNumber: order?.orderNumber || null,
      /* ป้าย "ย้อนหลัง" + โน้ต "โซนผูกจากฝ่ายขายตอนคีย์ใบแล้ว" บนแท็บนี้ · ไม่ส่ง origin มา = pipeline */
      origin: order?.origin || ORIGIN_PIPELINE,
      /* ป้าย "ฝ่ายขายตั้งโซนแล้ว" (PR-C · C1) — ใบมีตรา `serviceTermsOpenedAt` (mig 0392) = term เป็นแพ็คต่อรอบรายโซน
         ⚠️ ไม่ส่งคอลัมน์มา (ตัวนับบนเมนู) = false · ไม่กระทบจำนวนแถว */
      stamped: !!order?.serviceTermsOpenedAt,
      /* ชื่อช่องชุดเดียวกับ `orderReadiness` ⇒ จอใช้ชิปตัวเดียวกันได้ */
      ...moneyReadiness(order, pickFrom(installmentsByOrderId, term.salesOrderId) || [], todayIso),
      unboundPlans: unboundBySite.get(zone.siteId) || 0,
      foreignPlans: (foreignBySite.get(zone.siteId) || []).filter((id) => id !== term.salesOrderId).length,
      zones: [],
      terms: [],
    };
    if (!row.zones.some((z) => z.id === zone.id)) row.zones.push(zone);
    row.terms.push(term);
    bySite.set(key, row);
  }
  /* ขายไว้กี่รอบของไซต์ = จำนวนครั้งที่ต้องไปไซต์นี้ (`serviceVisitsSold` · mig 0392 · D23 n/N)
     🐞 ของเดิมบวกรอบของทุก term ⇒ บรรทัดเดียวที่ลงสองโซนในไซต์เดียวกันนับรอบซ้ำสองเท่า (12 รอบ → 24)
        ทั้งที่เจ้าหน้าที่เข้าไซต์ทีเดียวทำทุกโซน ⇒ ต่อไซต์ = รอบสูงสุดของบรรทัด (ไม่ซ้ำ) ที่ลงไซต์นั้น
     ⭐ `roundsMixed` = บรรทัดในไซต์เดียวกันขายรอบไม่เท่ากัน — จอบอก "รอบไม่เท่ากัน" ไม่ใช่เดาว่าเท่า
     ⚠️ อ่านสดจากบรรทัด ไม่ก๊อปเป็น snapshot ที่ term — จำนวนรอบแก้ได้หลังอนุมัติ (บรรทัดของใบ) หรือออก Rev.
     ⚠️ ไม่มีบรรทัดให้ชี้ (ไม่ส่ง `linesById` · ตัวนับบนเมนู) = null "ยังไม่ระบุ" ไม่ใช่ศูนย์ — ถอยไปตัวรวมเดิม
        (`serviceRoundsSold`) ซึ่งตอบ null ให้ชุดว่างเหมือนกัน */
  for (const row of bySite.values()) {
    const termLines = [...new Set(row.terms.map((t) => t.salesOrderLineId))]
      .map((id) => linesById.get(id)).filter(Boolean);
    const visits = serviceVisitsSold({ lines: termLines, links: row.terms, zonesById });
    row.roundsSold = visits.total ?? serviceRoundsSold(termLines);
    row.roundsMixed = visits.mixed;
    /* รอบที่ไม่ซ้ำของบรรทัดในไซต์นี้ (มากไปน้อย) — จอเขียน "12 · 8 รอบ (ต่างกันรายรายการ)" (`planRoundsSoldText`) */
    row.roundsValues = visits.bySite.get(row.siteId)?.values || [];
  }
  /* ⚠️ เรียงด้วยชื่อไซต์อย่างเดียวไม่พออีกแล้ว — ไซต์เดียวหลายใบจะสลับที่กันทุกครั้ง
     ที่โหลดใหม่ (ลำดับของ Map ตามลำดับที่ term เข้ามา) ⇒ ต่อท้ายด้วยเลขที่ใบ */
  return [...bySite.values()].sort((a, b) =>
    String(a.site?.name || '').localeCompare(String(b.site?.name || ''), 'th')
    || String(a.orderNumber || a.salesOrderId || '').localeCompare(String(b.orderNumber || b.salesOrderId || '')));
}

/* ── ถังที่ 3: รอบที่เดินอยู่แต่ไม่มีนัดข้างหน้า ────────────────────────
   ⚠️ **ห้ามเขียนเงื่อนไข "นัดที่ยังมีชีวิต" ขึ้นใหม่ที่นี่** — ผู้เรียกต้องส่ง
   `isLive` ตัวเดียวกับที่ทั้งระบบใช้ (visitStatus.isLiveVisit) เข้ามา
   เข้มกว่าด่านจริง = ซ่อนงานที่ทำได้ · หลวมกว่า = ชวนกดแล้วเด้ง
   (docs/business-line-level-and-handoff.md:173-174) */
export function visitQueue({ plans = [], visits = [], sites = [], ordersById = new Map(), isLive, todayIso = businessDate() } = {}) {
  if (typeof isLive !== 'function') throw new Error('visitQueue ต้องรับ isLive จากตัวตัดสินกลาง');
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  /* ── "มีนัดข้างหน้าแล้ว" ต้องถามราย **รอบ** ไม่ใช่ราย **ไซต์** ─────────────
     🔴 ของเดิมนับเป็น `aheadBySite` ⇒ นัดของรอบ A ทำให้รอบ B ที่ไซต์เดียวกัน
       ถูกถือว่า "มีนัดครอบแล้ว" ทั้งที่ยังไม่มีใครนัดให้เลย · รอบ B เงียบหายจากคิว
     ⚠️ นัดที่ `planId` ว่าง (งานซ่อมนอกรอบ) ไม่ครอบรอบไหนทั้งนั้น — มันไม่ได้เกิด
       จากรอบ และไม่นับเป็นรอบตามข้อผูกพันด้วย (เกณฑ์เดียวกับตัวนับ n/N) */
  const aheadByPlan = new Map();
  for (const visit of visits) {
    if (!isLive(visit)) continue;
    if (!visit.planId) continue;
    if (String(visit.scheduledDate || '') < todayIso) continue;
    aheadByPlan.set(visit.planId, (aheadByPlan.get(visit.planId) || 0) + 1);
  }

  const rows = [];
  for (const plan of plans) {
    if (plan.isActive === false) continue;
    if (plan.endDate && plan.endDate < todayIso) continue;
    if (aheadByPlan.get(plan.id)) continue;
    rows.push({
      planId: plan.id,
      siteId: plan.siteId,
      site: sitesById.get(plan.siteId) || null,
      kind: plan.kind,
      everyDays: plan.everyDays,
      assigneeName: plan.assigneeName || null,
      startDate: plan.startDate || null,
      /* ⚠️ ไซต์เดียวโผล่ได้หลายแถวแล้ว ⇒ จอต้องมีอะไรแยกแถวออกจากกัน
         (ชนิดงาน · ใบสั่งขาย) ไม่งั้นสองแถวพิมพ์ข้อความเหมือนกันเป๊ะ */
      salesOrderId: plan.salesOrderId || null,
      salesOrderNumber: ordersById.get(plan.salesOrderId)?.orderNumber || null,
    });
  }
  return rows.sort((a, b) => String(a.site?.name || '').localeCompare(String(b.site?.name || ''), 'th'));
}

/* จำนวนบนแท็บ — หน้าเดียวตอบ "มีอะไรค้างกี่ชิ้น" โดยไม่ต้องกดเข้าไปดู
   `legacy` = ผลของ `legacySetupQueue` (แท็บ `bind` · ใบเดิมรอฝ่ายขายตั้งงานบริการ) */
export function intakeCounts({ legacy = { rows: [], unknownLine: [] }, plan = [], visit = [] } = {}) {
  return {
    bind: legacy.rows.length,
    plan: plan.length,
    visit: visit.length,
    unknownLine: legacy.unknownLine.length,
  };
}
