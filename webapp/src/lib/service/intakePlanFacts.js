// ── ข้อเท็จจริงของแถว "รอตั้งรอบ" (งานเข้าใหม่ของ TS) + ค่าเติมของโมดัลรอบบริการ (PR-C · C1) — logic ล้วน ──
//
// ⭐ **ที่เดียวที่ตอบทุกข้อเท็จจริงใหม่บนแถว** — route คิว (`decoratePlanRows` · `orphanPlanRows`) คำนวณ · จอแค่วาด
//   (แผง/ชิป/โมดัลอ่านค่าชุดเดียวกัน ⇒ แถวกับโมดัลพูดเรื่องเดียวกันเสมอ)
// ⚠️ **หน่วยของแถวยังเป็น (ไซต์ × ใบ) เท่าเดิม** — ตัวนับบนเมนู = จำนวนแถวของแท็บ = ยอดของ Pager (C-D2 · C-D21)
//   ไฟล์นี้ **เติมช่อง** ให้แถวของ `planQueue` ไม่ตัด/รวม/เรียงแถวใหม่
// ⚠️ ไม่แตะ DB · ไม่อ่านนาฬิกาเอง (วันนี้ = `todayIso` จากผู้เรียก · ค่าตั้งต้น `businessDate()` เวลาไทย)
// ⚠️ ข้อมูลขาด = null ไม่ใช่ 0 (จอขีด) — ตัวเลขที่ดูเหมือนจริงแต่เดามา แย่กว่าขีด
//
// ทิศ import: ไฟล์ใหม่ใช้ได้ทั้ง `serviceSetup.js` (ช่วงบริการของใบ) และ `intake.js` (ความพร้อมของใบ) —
//   `intake.js` เองห้าม import `serviceSetup.js` (กฎ 16 · serviceSetupImports.test.mjs) ⇒ ตัวที่ต้องใช้สองฝั่งมาอยู่ที่นี่
import { businessDate } from '@/lib/businessDate';
import { fmtDate, fmtNumber } from '@/lib/format';
import { SERVICE_PERIOD_MODE_LINE, SERVICE_PERIOD_MODE_WHOLE, periodEnvelope, periodSpan, servicePeriodModeOf, servicePeriodOf } from '@/lib/sales/serviceSetup';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { orderReadiness } from './intake';
import { cadenceText, suggestCadence } from './cadence';
import { ROUNDS_SOLD_LABEL, roundsSoldSentence } from './rounds';
import { termOrderActive, termPeriodOf } from './terms';
import { termLineLabels } from './termLabels';

/* ── ข้อความ (แคตตาล็อก §5 ของแผน PR-C) ─────────────────────────────────────────────────── */
export const STAMPED_BADGE_LABEL = 'ฝ่ายขายตั้งโซนแล้ว';
export const PLAN_TAB_STAMPED_NOTE = `ใบที่มีป้าย “ฝ่ายขายตั้งโซนแล้ว” มาพร้อมโซน แพ็คต่อรอบ และ${ROUNDS_SOLD_LABEL} — โซนผิดให้ฝ่ายขายออก Rev.`;
export const PLAN_EMPTY_TEXT = 'ไม่มีไซต์ที่รอตั้งรอบ — ใบที่อนุมัติแล้วจะมาอยู่ที่นี่ทันที';
/* ด่านสัญญา (visitGate ข้อ ①) นับเฉพาะสัญญา signed ⇒ ผูกแล้วแต่ยังไม่ signed ก็ยังติดด่าน — ชิปพูดตามด่าน */
export const CONTRACT_MISSING_CHIP = 'ยังไม่ผูก — นัดติดด่านสัญญา (SA)';
export const CONTRACT_MISSING_WARNING = 'ใบนี้ยังไม่ผูกสัญญา — สร้างรอบและนัดได้ แต่นัดจะติดด่านสัญญาจนกว่าฝ่ายขาย (SA) ผูกสัญญาที่ครอบวันนัด';
export const PLAN_START_HINT_PERIOD = 'ตามวันเริ่มช่วงบริการของใบ';
/* ใบแยกรายรายการ (mig 0400): ช่วงของแถว = ช่วงของรายการที่ลงไซต์นั้น (ตัวโหลดแนบให้ term — `withLinePeriods`) ไม่ใช่ช่วงรวมของใบ */
export const PLAN_START_HINT_LINE_PERIOD = 'ตามวันเริ่มช่วงบริการของรายการ';
/* ไซต์เดียวมีหลายรายการที่ช่วงไม่เท่ากัน (รอบบริการยังเป็นหนึ่งรอบต่อไซต์ × ใบ) — แถวโชว์ช่วงรวมของไซต์ + คำนี้ · ไม่แนะนำความถี่ */
export const PERIOD_MIXED_TEXT = 'ช่วงต่างกันรายรายการ';
const PERIOD_MIXED_STRIP = ' (ต่างกันรายรายการ)';
const CONTRACT_SIGNED_FALLBACK = 'ผูกสัญญาแล้ว';

