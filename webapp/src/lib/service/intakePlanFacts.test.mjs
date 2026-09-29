// ── ข้อเท็จจริงของแถว "รอตั้งรอบ" + ค่าเติมของโมดัลรอบบริการ (PR-C · C1) — logic ล้วน ─────────────────
//
// เคสอ้างอิงคือใบจริงบน prod 29/09: SO-26090247-0 (ฝ่ายขายตั้งโซนแล้ว · 2 บรรทัด × 2 แพ็คบนโซน Office เดียว · ขาย 1 รอบ
// · ช่วงบริการ 22/10/2026–21/10/2027 · ยังไม่ผูกสัญญา)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_MISSING_CHIP, CONTRACT_MISSING_WARNING, ORPHAN_ITEM_TEXT, ORPHAN_TITLES, PLAN_EMPTY_TEXT,
  PLAN_START_HINT_PERIOD, PLAN_TAB_STAMPED_NOTE, STAMPED_BADGE_LABEL,
  MAX_ORPHAN_HOPS, OTHER_PLAN_TEXT, decoratePlanRows, orphanOrderIdsToLoad, orphanPlanRows, planCountLabel, planRowFacts,
  planSuggestionLabel, planTotals, planTotalsLine, planWindow,
} from './intakePlanFacts.js';
import { planQueue } from './intake.js';
import { suggestEveryDays } from './rounds.js';
import { ORIGIN_HISTORICAL, ORIGIN_PIPELINE } from '../sales/historicalOrders.js';

/* ── ใบจริง SO-26090247-0 ─────────────────────────────────────────────────────────────── */
const SITE = { id: 'SVS-muar3j8841c30', code: 'ST-0364-01-BKK-1120', name: 'Asan Service', customerId: 'CUS-1' };
const OFFICE = { id: 'SZN-muar3jcs5d98', siteId: SITE.id, code: 'ZN-1120-10210', name: 'Office' };
const FG = 'FG-364-02-001-1061';
const stampedOrder = (over = {}) => ({
  id: 'SOR-mum2x0ms1fti', orderNumber: 'SO-26090247-0', status: 'approved', supersededById: null,
  origin: ORIGIN_PIPELINE, serviceTermsOpenedAt: '2026-09-29T03:00:00Z',
  servicePeriodFrom: '2026-10-22', servicePeriodTo: '2027-10-21', serviceContractId: null, totalAmount: 12000,
  ...over,
});
const LINES = [
  { id: 'SOL-1', salesOrderId: 'SOR-mum2x0ms1fti', serviceRounds: 1, fgCode: FG },
  { id: 'SOL-2', salesOrderId: 'SOR-mum2x0ms1fti', serviceRounds: 1, fgCode: FG },
];
const TERMS = [
  { id: 'SZT-S1', zoneId: OFFICE.id, salesOrderId: 'SOR-mum2x0ms1fti', salesOrderLineId: 'SOL-1', fgCode: FG, description: 'บริการน้ำหอมรายเดือน', packageQty: 2, unit: 'แพ็ค', standardMlPerMonth: null },
  { id: 'SZT-S2', zoneId: OFFICE.id, salesOrderId: 'SOR-mum2x0ms1fti', salesOrderLineId: 'SOL-2', fgCode: FG, description: 'บริการน้ำหอมรายเดือน', packageQty: 2, unit: 'แพ็ค', standardMlPerMonth: null },
];

function rowFor({ order = stampedOrder(), zones = [OFFICE], terms = TERMS, lines = LINES, sites = [SITE], todayIso = '2026-09-29' } = {}) {
  const ordersById = new Map([[order.id, order]]);
  const linesById = new Map(lines.map((l) => [l.id, l]));
  const rows = planQueue({ zones, terms, plans: [], sites, ordersById, linesById, todayIso });
  assert.equal(rows.length, 1, 'ฟิกซ์เจอร์ต้องได้แถวเดียว');
  return { row: rows[0], linesById };
}

test('ข้อความคงที่ของแท็บรอตั้งรอบ (แคตตาล็อก §5)', () => {
  assert.equal(STAMPED_BADGE_LABEL, 'ฝ่ายขายตั้งโซนแล้ว');
  assert.equal(PLAN_TAB_STAMPED_NOTE, 'ใบที่มีป้าย “ฝ่ายขายตั้งโซนแล้ว” มาพร้อมโซน แพ็คต่อรอบ และจำนวนรอบบริการ — โซนผิดให้ฝ่ายขายออก Rev.');
  assert.equal(PLAN_EMPTY_TEXT, 'ไม่มีไซต์ที่รอตั้งรอบ — ใบที่อนุมัติแล้วจะมาอยู่ที่นี่ทันที');
  assert.equal(CONTRACT_MISSING_CHIP, 'ยังไม่ผูก — นัดติดด่านสัญญา (SA)');
  assert.equal(CONTRACT_MISSING_WARNING, 'ใบนี้ยังไม่ผูกสัญญา — สร้างรอบและนัดได้ แต่นัดจะติดด่านสัญญาจนกว่าฝ่ายขาย (SA) ผูกสัญญาที่ครอบวันนัด');
  assert.equal(PLAN_START_HINT_PERIOD, 'ตามวันเริ่มช่วงบริการของใบ');
});

