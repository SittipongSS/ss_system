// ── ถ้อยคำของใบสั่งขายย้อนหลัง (มติ 22/09 · mig 0374) — ชุดข้อมูลม็อก mockups/legacy-so-service-flow ──────
// สยามพิวรรธน์ · 4 โซน (บรรทัดแบบใบเสนอราคา: จำนวน 72/48/36/48 × 1,200) · 261,936 · ยกมา 196,452 ครอบ ม.ค.–ก.ย.
// + งวด ต.ค.–ธ.ค. 65,484
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HISTORICAL_APPROVE_TOAST, historicalAfterSendRail, historicalApprovalFacts, historicalCancelEffect,
  historicalCancelPrompt, historicalCancelToast, historicalCoverageSegments, historicalOpeningVoidSummary, historicalOpeningRejectNote, historicalOverrideNote, historicalRejectDetail,
  historicalServiceProgress, historicalStatusCopy, historicalWithdrawDetail, historicalWorkflowSteps,
  historicalZoneState, quoteLineText,
} from './historicalOrderCopy.js';
import { HISTORICAL_CORRECTION_PATH, HISTORICAL_STATUS_NOTE } from './historicalOrders.js';
import { historicalApprovalPrompt } from '../approvalPrompt.js';
import { workflowStepsFromIndex } from '../documentControlModel.js';
import { planHistoricalServiceOrder } from './historicalOrderPlan.js';

const TODAY = '2026-09-22';
const ORDER = {
  id: 'SOR-H1', orderNumber: 'SO-26090051-0', origin: 'historical', status: 'pending_approval',
  customerName: 'บจก. สยามพิวรรธน์', customer: { arCode: 'AR-1207' },
  subtotal: 244800, vatAmount: 17136, totalAmount: 261936, notes: null,
  createdBy: 'U-PIM', createdByName: 'พิมพ์ชนก รัตนา',
  submittedBy: 'U-PIM', submittedByName: 'พิมพ์ชนก รัตนา', submittedAt: '2026-09-22T03:00:00.000Z',
  approvedAt: null, approvedBy: null, approvedByName: null, approvalMode: 'standard',
  serviceContractId: 'CTR-H1',
  lines: [
    { id: 'L1', serviceZoneId: 'Z-1002-01', productId: 'P-PKG', fgCode: 'FG-SNS-02-001-0012', qty: 72, unit: 'แพ็คเกจ', unitPrice: 1200, discountAmount: 0, lineTotal: 86400 },
    { id: 'L2', serviceZoneId: 'Z-1002-02', productId: 'P-PKG', fgCode: 'FG-SNS-02-001-0012', qty: 48, unit: 'แพ็คเกจ', unitPrice: 1200, discountAmount: 0, lineTotal: 57600 },
    { id: 'L3', serviceZoneId: 'Z-1002-03', productId: 'P-PKG', fgCode: 'FG-SNS-02-001-0012', qty: 36, unit: 'แพ็คเกจ', unitPrice: 1200, discountAmount: 0, lineTotal: 43200 },
    { id: 'L4', serviceZoneId: 'Z-1044-01', productId: 'P-PKG', fgCode: 'FG-SNS-02-001-0012', qty: 48, unit: 'แพ็คเกจ', unitPrice: 1200, discountAmount: 0, lineTotal: 57600 },
  ],
};
/* แถวโซนจาก loadHistoricalOrderExtras — พกบรรทัดแบบใบเสนอราคามาด้วย (ไม่มี "แพ็ค" แล้ว · มติ 23/09) */
const LINE_ZONES = [
  { zoneId: 'Z-1002-01', zoneCode: 'Z-1002-01', zoneName: 'ชั้น G ล็อบบี้', siteId: 'ST-1002', siteCode: 'ST-1002', siteName: 'สยามพารากอน' },
  { zoneId: 'Z-1002-02', zoneCode: 'Z-1002-02', zoneName: 'ชั้น M ทางเชื่อม BTS', siteId: 'ST-1002', siteCode: 'ST-1002', siteName: 'สยามพารากอน' },
  { zoneId: 'Z-1002-03', zoneCode: 'Z-1002-03', zoneName: 'ห้องน้ำหญิง ชั้น 1', siteId: 'ST-1002', siteCode: 'ST-1002', siteName: 'สยามพารากอน' },
  { zoneId: 'Z-1044-01', zoneCode: 'Z-1044-01', zoneName: 'ทางเข้าหลัก', siteId: 'ST-1044', siteCode: 'ST-1044', siteName: 'สยามดิสคัฟเวอรี่' },
].map((zone, index) => {
  const { fgCode, qty, unit, unitPrice, discountAmount, lineTotal } = ORDER.lines[index];
  return { ...zone, fgCode, qty, unit, unitPrice, discountAmount, lineTotal };
});
const CONTRACT = {
  id: 'CTR-H1', source: 'external', status: 'draft', kind: 'service', contractNo: null,
  externalDocKind: 'customer_po', externalRef: 'PO-SPW-2026-0118',
  contractDate: '2026-01-01', effectiveDate: '2026-01-01', expiryDate: '2026-12-31',
  metadata: { historicalSalesOrderId: 'SOR-H1' },
};
const FILE = { id: '6f1c7e0a-0000-4000-8000-000000000001', fileName: 'PO-SPW-2026-0118.pdf', docType: 'external_doc' };
const OPENING = {
  id: 'SOI-1', seq: 1, kind: 'opening', label: 'งวดยกมา', amount: 196452, status: 'pending', frozenAt: null,
  dueDate: null, coversFrom: '2026-01-01', coversTo: '2026-09-30', paidOn: '2026-09-15',
  evidence: [{ storagePath: 'sales-orders/SOR-H1/payments/iv.pdf', fileName: 'IV-2601…IV-2609 Express.pdf' }],
};
const REGULAR = {
  id: 'SOI-2', seq: 2, kind: 'regular', label: 'งวด ต.ค.–ธ.ค. 2026', amount: 65484, status: 'pending', frozenAt: null,
  dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-12-31',
};
const EXTRAS = { installments: [REGULAR, OPENING], contract: CONTRACT, contractFiles: [FILE], lineZones: LINE_ZONES, signedFile: FILE };
const APPROVED = {
  ...ORDER, status: 'approved', approvedAt: '2026-09-22T06:00:00.000Z', approvedBy: 'U-SUP', approvedByName: 'วรเชษฐ์ ทองดี',
  lineZones: LINE_ZONES,
};
const TERMS = LINE_ZONES.map((z, i) => ({ id: `SZT-${i}`, zoneId: z.zoneId, salesOrderId: 'SOR-H1' }));
const CONFIRMED_OPENING = { ...OPENING, status: 'confirmed', frozenAt: '2026-09-22T06:00:00.000Z', confirmedByName: 'กนกวรรณ', confirmedAt: '2026-09-22T08:00:00.000Z' };
const plan = (siteId) => ({ id: `SP-${siteId}`, siteId, salesOrderId: 'SOR-H1', isActive: true });

/* 🔴 ห้ามมีประโยคไหนบอกว่าใบย้อนหลัง "นับ Actual" — ทุก "นับ Actual" ต้องมี "ไม่" นำหน้าติดกัน */
const OUTPUTS = [];
const collect = (value) => {
  if (typeof value === 'string') OUTPUTS.push(value);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  return value;
};
const affirmsActual = (s) => {
  for (let i = s.indexOf('นับ Actual'); i >= 0; i = s.indexOf('นับ Actual', i + 1)) {
    if (s.slice(Math.max(0, i - 3), i) !== 'ไม่') return true;
  }
  return false;
};