/* ── รอบอื่นที่เดินอยู่ที่ไซต์ (review 29/09) — ปุ่มตั้งรอบบนแถวสร้างรอบซ้อนได้ในคลิกเดียว ⇒ บอกบนแถว + ในโมดัลก่อนกด ──
   · foreign  — รอบที่ผูกใบอื่น (`planQueue.foreignPlans` · ใบที่ยกเลิก/ถูกแทน หรือใบอื่นที่ยังมีผล)
   · stale    — รอบกำพร้าชนิด stale ที่ใบปลายโซ่คือใบของแถวนี้ (`orphanPlanRows`) ⇒ ทางที่ถูกคือย้ายรอบ ไม่ใช่สร้างใหม่
   · unbound  — ข้อความเดิมของแถว (รอบที่ไม่ผูกใบ) · โมดัลพูดด้วยเมื่อมี */
export const OTHER_PLAN_TEXT = Object.freeze({
  foreign: (n) => `ไซต์นี้มีรอบของใบอื่นเดินอยู่ ${fmtNumber(n)} รอบ — ตรวจที่หน้าไซต์ก่อนว่าไม่ซ้อนกัน`,
  stale: (from) => `รอบเดิมของไซต์นี้ยังผูกใบ ${from || '—'} — ย้ายรอบนั้นมาใบนี้ที่หน้าไซต์แทนการสร้างใหม่ (สร้างซ้ำ = นัดซ้อน)`,
  unbound: (n) => `มีรอบที่ยังไม่ผูกใบ ${fmtNumber(n)} รอบ — ผูกใบให้รอบเดิมก่อนสร้างใหม่`,
  moveAction: 'ย้ายรอบเดิมมาใบนี้',
});

/* ── ตัวช่วย ─────────────────────────────────────────────────────────────────────────── */
const pick = (map, key) => (key == null ? null : (map instanceof Map ? map.get(key) : map?.[key]) || null);
const text = (value) => String(value ?? '').trim();
/* เรียงแบบคนอ่าน — กติกาเดียวกับตารางโซนของหน้าไซต์ (`siteDetailLists.naturalCompare`: ไทย · ตัวเลขเทียบเป็นเลข)
   ⇒ TS เห็นโซนเรียงเหมือนกันทั้งหน้าไซต์และแถวคิว */
const naturalCompare = (a, b) => text(a).localeCompare(text(b), 'th', { numeric: true, sensitivity: 'base' });
const positiveNumber = (value) => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const positiveInt = (value) => {
  const n = positiveNumber(value);
  return n != null && Number.isInteger(n) ? n : null;
};
/* ช่วงที่ใช้ได้ (วันจริง · เริ่มไม่หลังจบ) — `periodSpan` ตรวจให้แล้ว: ช่วงเพี้ยน = label ว่าง */
const usablePeriod = (period) => (period && periodSpan(period).label ? { from: period.from, to: period.to } : null);

/* ── ช่วงที่ใช้ตั้งรอบ (C-D5 · [owner]) ──────────────────────────────────────────────────────
   เริ่ม = วันเริ่มช่วงบริการ หรือวันนี้ถ้าช่วงเริ่มไปแล้ว · จบ = วันจบช่วงบริการ · ช่วงจบแล้ว = null (ไม่เติมวัน ไม่แนะนำ)
   ⭐ แถว ("รอบที่แนะนำ") กับชิปในโมดัลใช้ช่วงนี้ช่วงเดียว ⇒ ข้อเสนอพอดีกับเวลาที่เหลือเสมอ */
export function planWindow(period, todayIso = businessDate(), { startHint = PLAN_START_HINT_PERIOD } = {}) {
  const p = usablePeriod(period);
  if (!p || p.to < todayIso) return null;
  if (p.from >= todayIso) return { startDate: p.from, endDate: p.to, startHint };
  return { startDate: todayIso, endDate: p.to, startHint: `ช่วงบริการเริ่ม ${fmtDate(p.from)} ไปแล้ว — เริ่มวันนี้` };
}

/** ชิป "จำนวนรอบบริการ 12 รอบ → ทุกเดือน วันที่ 22" (C-D7 · คำตามมติ 29/09 · ความถี่ทุกชนิดตั้งแต่ mig 0397) · ไม่มีข้อเสนอ = null
 *  รับได้สองรูป: ผลของ `suggestCadence` (หกช่อง + `visits` · `exact` · `clamped`) และรูปเดิม `{ everyDays, visits, clamped }`
 *   · โดนเพดาน 365 วัน      → "… (สูงสุดที่ตั้งได้ · ได้ราว n นัด)"
 *   · ไม่มีความถี่ไหนได้พอดี → "… (ได้ราว n นัด)" (เฉพาะรูปที่มีคีย์ `exact` — รูปเดิมไม่บอก จึงไม่ต่อท้าย)
 *  ⚠️ ข้อเสนอที่อ่านความถี่ไม่ออก = null (ไม่พิมพ์ "→ —") */