test('⭐ SO-26090247-0: แพ็ครายโซน · ช่วงบริการ · รอบที่แนะนำ · สัญญา · ค่าเติมโมดัล', () => {
  const { row, linesById } = rowFor();
  const facts = planRowFacts(row, { order: stampedOrder(), contract: null, linesById, todayIso: '2026-09-29' });

  assert.equal(facts.stamped, true);
  assert.deepEqual(facts.zonePacks, [{ zoneId: OFFICE.id, code: 'ZN-1120-10210', name: 'Office', packsPerRound: 4 }]);
  assert.equal(facts.packsPerRound, 4);
  assert.equal(facts.zonePacksText, 'Office 4 = 4 แพ็ค/รอบ');

  assert.deepEqual(facts.period, { from: '2026-10-22', to: '2027-10-21' });
  assert.equal(facts.periodText, '22/10/2026 – 21/10/2027');
  assert.equal(facts.periodSpanText, '12 เดือน');

  assert.deepEqual(facts.window, { startDate: '2026-10-22', endDate: '2027-10-21', startHint: 'ตามวันเริ่มช่วงบริการของใบ' });
  assert.deepEqual(facts.cadence, { everyDays: 365, visits: 1, clamped: false });
  assert.equal(facts.cadenceText, 'ทุก 365 วัน');
  assert.equal(facts.cadenceSub, '≈ 1 นัด');

  assert.deepEqual(facts.contract, { hasContract: false, contractNo: null });
  assert.deepEqual(facts.contractChip, { tone: 'warning', label: 'ยังไม่ผูก — นัดติดด่านสัญญา (SA)' });

  const item = (id, lineId) => ({
    id, zoneId: OFFICE.id, zoneCode: 'ZN-1120-10210', zoneName: 'Office', fgCode: FG, description: 'บริการน้ำหอมรายเดือน',
    packageQty: 2, unit: 'แพ็ค', rounds: 1, periodMonths: 12, standardMlPerMonth: null,
  });
  assert.deepEqual(facts.termDetails, [item('SZT-S1', 'SOL-1'), item('SZT-S2', 'SOL-2')]);

  assert.deepEqual(facts.prefill, { kind: 'refill', startDate: '2026-10-22', endDate: '2027-10-21', startHint: 'ตามวันเริ่มช่วงบริการของใบ' });
  assert.deepEqual(facts.context, {
    subtitle: 'ST-0364-01-BKK-1120 · Asan Service',
    strip: 'งานนี้ · SO-26090247-0 · Asan Service · 1 โซน · 4 แพ็ค/รอบ · จำนวนรอบบริการ 1 รอบ · ช่วงบริการ 22/10/2026–21/10/2027',
    contractWarning: true,
    roundsSold: 1,
  });
});

test('term item ทรงเดียว (§4.3) — ตั้งมาตรฐานแล้วส่งค่าออกเป็นตัวเลข · เรียงตามชื่อโซนแล้ว fgCode', () => {
  const HALL = { id: 'Z-HALL', siteId: SITE.id, code: 'ZN-1120-10211', name: 'Hall' };
  const terms = [
    { ...TERMS[0], id: 'T-B', fgCode: 'FG-B', standardMlPerMonth: '2000' },
    { ...TERMS[1], id: 'T-A', fgCode: 'FG-A', zoneId: HALL.id },
  ];
  const { row, linesById } = rowFor({ zones: [OFFICE, HALL], terms });
  const facts = planRowFacts(row, { order: stampedOrder(), linesById, todayIso: '2026-09-29' });
  assert.deepEqual(facts.termDetails.map((t) => [t.id, t.zoneName, t.standardMlPerMonth]), [['T-A', 'Hall', null], ['T-B', 'Office', 2000]]);
  for (const t of facts.termDetails) {
    assert.deepEqual(Object.keys(t).sort(), ['description', 'fgCode', 'id', 'packageQty', 'periodMonths', 'rounds', 'standardMlPerMonth', 'unit', 'zoneCode', 'zoneId', 'zoneName']);
  }
  assert.equal(facts.zonePacksText, 'Hall 2 · Office 2 = 4 แพ็ค/รอบ');
});

test('ช่วงบริการเริ่มไปแล้ว → เริ่มวันนี้ + บอกเหตุ · รอบที่แนะนำคิดจากช่วงที่เหลือ (C-D5)', () => {
  const { row, linesById } = rowFor({ todayIso: '2026-12-01' });
  const facts = planRowFacts(row, { order: stampedOrder(), linesById, todayIso: '2026-12-01' });
  assert.deepEqual(facts.window, { startDate: '2026-12-01', endDate: '2027-10-21', startHint: 'ช่วงบริการเริ่ม 22/10/2026 ไปแล้ว — เริ่มวันนี้' });
  assert.deepEqual(facts.prefill, { kind: 'refill', startDate: '2026-12-01', endDate: '2027-10-21', startHint: 'ช่วงบริการเริ่ม 22/10/2026 ไปแล้ว — เริ่มวันนี้' });
  assert.deepEqual(facts.cadence, suggestEveryDays({ startDate: '2026-12-01', endDate: '2027-10-21', rounds: 1 }));
  assert.equal(facts.cadenceText, 'ทุก 325 วัน');
  assert.equal(facts.periodText, '22/10/2026 – 21/10/2027', 'ช่วงบริการของใบไม่เปลี่ยนตามวันนี้');
});