// ── สถานะ ─────────────────────────────────────────────────────────────────────────────────────
test('สถานะ: ป้ายเท่าใบปกติ · คำอธิบายเป็นของใบย้อนหลัง · อนุมัติแล้ว = ไม่นับ Actual', () => {
  assert.equal(collect(historicalStatusCopy('pending_approval')).label, 'รอผู้จัดการฝ่ายขายอนุมัติ');
  assert.equal(historicalStatusCopy('approved').description, HISTORICAL_STATUS_NOTE);
  assert.equal(collect(historicalStatusCopy('rejected')).tone, 'danger');
  assert.match(collect(historicalStatusCopy('cancelled')).description, /คีย์ใบใหม่/);
  assert.match(collect(historicalStatusCopy('draft')).description, /บันทึกและส่งอนุมัติ/);
  // สถานะที่ใบย้อนหลังไม่มี = ไม่เดาความหมาย แต่ยังไม่ปล่อยว่าง
  assert.deepEqual(collect(historicalStatusCopy('approval_revoked')), { label: 'approval_revoked', tone: 'muted', description: HISTORICAL_STATUS_NOTE });
  for (const status of ['draft', 'pending_approval', 'rejected', 'approved', 'cancelled']) {
    assert.doesNotMatch(historicalStatusCopy(status).description, /ยอดถูกนับเป็น Actual/);
  }
});

// ── รางก้าว ─────────────────────────────────────────────────────────────────────────────────
const labelsOf = ({ steps }) => steps.map((s) => s.label);
const statesOf = (result, cancelled = false) => workflowStepsFromIndex(result.steps, result.index, cancelled).map((s) => s.state);

test('รางก้าว: รออนุมัติ = 5 ขั้นตามม็อก · ชี้ขั้น AE Sup · บัญชีขึ้นคิวหลังอนุมัติ', () => {
  const r = collect(historicalWorkflowSteps(ORDER, [OPENING, REGULAR], [], [], TODAY));
  assert.deepEqual(labelsOf(r), ['คีย์ใบ', 'ผู้จัดการฝ่ายขายอนุมัติ', 'บัญชีรับรองงวดยกมา', 'TS ตั้งรอบ', 'เข้าบริการ']);
  assert.equal(r.index, 1);
  assert.deepEqual(statesOf(r), ['done', 'current', 'pending', 'pending', 'pending']);
  assert.equal(r.steps[0].hint, 'พิมพ์ชนก รัตนา · 22/09/2026');
  assert.equal(r.steps[1].hint, 'รอผู้จัดการฝ่ายขาย · ไม่นับ Actual');
  assert.equal(r.steps[2].hint, 'ขึ้นคิวบัญชีหลังผู้จัดการฝ่ายขายอนุมัติ');
  assert.equal(r.steps[3].hint, 'หลังผู้จัดการฝ่ายขายอนุมัติ · 4 โซน', 'ก่อนอนุมัตินับโซนจากบรรทัด');
  assert.equal(r.steps[4].hint, 'รอบัญชีรับรองงวด');
});

test('รางก้าว: ร่าง/ตีกลับชี้ขั้นคีย์ใบ · ยกเลิกทั้งรางเป็นสถานะยกเลิก', () => {
  const draft = collect(historicalWorkflowSteps({ ...ORDER, status: 'draft' }, [OPENING, REGULAR], [], [], TODAY));
  assert.equal(draft.index, 0);
  assert.match(draft.steps[0].hint, /ยังไม่ส่งอนุมัติ/);
  const rejected = collect(historicalWorkflowSteps({ ...ORDER, status: 'rejected', rejectedByName: 'วรเชษฐ์ ทองดี' }, [], [], [], TODAY));
  assert.equal(rejected.index, 0);
  assert.equal(rejected.steps[0].hint, 'ตีกลับให้แก้ไข (วรเชษฐ์ ทองดี)');
  assert.match(rejected.steps[1].hint, /ตีกลับแล้ว/);
  const cancelled = collect(historicalWorkflowSteps({ ...ORDER, status: 'cancelled' }, [OPENING], [], [], TODAY));
  assert.ok(statesOf(cancelled, true).every((s) => s === 'cancelled'));
  // ยกเลิกหลังอนุมัติ: ขั้นที่ยังไม่เกิดพูดว่าใบยกเลิกแล้ว ไม่ใช่ "รอ…" ที่ไม่มีวันมาถึง
  const voided = collect(historicalWorkflowSteps({ ...APPROVED, status: 'cancelled' }, [OPENING], TERMS, [], TODAY));
  assert.deepEqual(voided.steps.slice(2).map((s) => s.hint), [
    'ใบยกเลิกแล้ว', 'ใบยกเลิกแล้ว · 4 โซน', 'ใบยกเลิกแล้ว — รอบขายของโซนหยุดตามใบ',
  ]);
  assert.equal(voided.steps[1].hint, 'วรเชษฐ์ ทองดี · 22/09/2026');
});

test('รางก้าว: อนุมัติแล้ว → รอบัญชี · TS ตั้งรอบก่อนบัญชีได้ (ขั้นที่เสร็จประกาศ done เอง)', () => {
  const reported = { ...OPENING, status: 'reported', frozenAt: APPROVED.approvedAt };
  const waitFn = collect(historicalWorkflowSteps(APPROVED, [reported, REGULAR], TERMS, [], TODAY));
  assert.equal(waitFn.index, 2);
  assert.equal(waitFn.steps[1].hint, 'วรเชษฐ์ ทองดี · 22/09/2026');
  assert.equal(waitFn.steps[2].hint, 'รอบัญชีรับรอง');
  assert.equal(waitFn.steps[3].hint, 'รอฝ่าย TS · 4 โซน');
  // TS ตั้งรอบครบทั้งสองไซต์แล้ว แต่บัญชียังไม่รับรอง ⇒ ขั้น TS ติ๊กถูก หมุดยังอยู่ที่บัญชี
  const tsFirst = historicalWorkflowSteps(APPROVED, [reported, REGULAR], TERMS, [plan('ST-1002'), plan('ST-1044')], TODAY);
  assert.equal(tsFirst.index, 2);
  assert.deepEqual(statesOf(tsFirst), ['done', 'done', 'current', 'done', 'pending']);
});

test('รางก้าว: บัญชีรับรองแล้ว → TS ตั้งรอบทีละไซต์ → อยู่ในช่วงบริการ (ถึง "จ่ายถึง")', () => {
  const waitTs = collect(historicalWorkflowSteps(APPROVED, [CONFIRMED_OPENING, REGULAR], TERMS, [], TODAY));
  assert.equal(waitTs.index, 3);
  assert.equal(waitTs.steps[2].hint, 'กนกวรรณ · 22/09/2026');
  assert.equal(waitTs.steps[4].hint, 'ถึง 30/09/2026');
  // รอบของไซต์เดียว = 3 จาก 4 โซน · รอบที่ปิดใช้งาน/ของใบอื่นไม่นับ
  const partial = collect(historicalWorkflowSteps(APPROVED, [CONFIRMED_OPENING, REGULAR], TERMS, [
    plan('ST-1002'), { ...plan('ST-1044'), isActive: false }, { ...plan('ST-1044'), salesOrderId: 'SOR-OTHER' },
  ], TODAY));
  assert.equal(partial.index, 3);
  assert.equal(partial.steps[3].hint, 'ตั้งรอบแล้ว 3/4 โซน');
  const running = collect(historicalWorkflowSteps(APPROVED, [CONFIRMED_OPENING, REGULAR], TERMS, [plan('ST-1002'), plan('ST-1044')], TODAY));
  assert.equal(running.index, 4, 'ผ่านทุกด่าน = อยู่ในช่วงบริการ (ขั้นสุดท้ายเป็นปัจจุบัน ไม่ใช่จบ)');
  assert.equal(running.steps[3].hint, 'ตั้งรอบครบ 4 โซน');
  // เงินครอบถึงวันที่ผ่านไปแล้ว = บอกว่านัดหลังจากนี้ติดด่านเงิน
  const lapsed = collect(historicalWorkflowSteps(APPROVED, [CONFIRMED_OPENING, REGULAR], TERMS, [], '2026-10-05'));
  assert.match(lapsed.steps[4].hint, /เงินครอบถึง 30\/09\/2026 — นัดหลังจากนี้ติดด่านเงิน/);
  // ไซต์ของโซนมากับรอบขายของโซนเองก็ได้ (ไม่มี lineZones)
  const bare = historicalWorkflowSteps({ ...APPROVED, lineZones: undefined }, [CONFIRMED_OPENING],
    TERMS.map((t, i) => ({ ...t, siteId: LINE_ZONES[i].siteId })), [plan('ST-1002'), plan('ST-1044')], TODAY);
  assert.equal(bare.steps[3].hint, 'ตั้งรอบครบ 4 โซน');
});