export function planSuggestionLabel(rounds, suggestion) {
  if (!suggestion) return null;
  const text = cadenceText(suggestion);
  if (text === '—') return null;
  const base = `${roundsSoldSentence(rounds)} → ${text}`;
  if (suggestion.clamped) return `${base} (สูงสุดที่ตั้งได้ · ได้ราว ${fmtNumber(suggestion.visits)} นัด)`;
  return suggestion.exact === false ? `${base} (ได้ราว ${fmtNumber(suggestion.visits)} นัด)` : base;
}

/* แพ็คต่อรอบของโซน = Σ packageQty ของ term ในแถว · term ไหนไม่มีค่า = ไม่รู้ทั้งโซน (null) ไม่ใช่บวกเท่าที่มี */
function packsOf(terms) {
  if (!terms.length) return null;
  let sum = 0;
  for (const term of terms) {
    const qty = positiveNumber(term?.packageQty);
    if (qty == null) return null;
    sum += qty;
  }
  return sum;
}

/**
 * ข้อเท็จจริงของแถวรอตั้งรอบหนึ่งแถว (§3.1 ของแผน PR-C)
 * @param row แถวจาก `planQueue` (มี `stamped` · `zones` · `terms` · `roundsSold` · `site` · `orderNumber`)
 * @param order ใบของแถว · `contract` = สัญญาของใบ (`order.serviceContractId`) · `linesById` = บรรทัดของใบ (รอบที่ขายรายบรรทัด)
 */