test('ช่วงบริการจบแล้ว → ไม่เติมวัน ไม่แนะนำรอบ · แถบบริบทบอกว่าจบแล้ว', () => {
  const { row, linesById } = rowFor({ todayIso: '2027-11-01' });
  const facts = planRowFacts(row, { order: stampedOrder(), linesById, todayIso: '2027-11-01' });
  assert.equal(facts.window, null);
  assert.equal(facts.prefill, null);
  assert.equal(facts.cadence, null);
  assert.equal(facts.cadenceText, null);
  assert.equal(facts.cadenceSub, null);
  assert.equal(facts.periodText, '22/10/2026 – 21/10/2027');
  assert.equal(facts.context.strip,
    'งานนี้ · SO-26090247-0 · Asan Service · 1 โซน · 4 แพ็ค/รอบ · จำนวนรอบบริการ 1 รอบ · ช่วงบริการ 22/10/2026–21/10/2027 · ช่วงบริการจบแล้ว 21/10/2027');
});

test('สองโซนในไซต์เดียว 2 + 1 แพ็ค = รวม 3 แพ็ค/รอบ · เรียงชื่อโซนแบบหน้าไซต์ (ไทยก่อน · ตัวเลขเรียงเป็นเลข)', () => {
  const LOBBY = { id: 'Z-L', siteId: SITE.id, code: 'ZN-1', name: 'Lobby' };
  const WALK = { id: 'Z-W', siteId: SITE.id, code: 'ZN-2', name: 'ทางเดิน' };
  const terms = [
    { ...TERMS[0], id: 'T1', zoneId: LOBBY.id, packageQty: 2 },
    { ...TERMS[1], id: 'T2', zoneId: WALK.id, packageQty: 1 },
  ];
  const { row, linesById } = rowFor({ zones: [LOBBY, WALK], terms });
  const facts = planRowFacts(row, { order: stampedOrder(), linesById, todayIso: '2026-09-29' });
  assert.equal(facts.packsPerRound, 3);
  assert.equal(facts.zonePacksText, 'ทางเดิน 1 · Lobby 2 = 3 แพ็ค/รอบ');
  assert.match(facts.context.strip, / · 2 โซน · 3 แพ็ค\/รอบ · /);

  const F2 = { id: 'Z-2', siteId: SITE.id, code: 'ZN-3', name: 'Floor 2' };
  const F10 = { id: 'Z-10', siteId: SITE.id, code: 'ZN-4', name: 'Floor 10' };
  const floors = rowFor({ zones: [F10, F2], terms: [{ ...TERMS[0], zoneId: F10.id, packageQty: 2 }, { ...TERMS[1], zoneId: F2.id, packageQty: 1 }] });
  assert.equal(planRowFacts(floors.row, { order: stampedOrder(), linesById: floors.linesById, todayIso: '2026-09-29' }).zonePacksText,
    'Floor 2 1 · Floor 10 2 = 3 แพ็ค/รอบ');
});

test('⚠️ ใบเดิม (ยังไม่มีตรา): แพ็ค/ช่วงบริการ/รอบที่แนะนำ = null — ช่วงร่างของงานตั้งย้อนหลังห้ามถูกอ่าน', () => {
  const order = stampedOrder({ serviceTermsOpenedAt: null, servicePeriodFrom: '2026-10-01', servicePeriodTo: '2027-09-30' });
  const lines = LINES.map((l) => ({ ...l, serviceRounds: 12 }));
  const terms = TERMS.map((t) => ({ ...t, id: t.id.replace('SZT-S', 'SZT-'), packageQty: 24, unit: 'ชุด' }));
  const { row, linesById } = rowFor({ order, lines, terms });
  assert.equal(row.stamped, false);
  const facts = planRowFacts(row, { order, linesById, todayIso: '2026-09-29' });
  assert.equal(facts.stamped, false);
  assert.deepEqual(facts.zonePacks, [{ zoneId: OFFICE.id, code: 'ZN-1120-10210', name: 'Office', packsPerRound: null }]);
  assert.equal(facts.packsPerRound, null);
  assert.equal(facts.zonePacksText, null);
  assert.equal(facts.period, null);
  assert.equal(facts.periodText, null);
  assert.equal(facts.periodSpanText, null);
  assert.equal(facts.window, null);
  assert.equal(facts.cadence, null);
  assert.equal(facts.cadenceText, null);
  assert.equal(facts.prefill, null);
  assert.ok(facts.termDetails.every((t) => t.packageQty === null && t.periodMonths === null && t.rounds === 12 && t.unit === 'ชุด'));
  assert.equal(facts.context.strip, 'งานนี้ · SO-26090247-0 · Asan Service · 1 โซน · จำนวนรอบบริการ 12 รอบ');
  assert.equal(facts.context.roundsSold, null, 'ไม่มีรอบที่แนะนำบนแถว = ไม่มีชิปในโมดัล (ใช้ช่วงเดียวกัน)');
});

test('ใบย้อนหลัง: ช่วงบริการมาจากสัญญาแทน · ไม่มีแพ็ค/รอบที่แนะนำ (ส่งไปแล้วบางรอบก่อนเข้าระบบ) · ชิปสัญญาเลขที่', () => {
  const contract = { id: 'CT-1', contractNo: 'CT-2601-0001', status: 'signed', effectiveDate: '2026-01-01', expiryDate: '2026-12-31' };
  const order = stampedOrder({ origin: ORIGIN_HISTORICAL, serviceTermsOpenedAt: null, servicePeriodFrom: null, servicePeriodTo: null, serviceContractId: 'CT-1' });
  const lines = LINES.map((l) => ({ ...l, serviceRounds: 12 }));
  const { row, linesById } = rowFor({ order, lines });
  const facts = planRowFacts(row, { order, contract, linesById, todayIso: '2026-09-29' });
  assert.deepEqual(facts.period, { from: '2026-01-01', to: '2026-12-31' });
  assert.equal(facts.periodText, '01/01/2026 – 31/12/2026');
  assert.equal(facts.periodSpanText, '12 เดือน');
  assert.deepEqual(facts.prefill, { kind: 'refill', startDate: '2026-09-29', endDate: '2026-12-31', startHint: 'ช่วงบริการเริ่ม 01/01/2026 ไปแล้ว — เริ่มวันนี้' });
  assert.equal(facts.cadence, null);
  assert.equal(facts.packsPerRound, null);
  assert.deepEqual(facts.contract, { hasContract: true, contractNo: 'CT-2601-0001' });
  assert.deepEqual(facts.contractChip, { tone: 'success', label: 'CT-2601-0001' });
  assert.equal(facts.context.contractWarning, false);
  assert.equal(facts.context.roundsSold, null);
  assert.ok(facts.termDetails.every((t) => t.periodMonths === null && t.packageQty === null));
});

