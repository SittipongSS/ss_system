// ── สรุปฝั่งบริการของใบสั่งขายหนึ่งใบ (PR-F · แผน §3.4) ─────────────────────
//
// ⭐ **ตอบสามคำถามที่ฝ่ายขายถามจริงเวลาเปิดใบบริการ**
//   1. ของที่ขายไปแล้ว **ลงโซนครบหรือยัง** (ถ้ายัง TS ยังทำงานต่อไม่ได้)
//   2. ไซต์พวกนั้น **วางรอบแล้วหรือยัง** และมีนัดข้างหน้าไหม
//   3. **เดินไปกี่รอบแล้ว** เทียบกับที่ขายไว้ (กระทบยอด n/N)
//
// ⚠️ **ฟังก์ชันบริสุทธิ์** — ผู้เรียก (API) เป็นคนหยิบข้อมูล ที่นี่แค่ประกอบ
//   ⇒ เทสต์ได้โดยไม่ต้องมีฐานข้อมูล และตรรกะไม่ไปซ้ำอยู่ใน route
//
// ⚠️ ทุกเกณฑ์ยืมตัวตัดสินกลางทั้งหมด — `allocatedByLine`/`fgSummary` (การจัดสรร) ·
//   `termOrderActive` (รอบยังมีผลไหม) · `serviceRoundsSold`/`serviceVisitsSold` (ขายไว้กี่รอบ) ·
//   `serviceLineRole` (บรรทัดเป็นแพ็คเกจไหม) · `evaluateVisitGate` (นัดผ่านด่านไหม) · ห้ามเขียนเงื่อนไขซ้ำที่นี่
//
// ⭐ **ใบที่ประทับแล้ว (`serviceTermsOpenedAt` · mig 0392)** — ฝ่ายขายตั้งโซน/แพ็คต่อรอบ/รอบในใบ แล้วรอบขายเกิดตอน
//   อนุมัติครบทุกโซนที่เลือก ⇒ ไม่มี "ของค้างรอลงโซน" อีก (จำนวนในใบ = ระยะเวลา/แพ็คเกจ ไม่ใช่หน่วยที่ต้องจัดสรร)
//   และ "ขายไว้กี่รอบ" = จำนวนครั้งที่ต้องไปไซต์ (`serviceVisitsSold` · D23 n/N) ไม่ใช่ผลบวกรอบรายบรรทัด
//   ใบเดิมที่ยังไม่ประทับ (TS ผูกโซนก่อน 0392 · ใบย้อนหลัง) คงตัวนับเดิมทุกตัว
import { allocatedByLine, fgSummary, termOrderActive } from '@/lib/service/terms';
import { serviceRoundsSold, serviceVisitsSold } from '@/lib/sales/serviceOrders';
/* ชนิดของบรรทัด (D2) — ถาม "มีแพ็คเกจให้ลงโซนไหม" ด้วยตัวตัดสินงานบริการ ไม่ใช่ตัวตัดสินด่านเงิน
   (`hasServicePackageLine` เป็นสวิตช์ของด่านรับรองงวด · serviceMoneySelectGuard คุมผู้เรียกของมัน) ·
   ไฟล์นี้ไม่อยู่ในวง intake ↔ serviceOrders (กฎ 16 ห้ามเฉพาะสองไฟล์นั้น import serviceSetup) */
import { SERVICE_KIND_PACKAGE, periodSpan, serviceLineRole, servicePeriodOf } from '@/lib/sales/serviceSetup';
/* ป้าย "รายการ n · FG" + ลำดับรอบขาย — ไฟล์ไม่มี import (ไม่ดึงไฟล์คิว TS ตามมา · §3.8) */
import { termLineLabels } from '@/lib/service/termLabels';