export function planRowFacts(row, { order = null, contract = null, linesById = new Map(), todayIso = businessDate() } = {}) {
  /* ⭐ C-D3: ใบที่ฝ่ายขายตั้งโซนแล้ว (ตรา 0392) term = แพ็คต่อรอบ หน่วย 'แพ็ค' ⇒ บวกเป็น "แพ็ค/รอบ" ได้
     ใบเดิม/ย้อนหลัง packageQty = จำนวนที่ขายทั้งบรรทัด (จนกว่า PR-D) ⇒ ห้ามเรียกว่าแพ็คต่อรอบ */
  const stamped = !!(row?.stamped ?? order?.serviceTermsOpenedAt);
  const zones = Array.isArray(row?.zones) ? row.zones : [];
  const terms = Array.isArray(row?.terms) ? row.terms : [];
  const zonesById = new Map(zones.map((z) => [z.id, z]));

  const zonePacks = [...zones]
    .sort((a, b) => naturalCompare(a?.name, b?.name) || naturalCompare(a?.code, b?.code) || naturalCompare(a?.id, b?.id))
    .map((zone) => ({
      zoneId: zone.id,
      code: zone.code || null,
      name: zone.name || null,
      packsPerRound: stamped ? packsOf(terms.filter((t) => t.zoneId === zone.id)) : null,
    }));
  const packsPerRound = stamped && zonePacks.length && zonePacks.every((z) => z.packsPerRound != null)
    ? zonePacks.reduce((sum, z) => sum + z.packsPerRound, 0)
    : null;
  const zonePacksText = stamped && zonePacks.length
    ? zonePacks.map((z) => `${z.name || z.code || z.zoneId} ${z.packsPerRound == null ? '—' : fmtNumber(z.packsPerRound)}`).join(' · ')
      + (packsPerRound == null ? '' : ` = ${fmtNumber(packsPerRound)} แพ็ค/รอบ`)
    : null;

  /* ช่วงบริการ (C-D4): pipeline = หัวใบ · ย้อนหลัง = ช่วงของสัญญาแทน
     ⚠️ ใบ pipeline ที่ยังไม่มีตรา (ใบเดิม) = null — งานตั้งย้อนหลังเขียน `servicePeriodTo` ตั้งแต่ร่าง (mig 0392)
        ช่วงร่างที่ผู้จัดการยังไม่ตรวจห้ามโผล่เป็นข้อเท็จจริงของ TS */
  /* ⚠️ ข้ามเลน (PR-D · mig 0394): ใบย้อนหลังที่อนุมัติหลังไฟล์นั้นได้ตราด้วย ⇒ "มีตรา" ≠ "ใบ pipeline" — ถามแหล่งที่มาตรง ๆ */
  const historical = isHistoricalOrder(order) || isHistoricalOrder(row);
  /* ⭐ ใบแยกรายรายการ (mig 0400): ช่วงของแถว = ช่วงรวมของ **รอบขายในแถวนี้** (ช่วงของรายการที่ตัวโหลดแนบให้ term · `termPeriodOf`)
       — ไม่ใช่ช่วงรวมของทั้งใบ (สาขาอื่นของใบเริ่ม/จบคนละวัน) · กรณีปกติ หนึ่งรายการต่อไซต์ = ช่วงของรายการนั้นพอดี
     ⚠️ ไซต์เดียวมีหลายรายการที่ช่วงไม่เท่ากัน (`periodMixed`) = ช่วงรวมของไซต์ + "ช่วงต่างกันรายรายการ" · ไม่แนะนำความถี่
        (รอบของสองรายการอ้างถึงคนละหน้าต่าง — ข้อเสนอจะเป็นการเดา) · รอบบริการยังเป็นหนึ่งรอบต่อ (ไซต์ × ใบ) เท่าเดิม */
  const lineMode = stamped && !historical && servicePeriodModeOf(order) === SERVICE_PERIOD_MODE_LINE;
  const termPeriods = lineMode ? terms.map((term) => usablePeriod(termPeriodOf(term, order))) : [];
  const periodMixed = lineMode && new Set(termPeriods.filter(Boolean).map((p) => `${p.from}|${p.to}`)).size > 1;
  const period = lineMode
    ? periodEnvelope(termPeriods)
    : (stamped || historical ? usablePeriod(servicePeriodOf(order, contract)) : null);
  const span = period ? periodSpan(period) : null;
  const window = planWindow(period, todayIso, lineMode ? { startHint: PLAN_START_HINT_LINE_PERIOD } : undefined);
  /* รอบที่แนะนำเฉพาะใบที่ตั้งแล้ว — ใบย้อนหลังส่งไปแล้วบางรอบก่อนเข้าระบบ ⇒ ยัดรอบทั้งสัญญาลงเวลาที่เหลือ = ถี่เกินจริง
     (C-D3: แถวใบเดิม/ย้อนหลัง "—") · แถวกับชิปของโมดัลต้องตรงกัน ⇒ `context.roundsSold` ตามกติกาเดียวกัน */
  const suggestRounds = stamped && !historical && !periodMixed ? (row?.roundsSold ?? null) : null;
  /* ⭐ รอบที่ขายที่ **โมดัลตั้งรอบ** ใช้ (บรรทัด "ขายไว้ n รอบ" + ส่วนต่างกับจำนวนนัดที่ประมาณ) — แถวที่ช่วงต่างกันรายรายการ = null
     🐞 ตรวจทาน lib-02: `row.roundsSold` ของแถว = **ค่ามากสุด** ของรายการที่ลงไซต์นี้ (`serviceVisitsSold`) · สองรายการคนละช่วง
        (02/09/2026–01/09/2027 12 รอบ ต่อด้วย 02/09/2027–01/09/2028 12 รอบ) ⇒ โมดัลเปิดช่วงรวม 24 เดือน แล้วบอก "ขายไว้ 12 รอบ"
        TS ตั้งรายเดือน (24 นัด — ตรงกับที่ขาย) โมดัลกลับบอกว่าต่างจากที่ขาย 12 · ทำตามคำบอก = 12 นัดใน 24 เดือน = ครึ่งเดียวของที่ขาย
        ⇒ ไม่มีตัวเลขให้เทียบ (ผู้ใช้ดูช่วงของแต่ละรายการแล้วเลือกความถี่เอง) · แถวอื่นทุกแบบ = `row.roundsSold` เท่าเดิม
     ⚠️ ไม่ทับ `roundsSold` ของแถว (ช่องเดิมของ planQueue ไม่ถูกแตะ — คอลัมน์ของตาราง/ตัวรวมอื่นอ่านอยู่) */
  const planRoundsSold = periodMixed ? null : (row?.roundsSold ?? null);
  /* ⭐ ความถี่ตัวแรกที่ได้นัด **เท่าจำนวนรอบบริการพอดี** (`suggestCadence` · mig 0397): รายเดือนวันที่ของวันเริ่ม →
        รายสัปดาห์ จ.–ศ. → ทุก N วัน (`exact` บอกว่าพอดีไหม) · ตัวเดียวกับชิปของโมดัลรอบบริการ ⇒ แถวกับโมดัลพูดตรงกัน */
  const cadence = window && suggestRounds
    ? suggestCadence({ startDate: window.startDate, endDate: window.endDate, rounds: suggestRounds })
    : null;

  /* สัญญา: ตัวตัดสินเดียวกับชิปเดิม (`orderReadiness` — signed เท่านั้น) */
  const readiness = orderReadiness(order, {
    contractsById: new Map(order?.serviceContractId && contract ? [[order.serviceContractId, contract]] : []),
    todayIso,
  });
  const hasContract = readiness.hasContract;
  const contractNo = readiness.contractNo;

  /* รายการ term ทรงเดียวทั้งระบบ (§4.3) — แผงรายละเอียดโซน · แท็บงานบริการของ SO · ช่องมาตรฐาน มล. ส่งต่อโดยไม่แปลงทรง */
  /* เดือนของรายการ = ช่วงหัวใบของใบ pipeline ที่มีตราเท่านั้น (C-D9: ใบย้อนหลังไม่มีข้อเสนอ มล.) — ตรงกับแท็บงานบริการของ SO
     ที่ไม่มีสัญญาให้อ่าน ⇒ รายการเดียวกันให้ชิปเดียวกันทั้งสองจอ (§7 ข้อ 5) */
  const periodMonths = span && stamped && !historical ? (span.months || null) : null;
  /* ใบแยกรายรายการ: เดือนของรายการ = เดือนเต็มของช่วงของ **รายการนั้นเอง** (ข้อเสนอ มล. ต่อรอบขาย · ตรงกับแท็บงานบริการของ SO) */
  const termMonths = (index) => (lineMode
    ? (termPeriods[index] ? (periodSpan(termPeriods[index]).months || null) : null)
    : periodMonths);
  /* ช่วงของแต่ละรายการในแถว (ใบแยกรายรายการ) — ไม่ซ้ำรายการ · เรียงตามวันเริ่ม · โหมดทั้งใบ = [] */
  const linePeriods = [];
  if (lineMode) {
    const seen = new Set();
    terms.forEach((term, index) => {
      const lineId = term?.salesOrderLineId || null;
      const p = termPeriods[index];
      if (!lineId || !p || seen.has(lineId)) return;
      seen.add(lineId);
      linePeriods.push({ lineId, from: p.from, to: p.to });
    });
    linePeriods.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)
      || (a.to < b.to ? -1 : a.to > b.to ? 1 : 0) || naturalCompare(a.lineId, b.lineId));
  }
  const termItems = terms.map((term, index) => {
    const zone = zonesById.get(term.zoneId) || null;
    const line = pick(linesById, term.salesOrderLineId);
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
      periodMonths: termMonths(index),
      standardMlPerMonth: positiveNumber(term.standardMlPerMonth),
    };
  });
  /* เรียง + ป้าย "รายการ n · FG" ด้วยตัวช่วยเดียวกับแท็บงานบริการของใบ (review 29/09) — สองรอบขาย FG เดียวกันบนโซนเดียว
     (SO-26090247-0) ต้องแยกกันออกทั้งสองจอ · เลขรายการ = ตำแหน่งในใบ ⇒ ส่งบรรทัด **ทั้งใบ** ของแถวนี้ */
  const orderLines = (linesById instanceof Map ? [...linesById.values()] : Object.values(linesById || {}))
    .filter((line) => line && row?.salesOrderId && line.salesOrderId === row.salesOrderId);
  const { items: termDetails, labels: termLabels } = termLineLabels(termItems, { terms, lines: orderLines });

  /* รอบอื่นที่เดินอยู่ที่ไซต์ — stale ชนะ foreign (เป็นรอบเดียวกัน · ทางแก้ต่างกัน) */
  const stale = row?.stalePlanToMove || null;
  const otherPlanNote = stale
    ? OTHER_PLAN_TEXT.stale(stale.fromOrderNumber)
    : (row?.foreignPlans > 0 ? OTHER_PLAN_TEXT.foreign(row.foreignPlans) : null);
  const existingPlanWarning = [otherPlanNote, row?.unboundPlans > 0 ? OTHER_PLAN_TEXT.unbound(row.unboundPlans) : null]
    .filter(Boolean).join(' · ') || null;

  const site = row?.site || null;
  const ended = !!period && period.to < todayIso;
  const strip = `งานนี้ · ${[
    row?.orderNumber || row?.salesOrderId || null,
    site?.name || null,
    `${fmtNumber(zones.length)} โซน`,
    stamped && packsPerRound != null ? `${fmtNumber(packsPerRound)} แพ็ค/รอบ` : null,
    planRoundsSold ? roundsSoldSentence(planRoundsSold) : null,
    period ? `ช่วงบริการ ${fmtDate(period.from)}–${fmtDate(period.to)}${periodMixed ? PERIOD_MIXED_STRIP : ''}` : null,
    ended ? `ช่วงบริการจบแล้ว ${fmtDate(period.to)}` : null,
  ].filter(Boolean).join(' · ')}`;

  return {
    stamped,
    zonePacks,
    packsPerRound,
    zonePacksText,
    period,
    periodText: period ? `${fmtDate(period.from)} – ${fmtDate(period.to)}` : null,
    periodSpanText: periodMixed ? PERIOD_MIXED_TEXT : (span?.label || null),
    /* mig 0400: โหมดช่วงบริการของใบของแถว · `periodMixed` = ไซต์นี้มีรายการที่ช่วงไม่เท่ากัน · `linePeriods` = ช่วงรายรายการ ([] ในโหมดทั้งใบ) */
    periodMode: lineMode ? SERVICE_PERIOD_MODE_LINE : SERVICE_PERIOD_MODE_WHOLE,
    periodMixed,
    linePeriods,
    planRoundsSold,
    window,
    cadence,
    cadenceText: cadence ? cadenceText(cadence) : null,
    // พอดี = "12 นัด" · ไม่พอดี = "≈ 25 นัด" (+ "สูงสุดที่ตั้งได้" เมื่อโดนเพดาน 365 วัน)
    cadenceSub: cadence
      ? (cadence.exact
        ? `${fmtNumber(cadence.visits)} นัด`
        : `≈ ${fmtNumber(cadence.visits)} นัด${cadence.clamped ? ' · สูงสุดที่ตั้งได้' : ''}`)
      : null,
    contract: { hasContract, contractNo },
    contractChip: hasContract
      ? { tone: 'success', label: contractNo || CONTRACT_SIGNED_FALLBACK }
      : { tone: 'warning', label: CONTRACT_MISSING_CHIP },
    termDetails,
    termLabels,
    otherPlanNote,
    /* ค่าเติมของโมดัล (§4.5) — ไม่มีช่วงให้ใช้ = null (โมดัลเริ่มว่างเหมือนเดิม) · ความถี่ไม่เติมเงียบ ๆ (C-D6) */
    prefill: window ? { kind: 'refill', startDate: window.startDate, endDate: window.endDate, startHint: window.startHint } : null,
    context: {
      subtitle: [site?.code, site?.name].filter(Boolean).join(' · ') || null,
      strip,
      contractWarning: !hasContract,
      roundsSold: suggestRounds,
      /* คำเตือนรอบซ้อน (review 29/09) — มีเมื่อมีเท่านั้น (ทรง context เดิมของแถวทั่วไปไม่เปลี่ยน) */
      ...(existingPlanWarning ? { existingPlanWarning } : {}),
    },
  };
}