/* ⚠️ ข้ามเลน (PR-D · mig 0394 ของ claude/so-service-historical): ใบย้อนหลังที่อนุมัติหลังไฟล์นั้นได้ตรา `serviceTermsOpenedAt`
   และ term เป็นแพ็คต่อรอบหน่วย 'แพ็ค' ⇒ "มีตรา" ไม่ได้แปลว่า "ใบ pipeline" อีกต่อไป
   กติกาของ PR-C ที่ต้องคงไว้: C-D3 แถวใบย้อนหลังไม่มีรอบที่แนะนำ (ส่งไปแล้วบางรอบก่อนเข้าระบบ) · C-D9 ใบย้อนหลังไม่มีข้อเสนอ มล.
   (แท็บงานบริการของ SO ไม่มีสัญญาให้รู้เดือน ⇒ ถ้าคิว TS ให้เดือนจากสัญญา สองจอจะโชว์ชิปไม่ตรงกัน — รายการ §7 ข้อ 5) */
test('ใบย้อนหลังที่ได้ตรา (หลัง 0394): แพ็ค/รอบโชว์ได้ · แต่ไม่มีรอบที่แนะนำ (C-D3) และไม่มีข้อเสนอ มล. (C-D9)', async () => {
  const { standardMlSuggestion } = await import('./termStandardMl.js');
  const contract = { id: 'CT-1', contractNo: 'CT-2601-0001', status: 'signed', effectiveDate: '2026-01-01', expiryDate: '2026-12-31' };
  const order = stampedOrder({ origin: ORIGIN_HISTORICAL, serviceTermsOpenedAt: '2026-10-01T03:00:00Z', servicePeriodFrom: null, servicePeriodTo: null, serviceContractId: 'CT-1' });
  const lines = LINES.map((l) => ({ ...l, serviceRounds: 12 }));
  const { row, linesById } = rowFor({ order, lines });
  const facts = planRowFacts(row, { order, contract, linesById, todayIso: '2026-09-29' });
  assert.equal(facts.stamped, true);
  assert.equal(facts.packsPerRound, 4, 'term หลัง 0394 = แพ็คต่อรอบ');
  assert.deepEqual(facts.period, { from: '2026-01-01', to: '2026-12-31' }, 'ช่วงบริการยังมาจากสัญญาแทน');
  assert.equal(facts.cadence, null);
  assert.equal(facts.cadenceText, null);
  assert.equal(facts.context.roundsSold, null, 'ไม่มีรอบที่แนะนำบนแถว = ไม่มีชิปในโมดัล');
  assert.ok(facts.termDetails.every((t) => t.packageQty === 2 && t.periodMonths === null));
  assert.ok(facts.termDetails.every((t) => standardMlSuggestion(t, { stamped: facts.stamped }) === null));
});

test('ชิปสัญญา: signed = เลขที่ · ผูกแล้วแต่ยังไม่ signed = ยังไม่ผูก (ด่านสัญญาดูเฉพาะ signed)', () => {
  const { row, linesById } = rowFor();
  const order = stampedOrder({ serviceContractId: 'CT-9' });
  const signed = planRowFacts(row, { order, contract: { id: 'CT-9', contractNo: 'CT-2609-0009', status: 'signed' }, linesById, todayIso: '2026-09-29' });
  assert.deepEqual(signed.contractChip, { tone: 'success', label: 'CT-2609-0009' });
  assert.equal(signed.context.contractWarning, false);
  const draft = planRowFacts(row, { order, contract: { id: 'CT-9', contractNo: 'CT-2609-0009', status: 'draft' }, linesById, todayIso: '2026-09-29' });
  assert.deepEqual(draft.contractChip, { tone: 'warning', label: CONTRACT_MISSING_CHIP });
  assert.equal(draft.context.contractWarning, true);
});

test('planWindow: ไม่มีช่วง/ช่วงเพี้ยน/จบแล้ว = null · เริ่มวันนี้พอดี = ตามวันเริ่มของใบ', () => {
  assert.equal(planWindow(null, '2026-09-29'), null);
  assert.equal(planWindow({ from: '2026-10-01', to: '2026-09-01' }, '2026-09-29'), null);
  assert.equal(planWindow({ from: 'x', to: '2026-12-31' }, '2026-09-29'), null);
  assert.equal(planWindow({ from: '2026-01-01', to: '2026-09-28' }, '2026-09-29'), null);
  assert.deepEqual(planWindow({ from: '2026-09-29', to: '2026-09-29' }, '2026-09-29'),
    { startDate: '2026-09-29', endDate: '2026-09-29', startHint: 'ตามวันเริ่มช่วงบริการของใบ' });
  assert.deepEqual(planWindow({ from: '2026-01-01', to: '2026-09-29' }, '2026-09-29'),
    { startDate: '2026-09-29', endDate: '2026-09-29', startHint: 'ช่วงบริการเริ่ม 01/01/2026 ไปแล้ว — เริ่มวันนี้' });
});