/* ── รอบขายรายไซต์ให้ช่องมาตรฐาน มล./เดือน (PR-C · C8 · IMPL_PLAN_C §4.3) ─────────────────────────
   ⭐ **ทรงเดียวกับ `termDetails` ของคิว TS** (`intakePlanFacts.planRowFacts`) — `TermStandardMlCell` รับไปตรง ๆ
     สองจอต้องเสนอมาตรฐานเลขเดียวกันสำหรับรอบขายเดียวกัน (เทสต์ C8 เทียบกันตรง ๆ)
   ⚠️ ห้าม import ไฟล์ของคิว TS มาใช้ที่นี่ (แผน §3.8) ⇒ กติกาทุกข้อเขียนซ้ำให้ตรงกัน:
     packageQty = แพ็คต่อรอบเฉพาะใบที่ประทับ (ใบเดิม = จำนวนที่จัดสรร ห้ามเรียกว่าแพ็ค/รอบ) ·
     periodMonths เฉพาะใบที่ประทับ (ช่วงร่างของงานตั้งย้อนหลังยังไม่ผ่านผู้จัดการ) · ไม่รู้ = null ไม่ใช่ 0 */
const positiveNumber = (value) => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const positiveInt = (value) => {
  const n = positiveNumber(value);
  return n != null && Number.isInteger(n) ? n : null;
};

function termItem(term, { zone, line, stamped, periodMonths }) {
  return {
    id: term.id,
    zoneId: term.zoneId || null,
    zoneCode: zone?.code || null,
    zoneName: zone?.name || null,
    fgCode: term.fgCode || null,
    description: term.description || null,
    packageQty: stamped ? positiveNumber(term.packageQty) : null,
    unit: term.unit || null,
    rounds: line ? positiveInt(line.serviceRounds) : null,
    periodMonths,
    standardMlPerMonth: positiveNumber(term.standardMlPerMonth),
  };
}

/**
 * @param order      ใบสั่งขาย
 * @param lines      บรรทัดของใบ
 * @param terms      รอบขายที่ชี้ใบนี้ (service_zone_terms)
 * @param zonesById  Map โซน
 * @param sitesById  Map ไซต์
 * @param plans      รอบบริการของไซต์ที่เกี่ยวข้อง (service_plans)
 * @param visits     นัดของไซต์ที่เกี่ยวข้อง
 * @param gateByVisitId Map visitId → { ok, blocked } จาก evaluateVisitGate (ผู้เรียกคำนวณมาให้)
 *   ⚠️ ราย **นัด** ไม่ใช่รายไซต์ — ด่านมีข้อที่เป็นของนัดจริง ๆ (ผู้รับผิดชอบ/ช่วงเข้าไซต์)
 */