/** แถวของ `planQueue` + ข้อเท็จจริง (ช่องเดิมไม่ถูกแตะ · จำนวน/ลำดับแถวเท่าเดิม)
 * @param orphans ผลของ `orphanPlanRows` (ไม่บังคับ) — รอบ stale ที่ใบปลายโซ่คือใบของแถว ติดแถวเป็น `stalePlanToMove`
 *                (ทางที่ถูกคือย้ายรอบเดิมมาใบนี้ที่หน้าไซต์ ไม่ใช่กดตั้งรอบใหม่ · review 29/09) */
export function decoratePlanRows(rows, { ordersById = new Map(), contractsById = new Map(), linesById = new Map(), todayIso = businessDate(), orphans = null } = {}) {
  const staleByPair = new Map();
  for (const item of Array.isArray(orphans?.stale) ? orphans.stale : []) {
    const key = `${item.siteId}\u0000${item.toOrderId}`;
    if (!staleByPair.has(key)) staleByPair.set(key, { planId: item.planId, fromOrderNumber: item.fromOrderNumber || item.fromOrderId || null });
  }
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const order = pick(ordersById, row?.salesOrderId);
    const contract = order?.serviceContractId ? pick(contractsById, order.serviceContractId) : null;
    const withStale = { ...row, stalePlanToMove: staleByPair.get(`${row?.siteId}\u0000${row?.salesOrderId}`) || null };
    return { ...withStale, ...planRowFacts(withStale, { order, contract, linesById, todayIso }) };
  });
}