test('planSuggestionLabel: ชิป "จำนวนรอบบริการ" · โดนเพดาน = บอกว่าได้ราวกี่นัด · ไม่มีข้อเสนอ = null', () => {
  assert.equal(planSuggestionLabel(12, suggestEveryDays({ startDate: '2026-10-01', endDate: '2027-09-30', rounds: 12 })), 'จำนวนรอบบริการ 12 รอบ → ทุก 33 วัน');
  assert.equal(planSuggestionLabel(2, suggestEveryDays({ startDate: '2026-01-01', endDate: '2028-01-01', rounds: 2 })),
    'จำนวนรอบบริการ 2 รอบ → ทุก 365 วัน (สูงสุดที่ตั้งได้ · ได้ราว 3 นัด)');
  assert.equal(planSuggestionLabel(12, null), null);
});

test('รอบที่แนะนำโดนเพดาน → ใต้ค่าบอก "สูงสุดที่ตั้งได้"', () => {
  const order = stampedOrder({ servicePeriodFrom: '2026-10-01', servicePeriodTo: '2028-09-30' });
  const lines = LINES.map((l) => ({ ...l, serviceRounds: 2 }));
  const { row, linesById } = rowFor({ order, lines });
  const facts = planRowFacts(row, { order, linesById, todayIso: '2026-09-29' });
  assert.equal(facts.cadenceText, 'ทุก 365 วัน');
  assert.equal(facts.cadenceSub, '≈ 3 นัด · สูงสุดที่ตั้งได้');
  assert.equal(facts.periodSpanText, '24 เดือน');
  assert.ok(facts.termDetails.every((t) => t.periodMonths === 24 && t.rounds === 2));
});

test('decoratePlanRows: เติมข้อเท็จจริงโดยไม่แตะ key · terms · ช่องเงิน · จำนวนแถว', () => {
  const order = stampedOrder();
  const other = { ...stampedOrder({ id: 'SO-B', orderNumber: 'SO-26090300-0', serviceTermsOpenedAt: null, serviceContractId: 'CT-1' }) };
  const ordersById = new Map([[order.id, order], [other.id, other]]);
  const linesById = new Map(LINES.map((l) => [l.id, l]));
  const terms = TERMS.concat([{ ...TERMS[0], id: 'SZT-B', salesOrderId: 'SO-B', salesOrderLineId: 'SOL-B' }]);
  const rows = planQueue({ zones: [OFFICE], terms, plans: [], sites: [SITE], ordersById, linesById, todayIso: '2026-09-29' });
  const contractsById = new Map([['CT-1', { id: 'CT-1', contractNo: 'CT-2601-0001', status: 'signed' }]]);
  const decorated = decoratePlanRows(rows, { ordersById, contractsById, linesById, todayIso: '2026-09-29' });
  assert.equal(decorated.length, rows.length);
  decorated.forEach((d, i) => {
    for (const key of ['key', 'siteId', 'site', 'salesOrderId', 'orderNumber', 'origin', 'paidThrough', 'coveredToday', 'paymentNotRequired', 'unboundPlans', 'zones', 'terms', 'roundsSold', 'roundsMixed', 'roundsValues', 'stamped']) {
      assert.deepEqual(d[key], rows[i][key], `${key} ต้องไม่ถูกแตะ`);
    }
  });
  const bySo = Object.fromEntries(decorated.map((r) => [r.salesOrderId, r]));
  assert.equal(bySo[order.id].zonePacksText, 'Office 4 = 4 แพ็ค/รอบ');
  assert.deepEqual(bySo['SO-B'].contractChip, { tone: 'success', label: 'CT-2601-0001' }, 'สัญญาหาจาก serviceContractId ของใบ');
  assert.deepEqual(decoratePlanRows([], { ordersById }), []);
});

test('planTotals · planCountLabel · planTotalsLine (C-D21): นับแถว · ไซต์ · ใบ · โซน · แพ็คเฉพาะแถวที่ตั้งแล้ว', () => {
  const rows = [
    { siteId: 'S1', salesOrderId: 'SO-A', zones: [{ id: 'Z1' }], stamped: true, packsPerRound: 4 },
    { siteId: 'S1', salesOrderId: 'SO-B', zones: [{ id: 'Z1' }], stamped: false, packsPerRound: null },
  ];
  const totals = planTotals(rows);
  assert.deepEqual(totals, { rows: 2, sites: 1, orders: 2, zones: 1, packsPerRound: 4, anyStamped: true });
  assert.equal(planCountLabel(totals), '2 แถว');
  assert.equal(planTotalsLine(totals), 'ทั้งหมด 1 ไซต์ · 2 ใบ · 1 โซน · 4 แพ็ค/รอบ');

  const legacyOnly = planTotals([rows[1]]);
  assert.deepEqual(legacyOnly, { rows: 1, sites: 1, orders: 1, zones: 1, packsPerRound: null, anyStamped: false });
  assert.equal(planTotalsLine(legacyOnly), 'ทั้งหมด 1 ไซต์ · 1 ใบ · 1 โซน');
  assert.equal(planCountLabel(planTotals([])), '0 แถว');

  const many = planTotals(Array.from({ length: 1200 }, (_, i) => ({ siteId: `S${i}`, salesOrderId: 'SO-A', zones: [], stamped: false })));
  assert.equal(planCountLabel(many), '1,200 แถว');
});