test('รางก้าว: ใบ ฿0 ไม่มีขั้นบัญชี · ใบไม่มีงวดยกมาใช้งวดแรก', () => {
  const zero = collect(historicalWorkflowSteps({ ...APPROVED, totalAmount: 0, subtotal: 0, vatAmount: 0 }, [], TERMS, [], TODAY));
  assert.deepEqual(labelsOf(zero), ['คีย์ใบ', 'ผู้จัดการฝ่ายขายอนุมัติ', 'TS ตั้งรอบ', 'เข้าบริการ']);
  assert.equal(zero.index, 2);
  assert.equal(zero.steps[3].hint, 'ใบยอด 0 บาท — ไม่มีด่านเงิน');
  const firstRow = { ...REGULAR, amount: 261936, coversFrom: '2026-01-01', frozenAt: APPROVED.approvedAt };
  const noOpening = collect(historicalWorkflowSteps(APPROVED, [firstRow], TERMS, [], TODAY));
  assert.equal(noOpening.steps[2].label, 'บัญชีรับรองงวดแรก');
  assert.equal(noOpening.steps[2].hint, 'รอลูกค้าจ่าย แล้วฝ่ายขายแจ้งชำระ');
});

// ── ฝั่งบริการของหน้าใบ (สรุปงานบริการ → รางก้าว/การ์ดโซน) ───────────────────────────────────────
const SERVICE_SUMMARY = {
  allocation: {
    sites: [
      { siteId: 'ST-1002', zones: [{ id: 'Z-1002-01' }, { id: 'Z-1002-02' }, { id: 'Z-1002-03' }], hasPlan: true },
      { siteId: 'ST-1044', zones: [{ id: 'Z-1044-01' }], hasPlan: false },
    ],
  },
};

test('สรุปงานบริการ → terms/plans ของรางก้าว — "ตั้งรอบแล้ว" นับรายไซต์', () => {
  const progress = historicalServiceProgress(SERVICE_SUMMARY, 'SOR-H1');
  assert.deepEqual(progress.plannedSiteIds, ['ST-1002']);
  assert.equal(progress.terms.length, 4);
  assert.deepEqual(progress.terms[0], { zoneId: 'Z-1002-01', siteId: 'ST-1002' });
  assert.deepEqual(progress.plans, [{ siteId: 'ST-1002', salesOrderId: 'SOR-H1', isActive: true }]);
  // ป้อนรางก้าวได้ตรง ๆ: 3 ใน 4 โซนของใบนี้อยู่ที่ไซต์ที่ตั้งรอบแล้ว
  const rail = collect(historicalWorkflowSteps(APPROVED, [CONFIRMED_OPENING, REGULAR], progress.terms, progress.plans, TODAY));
  assert.equal(rail.steps[3].hint, 'ตั้งรอบแล้ว 3/4 โซน');
  // อ่านสรุปไม่ขึ้น = ไม่มีอะไรเลย (ผู้เรียกไม่ต้องกันเอง)
  assert.deepEqual(historicalServiceProgress(null), { terms: [], plans: [], plannedSiteIds: [] });
});

test('🔴 สถานะรอบรายโซน: ไม่รู้ = บอกว่าไม่รู้ ไม่ใช่เดาว่า "ยังไม่ตั้งรอบ"', () => {
  const zone = { zoneId: 'Z-1002-01', siteId: 'ST-1002' };
  assert.equal(collect(historicalZoneState(ORDER, zone)), 'รอผู้จัดการฝ่ายขายอนุมัติ');
  assert.equal(collect(historicalZoneState({ ...ORDER, status: 'cancelled' }, zone)), 'ใบยกเลิกแล้ว');
  assert.equal(collect(historicalZoneState(APPROVED, zone, { loading: true })), 'กำลังตรวจรอบบริการ…');
  assert.equal(collect(historicalZoneState(APPROVED, zone, { plannedSiteIds: null })), 'ตรวจรอบบริการไม่ขึ้น — ดูที่แท็บงานบริการ');
  assert.equal(collect(historicalZoneState(APPROVED, zone, { plannedSiteIds: ['ST-1002'] })), 'ตั้งรอบแล้ว');
  assert.equal(collect(historicalZoneState(APPROVED, zone, { plannedSiteIds: [] })), 'ยังไม่ตั้งรอบ — รอฝ่าย TS');
});

// ── แถบ "ช่วงบริการ" ────────────────────────────────────────────────────────────────────────
test('ช่วงบริการ: ท่อนที่เปิดแล้ววัดจาก "จ่ายถึง" · ที่เหลือต่อจากวันถัดไป', () => {
  const bounds = { start: CONTRACT.effectiveDate, end: CONTRACT.expiryDate };
  const paid = collect(historicalCoverageSegments([CONFIRMED_OPENING, REGULAR], bounds));
  assert.equal(paid.through, '2026-09-30');
  assert.deepEqual(paid.segments.map((s) => [s.kind, s.from, s.to]), [
    ['paid', '2026-01-01', '2026-09-30'],
    ['due', '2026-10-01', '2026-12-31'],
  ]);
  assert.equal(paid.segments[0].label, 'เปิดบริการถึง 30/09/2026');
  // ยังไม่มีงวดที่บัญชีรับรอง = ทั้งช่วงยังรอชำระ (ไม่มีท่อน paid)
  const none = collect(historicalCoverageSegments([OPENING, REGULAR], bounds));
  assert.equal(none.through, null);
  assert.deepEqual(none.segments.map((s) => s.kind), ['due']);
  // เก็บครบทั้งสัญญา = ไม่มีท่อนรอชำระ
  const full = collect(historicalCoverageSegments(
    [CONFIRMED_OPENING, { ...REGULAR, status: 'confirmed' }], bounds,
  ));
  assert.deepEqual(full.segments.map((s) => s.kind), ['paid']);
  // ไม่มีช่วงสัญญา = ไม่วาดแถบ (ห้ามเดาวันเอง)
  assert.equal(historicalCoverageSegments([CONFIRMED_OPENING], { start: null, end: '2026-12-31' }), null);
  assert.equal(historicalCoverageSegments([CONFIRMED_OPENING], { start: '2026-12-31', end: '2026-01-01' }), null);
});