/* ── ยอดรวมของแท็บ (C-D21 · [owner]) ─────────────────────────────────────────────────────
   ป้ายจำนวน = "{n} แถว" (หน่วยของแถวคือไซต์ × ใบ) · รายละเอียดไปอยู่บรรทัดรวมเหนือ Pager
   แพ็คนับเฉพาะแถวที่ตั้งแล้ว · แถวที่ตั้งแล้วแต่ไม่รู้แพ็ค = ไม่บอกยอดแพ็ค (ไม่โชว์ยอดครึ่ง ๆ เป็นยอดเต็ม) */
export function planTotals(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const sites = new Set();
  const orders = new Set();
  const zones = new Set();
  let anyStamped = false;
  let packsKnown = true;
  let packs = 0;
  for (const row of list) {
    if (row?.siteId) sites.add(row.siteId);
    if (row?.salesOrderId) orders.add(row.salesOrderId);
    for (const zone of Array.isArray(row?.zones) ? row.zones : []) if (zone?.id) zones.add(zone.id);
    if (!row?.stamped) continue;
    anyStamped = true;
    if (row.packsPerRound == null) packsKnown = false;
    else packs += row.packsPerRound;
  }
  return {
    rows: list.length,
    sites: sites.size,
    orders: orders.size,
    zones: zones.size,
    packsPerRound: anyStamped && packsKnown ? packs : null,
    anyStamped,
  };
}