/* ── รอบกำพร้า (C-D11) ─────────────────────────────────────────────────────────────────── */
const OS1 = { id: 'S1', code: 'ST-1', name: 'ไซต์ A' };
const OS2 = { id: 'S2', code: 'ST-2', name: 'ไซต์ B' };
const OZ1 = { id: 'Z1', siteId: 'S1', name: 'Lobby' };
const OZ2 = { id: 'Z2', siteId: 'S2', name: 'Hall' };
const ord = (id, status, supersededById = null) => ({ id, orderNumber: `SO-${id}`, status, supersededById });
const livePlan = (id, salesOrderId, over = {}) => ({ id, siteId: 'S1', salesOrderId, everyDays: 30, isActive: true, endDate: null, ...over });
const orphanCtx = (plans, orders, terms) => orphanPlanRows({
  plans, ordersById: new Map(orders.map((o) => [o.id, o])), terms, zones: [OZ1, OZ2], sites: [OS1, OS2], todayIso: '2026-09-29',
});

test('⭐ รอบกำพร้า: Rev. ที่อนุมัติไม่มีไซต์นี้ = dropped · Rev. ของ Rev. เอาไซต์กลับมา = stale · ใบยกเลิก = cancelled', () => {
  const orders = [
    ord('A', 'revised', 'B'), ord('B', 'approved'),                                   // dropped: B ไม่มีไซต์ S1
    ord('C', 'revised', 'D'), ord('D', 'revised', 'E'), ord('E', 'approved'),          // stale: E ครอบ S1 แต่รอบยังชี้ C
    ord('F', 'cancelled'),                                                             // cancelled
  ];
  const terms = [
    { id: 'T-B', zoneId: 'Z2', salesOrderId: 'B' },
    { id: 'T-E', zoneId: 'Z1', salesOrderId: 'E' },
  ];
  const out = orphanCtx([livePlan('P1', 'A'), livePlan('P2', 'C', { everyDays: 14 }), livePlan('P3', 'F')], orders, terms);
  assert.deepEqual(out.dropped, [{ planId: 'P1', siteId: 'S1', site: OS1, fromOrderId: 'A', fromOrderNumber: 'SO-A', toOrderId: 'B', toOrderNumber: 'SO-B', everyDays: 30, kind: 'dropped' }]);
  assert.deepEqual(out.stale, [{ planId: 'P2', siteId: 'S1', site: OS1, fromOrderId: 'C', fromOrderNumber: 'SO-C', toOrderId: 'E', toOrderNumber: 'SO-E', everyDays: 14, kind: 'stale' }]);
  assert.deepEqual(out.cancelled, [{ planId: 'P3', siteId: 'S1', site: OS1, fromOrderId: 'F', fromOrderNumber: 'SO-F', toOrderId: null, toOrderNumber: null, everyDays: 30, kind: 'cancelled' }]);
});

test('รอบกำพร้า: Rev. ยังไม่อนุมัติ · ย้อนการอนุมัติ · ใบยังมีผล = ไม่ใช่กำพร้า (0392 ย้ายให้ตอนอนุมัติ)', () => {
  const orders = [
    ord('G', 'revised', 'H'), ord('H', 'draft'),
    ord('I', 'approval_revoked'),
    ord('J', 'revised', 'K'), ord('K', 'approval_revoked'),
    ord('L', 'revised', 'M'), ord('M', 'pending_approval'),
    ord('LIVE', 'approved'),
  ];
  const out = orphanCtx([livePlan('P4', 'G'), livePlan('P5', 'I'), livePlan('P6', 'J'), livePlan('P7', 'L'), livePlan('P8', 'LIVE')], orders, []);
  assert.deepEqual(out, { dropped: [], stale: [], cancelled: [] });
});

test('รอบกำพร้า: รอบปิด/จบแล้ว · ไม่ผูกใบ · ใบไม่รู้จัก · ข้อต่อหาย · วน · เกิน 10 ทอด = ข้าม (ไม่เดา)', () => {
  const chain = Array.from({ length: MAX_ORPHAN_HOPS + 2 }, (_, i) => ord(`X${i}`, 'revised', `X${i + 1}`));
  chain.push(ord(`X${MAX_ORPHAN_HOPS + 2}`, 'approved'));
  const orders = [
    ord('A', 'revised', 'B'), ord('B', 'approved'),
    ord('N', 'revised', 'MISSING'),
    ord('LA', 'revised', 'LB'), ord('LB', 'revised', 'LA'),
    ...chain,
  ];
  const plans = [
    livePlan('P-off', 'A', { isActive: false }),
    livePlan('P-ended', 'A', { endDate: '2026-09-28' }),
    livePlan('P-free', null),
    livePlan('P-unknown', 'NOPE'),
    livePlan('P-hop', 'N'),
    livePlan('P-loop', 'LA'),
    livePlan('P-long', 'X0'),
  ];
  assert.deepEqual(orphanCtx(plans, orders, []), { dropped: [], stale: [], cancelled: [] });
  // จบวันนี้ยังนับว่ามีผล
  assert.equal(orphanCtx([livePlan('P-today', 'A', { endDate: '2026-09-29' })], orders, []).dropped.length, 1);
  // โซ่ยาวพอดีเพดานยังเดินถึง
  const exact = Array.from({ length: MAX_ORPHAN_HOPS }, (_, i) => ord(`Y${i}`, 'revised', `Y${i + 1}`)).concat([ord(`Y${MAX_ORPHAN_HOPS}`, 'approved')]);
  assert.equal(orphanCtx([livePlan('P-exact', 'Y0')], exact, []).dropped[0].toOrderId, `Y${MAX_ORPHAN_HOPS}`);
});