// ── โมดัลอนุมัติ ────────────────────────────────────────────────────────────────────────────
test('โมดัลอนุมัติ: ชุดม็อก — ตรวจลูกค้า/สัญญา/ไฟล์/โซนรายไซต์/เงิน/งวด · ผลลัพธ์ 3 ข้อ', () => {
  const facts = collect(historicalApprovalFacts(ORDER, EXTRAS));
  assert.equal(facts.subject, 'ใบสั่งขาย SO-26090051-0');
  assert.deepEqual(facts.checklist, [
    'ลูกค้า: AR-1207 · บจก. สยามพิวรรธน์',
    'เอกสารแทนสัญญา: ใบสั่งซื้อของลูกค้า (PO) PO-SPW-2026-0118 · 01/01/2026–31/12/2026 — อนุมัติพร้อมใบนี้ ไม่ต้องอนุมัติสัญญาแยก',
    'ไฟล์ที่ผูกเป็นหลักฐานลงนามของสัญญา: PO-SPW-2026-0118.pdf',
    'โซน: 4 โซน — ST-1002 สยามพารากอน 3 โซน · ST-1044 สยามดิสคัฟเวอรี่ 1 โซน',
    'รายการ: FG-SNS-02-001-0012 72 แพ็คเกจ × ฿1,200.00 = ฿86,400.00'
      + ' · FG-SNS-02-001-0012 48 แพ็คเกจ × ฿1,200.00 = ฿57,600.00 (2 โซน)'
      + ' · FG-SNS-02-001-0012 36 แพ็คเกจ × ฿1,200.00 = ฿43,200.00',
    'ยอดรวมทั้งสิ้น: ฿261,936.00 — ยอดรวมสินค้า/บริการ ฿244,800.00 · ภาษีมูลค่าเพิ่ม ฿17,136.00',
    'งวดยกมา: ฿196,452.00 · ครอบบริการ 01/01/2026–30/09/2026 · รับเงิน 15/09/2026 · หลักฐาน 1 ไฟล์',
    'งวดที่ยังต้องเก็บ: งวด ต.ค.–ธ.ค. 2026 ฿65,484.00 ครบกำหนด 01/10/2026',
    'ยอดงวดรวม = ยอดใบ · ช่วงบริการต่อเนื่อง 01/01/2026–31/12/2026 ไม่มีช่องโหว่',
  ]);
  assert.deepEqual(facts.effects, [
    'เอกสารแทนสัญญา ใบสั่งซื้อของลูกค้า (PO) PO-SPW-2026-0118 อนุมัติ ออกเลข CT แล้วผูกกับใบนี้ (มีผล 01/01/2026–31/12/2026)',
    'ส่งงวดยกมา ฿196,452.00 (ครอบบริการ 01/01/2026–30/09/2026) ให้บัญชีรับรอง',
    'งวดที่ยังต้องเก็บ 1 งวดขึ้นทะเบียนการชำระ — ฝ่ายขายแจ้งชำระเมื่อลูกค้าจ่าย',
    '4 โซนขึ้นคิว TS งานเข้าใหม่ › รอตั้งรอบ — นัดขึ้นตารางได้เมื่อบัญชีรับรองงวดยกมา',
  ]);
  // ป้อนตัวสร้างโมดัลได้ตรง ๆ — ปกติและ override ใช้รายการตรวจชุดเดียวกัน
  const prompt = collect(historicalApprovalPrompt(facts));
  assert.equal(prompt.confirmLabel, 'อนุมัติใบย้อนหลัง');
  const override = collect(historicalApprovalPrompt({ ...facts, override: { note: historicalOverrideNote } }));
  assert.match(override.detail, /Admin Override/);
  assert.equal(override.detail.split('สิ่งที่จะเกิดขึ้นทันที:')[0], prompt.detail.split('สิ่งที่จะเกิดขึ้นทันที:')[0]);
});

test('โมดัลอนุมัติ: ไฟล์ที่จะเป็นหลักฐานลงนามต้องบอกชื่อ · ไม่มีไฟล์ = บอกว่าอนุมัติไม่ได้', () => {
  const two = collect(historicalApprovalFacts(ORDER, { ...EXTRAS, contractFiles: [FILE, { ...FILE, id: 'x', fileName: 'แนบเพิ่ม.pdf' }] }));
  assert.ok(two.checklist.includes('ไฟล์ที่ผูกเป็นหลักฐานลงนามของสัญญา: PO-SPW-2026-0118.pdf (จาก 2 ไฟล์ที่แนบ)'));
  const none = collect(historicalApprovalFacts(ORDER, { ...EXTRAS, contractFiles: [], signedFile: null }));
  assert.ok(none.checklist.includes('ไฟล์เอกสารแทนสัญญา: ยังไม่มีไฟล์ — อนุมัติไม่ได้จนกว่าจะเห็นไฟล์'));
});

test('🔴 โมดัลอนุมัติ: ของเสริมโหลดไม่ขึ้น = บอกว่า "โหลดไม่ขึ้น" ในรายการ ไม่ใช่ซ่อนแถว', () => {
  const facts = collect(historicalApprovalFacts(ORDER, { installments: [OPENING, REGULAR], extrasError: 'timeout' }));
  assert.match(facts.checklist[0], /โหลดข้อมูลประกอบไม่ขึ้น \(timeout\)/);
  assert.ok(facts.checklist.includes('เอกสารแทนสัญญา: โหลดไม่ขึ้น — เปิดใบใหม่ก่อนอนุมัติ'));
  assert.ok(facts.checklist.includes('ไฟล์เอกสารแทนสัญญา: โหลดไม่ขึ้น — อนุมัติไม่ได้จนกว่าจะเห็นไฟล์'));
  // โซนยังนับได้จากบรรทัดของใบ (ไม่มีชื่อไซต์ก็ไม่เดา) · รายการยังอ่านจากบรรทัดของใบได้
  assert.ok(facts.checklist.includes('โซน: 4 โซน'));
  assert.ok(facts.checklist.some((l) => l.startsWith('รายการ: FG-SNS-02-001-0012 72 แพ็คเกจ × ฿1,200.00')));
  // ใบไม่พกบรรทัดมา = ถอยไปอ่านแถวโซนของเสริม (มีจำนวน/ราคาเหมือนกัน)
  const fromZones = collect(historicalApprovalFacts({ ...ORDER, lines: [] }, EXTRAS));
  assert.ok(fromZones.checklist.includes('โซน: 4 โซน — ST-1002 สยามพารากอน 3 โซน · ST-1044 สยามดิสคัฟเวอรี่ 1 โซน'));
  assert.ok(fromZones.checklist.some((l) => l.startsWith('รายการ: FG-SNS-02-001-0012 72 แพ็คเกจ')));
  assert.ok(facts.checklist.some((l) => /ช่วงสัญญาโหลดไม่ขึ้น/.test(l)));
});

test('โมดัลอนุมัติ: โซนที่มีรอบขายของใบอื่นอยู่แล้ว = เตือนให้ AE Sup ตัดสิน (สตริงหรือแถว)', () => {
  const facts = collect(historicalApprovalFacts(ORDER, {
    ...EXTRAS,
    liveTermWarnings: [
      'Z-1002-01: โซนนี้มีรอบขายของ SO-26030012-0 อยู่แล้ว (ถึง 31/03/2026) — ตรวจว่าไม่ซ้ำสัญญา',
      { zoneCode: 'Z-1044-01', orderNumber: 'SO-26050003-0', endDate: '2026-12-31' },
      { zoneName: 'ชั้น M', orderNumber: 'SO-26050004-0', endDate: null },
    ],
  }));
  const warnings = facts.checklist.filter((l) => l.startsWith('⚠️'));
  assert.equal(warnings.length, 3);
  assert.equal(warnings[1], '⚠️ Z-1044-01: โซนนี้มีรอบขายของ SO-26050003-0 อยู่แล้ว (ถึง 31/12/2026) — ตรวจว่าไม่ซ้ำสัญญา');
  assert.match(warnings[2], /ไม่ระบุวันสิ้นสุด/);
});

test('โมดัลอนุมัติ: ยอดงวดไม่เท่ายอดใบ / ช่วงครอบขาดตอน = เตือนว่าระบบจะไม่ยอม (ฐานตรวจซ้ำ)', () => {
  const gap = collect(historicalApprovalFacts(ORDER, { ...EXTRAS, installments: [OPENING, { ...REGULAR, coversFrom: '2026-10-05' }] }));
  assert.ok(gap.checklist.some((l) => /ไม่ต่อเนื่องเต็มสัญญา/.test(l)));
  const short = collect(historicalApprovalFacts(ORDER, { ...EXTRAS, installments: [OPENING, { ...REGULAR, amount: 60000 }] }));
  assert.ok(short.checklist.some((l) => /ยอดงวดรวมไม่เท่ายอดใบ/.test(l)));
});