export const planCountLabel = (totals) => `${fmtNumber(totals?.rows || 0)} แถว`;

export function planTotalsLine(totals) {
  const base = `ทั้งหมด ${fmtNumber(totals?.sites || 0)} ไซต์ · ${fmtNumber(totals?.orders || 0)} ใบ · ${fmtNumber(totals?.zones || 0)} โซน`;
  return totals?.anyStamped && totals.packsPerRound != null ? `${base} · ${fmtNumber(totals.packsPerRound)} แพ็ค/รอบ` : base;
}

/* ── รอบกำพร้า (C-D11 · [owner]) ────────────────────────────────────────────────────────
   รอบที่ยังเดิน (เปิดอยู่ · ไม่มีวันจบหรือจบไม่ก่อนวันนี้) แต่ใบของมันไม่มีผลแล้ว:
   · dropped   — ใบถูก Rev. · ใบปลายโซ่อนุมัติแล้ว **ไม่มี** term ที่ไซต์ของรอบ (Rev. ถอดไซต์นี้)
   · stale     — ใบปลายโซ่อนุมัติแล้ว **มี** term ที่ไซต์นี้ แต่รอบยังชี้ใบเก่า (0392 ย้ายรอบจาก `revisedFromId` ทอดเดียว ⇒
                 Rev. ของ Rev. ที่เอาไซต์กลับมา ทิ้งรอบไว้ที่ใบแรก)
   · cancelled — ใบถูกยกเลิก หรือใบ Rev. ปลายโซ่ถูกยกเลิก (ไม่มีใบไหนย้ายรอบให้อีกแล้ว)
   ไม่ใช่กำพร้า: ใบยังมีผล · ปลายโซ่ยังไม่อนุมัติ (Rev. รออนุมัติ — 0392 ย้ายให้ตอนอนุมัติ) · ย้อนการอนุมัติ ·
   ข้อต่อที่ไม่ได้โหลดมา · โซ่วน · โซ่ยาวเกินเพดาน (ไม่เดา)
   ⚠️ ระบบไม่ปิด/ย้ายรอบเอง — แถบบอก TS ให้ตัดสินที่หน้าไซต์ */
export const MAX_ORPHAN_HOPS = 10;

const planIsLive = (plan, todayIso) => !!plan?.salesOrderId && plan.isActive !== false
  && (!plan.endDate || String(plan.endDate) >= todayIso);

/* ใบปลายโซ่ `supersededById` (≤ MAX_ORPHAN_HOPS ทอด) · ข้อต่อหาย/วน/ยาวเกิน = null */
function chainTip(order, ordersById) {
  let current = order;
  const seen = new Set([current.id]);
  for (let hop = 0; hop < MAX_ORPHAN_HOPS; hop += 1) {
    if (!current.supersededById) return current;
    const next = pick(ordersById, current.supersededById);
    if (!next || seen.has(next.id)) return null;
    seen.add(next.id);
    current = next;
  }
  return current.supersededById ? null : current;
}

/**
 * รอบที่ค้างบนใบที่ไม่มีผลแล้ว → `{ dropped, stale, cancelled }`
 * @param ordersById ใบที่มีผล + ใบที่ตายแล้วที่ route โหลดเพิ่มตาม `orphanOrderIdsToLoad`
 * @param terms term ทั้งหมด (ใช้ดูว่าใบปลายโซ่มีโซนที่ไซต์ของรอบไหม) · `zones` ทุกโซน (โซน → ไซต์) · `sites` ทะเบียนไซต์
 */