test('รอบกำพร้า: ใบ Rev. ปลายทางถูกยกเลิก = cancelled พร้อมบอกใบปลายทาง (ไม่มีใบไหนย้ายรอบให้อีกแล้ว)', () => {
  const out = orphanCtx([livePlan('P9', 'O')], [ord('O', 'revised', 'Q'), ord('Q', 'cancelled')], []);
  assert.deepEqual(out.cancelled.map((r) => [r.planId, r.fromOrderId, r.toOrderId, r.toOrderNumber]), [['P9', 'O', 'Q', 'SO-Q']]);
});

test('รอบกำพร้า: เรียงตามชื่อไซต์แล้วเลขใบ · ไซต์ที่ไม่อยู่ในทะเบียน = site null', () => {
  const orders = [ord('A', 'revised', 'B'), ord('B', 'approved'), ord('A2', 'revised', 'B')];
  const out = orphanCtx([
    livePlan('P2', 'A', { siteId: 'S2' }),
    livePlan('P1', 'A2'),
    livePlan('P0', 'A'),
    livePlan('P3', 'A', { siteId: 'S-GONE' }),
  ], orders, []);
  assert.deepEqual(out.dropped.map((r) => r.planId), ['P3', 'P0', 'P1', 'P2']);
  assert.equal(out.dropped[0].site, null);
});

test('ข้อความแถบรอบกำพร้า (แคตตาล็อก §5)', () => {
  assert.ok(Object.isFrozen(ORPHAN_TITLES));
  assert.equal(ORPHAN_TITLES.dropped(1), 'รอบของใบเดิมที่ถูกแทนแล้ว 1 รอบ (Rev. ไม่มีไซต์นี้) — ปิดรอบ หรือนัดถอนเครื่อง');
  assert.equal(ORPHAN_TITLES.stale(2), 'รอบที่ยังผูกใบเดิม 2 รอบ — ใบ Rev. ล่าสุดครอบไซต์นี้แล้ว ย้ายรอบไปใบนั้นที่หน้าไซต์ (แก้รอบ → “ใบสั่งขายที่ครอบรอบนี้”)');
  assert.equal(ORPHAN_TITLES.cancelled(3), 'รอบของใบที่ยกเลิกแล้ว 3 รอบ — ปิดรอบ หรือนัดถอนเครื่อง');
  assert.equal(
    ORPHAN_ITEM_TEXT({ site: OS1, siteId: 'S1', fromOrderNumber: 'SO-26090001-0', toOrderNumber: 'SO-26090001-1', everyDays: 30 }),
    'ST-1 ไซต์ A · SO-26090001-0 → SO-26090001-1 · ทุก 30 วัน',
  );
  assert.equal(
    ORPHAN_ITEM_TEXT({ site: OS1, siteId: 'S1', fromOrderNumber: 'SO-26090001-0', toOrderNumber: null, everyDays: 14 }),
    'ST-1 ไซต์ A · SO-26090001-0 · ทุก 14 วัน',
  );
  assert.equal(ORPHAN_ITEM_TEXT({ site: null, siteId: 'S-GONE', fromOrderId: 'SOR-x', everyDays: 7 }), 'S-GONE · SOR-x · ทุก 7 วัน');
});

test('orphanOrderIdsToLoad: บอก route ว่าต้องโหลดใบไหนเพิ่มเพื่อเดินโซ่ Rev. (ทีละทอด · ไม่ซ้ำ · หยุดที่ใบมีผล/ยกเลิก)', () => {
  const plans = [livePlan('P1', 'A'), livePlan('P2', 'A'), livePlan('P3', 'LIVE'), livePlan('P-off', 'Z', { isActive: false }), livePlan('P-free', null)];
  const map = new Map([['LIVE', ord('LIVE', 'approved')]]);
  assert.deepEqual(orphanOrderIdsToLoad({ plans, ordersById: map, todayIso: '2026-09-29' }), ['A']);
  map.set('A', ord('A', 'revised', 'B'));
  assert.deepEqual(orphanOrderIdsToLoad({ plans, ordersById: map, todayIso: '2026-09-29' }), ['B']);
  map.set('B', ord('B', 'revised', 'C'));
  assert.deepEqual(orphanOrderIdsToLoad({ plans, ordersById: map, todayIso: '2026-09-29' }), ['C']);
  map.set('C', ord('C', 'approved'));
  assert.deepEqual(orphanOrderIdsToLoad({ plans, ordersById: map, todayIso: '2026-09-29' }), []);
  // วนไม่ค้าง
  const loop = new Map([['A', ord('A', 'revised', 'B')], ['B', ord('B', 'revised', 'A')]]);
  assert.deepEqual(orphanOrderIdsToLoad({ plans: [livePlan('P1', 'A')], ordersById: loop, todayIso: '2026-09-29' }), []);
});