test('โมดัลอนุมัติ: ใบ ฿0 · ใบไม่มีงวดยกมา · งวดหลายงวดสรุปเป็นบรรทัดเดียว', () => {
  const zeroOrder = { ...ORDER, totalAmount: 0, subtotal: 0, vatAmount: 0, notes: 'บริการเสริมฟรีตามสัญญาหลัก' };
  const zero = collect(historicalApprovalFacts(zeroOrder, { ...EXTRAS, installments: [] }));
  assert.ok(zero.checklist.includes('ยอดรวมทั้งสิ้น: ฿0.00 — ไม่มีงวดให้เก็บ · หมายเหตุ: บริการเสริมฟรีตามสัญญาหลัก'));
  assert.ok(!zero.checklist.some((l) => /งวดยกมา|ยอดงวดรวม/.test(l)));
  assert.ok(zero.effects.includes('ใบยอด 0 บาท — ไม่มีงวดเข้าคิวบัญชี'));
  assert.match(zero.effects[zero.effects.length - 1], /นัดขึ้นตารางได้ทันที/);

  const whole = { ...REGULAR, label: 'ทั้งสัญญา', amount: 261936, coversFrom: '2026-01-01' };
  const noOpening = collect(historicalApprovalFacts(ORDER, { ...EXTRAS, installments: [whole] }));
  assert.ok(noOpening.checklist.some((l) => /^งวดยกมา: ไม่มี/.test(l)));
  assert.ok(!noOpening.effects.some((l) => /ส่งงวดยกมา/.test(l)));
  assert.match(noOpening.effects[noOpening.effects.length - 1], /เมื่อบัญชีรับรองงวดแรก/);

  const months = ['10', '11', '12', '13'].map((m, i) => ({
    ...REGULAR, id: `M${i}`, seq: i + 2, label: `งวดที่ ${i + 2}`, amount: 16371, dueDate: `2026-${m === '13' ? '12' : m}-0${i + 1}`,
  }));
  const many = collect(historicalApprovalFacts(ORDER, { ...EXTRAS, installments: [OPENING, ...months] }));
  assert.ok(many.checklist.includes('งวดที่ยังต้องเก็บ: 4 งวด รวม ฿65,484.00 · งวดแรกครบกำหนด 01/10/2026'));
});

/* ⭐ มติเจ้าของ 23/09: ผู้อนุมัติเห็นบรรทัดแบบเดียวกับที่ผู้คีย์คีย์ — ลำดับคอลัมน์ของใบเสนอราคา */
test('⭐ บรรทัดตามลำดับคอลัมน์ใบเสนอราคา: จำนวน (หน่วย) × ราคา/หน่วย [− ส่วนลด] = จำนวนเงิน', () => {
  assert.equal(collect(quoteLineText({ qty: 12, unit: 'แพ็คเกจ', unitPrice: 3500, discountAmount: 0, lineTotal: 42000 })),
    '12 แพ็คเกจ × ฿3,500.00 = ฿42,000.00');
  assert.equal(collect(quoteLineText({ qty: 12, unit: 'แพ็คเกจ', unitPrice: 3500, discountAmount: 2100, lineTotal: 39900 })),
    '12 แพ็คเกจ × ฿3,500.00 − ส่วนลด ฿2,100.00 = ฿39,900.00');
  assert.equal(quoteLineText({ qty: '3', unitPrice: '10.1', lineTotal: '30.3' }), '3 หน่วย × ฿10.10 = ฿30.30', 'ไม่มีหน่วย = คำกลาง ไม่ใช่ช่องว่าง');
});

test('โมดัลอนุมัติ: ตัวอย่างเจ้าของ (1 ชุด × 12 เดือน = 12 × 3,500) · ส่วนลด · เกิน 3 แบบ = สรุปบรรทัดเดียว', () => {
  const line = (id, zone, qty, unitPrice, discountAmount = 0) => ({
    id, serviceZoneId: zone, fgCode: 'FG-SNS-02-001-0020', qty, unit: 'แพ็คเกจ', unitPrice, discountAmount,
    lineTotal: qty * unitPrice - discountAmount,
  });
  const owner = collect(historicalApprovalFacts({ ...ORDER, subtotal: 42000, vatAmount: 0, totalAmount: 42000,
    lines: [line('L1', 'Z-1002-01', 12, 3500)] }, { ...EXTRAS, lineZones: [] }));
  assert.ok(owner.checklist.includes('รายการ: FG-SNS-02-001-0020 12 แพ็คเกจ × ฿3,500.00 = ฿42,000.00'));
  assert.ok(owner.checklist.includes('ยอดรวมทั้งสิ้น: ฿42,000.00 — ยอดรวมสินค้า/บริการ ฿42,000.00 · รวม VAT แล้ว'),
    'VAT 0 = ตัวเลือก "รวม VAT แล้ว" ของใบเสนอราคา');
  const discounted = collect(historicalApprovalFacts({ ...ORDER, lines: [line('L1', 'Z-1002-01', 12, 3500, 2100)] }, { ...EXTRAS, lineZones: [] }));
  assert.ok(discounted.checklist.some((l) => l.includes('12 แพ็คเกจ × ฿3,500.00 − ส่วนลด ฿2,100.00 = ฿39,900.00')));
  const many = collect(historicalApprovalFacts({ ...ORDER, lines: [
    line('L1', 'Z-1', 12, 3500), line('L2', 'Z-2', 6, 3500), line('L3', 'Z-3', 3, 3500), line('L4', 'Z-4', 1, 3500),
  ] }, { ...EXTRAS, lineZones: [] }));
  assert.ok(many.checklist.includes('รายการ: 4 บรรทัด 4 แบบ — ยอดรวมสินค้า/บริการ ฿244,800.00 (ดูตารางรายการในหน้าใบ)'));
  for (const facts of [owner, discounted, many]) {
    assert.ok(!facts.checklist.some((l) => /แพ็ค(?!เกจ)/.test(l)), 'ไม่มีคำว่า "แพ็ค" ที่อ่านได้สองความหมายแล้ว');
  }
});

// ── ผลของการยกเลิก/ลบ ต่อเอกสารแทนสัญญา (trigger ของ 0374) ─────────────────────────────────────
test('ยกเลิก/ลบใบ: บอกว่าเอกสารแทนสัญญาถูกยกเลิกด้วย · ฉบับที่ลงนามแล้วเลข CT ไม่คืน', () => {
  assert.equal(collect(historicalCancelEffect(ORDER, CONTRACT)),
    'เอกสารแทนสัญญา ใบสั่งซื้อของลูกค้า (PO) PO-SPW-2026-0118 จะถูกยกเลิกด้วย');
  const signed = { ...CONTRACT, status: 'signed', contractNo: 'CT-SR-2609001-0' };
  assert.equal(collect(historicalCancelEffect(APPROVED, signed)),
    'เอกสารแทนสัญญา ใบสั่งซื้อของลูกค้า (PO) PO-SPW-2026-0118 จะถูกยกเลิกด้วย (เลข CT-SR-2609001-0 ไม่คืน)');
  // เงื่อนไขเดียวกับ trigger: ต้องชี้กลับใบนี้ · ยังร่าง/ลงนามอยู่ · เป็นเอกสารภายนอก
  assert.equal(historicalCancelEffect(ORDER, { ...CONTRACT, metadata: { historicalSalesOrderId: 'SOR-OTHER' } }), null);
  assert.equal(historicalCancelEffect(ORDER, { ...CONTRACT, status: 'cancelled' }), null);
  assert.equal(historicalCancelEffect(ORDER, { ...CONTRACT, source: 'generated' }), null);
  assert.equal(historicalCancelEffect({ ...ORDER, origin: 'pipeline' }, CONTRACT), null);
  // โหลดสัญญาไม่ขึ้นแต่ใบชี้สัญญาอยู่ = พูดแบบมีเงื่อนไข ไม่เงียบ
  assert.match(collect(historicalCancelEffect(ORDER, null)), /ถ้ายังเป็นร่างหรือลงนามแล้ว/);
  assert.equal(historicalCancelEffect({ ...ORDER, serviceContractId: null }, null), null);
});

/* ── โมดัลยกเลิกใบย้อนหลัง (มติเจ้าของ 24/09 · mig 0387) ─────────────────────────────────────────────
   ⭐ ผู้จัดการฝ่ายขาย (CD · CM · AE Sup · Admin — คนเดียวกับผู้อนุมัติ) ยกเลิกใบที่อนุมัติแล้วได้แม้งวดยกมารับรองแล้ว
     ⇒ โมดัลต้องบอกก่อนกด: สัญญาถูกยกเลิกตาม · งวดยกมาเป็นโมฆะ (ใครรับรองไว้) · รอบขายของโซนหยุด + ด่านนัดช่างรอใบใหม่
       อนุมัติ **และ** บัญชีรับรองงวดยกมาของใบใหม่ · ทางคีย์ใหม่
   🐞 คำนำเดิมของโมดัลพูดเรื่อง "ยอด Actual ถูกนำออก" / "ออกจากรออนุมัติ" — ไม่จริงกับใบย้อนหลังทุกสถานะ */