export function orphanPlanRows({ plans = [], ordersById = new Map(), terms = [], zones = [], sites = [], todayIso = businessDate() } = {}) {
  const siteOfZone = new Map(zones.map((z) => [z.id, z.siteId]));
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const sitesByOrder = new Map();
  for (const term of terms) {
    const siteId = siteOfZone.get(term.zoneId);
    if (!siteId || !term.salesOrderId) continue;
    const set = sitesByOrder.get(term.salesOrderId) || new Set();
    set.add(siteId);
    sitesByOrder.set(term.salesOrderId, set);
  }

  const out = { dropped: [], stale: [], cancelled: [] };
  for (const plan of plans) {
    if (!planIsLive(plan, todayIso)) continue;
    const from = pick(ordersById, plan.salesOrderId);
    if (!from || termOrderActive(from)) continue;

    let kind = null;
    let to = null;
    if (from.status === 'cancelled') {
      kind = 'cancelled';
    } else if (from.supersededById) {
      const tip = chainTip(from, ordersById);
      if (!tip) continue;
      if (tip.status === 'cancelled') {
        kind = 'cancelled';
        to = tip;
      } else if (termOrderActive(tip)) {
        to = tip;
        kind = sitesByOrder.get(tip.id)?.has(plan.siteId) ? 'stale' : 'dropped';
      } else {
        continue;
      }
    } else {
      continue;
    }

    out[kind].push({
      planId: plan.id,
      siteId: plan.siteId,
      site: sitesById.get(plan.siteId) || null,
      fromOrderId: from.id,
      fromOrderNumber: from.orderNumber || null,
      toOrderId: to?.id || null,
      toOrderNumber: to?.orderNumber || null,
      everyDays: plan.everyDays ?? null,
      // คำบอกความถี่ของรอบทุกชนิด (mig 0397) — แถบรอบกำพร้าพิมพ์ช่องนี้ (รอบตามปฏิทินไม่มี everyDays)
      cadenceText: cadenceText(plan),
      kind,
    });
  }
  const byRow = (a, b) => String(a.site?.name || '').localeCompare(String(b.site?.name || ''), 'th')
    || String(a.fromOrderNumber || a.fromOrderId || '').localeCompare(String(b.fromOrderNumber || b.fromOrderId || ''))
    || String(a.planId || '').localeCompare(String(b.planId || ''));
  for (const list of Object.values(out)) list.sort(byRow);
  return out;
}

/**
 * ใบที่ route ต้องโหลดเพิ่มเพื่อเดินโซ่ของรอบที่ยังเดิน (ทีละทอด) — วนเรียกจนได้ [] (≤ MAX_ORPHAN_HOPS + 1 รอบ)
 * ⚠️ ผู้เรียกโหลดด้วย id ล้วน (`.in('id', …)` · กรองสถานะใน JS — กฎ 18) แล้วรวมเข้า `ordersById`
 */
export function orphanOrderIdsToLoad({ plans = [], ordersById = new Map(), todayIso = businessDate() } = {}) {
  const missing = new Set();
  for (const plan of plans) {
    if (!planIsLive(plan, todayIso)) continue;
    let id = plan.salesOrderId;
    const seen = new Set();
    for (let hop = 0; hop <= MAX_ORPHAN_HOPS; hop += 1) {
      if (!id || seen.has(id)) break;
      seen.add(id);
      const order = pick(ordersById, id);
      if (!order) { missing.add(id); break; }
      if (termOrderActive(order) || order.status === 'cancelled' || !order.supersededById) break;
      id = order.supersededById;
    }
  }
  return [...missing];
}

export const ORPHAN_TITLES = Object.freeze({
  dropped: (n) => `รอบของใบเดิมที่ถูกแทนแล้ว ${fmtNumber(n)} รอบ (Rev. ไม่มีไซต์นี้) — ปิดรอบ หรือนัดถอนเครื่อง`,
  stale: (n) => `รอบที่ยังผูกใบเดิม ${fmtNumber(n)} รอบ — ใบ Rev. ล่าสุดครอบไซต์นี้แล้ว ย้ายรอบไปใบนั้นที่หน้าไซต์ (แก้รอบ → “ใบสั่งขายที่ครอบรอบนี้”)`,
  cancelled: (n) => `รอบของใบที่ยกเลิกแล้ว ${fmtNumber(n)} รอบ — ปิดรอบ หรือนัดถอนเครื่อง`,
});

/** บรรทัดของแถบรอบกำพร้า: "{รหัสไซต์} {ชื่อ} · {ใบเดิม} → {ใบปลายโซ่} · {ความถี่}" (ไม่มีใบปลายโซ่ = ไม่มีลูกศร)
 *  ความถี่ = `row.cadenceText` (ทุกชนิด · mig 0397) · แถวรูปเดิมที่มีแค่ `everyDays` ยังได้ "ทุก N วัน" ผ่าน `cadenceText` ตัวเดียวกัน
 *  อ่านความถี่ไม่ออก = ไม่ต่อท้าย */
export function ORPHAN_ITEM_TEXT(row) {
  const site = [row?.site?.code, row?.site?.name].filter(Boolean).join(' ') || row?.siteId || '—';
  const from = row?.fromOrderNumber || row?.fromOrderId || '—';
  const to = row?.toOrderNumber || row?.toOrderId || null;
  const text = row?.cadenceText || cadenceText(row);
  const every = text && text !== '—' ? ` · ${text}` : '';
  return `${site} · ${from}${to ? ` → ${to}` : ''}${every}`;
}