/* ── review 29/09: รอบของใบอื่นที่ไซต์ + รอบเดิมที่ควรย้ายมาใบนี้ (stale) — บอกบนแถวและในโมดัลก่อนสร้างรอบซ้อน ─────────── */
test('🔴 OTHER_PLAN_TEXT: รอบของใบอื่น · รอบเดิมที่ต้องย้าย (stale) · รอบไม่ผูกใบ', () => {
  assert.equal(OTHER_PLAN_TEXT.foreign(2), 'ไซต์นี้มีรอบของใบอื่นเดินอยู่ 2 รอบ — ตรวจที่หน้าไซต์ก่อนว่าไม่ซ้อนกัน');
  assert.equal(OTHER_PLAN_TEXT.stale('SO-26090100-0'), 'รอบเดิมของไซต์นี้ยังผูกใบ SO-26090100-0 — ย้ายรอบนั้นมาใบนี้ที่หน้าไซต์แทนการสร้างใหม่ (สร้างซ้ำ = นัดซ้อน)');
  assert.equal(OTHER_PLAN_TEXT.unbound(1), 'มีรอบที่ยังไม่ผูกใบ 1 รอบ — ผูกใบให้รอบเดิมก่อนสร้างใหม่');
  assert.equal(OTHER_PLAN_TEXT.moveAction, 'ย้ายรอบเดิมมาใบนี้');
});

test('🔴 planRowFacts: มีรอบอื่นที่ไซต์ → โน้ตบนแถว + คำเตือนในโมดัล · ไม่มี = ไม่มีคีย์ (context ทรงเดิม)', () => {
  const { row, linesById } = rowFor();
  const plain = planRowFacts(row, { order: stampedOrder(), linesById, todayIso: '2026-09-29' });
  assert.equal(plain.otherPlanNote, null);
  assert.equal('existingPlanWarning' in plain.context, false);

  const foreign = planRowFacts({ ...row, foreignPlans: 1 }, { order: stampedOrder(), linesById, todayIso: '2026-09-29' });
  assert.equal(foreign.otherPlanNote, OTHER_PLAN_TEXT.foreign(1));
  assert.equal(foreign.context.existingPlanWarning, OTHER_PLAN_TEXT.foreign(1));

  const stale = planRowFacts({ ...row, foreignPlans: 1, unboundPlans: 2, stalePlanToMove: { planId: 'PL-1', fromOrderNumber: 'SO-OLD' } },
    { order: stampedOrder(), linesById, todayIso: '2026-09-29' });
  assert.equal(stale.otherPlanNote, OTHER_PLAN_TEXT.stale('SO-OLD'), 'stale ชนะข้อความรอบของใบอื่น (เป็นรอบเดียวกัน)');
  assert.equal(stale.context.existingPlanWarning, `${OTHER_PLAN_TEXT.stale('SO-OLD')} · ${OTHER_PLAN_TEXT.unbound(2)}`);
});

test('🔴 decoratePlanRows: รอบ stale ของ orphanPlanRows ติดแถว (ไซต์ × ใบปลายโซ่) ที่ตรงกันเท่านั้น', () => {
  const order = stampedOrder();
  const ordersById = new Map([[order.id, order]]);
  const linesById = new Map(LINES.map((l) => [l.id, l]));
  const rows = planQueue({ zones: [OFFICE], terms: TERMS, plans: [], sites: [SITE], ordersById, linesById, todayIso: '2026-09-29' });
  const orphans = {
    dropped: [],
    stale: [
      { planId: 'PL-1', siteId: SITE.id, fromOrderId: 'SO-OLD', fromOrderNumber: 'SO-OLD-NO', toOrderId: order.id, toOrderNumber: order.orderNumber, kind: 'stale' },
      { planId: 'PL-2', siteId: 'OTHER-SITE', fromOrderId: 'SO-OLD', fromOrderNumber: 'SO-OLD-NO', toOrderId: order.id, kind: 'stale' },
    ],
    cancelled: [],
  };
  const [decorated] = decoratePlanRows(rows, { ordersById, linesById, todayIso: '2026-09-29', orphans });
  assert.deepEqual(decorated.stalePlanToMove, { planId: 'PL-1', fromOrderNumber: 'SO-OLD-NO' });
  assert.equal(decorated.otherPlanNote, OTHER_PLAN_TEXT.stale('SO-OLD-NO'));
  const [none] = decoratePlanRows(rows, { ordersById, linesById, todayIso: '2026-09-29' });
  assert.equal(none.stalePlanToMove, null);
});

/* ── review 29/09: สองรอบขาย FG เดียวกันบนโซนเดียว (SO-26090247-0) หน้าตาเหมือนกันเป๊ะ — ป้าย "รายการ n · FG" เหมือนแท็บของใบ ── */
test('🔴 termLabels: สองบรรทัดโซนเดียว = "รายการ n · FG" · โซนที่มีรอบขายเดียว = ไม่มีบรรทัดรอง', () => {
  const { row, linesById } = rowFor();
  const facts = planRowFacts(row, { order: stampedOrder(), linesById, todayIso: '2026-09-29' });
  assert.deepEqual(facts.termLabels, {
    'SZT-S1': { zone: 'Office', detail: `รายการ 1 · ${FG}` },
    'SZT-S2': { zone: 'Office', detail: `รายการ 2 · ${FG}` },
  });
  const one = rowFor({ terms: [TERMS[1]] });
  const single = planRowFacts(one.row, { order: stampedOrder(), linesById: one.linesById, todayIso: '2026-09-29' });
  assert.deepEqual(single.termLabels, { 'SZT-S2': { zone: 'Office', detail: null } });
  // ลำดับรายการ = โซน → ลำดับบรรทัดในใบ (ไม่ใช่ FG) — ตรงกับแท็บงานบริการของใบ
  const swapped = rowFor({ terms: [TERMS[1], TERMS[0]] });
  assert.deepEqual(planRowFacts(swapped.row, { order: stampedOrder(), linesById: swapped.linesById, todayIso: '2026-09-29' }).termDetails.map((t) => t.id), ['SZT-S1', 'SZT-S2']);
});