test('โมดัลยกเลิกใบย้อนหลังที่อนุมัติแล้ว: หัว/คำนำของใบย้อนหลัง · งวดยกมารับรองแล้ว = หมายเหตุบังคับ · โซนหยุด + ทางคีย์ใหม่', () => {
  const p = collect(historicalCancelPrompt(APPROVED, { installments: [CONFIRMED_OPENING, { ...REGULAR, frozenAt: '2026-09-22T06:00:00.000Z' }] }));
  assert.equal(p.title, 'ยกเลิกใบสั่งขายย้อนหลัง');
  assert.equal(p.lead, 'ใบ SO-26090051-0 จะเป็น “ยกเลิก” — ใบย้อนหลังไม่นับ Actual/รออนุมัติ ยอดจึงไม่ขยับ');
  assert.equal(p.confirmLabel, 'ยืนยันยกเลิกใบย้อนหลัง');
  assert.equal(p.noteRequired, true, 'เงินที่บัญชีรับรองออกจากทะเบียน — ต้องมีเหตุผลให้บัญชีเห็น');
  assert.equal(p.noteLabel, 'หมายเหตุ (บังคับ อย่างน้อย 10 ตัวอักษร — บัญชีเห็นในประวัติ)');
  assert.deepEqual(p.money, [
    'งวดยกมา ฿196,452.00 ที่บัญชีรับรองแล้ว (กนกวรรณ · 22/09/2026) เป็นโมฆะตามใบ — ไม่ใช่เงินค้าง ไม่ต้องคืน/ยก'
      + ' · ใบที่คีย์ใหม่ต้องให้บัญชีรับรองงวดยกมาอีกครั้ง',
    'งวดที่ยังไม่ชำระ 1 งวด ฿65,484.00 หลุดจากยอดค้างรับ',
  ]);
  assert.deepEqual(p.notices, [
    'รอบขายของโซน 4 โซนหยุดมีผลทันที — นัดบริการของโซนเหล่านี้ติดด่านจนกว่าใบที่คีย์ใหม่จะอนุมัติ'
      + ' และบัญชีรับรองงวดยกมาของใบใหม่',
    HISTORICAL_CORRECTION_PATH,
  ]);
  assert.doesNotMatch(JSON.stringify(p), /Actual จะถูกนำออก|ออกจาก "รออนุมัติ"|AE Sup/);
  // งวดยกมารอรับรอง = ออกจากคิวบัญชีเอง ไม่บังคับหมายเหตุ
  const reported = historicalCancelPrompt(APPROVED, { installments: [{ ...CONFIRMED_OPENING, status: 'reported' }] });
  assert.equal(reported.noteRequired, false);
  assert.equal(reported.noteLabel, 'หมายเหตุ (ไม่บังคับ)');
});

test('โมดัลยกเลิกใบย้อนหลังที่ยังไม่อนุมัติ: ไม่มีรอบขายของโซน/ทางแก้หลังอนุมัติ · หมายเหตุตามรหัส "อื่น ๆ" · ใบ pipeline = null', () => {
  const p = collect(historicalCancelPrompt(ORDER, { installments: [OPENING, REGULAR] }));
  assert.equal(p.lead, 'ใบ SO-26090051-0 จะเป็น “ยกเลิก” — ใบย้อนหลังไม่นับ Actual/รออนุมัติ ยอดจึงไม่ขยับ');
  assert.deepEqual(p.money, []);
  assert.deepEqual(p.notices, []);
  assert.equal(p.noteRequired, false);
  assert.equal(historicalCancelPrompt(ORDER, { installments: [], reasonCode: 'other' }).noteRequired, true);
  assert.equal(historicalCancelPrompt(ORDER, { installments: [], reasonCode: 'other' }).noteLabel, 'หมายเหตุ (บังคับ)');
  assert.equal(historicalCancelPrompt({ ...ORDER, origin: 'pipeline' }, { installments: [] }), null);
});

test('toast หลังยกเลิกใบย้อนหลัง: บอกสิ่งที่เกิดจริง (สัญญา · งวดยกมา) + ทางคีย์ใบใหม่ · ไม่พูดเรื่อง Actual', () => {
  assert.equal(
    collect(historicalCancelToast({ contractVoided: true, contractVoidedLabel: 'ใบสั่งซื้อของลูกค้า (PO) PO-SPW-2026-0118 (CT-SR-26090007-0)', openingVoided: 'confirmed' })),
    'ยกเลิกใบย้อนหลังแล้ว — เอกสารแทนสัญญา ใบสั่งซื้อของลูกค้า (PO) PO-SPW-2026-0118 (CT-SR-26090007-0) ถูกยกเลิกตาม'
      + ' · งวดยกมาเป็นโมฆะ · คีย์ใบใหม่ได้ที่ ใบสั่งขาย › SO ย้อนหลัง',
  );
  assert.equal(historicalCancelToast({ contractVoided: true, contractVoidedLabel: '', openingVoided: null }),
    'ยกเลิกใบย้อนหลังแล้ว — เอกสารแทนสัญญาถูกยกเลิกตาม · คีย์ใบใหม่ได้ที่ ใบสั่งขาย › SO ย้อนหลัง');
  assert.equal(historicalCancelToast({}), 'ยกเลิกใบย้อนหลังแล้ว — คีย์ใบใหม่ได้ที่ ใบสั่งขาย › SO ย้อนหลัง');
  assert.equal(historicalCancelToast(null), 'ยกเลิกใบย้อนหลังแล้ว — คีย์ใบใหม่ได้ที่ ใบสั่งขาย › SO ย้อนหลัง');
});

/* audit ของ route ยกเลิก: ท้ายสรุปของใบ + หัวสรุปแถว audit ของงวด (ประวัติที่บัญชีเปิดดู) — บอกยอด · สถานะก่อนยกเลิก · ผู้รับรอง */
test('สรุป audit งวดยกมาที่โมฆะตามใบ: รับรองแล้ว (ใครรับรอง) / รอรับรอง (ออกจากคิวบัญชี) · ไม่มี = null', () => {
  assert.equal(collect(historicalOpeningVoidSummary({ row: CONFIRMED_OPENING, status: 'confirmed', amount: 196452 })),
    'งวดยกมา ฿196,452.00 (รับรองแล้ว โดย กนกวรรณ) โมฆะตามใบ');
  assert.equal(historicalOpeningVoidSummary({ row: { ...OPENING, status: 'reported' }, status: 'reported', amount: 196452 }),
    'งวดยกมา ฿196,452.00 (รอรับรอง — ออกจากคิวบัญชี) โมฆะตามใบ');
  assert.equal(historicalOpeningVoidSummary({ row: { ...CONFIRMED_OPENING, confirmedByName: null }, status: 'confirmed', amount: 1 }),
    'งวดยกมา ฿1.00 (รับรองแล้ว) โมฆะตามใบ');
  assert.equal(historicalOpeningVoidSummary(null), null);
});

// ── ตีกลับ · ดึงกลับ · บัญชีตีกลับงวดยกมา · toast ────────────────────────────────────────────────
test('ตีกลับ/ดึงกลับ: ชี้กลับฟอร์มคีย์ใบ · ไม่พูดเรื่องยอดออกจาก "รออนุมัติ" ของใบปกติ', () => {
  for (const detail of [historicalRejectDetail(ORDER), historicalWithdrawDetail(ORDER)]) {
    collect(detail);
    assert.match(detail, /SO-26090051-0/);
    assert.match(detail, /ฟอร์มคีย์ใบ/);
    assert.doesNotMatch(detail, /ออกจาก "รออนุมัติ"/);
  }
  assert.match(historicalWithdrawDetail(ORDER), /บันทึกและส่งอนุมัติ/);
});