export function salesOrderServiceSummary({
  order, lines = [], terms = [], zonesById = new Map(), sitesById = new Map(),
  plans = [], visits = [], gateByVisitId = new Map(), todayIso,
} = {}) {
  /* ⚠️ นับเฉพาะรอบขายที่ **ใบแม่ยังมีผล** — ใบถูก Rev./ยกเลิกแล้ว term ยังค้างในฐาน
     (ตารางไม่มีคอลัมน์สถานะโดยเจตนา) ⇒ ไม่กรอง = จัดสรรซ้ำสองเท่าหลังออก Rev. */
  const liveTerms = termOrderActive(order) ? terms : [];
  /* ใบที่ประทับแล้ว: รอบขายเกิดครบทุกโซนที่ฝ่ายขายเลือกในทรานแซกชันเดียวกับการอนุมัติ ⇒ ไม่มีของค้างให้ TS ลงโซน
     ⚠️ ถามจากตราประทับบนใบ ไม่ใช่เดาจาก term — ใบเดิมมี term ที่ TS ผูกไว้ก็ได้ (ยังนับแบบเดิม) */
  const stamped = !!order?.serviceTermsOpenedAt;
  const allocated = allocatedByLine(liveTerms);
  const fgRows = fgSummary(lines, allocated);
  const fg = stamped ? fgRows.map((g) => ({ ...g, remaining: 0 })) : fgRows;
  const remaining = fg.reduce((sum, g) => sum + g.remaining, 0);

  /* C8: บรรทัดของรอบขาย (รอบที่ขาย) + เดือนของช่วงบริการ — ใช้กับทุก term ของใบ · ลำดับ "รายการ n" อยู่ที่ `termLineLabels` */
  const lineById = new Map((Array.isArray(lines) ? lines : []).filter((line) => line?.id).map((line) => [line.id, line]));
  const periodMonths = stamped ? (periodSpan(servicePeriodOf(order)).months || null) : null;

  /* ไซต์/โซนที่ใบนี้ลงไปแล้ว — หน่วยที่คนอ่านคือ "ไซต์" (คนเข้าไซต์ทีเดียวทำทุกโซน) */
  const bySite = new Map();
  for (const term of liveTerms) {
    const zone = zonesById.get(term.zoneId);
    if (!zone) continue;
    const row = bySite.get(zone.siteId) || {
      siteId: zone.siteId,
      site: sitesById.get(zone.siteId) || null,
      zones: [],
      packageQty: 0,
      terms: [],
    };
    if (!row.zones.some((z) => z.id === zone.id)) row.zones.push({ id: zone.id, name: zone.name });
    const qty = Number(term.packageQty);
    if (Number.isFinite(qty) && qty > 0) row.packageQty += qty;
    row.terms.push(termItem(term, { zone, line: lineById.get(term.salesOrderLineId), stamped, periodMonths }));
    bySite.set(zone.siteId, row);
  }
  /* เรียง: ชื่อโซน → ลำดับบรรทัดในใบ · ป้าย: โซนที่มีหลายรอบขายบอก "รายการ n · FG" ไม่งั้นช่องหน้าตาเหมือนกันแยกไม่ออก
     (ใบจริง SO-26090247-0: สองบรรทัด FG เดียวกันลงโซน Office ทั้งคู่)
     ⭐ ตัวช่วยเดียวกับแถวคิว TS (`termLineLabels` · review 29/09) — สองจอติดป้ายรอบขายเดียวกันเหมือนกันทุกตัวอักษร */
  for (const row of bySite.values()) {
    const { items, labels } = termLineLabels(row.terms, { terms: liveTerms, lines });
    row.terms = items;
    row.termLabels = labels;
  }

  /* ── รอบของ "ใบนี้" กับรอบของ "ไซต์นี้" เป็นคนละชุด ────────────────────────
     🔴 **ผู้เรียกโหลดรอบ/นัดมาราย *ไซต์* แต่ทุกตัวเลขบนจอนี้เป็นของ *ใบ*** —
       route โหลดด้วย `loadPlans({ siteId })` เพราะ repo กลางรับ siteId เดียว
       ⇒ ของที่ป้อนเข้ามาปนรอบของทุกใบที่ลงไซต์เดียวกันตั้งแต่ต้นทาง · การกรอง
       ให้เหลือเฉพาะของใบนี้จึงเป็นงานของที่นี่ ไม่ใช่ของ route
     ⚠️ **ต้องตรงกับทะเบียนใบสั่งขาย** — คอลัมน์ "รอบที่เดิน n/N" บนทะเบียนกรอง
       `.in('salesOrderId', ...)` มาตั้งแต่แรก (`api/sales-planning/sales-orders/route.js`)
       ⇒ ก่อนหน้านี้สองจอใช้ชื่อเดียวกันแต่คนละเลข และคอมเมนต์ตรงตัวนับก็อ้างผิด
       ว่า "เกณฑ์เดียวกับทะเบียน"
     ⚠️ **รอบที่ `salesOrderId` เป็น null ไม่ใช่ของใบนี้** — มันคือรอบที่วางจากหน้าไซต์
       ตรง ๆ (โมดัลที่นั่นไม่ส่งคีย์นี้เลย) ⇒ ไม่ผูกกับข้อผูกพันของใบไหน · นับให้ใบนี้
       เมื่อไร ตัวตั้งจะโตเกินตัวหารที่มาจากบรรทัดของใบใบเดียว */
  const ownPlan = (plan) => !!plan?.salesOrderId && plan.salesOrderId === order?.id;
  const activePlans = plans.filter((p) => p?.isActive !== false);
  const ownActivePlans = activePlans.filter(ownPlan);
  const planSites = new Set(ownActivePlans.map((p) => p.siteId));
  /* ไซต์ที่มีรอบอยู่แล้วแต่เป็นของใบอื่น (หรือไม่ผูกใบเลย) — **ไม่ใช่ "ยังไม่วาง"**
     ⭐ สภาพที่สามนี้คือสภาพที่ของเดิมกลืนหายไปกับ "วางแล้ว" · คนวางรอบต้องรู้ว่า
       ที่ไซต์นี้มีรอบเดินอยู่ก่อนจะกดสร้างอีกใบ ไม่งั้นได้นัดซ้อนวันเดียวกันสองชุด
       (`ensureVisits` กันซ้ำเฉพาะภายในรอบเดียวกัน — ข้ามรอบไม่มีใครกัน) */
  const foreignPlanSites = new Set(
    activePlans.filter((p) => !ownPlan(p)).map((p) => p.siteId),
  );
  const planIds = new Set(plans.filter(ownPlan).map((p) => p.id));

  /* นัดข้างหน้า: ผ่านด่านกี่นัด ติดกี่นัด และ **ติดเพราะอะไรบ่อยที่สุด**
     ⚠️ เหตุที่บอกต้องมาจาก `evaluateVisitGate` ตัวเดียวกับที่ตารางจริงใช้ —
     เขียนเหตุเองที่นี่ = จอกับด่านพูดคนละเรื่อง (โรคเดิมของโมดูลนี้) */
  /* ⚠️ **นัดก็ต้องเป็นของใบนี้เหมือนกัน** — การ์ดนี้พาดหัวว่า "นัดข้างหน้าและรอบที่
     เดินไปแล้ว" ทั้งใบ ⇒ ถ้าตัวนับรอบกรองรายใบแต่ตัวนับนัดไม่กรอง สองเลขบนการ์ด
     เดียวกันจะเป็นคนละขอบเขตอย่างเห็นได้ชัด · นัดที่ไม่มี `planId` (งานซ่อมนอกรอบ)
     เป็นของ *ไซต์* ไม่ใช่ของใบ ⇒ ดูได้ที่หน้าไซต์ ซึ่งเป็นที่ที่เห็นงานทั้งไซต์อยู่แล้ว */
  const ownVisit = (v) => !!v?.planId && planIds.has(v.planId);
  const ahead = visits.filter((v) =>
    ownVisit(v) && String(v.scheduledDate || '') >= String(todayIso || ''));
  const blockedReasons = new Map();
  let passed = 0;
  let blocked = 0;
  for (const visit of ahead) {
    const gate = gateByVisitId.get(visit.id);
    if (!gate || gate.ok) { passed += 1; continue; }
    blocked += 1;
    for (const item of gate.blocked || []) {
      const key = item.reason || item.label || 'ติดด่าน';
      blockedReasons.set(key, (blockedReasons.get(key) || 0) + 1);
    }
  }
  const topReason = [...blockedReasons.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  /* กระทบยอดรอบ: ขายไว้เท่าไร เดินไปแล้วเท่าไร
     ⚠️ นับ **นัดที่ปิดงานแล้ว** เท่านั้น และนับเฉพาะนัดที่เกิดจากรอบ (มี planId) —
     งานซ่อมฉุกเฉินไม่ใช่รอบตามข้อผูกพัน
     ⚠️ **ตัวนับนี้ไม่กรอง `isActive` โดยเจตนา — ต่างจาก `hasPlan` และไม่ใช่ความพลาด**
       รอบที่เดินไป 6 ครั้งแล้วถูกปิดใช้งาน คือ 6 รอบที่เกิดขึ้นจริงตามข้อผูกพัน
       การปิดรอบหยุดแค่นัด *ข้างหน้า* ไม่ได้ลบประวัติ ⇒ ตัวนับใช้รอบของใบนี้ทุกใบ
       ส่วน `hasPlan` ถามคนละคำถาม ("ยังต้องวางรอบอีกไหม") จึงดูเฉพาะรอบที่ยังเปิด
       ⇒ เกณฑ์ตรงกับคอลัมน์ "รอบที่เดิน" บนทะเบียน ซึ่งก็ไม่กรอง `isActive` เช่นกัน */
  const done = visits.filter((v) => v.status === 'done' && ownVisit(v)).length;
  /* ⭐ ใบที่ประทับแล้ว: ขายไว้ = จำนวนครั้งที่ต้องไปไซต์ (Σ ไซต์ของรอบสูงสุดของบรรทัดที่ลงไซต์นั้น · D23)
     ⚠️ ผลบวกรายบรรทัดของเดิมนับบรรทัดเดียวที่ลงหลายไซต์/หลายโซนผิด (ไปไซต์ละครั้งต่อรอบ ไม่ใช่บรรทัดละครั้ง) */
  const sold = stamped
    ? serviceVisitsSold({ lines, links: liveTerms, zonesById }).total
    : serviceRoundsSold(lines);

  return {
    /* C8: ช่องมาตรฐาน มล. เสนอค่าเฉพาะใบที่ประทับ (แพ็คต่อรอบมีความหมายเฉพาะใบนั้น) */
    stamped,
    allocation: {
      fg,
      remaining,
      // ⚠️ "จัดสรรครบ" = ไม่เหลือของค้าง **และ** มีอย่างน้อยหนึ่งโซนจริง
      /* ใบที่ประทับแล้ว: มีไซต์ = ครบ · ไม่มีบรรทัดแพ็คเกจเลย (ใบที่ตั้งทุกบรรทัดเป็น "ไม่ใช่งานบริการ") = ไม่มีอะไรต้องลง = ครบ */
      complete: stamped
        ? bySite.size > 0 || !lines.some((l) => serviceLineRole(l) === SERVICE_KIND_PACKAGE)
        : remaining === 0 && bySite.size > 0,
      /* ⭐ **ธง `hasPlan` รายแถว** — `planSites` คำนวณอยู่แล้วสองบรรทัดข้างบน แต่ถูกใช้
         ครั้งเดียวเพื่อ *นับ* ไซต์ที่ยังไม่วางรอบ ⇒ ตารางบอกได้แค่ยอดรวม คนอ่านต้อง
         ไล่เปิดทีละไซต์เพื่อหาว่าไซต์ไหนคือไซต์ที่ค้าง · ผูกกลับเข้าแถวได้ฟรี ไม่มีคิวรีเพิ่ม
         ⭐ `hasForeignPlan` = ไซต์นี้มีรอบเดินอยู่ **แต่เป็นของใบอื่น** ⇒ ใบนี้ยังต้อง
            วางรอบของตัวเอง แต่คนกดต้องรู้ก่อนว่ามีรอบอื่นอยู่ ไม่ใช่กดแล้วได้นัดซ้อน */
      sites: [...bySite.values()]
        .map((row) => ({
          ...row,
          hasPlan: planSites.has(row.siteId),
          hasForeignPlan: !planSites.has(row.siteId) && foreignPlanSites.has(row.siteId),
        }))
        .sort((a, b) =>
          String(a.site?.name || '').localeCompare(String(b.site?.name || ''), 'th')),
    },
    plans: {
      total: ownActivePlans.length,
      // ไซต์ที่ลงของแล้วแต่ยังไม่มีรอบ = งานค้างของ TS ที่ฝ่ายขายควรเห็น
      sitesWithoutPlan: [...bySite.values()].filter((row) => !planSites.has(row.siteId)).length,
    },
    visits: {
      ahead: ahead.length,
      passed,
      blocked,
      topReason: topReason ? { reason: topReason[0], count: topReason[1] } : null,
    },
    rounds: { sold, done },
  };
}