test('บัญชีตีกลับงวดยกมา: บอกทางออกทั้งหลักฐานผิดและยอด/ช่วงที่อนุมัติผิด · toast ไม่นับ Actual', () => {
  collect([historicalOpeningRejectNote, historicalOverrideNote, HISTORICAL_APPROVE_TOAST]);
  assert.ok(historicalOpeningRejectNote.includes(HISTORICAL_CORRECTION_PATH));
  assert.match(historicalOpeningRejectNote, /แจ้งงวดยกมาใหม่พร้อมหลักฐาน/);
  assert.match(HISTORICAL_APPROVE_TOAST, /ไม่นับ Actual/);
  assert.doesNotMatch(HISTORICAL_APPROVE_TOAST, /อัปเดต Actual/);
});

// ── "หลังบันทึก จะเกิดอะไร" (ขั้น ④) — ป้อนด้วยแผนจริงของ planHistoricalServiceOrder ─────────────────────
const PIM = { id: 'U-PIM', role: 'ae', team: 'SV', teams: ['SV'] };
const SPW = { id: 'CUS-SPW', name: 'บจก. สยามพิวรรธน์', approvalStatus: 'approved', isActive: true };
const PKG = { id: 'P-PKG', fgCode: 'FG-SNS-02-001-0012', productDescription: 'แพ็คเกจกลิ่นรายเดือน (30 วัน)', saleUnit: 'แพ็คเกจ', costPrice: 1200 };
const SITES = [
  { id: 'ST-1002', code: 'ST-1002', name: 'สยามพารากอน', customerId: 'CUS-SPW', kind: 'customer', isActive: true },
  { id: 'ST-1044', code: 'ST-1044', name: 'สยามดิสคัฟเวอรี่', customerId: 'CUS-SPW', kind: 'customer', isActive: true },
];
const ZONES = LINE_ZONES.map((z) => ({ id: z.zoneId, siteId: z.siteId, name: z.zoneName, code: z.zoneCode, isActive: true }));
const zoneRow = (zoneId, qty, extra = {}) => ({ zoneId, productId: 'P-PKG', qty, discountType: null, discountValue: 0, rounds: 12, ...extra });
const planOf = (extra = {}, actor = PIM) => planHistoricalServiceOrder({
  customerId: 'CUS-SPW', ownerId: 'U-PIM',
  contract: { docKind: 'customer_po', ref: 'PO-SPW-2026-0118', startDate: '2026-01-01', endDate: '2026-12-31' },
  refs: { quote: null, express: null, invoice: 'IV-2601-0412' }, vatRate: 7, notes: null,
  zones: [zoneRow('Z-1002-01', 72), zoneRow('Z-1002-02', 48), zoneRow('Z-1002-03', 36), zoneRow('Z-1044-01', 48)],
  opening: { amount: 196452, coversTo: '2026-09-30', paidOn: '2026-09-15', note: 'เก็บผ่าน Express แล้ว ม.ค.–ก.ย.' },
  installments: [{ label: 'งวด ต.ค.–ธ.ค. 2026', amount: 65484, dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-12-31' }],
  ...extra,
}, {
  actor, customer: SPW, owner: { ok: true, ownerId: 'U-PIM', ownerName: 'พิมพ์ชนก รัตนา', team: 'SV', teams: ['SV'] },
  products: [PKG], zones: ZONES, sites: SITES, containerDeals: [], existingHistorical: [], liveTermsByZone: null,
  todayIso: TODAY, selfOrderId: null,
});

/* ⭐ มติเจ้าของ 25/09 (รื้อขั้น ④): "หลังกดส่ง" เป็นรางแบบหน้าสร้างใบสั่งขาย · ผู้อนุมัติ = ผู้จัดการฝ่ายขาย (AE Sup · CM · CD) */
test('หลังกดส่ง: ชุดม็อก — คีย์ใบ (คุณอยู่ตรงนี้) → ผู้จัดการฝ่ายขายอนุมัติ → บัญชีรับรองงวดยกมา → TS → ฝ่ายขายตามเก็บงวด', () => {
  const p = planOf();
  assert.deepEqual(p.errors, []);
  const steps = historicalAfterSendRail(p).map((step) => { collect([{ text: step.label, note: step.hint }]); return step; });
  assert.deepEqual(steps.map((s) => s.id), ['keyed', 'approve', 'finance', 'ts', 'collect']);
  assert.equal(steps[0].state, 'current');
  assert.equal(steps[0].hint, 'คุณอยู่ตรงนี้ — กดส่งแล้วได้เลข SO (เลขใช้แล้วไม่คืน) · ไฟล์เอกสารแทนสัญญาล็อกระหว่างรออนุมัติ');
  assert.equal(steps[1].label, 'ผู้จัดการฝ่ายขายอนุมัติ');
  assert.match(steps[1].hint, /^AE Sup · CM · Commercial Director ตรวจตามรายการข้างบน/);
  assert.equal(steps[2].label, 'บัญชีรับรองงวดยกมา');
  assert.match(steps[2].hint, /^฿196,452\.00 แจ้งชำระในชื่อคุณ — รับรองแล้วนัดบริการได้ถึง 30\/09\/2026/);
  assert.equal(steps[3].hint, '4 โซนขึ้นคิวฝ่ายบริการทันทีที่อนุมัติ — ตั้งรอบได้ก่อนบัญชีรับรอง แต่นัดเข้าบริการรอด่านเงิน');
  assert.equal(steps[4].hint, 'งวด ต.ค.–ธ.ค. 2026 ฿65,484.00 ครบกำหนด 01/10/2026');
  /* ป้ายขั้นชุดเดียวกับรางบนหน้าใบย้อนหลัง — ผู้คีย์เห็นรางเดิมต่อหลังระบบพาไปหน้าใบ */
  const page = historicalWorkflowSteps({ status: 'pending_approval', totalAmount: 261936 }, [], [], [], TODAY).steps;
  assert.equal(page[1].label, steps[1].label);
});

test('หลังกดส่ง: ผู้คีย์เป็นผู้จัดการ = ผู้จัดการคนอื่นอนุมัติ · admin = Admin Override · ใบที่มีเลขแล้วส่งซ้ำใช้เลขเดิม', () => {
  assert.match(historicalAfterSendRail(planOf(), { keyerMode: 'manager' })[1].hint, /คนอื่นเป็นผู้อนุมัติ — คุณคีย์\/ส่งใบนี้เองจึงอนุมัติเองไม่ได้/);
  assert.match(historicalAfterSendRail(planOf(), { keyerMode: 'admin' })[1].hint, /Admin Override/);
  assert.equal(historicalAfterSendRail(planOf(), { orderNumber: 'SO-26090240-0' })[0].hint, 'คุณอยู่ตรงนี้ — ส่ง SO-26090240-0 อีกครั้ง ใช้เลขเดิม');
});

test('หลังกดส่ง: ใบ ฿0 ไม่มีขั้นบัญชี/ตามเก็บ · ไม่มีงวดยกมา = บัญชีรับรองงวดแรก · งวดหลายงวดบอกที่เหลือ', () => {
  const zero = planOf({
    zones: [zoneRow('Z-1002-01', 72, { discountType: 'percent', discountValue: 100 })], opening: null, installments: [],
    notes: 'บริการเสริมฟรีตามสัญญาหลัก',
  });
  assert.deepEqual(zero.errors, []);
  const zeroSteps = historicalAfterSendRail(zero);
  assert.deepEqual(zeroSteps.map((s) => s.id), ['keyed', 'approve', 'ts']);
  assert.match(zeroSteps[2].hint, /นัดได้ทันที ไม่มีด่านเงิน/);

  const noOpening = planOf({ opening: null, installments: [
    { label: 'ทั้งสัญญา', amount: 261936, dueDate: '2026-10-01', coversFrom: '2026-01-01', coversTo: '2026-12-31' },
  ] });
  assert.deepEqual(noOpening.errors, []);
  const steps = historicalAfterSendRail(noOpening);
  assert.equal(steps[2].label, 'บัญชีรับรองงวดแรก');
  assert.equal(steps[2].hint, 'เมื่อลูกค้าจ่ายและฝ่ายขายแจ้งชำระ — ก่อนนั้นนัดบริการไม่ได้');

  const split = planOf({ installments: [
    { label: 'งวด ต.ค.', amount: 21828, dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-10-31' },
    { label: 'งวด พ.ย.', amount: 21828, dueDate: '2026-11-01', coversFrom: '2026-11-01', coversTo: '2026-11-30' },
    { label: 'งวด ธ.ค.', amount: 21828, dueDate: '2026-12-01', coversFrom: '2026-12-01', coversTo: '2026-12-31' },
  ] });
  assert.deepEqual(split.errors, []);
  assert.equal(historicalAfterSendRail(split).at(-1).hint, 'งวด ต.ค. ฿21,828.00 ครบกำหนด 01/10/2026 · อีก 2 งวดตามตาราง');
});

// ── ยามรวม (ต้องอยู่ท้ายไฟล์ — อ่านทุกสตริงที่เทสต์ข้างบนเก็บไว้) ───────────────────────────────────
test('🔴 ไม่มีประโยคไหนบอกว่าใบย้อนหลัง "นับ Actual" — ทุกครั้งต้องเป็น "ไม่นับ Actual"', () => {
  assert.ok(OUTPUTS.length > 100, `เก็บสตริงได้น้อยผิดปกติ (${OUTPUTS.length}) — ยามนี้ต้องวิ่งหลังเทสต์อื่น`);
  assert.deepEqual(OUTPUTS.filter(affirmsActual), []);
  assert.equal(affirmsActual('อนุมัติและนับ Actual'), true, 'ตัวจับต้องจับประโยคของใบปกติได้');
  assert.equal(affirmsActual('ยังไม่นับ Actual'), false);
});

test('ไฟล์ถ้อยคำ pure — ไม่อ่านนาฬิกา · ไม่อ่านฐาน · import เฉพาะตัวตัดสินฝั่ง client', () => {
  const src = readFileSync(new URL('./historicalOrderCopy.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.doesNotMatch(code, /new Date\(|Date\.now\(|businessDate\(|supabase|\.from\(/);
  const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(imports, [
    '@/lib/format', '@/lib/sales/contracts', '@/lib/sales/historicalDuplicates', '@/lib/sales/historicalOrders',
    '@/lib/sales/paymentCoverage', '@/lib/sales/salesOrderPayments',
  ]);
});

/* 🐞 รีวิว 25/09: ส่วนลดท้ายใบ (มติเจ้าของ 25/09) ไปถึงโมดัลอนุมัติได้แล้ว แต่บรรทัดเงินเคยข้ามมัน ⇒ 42,000 + 2,800 ≠ 42,800
   และส่วนลดที่ AE Sup รับรองไม่ขึ้นบนจอเลย · กติกา: ยอดรวมสินค้า/บริการ − ส่วนลด + VAT = ยอดรวมทั้งสิ้น อ่านได้ครบในบรรทัดเดียว */
test('โมดัลอนุมัติ: ใบที่มีส่วนลดท้ายใบ — บรรทัดเงินบอกส่วนลดคั่นระหว่างยอดรวมกับ VAT (บวกลบลงตัวบนจอ)', () => {
  const withVat = collect(historicalApprovalFacts(
    { ...ORDER, subtotal: 42000, discountAmount: 2000, vatAmount: 2800, totalAmount: 42800 },
    { ...EXTRAS, installments: [] },
  ));
  assert.ok(withVat.checklist.includes(
    'ยอดรวมทั้งสิ้น: ฿42,800.00 — ยอดรวมสินค้า/บริการ ฿42,000.00 · หัก ส่วนลด ฿2,000.00 · ภาษีมูลค่าเพิ่ม ฿2,800.00',
  ), withVat.checklist.join('\n'));
  const included = collect(historicalApprovalFacts(
    { ...ORDER, subtotal: 42000, discountAmount: 4200, vatAmount: 0, totalAmount: 37800 },
    { ...EXTRAS, installments: [] },
  ));
  assert.ok(included.checklist.includes(
    'ยอดรวมทั้งสิ้น: ฿37,800.00 — ยอดรวมสินค้า/บริการ ฿42,000.00 · หัก ส่วนลด ฿4,200.00 · รวม VAT แล้ว',
  ), included.checklist.join('\n'));
  /* ไม่มีส่วนลด = บรรทัดเดิมทุกตัวอักษร (ใบที่คีย์ก่อน 25/09 ไม่เปลี่ยนหน้าตา) */
  const none = collect(historicalApprovalFacts({ ...ORDER, discountAmount: 0 }, EXTRAS));
  assert.ok(none.checklist.some((line) => line.startsWith('ยอดรวมทั้งสิ้น:') && !line.includes('หัก ส่วนลด')));
});


/* ⭐ มติ 26/09 "บันทึกใบซ้ำที่ผู้คีย์ยืนยัน": หน้าต่างอนุมัติบอกใบที่ผู้คีย์ยืนยันว่าไม่ซ้ำ (ใคร · เมื่อไร · เหตุผล) และใบที่พบเพิ่ม
   ตอนเปิดใบ — เตือน ไม่บล็อก · ต่อจากคำเตือนโซนซ้อน · ไม่มีอะไรจะพูด = ไม่มีแถว (ตารางตรวจทั้งใบข้างบนตรึงไว้แล้ว) */
test('โมดัลอนุมัติ: ใบที่อาจซ้ำ — บันทึกของผู้คีย์ + ที่พบเพิ่ม · ต่อจากคำเตือนโซนซ้อน · ไม่มี = ไม่มีแถว', () => {
  const review = {
    v: 1, checkedAt: '2026-09-26T07:32:00.000Z', byName: 'พิมพ์ชนก รัตนา', basis: 'ids', note: 'คนละอาคาร',
    orders: [{ id: 'SOR-A', orderNumber: 'SO-26090001-0', status: 'pending_approval', matchedOn: [{ kind: 'startDate', value: '2026-01-01' }] }],
  };
  const order = { ...ORDER, metadata: { historicalIntake: { vatRate: 7, duplicateReview: review } } };
  const duplicateCheck = {
    candidates: [
      { id: 'SOR-A', status: 'approved', matchedOn: [] },
      { id: 'SOR-N', orderNumber: 'SO-26090009-0', status: 'draft', matchedOn: [{ kind: 'ref', value: 'PO-1' }] },
    ],
    statusById: { 'SOR-A': 'approved', 'SOR-N': 'draft' },
  };
  const { checklist, effects } = historicalApprovalFacts(order, {
    ...EXTRAS, liveTermWarnings: [{ zoneCode: 'ZN-1', orderNumber: 'SO-X', endDate: '2026-12-31' }], duplicateCheck,
  });
  const at = checklist.findIndex((line) => line.startsWith('⚠️ ใบที่อาจซ้ำ'));
  assert.ok(at > checklist.findIndex((line) => line.includes('โซนนี้มีรอบขายของ')), 'ต่อจากคำเตือนโซนซ้อน');
  assert.match(checklist[at], /ผู้คีย์ยืนยันว่าไม่ซ้ำ \(พิมพ์ชนก รัตนา · .+\) · เหตุผล: “คนละอาคาร”/);
  assert.equal(checklist[at + 1], '⚠️ SO-26090001-0 (ตอนยืนยัน: รอผู้จัดการฝ่ายขายอนุมัติ · ตอนนี้: อนุมัติแล้ว) — ตรงกันที่ วันเริ่มสัญญา');
  assert.equal(checklist[at + 2], '⚠️ พบใบที่อาจซ้ำเพิ่มหลังผู้คีย์ยืนยัน: SO-26090009-0 (ฉบับร่าง) — ตรงกันที่ เลขเอกสารเดิม PO-1');
  assert.ok(!effects.some((line) => /ใบที่อาจซ้ำ/.test(line)), 'การยืนยันไม่ก่อผลตอนอนุมัติ — ไม่อยู่ใน effects');
  /* ไม่มีใบที่อาจซ้ำ (บันทึก orders: [] และตรวจใหม่ว่าง) = ไม่มีแถวเพิ่ม */
  const clean = historicalApprovalFacts({ ...ORDER, metadata: { historicalIntake: { duplicateReview: { ...review, orders: [] } } } },
    { ...EXTRAS, duplicateCheck: { candidates: [], statusById: {} } });
  assert.deepEqual(clean.checklist, historicalApprovalFacts(ORDER, EXTRAS).checklist);
});
