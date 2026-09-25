// ── ตัวตัดสินฝั่งจอของฟอร์มคีย์ใบสั่งขายย้อนหลัง (หน้าเต็ม 4 ขั้น · มติ 22/09 · mig 0374) ────────
//
// 🔴 **นี่คือของจริง ไม่ใช่ยาม source** — ชุดเทสต์ของรีโปนี้ไม่มีตัวเรนเดอร์ React ⇒ ตรรกะของฟอร์ม
//    ต้องอยู่ในฟังก์ชันบริสุทธิ์ที่เรียกตรง ๆ ได้ · ที่เฝ้าได้แค่ด้วย regex อยู่ที่ historicalRegisterUi
//
// สี่เรื่องที่พังแล้วเงียบ (ไม่มี error ให้เห็น มีแต่ข้อมูลผิดหรืองานที่หาย):
//   ① body ที่ส่งขึ้น API มีคีย์ที่ฐานไม่รับ ⇒ ตีกลับทั้งใบด้วยข้อความที่อ่านไม่ออกว่าช่องไหน
//   ② โหลดใบมาแก้แล้วค่าเติมกลับผิดช่อง ⇒ ยอด/ช่วงครอบเพี้ยนโดยที่จอดูปกติ
//   ③ ลำดับการบันทึกผิด ⇒ ใบซ้ำ หรือไฟล์ถูกอัปซ้ำทุกครั้งที่กดใหม่
//   ④ ทางออกของ 409/500 ผิด ⇒ ผู้คีย์เสียงานทั้งใบเพราะปุ่มเดียวบนจอคือปุ่มที่ไม่มีวันผ่าน
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRACT_PARTIAL_NOTE, HISTORICAL_DISCOUNT_MESSAGES, HISTORICAL_MONEY_UNKNOWN, HISTORICAL_SAVE_BUTTON_LABEL,
  HISTORICAL_WIZARD_STEPS, HISTORICAL_WIZARD_STEP_ORDER,
  contractMonths, contractSpan, emptyHistoricalInstallment,
  emptyHistoricalWizard, emptyHistoricalZone, emptySaveProgress, firstStepWithIssues,
  historicalAsideRows, historicalBulkAddRows, historicalIssueText, historicalBulkConsequence, historicalBulkQtyIssue,
  historicalContractDateIssues, historicalContractDateWarnings,
  historicalContractFileCount, historicalCoverageWarning,
  historicalDocStatusLabel, historicalDownstreamReset, historicalDuplicateGate, historicalFieldAnchorId,
  historicalFootNote, historicalIssuesWithRowKeys, historicalLineIssues,
  historicalLinesSummary, historicalMoneyView, historicalNextBlock, historicalPruneIssues,
  historicalReviewStaleNotice, historicalSaveExit,
  historicalStepIssueNotice,
  HISTORICAL_FULL_WIDTH_STEPS, HISTORICAL_LINE_MESSAGES, historicalTotalsView,
  historicalZoneLines, historicalZonePickerOptions, historicalZonesWithPlanPrices,
  historicalTeamField, historicalWizardRail, historicalZoneBrowser, historicalZoneLineAmount,
  historicalWizardBody, historicalWizardLocalIssues, issuesForStep, newHistoricalIntakeKey,
  nextSaveStage, saveProgressAfter, stepOfField, wizardStateFromOrder,
} from './historicalIntakeForm.js';
import * as intakeForm from './historicalIntakeForm.js';
import {
  CONTRACT_DATE_MESSAGES, HISTORICAL_DISCOUNT_MESSAGES as PLAN_DISCOUNT_MESSAGES,
  historicalServiceRpcArgs, historicalZonePoint, planHistoricalServiceOrder,
} from './historicalOrderPlan.js';
import { QUOTE_VAT_OPTIONS } from '../salesPlanning.js';
import { quoteLineFromProduct } from './quoteLines.js';
import { OPENING_INSTALLMENT_LABEL } from './historicalOrders.js';
import { historicalSaveResultView } from './historicalReviewView.js';
import { coverageIsContinuous } from './paymentCoverage.js';

/* ชุดตัวเลขของม็อก (mockups/legacy-so-service-flow) — 196,452 + 65,484 = 261,936 ครอบ 1 ม.ค.–31 ธ.ค. 2026 */
const CONTRACT = { docKind: 'customer_po', ref: 'PO-SPW-2026-0118', startDate: '2026-01-01', endDate: '2026-12-31' };

function filledState(extra = {}) {
  return {
    ...emptyHistoricalWizard(),
    customerId: 'CUS-1', ownerId: 'USR-AE', team: 'KA',
    contract: { ...CONTRACT },
    refs: { quote: '', express: '', invoice: 'IV-2601-0412' },
    vatRate: 7,
    notes: '',
    /* ⚠️ ไม่มี `packageProductId` แล้ว (มติเจ้าของ 25/09 — ช่อง "ใช้แพ็คเกจเดียวกันทุกโซน" ถูกถอดทั้งช่องและ state)
       แถวโซนแบบใบเสนอราคา — ราคา/หน่วยมาจากทะเบียนตอนเลือกแพ็คเกจ (quoteLineFromProduct) */
    zones: [emptyHistoricalZone({
      zoneId: 'ZN-1', siteId: 'ST-1', productId: 'PRD-1', fgCode: 'FG-SNS-02-001-0012', unit: 'แพ็คเกจ',
      /* ⭐ 25/09 (รื้อขั้น ③): 204 × 1,200 = 244,800 + VAT 7% = 261,936 = งวดยกมา 196,452 + งวดที่เหลือ 65,484 —
         ยอดใบต้องเท่างวดรวมจริง เพราะงวดสุดท้ายรับ "ยอดที่เหลือ" ที่ห่วงโซ่คิดจากยอดใบ (ของเดิม 72 × 1,200 ไม่ตรงงวด) */
      unitPrice: 1200, qty: '204', rounds: '12',
    })],
    hasOpening: true,
    opening: { amount: '196452', coversTo: '2026-09-30', paidOn: '2026-09-22', note: 'เก็บผ่าน Express แล้ว ม.ค.–ก.ย.' },
    openingEvidence: [],
    installments: [emptyHistoricalInstallment({
      label: 'งวด ต.ค.–ธ.ค. 2026', amount: '65484', dueDate: '2026-10-01',
      coversFrom: '2026-10-01', coversTo: '2026-12-31',
    })],
    ...extra,
  };
}

// ── ① body ที่ส่งขึ้น API ─────────────────────────────────────────────────────────

test('⭐ body ของพรีวิวกับของบันทึกต่างกันแค่ preview/intakeKey — รูปที่เหลือเหมือนกันเป๊ะ', () => {
  const state = filledState();
  const preview = historicalWizardBody(state, { preview: true, intakeKey: 'KEY-1' });
  const save = historicalWizardBody(state, { intakeKey: 'KEY-1' });
  assert.equal(preview.preview, true);
  assert.equal(save.preview, false);
  assert.deepEqual({ ...preview, preview: null }, { ...save, preview: null });
});

test('🪤 ตัวประกอบสร้างคีย์เองจากช่องที่รู้จัก — `key` ของ React และธงของฐานไม่มีทางไหลขึ้น API', () => {
  const state = filledState();
  state.zones[0].key = 'zone-99';
  state.installments[0].key = 'inst-99';
  state.installments[0].status = 'pending';       // ค่าที่ฐานเป็นคนตั้ง
  state.zones[0].frozenAt = '2026-01-01T00:00:00Z';
  const body = historicalWizardBody(state, { intakeKey: 'KEY-1' });
  const json = JSON.stringify(body);
  /* `_lineKind` (ธงล็อกหน่วยของบรรทัดสินค้า — รีวิว 23/09) · unit/unitPrice/fgCode/description มีไว้โชว์อย่างเดียว */
  for (const forbidden of ['"key"', '"status"', '"frozenAt"', '"kind"', '"seq"', '"_lineKind"', '"unitPrice"', '"unit"']) {
    assert.ok(!json.includes(forbidden), `body ต้องไม่มี ${forbidden}`);
  }
  /* ⭐ บรรทัดโซน = บรรทัดใบเสนอราคา: สินค้า · จำนวน · ส่วนลดรายการ (+ โซน · รอบ) — **ไม่ส่งราคา/ยอด/หน่วย**
     (ราคาเป็นของทะเบียน server อ่านเอง · ยอดเป็นของสูตร) · ไม่มี packs/lineAmount ของรุ่น 0374 แล้ว */
  assert.deepEqual(Object.keys(body.zones[0]).sort(), ['discountType', 'discountValue', 'productId', 'qty', 'rounds', 'zoneId']);
  assert.ok(!('amountsIncludeVat' in body), 'โหมด VAT ที่สามถูกถอด (มติ 23/09)');
  assert.deepEqual(
    Object.keys(body.installments[0]).sort(),
    ['amount', 'coversFrom', 'coversTo', 'dueDate', 'label', 'note'],
  );
});

test('⭐ "ยังไม่เคยเก็บเงิน" และ "ยังไม่เลือก" ส่ง opening = null ไม่ใช่ก้อนว่าง', () => {
  assert.equal(historicalWizardBody(filledState({ hasOpening: false }), {}).opening, null);
  assert.equal(historicalWizardBody(filledState({ hasOpening: null }), {}).opening, null);
  const on = historicalWizardBody(filledState(), {}).opening;
  assert.equal(on.amount, '196452');
  assert.equal(on.coversTo, '2026-09-30');
  assert.ok(!('coversFrom' in on), 'วันเริ่มครอบมาจากวันเริ่มสัญญาฝั่ง server เสมอ');
});

test('⭐ หลักฐานงวดยกมาส่งทั้งชุดเสมอ (ของเดิม + ที่เพิ่งอัป) — RPC แก้ใบเขียนงวดใหม่ทั้งชุด', () => {
  const stored = [{ storageBucket: 'private', storagePath: 'sales-orders/SOR-H1/payments/a.pdf', fileName: 'a.pdf' }];
  const fresh = [{ storageBucket: 'private', storagePath: 'sales-orders/SOR-H1/payments/b.pdf', fileName: 'b.pdf' }];
  const state = filledState({ openingEvidence: stored });
  assert.deepEqual(historicalWizardBody(state, {}).opening.evidence, stored);
  assert.deepEqual(
    historicalWizardBody(state, { openingEvidenceRefs: [...stored, ...fresh] }).opening.evidence,
    [...stored, ...fresh],
  );
});

test('expectedUpdatedAt / acknowledgeDuplicates ติดไปเฉพาะตอนมีค่า', () => {
  const plain = historicalWizardBody(filledState(), {});
  assert.ok(!('expectedUpdatedAt' in plain));
  assert.ok(!('acknowledgeDuplicates' in plain));
  const full = historicalWizardBody(filledState(), { expectedUpdatedAt: '2026-09-22T10:00:00Z', acknowledgeDuplicates: true });
  assert.equal(full.expectedUpdatedAt, '2026-09-22T10:00:00Z');
  assert.equal(full.acknowledgeDuplicates, true);
});

// ── ② โหลดใบมาแก้ (ฟอร์มแก้ = ฟอร์มสร้าง) ──────────────────────────────────────────

const ORDER = {
  id: 'SOR-Habc', origin: 'historical', status: 'rejected', orderNumber: 'SO-26090051-0',
  updatedAt: '2026-09-22T09:00:00Z', customerId: 'CUS-1', orderDate: '2026-01-01',
  notes: 'ย้ายจาก Express', historicalInvoiceRef: 'IV-2601-0412',
  rejectedByName: 'วรเชษฐ์ ทองดี', rejectedAt: '2026-09-22T08:00:00Z', rejectionReason: 'ยอดงวดยกมาไม่ตรงใบกำกับ',
  metadata: { historicalIntake: { vatRate: 7 } },
  deal: { ownerId: 'USR-AE', team: 'KA' },
  serviceContract: {
    id: 'CTR-Habc', externalDocKind: 'customer_po', externalRef: 'PO-SPW-2026-0118',
    effectiveDate: '2026-01-01', expiryDate: '2026-12-31',
  },
  lines: [
    { id: 'SOL-2', sortOrder: 1, serviceZoneId: 'ZN-2', productId: 'PRD-1', fgCode: 'FG-SNS-02-001-0012', description: 'แพ็คเกจ',
      unit: 'แพ็คเกจ', qty: 48, unitPrice: 1200, discountType: 'amount', discountValue: 600, discountAmount: 600,
      serviceRounds: 12, lineTotal: 57000, metadata: {} },
    { id: 'SOL-1', sortOrder: 0, serviceZoneId: 'ZN-1', productId: 'PRD-1', fgCode: 'FG-SNS-02-001-0012', description: 'แพ็คเกจ',
      unit: 'แพ็คเกจ', qty: 72, unitPrice: 1200, discountType: 'percent', discountValue: 5, discountAmount: 4320,
      serviceRounds: 12, lineTotal: 82080, metadata: {} },
  ],
  installments: [
    { id: 'SOI-2', seq: 2, kind: 'regular', label: 'งวด ต.ค.–ธ.ค. 2026', amount: 65484, dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-12-31', note: null },
    { id: 'SOI-1', seq: 1, kind: 'opening', label: OPENING_INSTALLMENT_LABEL, amount: 196452, dueDate: null, coversFrom: '2026-01-01', coversTo: '2026-09-30', paidOn: '2026-09-22', note: 'เก็บผ่าน Express', evidence: [{ storagePath: 'sales-orders/SOR-Habc/payments/a.pdf', fileName: 'a.pdf' }] },
  ],
};

test('⭐ ใบที่โหลดมา → state ของฟอร์ม: เรียงตามลำดับบนใบ · เหตุผลที่ถูกตีกลับ · หลักฐานที่เก็บไว้', () => {
  const state = wizardStateFromOrder(ORDER);
  assert.equal(state.orderId, 'SOR-Habc');
  assert.equal(state.status, 'rejected');
  assert.equal(state.updatedAt, '2026-09-22T09:00:00Z');
  assert.deepEqual(state.rejection, { by: 'วรเชษฐ์ ทองดี', at: '2026-09-22T08:00:00Z', reason: 'ยอดงวดยกมาไม่ตรงใบกำกับ' });
  assert.equal(state.customerId, 'CUS-1');
  assert.equal(state.ownerId, 'USR-AE');
  assert.equal(state.team, 'KA');
  assert.deepEqual(state.contract, CONTRACT);
  assert.equal(state.vatRate, 7);
  assert.ok(!('amountsIncludeVat' in state), 'ไม่มีโหมด VAT ที่สามให้โหลดกลับแล้ว');
  assert.deepEqual(state.zones.map((z) => z.zoneId), ['ZN-1', 'ZN-2'], 'เรียงตาม sortOrder ของบรรทัด');
  assert.equal(state.hasOpening, true);
  assert.equal(state.opening.coversTo, '2026-09-30');
  assert.equal(state.openingEvidence.length, 1);
  assert.deepEqual(state.installments.map((r) => r.label), ['งวด ต.ค.–ธ.ค. 2026']);
});

/* ⭐ มติ 23/09: บรรทัดโซนเติมกลับ **ช่องต่อช่องแบบใบเสนอราคา** — จำนวน · หน่วย · ราคา/หน่วย · ส่วนลด · รอบ
   (ไม่มี "ยอดที่พิมพ์เอง" ให้เติมกลับแล้ว) · เติมผิดช่อง = เปิดใบมาแก้แล้วส่วนลดหาย/จำนวนเพี้ยนโดยจอดูปกติ */
test('⭐ บรรทัดโซนเติมกลับจากบรรทัดใบ: จำนวน · หน่วย · ราคา/หน่วย · ส่วนลด (ชนิด/ค่า) · รอบ', () => {
  const state = wizardStateFromOrder(ORDER);
  const pick = (z) => [z.productId, z.fgCode, z.unit, z.unitPrice, z.qty, z.discountType, z.discountValue, z.rounds];
  assert.deepEqual(pick(state.zones[0]), ['PRD-1', 'FG-SNS-02-001-0012', 'แพ็คเกจ', 1200, 72, 'percent', 5, '12']);
  assert.deepEqual(pick(state.zones[1]), ['PRD-1', 'FG-SNS-02-001-0012', 'แพ็คเกจ', 1200, 48, 'amount', 600, '12']);
  for (const zone of state.zones) {
    assert.ok(!('packs' in zone) && !('lineAmount' in zone), 'ช่องของรุ่น 0374 ไม่มีแล้ว');
  }
  // บรรทัดรุ่น 0374 (ไม่มีส่วนลด · metadata.grossAmount) โหลดเป็นไม่ลด — grossAmount ไม่ถูกอ่าน
  const old = wizardStateFromOrder({ ...ORDER, lines: [{ serviceZoneId: 'ZN-1', productId: 'PRD-1', qty: 12, unitPrice: 3500,
    discountType: null, discountValue: 0, lineTotal: 42000, metadata: { grossAmount: 99999 } }] });
  assert.deepEqual([old.zones[0].qty, old.zones[0].unitPrice, old.zones[0].discountType, old.zones[0].discountValue], [12, 3500, null, 0]);
});

/* 🪤 ใบที่คีย์ในโหมด "ราคารวม VAT แล้ว — ถอด VAT" ของรุ่นก่อน: โหมดนั้นถูกถอด และตัวเลือกที่เหลือไม่มีตัวไหน
   แปลว่าเงินก้อนเดียวกัน ⇒ โหลดมาเป็น "ยังไม่เลือก" ให้ผู้คีย์เลือกใหม่เอง (ไม่เดาเป็น 7 ซึ่งบวก VAT ซ้ำ) */
test('🪤 intake รุ่นก่อนแบบรวม VAT แล้ว → vatRate null (เลือกใหม่) · แบบอื่นโหลดตามอัตราเดิม', () => {
  const at = (intake) => wizardStateFromOrder({ ...ORDER, metadata: { historicalIntake: intake } }).vatRate;
  assert.equal(at({ amountsIncludeVat: true, vatRate: 7 }), null);
  assert.equal(at({ amountsIncludeVat: false, vatRate: 7 }), 7, '"ไม่รวม VAT +7%" = "+ VAT 7% ท้ายใบ" เงินก้อนเดียวกัน');
  assert.equal(at({ amountsIncludeVat: false, vatRate: 0 }), 0, '"ไม่มี VAT" = "รวม VAT แล้ว" เงินก้อนเดียวกัน');
  assert.equal(at({ vatRate: 7 }), 7);
  assert.equal(at({ vatRate: 0 }), 0);
  assert.equal(at({ vatRate: 5 }), null);
  assert.equal(at(undefined), null);
});

test('⭐ โหลดมาแล้วประกอบ body กลับได้ค่าชุดเดิม (สร้าง = แก้ ฟอร์มเดียวกันจริง)', () => {
  /* ยอดใบของใบจริงที่เปิดมาแก้ = ยอดที่งวดรวมกันได้เสมอ (ตัวตรวจงวดของ 0374) · บรรทัดของ fixture นี้ไม่ได้ตั้งให้ตรงยอดงวด
     ⇒ ส่งยอดใบของใบนี้ (261,936) แบบที่ฟอร์มส่งจากแผน — งวดสุดท้ายเป็นงวดที่ห่วงโซ่คิดยอดให้ */
  const body = historicalWizardBody(wizardStateFromOrder(ORDER), { expectedUpdatedAt: ORDER.updatedAt, totalAmount: 261936 });
  assert.deepEqual(body.contract, { docKind: 'customer_po', ref: 'PO-SPW-2026-0118', startDate: '2026-01-01', endDate: '2026-12-31' });
  assert.deepEqual(body.zones.map((z) => [z.qty, z.discountType, z.discountValue, z.rounds]),
    [['72', 'percent', '5', '12'], ['48', 'amount', '600', '12']]);
  assert.equal(body.opening.amount, '196452');
  assert.equal(body.opening.evidence.length, 1);
  assert.equal(body.installments[0].amount, '65484.00', 'งวดสุดท้ายรับยอดที่เหลือจากห่วงโซ่ (261,936 − 196,452)');
  assert.equal(body.vatRate, 7);
});

test('ใบร่างที่ยังไม่มีงวดเลย: hasOpening = null (ยังไม่ตัดสินใจ) ไม่ใช่ false', () => {
  const state = wizardStateFromOrder({ ...ORDER, status: 'draft', installments: [], rejectedAt: null });
  assert.equal(state.hasOpening, null);
  assert.equal(state.rejection, null, 'ร่างที่ไม่เคยถูกตีกลับ = ไม่มีป้ายตีกลับ');
});

test('⭐ ร่างที่พก rejectedAt = ใบที่ถูกตีกลับแล้วบันทึกแก้ (RPC พลิกเป็นร่าง) — เหตุผลยังอยู่บนฟอร์มจนกว่าจะส่งใหม่ (รีวิวขั้น ④ 25/09)', () => {
  const draft = wizardStateFromOrder({ ...ORDER, status: 'draft' });
  assert.deepEqual(draft.rejection, wizardStateFromOrder({ ...ORDER, status: 'rejected' }).rejection);
  assert.ok(draft.rejection?.reason);
  assert.equal(wizardStateFromOrder({ ...ORDER, status: 'pending_approval' }).rejection, null, 'ส่งใหม่แล้ว = ป้ายหาย');
  /* ป้ายสถานะบนหัวขั้น ① ④ เดินตามป้ายตีกลับ — ไม่ขึ้น "ฉบับร่าง" คู่กับ "ตีกลับให้แก้ไข" */
  assert.equal(historicalDocStatusLabel({ ...draft, orderId: 'SOR-H1' }), 'ถูกตีกลับ — แก้แล้วส่งใหม่');
  assert.equal(historicalDocStatusLabel({ orderId: 'SOR-H1', status: 'draft', rejection: null }), 'ฉบับร่าง — ยังไม่ส่งอนุมัติ');
});

test('⭐ รางขั้น ④: ปุ่มติดด่าน (ข้อค้าง/ใบซ้ำยังไม่ยืนยัน) = จุดเหลือง ไม่ใช่ "ครบ" · ข้อค้างบอกขั้นและจำนวน (รีวิวขั้น ④ 25/09)', () => {
  const plan = { zeroValue: false };
  const at = (options) => historicalWizardRail(emptyHistoricalWizard(), { step: 'review', plan, ...options }).find((r) => r.key === 'review');
  assert.deepEqual([at({}).summary, at({}).tone], ['ตรวจแล้ว — พร้อมส่ง', 'full']);
  assert.deepEqual([at({ duplicatesPending: true }).summary, at({ duplicatesPending: true }).tone], ['ตรวจแล้ว — ต้องยืนยันใบที่อาจซ้ำ', 'some']);
  const local = at({ localIssues: [{ field: 'contract.file', message: 'x' }] });
  assert.deepEqual([local.summary, local.tone], ['ตรวจแล้ว — ขั้น ① ต้องแก้ 1 ข้อ', 'some']);
});

// ── ช่อง → ขั้น ────────────────────────────────────────────────────────────────

test('ช่องของแผนและของฟอร์มถูกจัดเข้าขั้นที่ผู้คีย์เห็นช่องนั้นจริง', () => {
  assert.equal(stepOfField('customerId'), 'contract');
  assert.equal(stepOfField('contract.startDate'), 'contract');
  assert.equal(stepOfField('contract.file'), 'contract');
  assert.equal(stepOfField('refs.invoice'), 'contract');
  /* ⭐ มติเจ้าของ 25/09: VAT + ส่วนลดท้ายใบอยู่ในกล่องสรุปท้ายตารางรายการ (ขั้น ②) แบบใบเสนอราคา
     🔴 จัดผิดขั้น = "ถัดไป"/ปุ่มบันทึกพากลับไปขั้น ① ที่ไม่มีช่อง VAT แล้ว (ทางตันแบบรีวิว S8) */
  assert.equal(stepOfField('vatRate'), 'zones');
  assert.equal(stepOfField('discount'), 'zones');
  assert.equal(stepOfField('zones'), 'zones');
  assert.equal(stepOfField('zones.2'), 'zones');
  assert.equal(stepOfField('zones.2.qty'), 'zones', 'error รายช่องของบรรทัด (มติ 25/09) ยังตกขั้น ②');
  assert.equal(stepOfField('opening.coversTo'), 'money');
  assert.equal(stepOfField('opening.evidence'), 'money');
  assert.equal(stepOfField('installments.0'), 'money');
  assert.equal(stepOfField('อะไรก็ไม่รู้'), 'contract', 'ของที่ไม่รู้จักตกที่ขั้นแรกเสมอ');
  assert.deepEqual(HISTORICAL_WIZARD_STEP_ORDER, ['contract', 'zones', 'money', 'review']);
  assert.equal(HISTORICAL_WIZARD_STEPS.length, 4);
});

test('firstStepWithIssues ตอบขั้นแรกตามลำดับของฟอร์ม ไม่ใช่ตามลำดับที่ error เข้ามา', () => {
  const issues = [{ field: 'installments.0' }, { field: 'zones.1' }, { field: 'customerId' }];
  assert.equal(firstStepWithIssues(issues), 'contract');
  assert.equal(firstStepWithIssues([{ field: 'installments.0' }, { field: 'zones.1' }]), 'zones');
  assert.equal(firstStepWithIssues([]), null);
  assert.equal(issuesForStep(issues, 'money').length, 1);
});

// ── ของที่ server มองไม่เห็นตอนพรีวิว ────────────────────────────────────────────

test('⭐ ไฟล์สองชุดถูกถามบนฟอร์ม — พรีวิวไม่เห็น แต่ขั้นส่งอนุมัติตีกลับทั้งคู่', () => {
  const state = filledState();
  const issues = historicalWizardLocalIssues(state, { role: 'ac', userId: 'USR-AC' });
  assert.ok(issues.some((i) => i.field === 'contract.file'));
  assert.ok(issues.some((i) => i.field === 'opening.evidence'));
  const ok = historicalWizardLocalIssues(state, {
    role: 'ac', userId: 'USR-AC', contractFileCount: 1, evidenceFileCount: 1,
  });
  assert.deepEqual(ok, []);
});

test('⭐ AE / Senior AE คีย์ได้เฉพาะของตัวเอง (ownerLockedToSelf) — AC/AE Sup ไม่ติดข้อนี้', () => {
  const base = { contractFileCount: 1, evidenceFileCount: 1 };
  const state = filledState();
  for (const role of ['ae', 'senior_ae']) {
    const issues = historicalWizardLocalIssues(state, { ...base, role, userId: 'USR-OTHER' });
    assert.ok(issues.some((i) => i.field === 'ownerId'), role);
    assert.deepEqual(historicalWizardLocalIssues(state, { ...base, role, userId: 'USR-AE' }), []);
  }
  for (const role of ['ac', 'ae_supervisor', 'admin']) {
    assert.deepEqual(historicalWizardLocalIssues(state, { ...base, role, userId: 'USR-OTHER' }), [], role);
  }
});

test('⭐ ช่องทีมถูกถามเฉพาะตอน **มีตัวเลือกจริง ≥ 2** · ผู้คีย์ที่ขอบเขตไม่ใช่ทั้งบริษัทเลือกได้แค่ทีมร่วม', () => {
  const base = { role: 'ac', userId: 'USR-AC', contractFileCount: 1, evidenceFileCount: 1 };
  // ทีมเดียว = ไม่มีคำถาม
  assert.deepEqual(historicalWizardLocalIssues(filledState({ team: '' }), { ...base, ownerTeams: ['KA'] }), []);
  // สองทีมแต่ยังไม่เลือก = ถาม (บนจอมีสองชิปให้กด)
  const ask = historicalWizardLocalIssues(filledState({ team: '' }), { ...base, ownerTeams: ['KA', 'SV'] });
  assert.ok(ask.some((i) => i.field === 'team'));
  // เลือกทีมที่ผู้คีย์ไม่ได้ดูแล ทั้งที่มีทีมร่วมให้เลือกสองทีม = ยังไม่ผ่าน
  const outside = historicalWizardLocalIssues(filledState({ team: 'OD' }), {
    ...base, ownerTeams: ['KA', 'SV', 'OD'], sharedTeams: ['KA', 'SV'],
  });
  assert.ok(outside.some((i) => i.field === 'team'));
  assert.deepEqual(
    historicalWizardLocalIssues(filledState({ team: 'KA' }), { ...base, ownerTeams: ['KA', 'SV'], sharedTeams: ['KA'] }),
    [],
  );
});

/* 🪤 ทางตันที่รีวิว S8 จับได้: AC ดูแลทีมเดียว แต่ AE อยู่สองทีม ⇒ `TeamPickerField` คืน null
   (ตัวเลือกเหลือ 1) แต่คำถามเดิมนับจากจำนวนทีมของ AE ⇒ ติด {field:'team'} ถาวรโดยไม่มีช่องให้ตอบ
   ⇒ ตัวตัดสินตัวเดียวต้องตอบทั้ง "ถามไหม" และ "ช่องเป็นทรงไหน" */
test('⭐ AE หลายทีมแต่ผู้คีย์ดูแลร่วมทีมเดียว = ไม่ถาม แต่ต้องได้ทีมล็อกคืนมา (ล็อกดีกว่าซ่อน)', () => {
  const base = { role: 'ac', userId: 'USR-AC', contractFileCount: 1, evidenceFileCount: 1 };
  const narrowed = { ...base, ownerTeams: ['KA', 'SV'], sharedTeams: ['KA'] };
  assert.deepEqual(historicalWizardLocalIssues(filledState({ team: '' }), narrowed), []);
  assert.deepEqual(historicalWizardLocalIssues(filledState({ team: 'KA' }), narrowed), []);

  const field = historicalTeamField({ ownerTeams: ['KA', 'SV'], sharedTeams: ['KA'] });
  assert.deepEqual(field.options, ['KA']);
  assert.equal(field.ask, false);
  assert.equal(field.lockedTeam, 'KA', 'ต้องส่งทีมขึ้นไปเอง ไม่งั้น server ถอยไปทีมหลักของ AE');

  // ตัวเลือกจริงสองทีม = ถาม และไม่มีอะไรให้ล็อก (ช่องบนจอเป็นชิปให้เลือก)
  const open = historicalTeamField({ ownerTeams: ['KA', 'SV'], sharedTeams: [] });
  assert.deepEqual(open.options, ['KA', 'SV']);
  assert.equal(open.ask, true);
  assert.equal(open.lockedTeam, null);

  // AE อยู่ทีมเดียว = ไม่มีคำถามและไม่ต้องล็อกอะไร (server ใช้ทีมหลักของ AE ตามเดิม)
  assert.deepEqual(historicalTeamField({ ownerTeams: ['KA'] }), { options: ['KA'], ask: false, lockedTeam: null });

  /* โหมดแก้ใบ: ดีลผูกไปแล้วและ RPC แก้ใบไม่อ่านทีมเลย ⇒ ไม่ถาม ไม่ล็อกทับทีมของดีลเดิม */
  const editing = historicalTeamField({ ownerTeams: ['KA', 'SV'], sharedTeams: ['KA'], locked: true });
  assert.equal(editing.ask, false);
  assert.equal(editing.lockedTeam, null);
  assert.deepEqual(historicalWizardLocalIssues(filledState({ orderId: 'SOR-H1', team: 'SV' }), {
    ...base, ownerTeams: ['KA', 'SV', 'OD'], sharedTeams: ['KA', 'OD'],
  }), []);
});

test('VAT: ไม่เลือก = ติด (ข้อความบอกสองตัวเลือกของใบเสนอราคา) · เลือก 0 หรือ 7 = ผ่าน ไม่มีคำถามโหมดที่สาม', () => {
  const base = { role: 'ac', userId: 'USR-AC', contractFileCount: 1, evidenceFileCount: 1 };
  const none = historicalWizardLocalIssues(filledState({ vatRate: null }), base);
  const vat = none.find((i) => i.field === 'vatRate');
  assert.ok(vat);
  for (const option of QUOTE_VAT_OPTIONS) assert.ok(vat.message.includes(option.label), option.label);
  assert.ok(!none.some((i) => i.field === 'amountsIncludeVat'));
  assert.deepEqual(historicalWizardLocalIssues(filledState({ vatRate: 0 }), base), []);
  assert.deepEqual(historicalWizardLocalIssues(filledState({ vatRate: 7 }), base), []);
  /* 🪤 state ที่ยังพกโหมดรวม VAT ของรุ่นก่อน (ไทล์เก่า) — body ไม่ส่งมันแล้ว ⇒ ถ้าไม่ติดด่านจะกลายเป็น +7% เงียบ ๆ */
  const legacy = historicalWizardLocalIssues(filledState({ vatRate: 7, amountsIncludeVat: true }), base);
  assert.deepEqual(legacy.map((i) => i.field), ['vatRate']);
  assert.match(legacy[0].message, /เลิกใช้แล้ว/);
  assert.ok(!('amountsIncludeVat' in historicalWizardBody(filledState({ amountsIncludeVat: true }), {})));
  assert.deepEqual(historicalWizardLocalIssues(filledState({ vatRate: 7, amountsIncludeVat: false }), base), []);
});

/* 🐞 UAT 23/09: ช่องวันสองช่องถูกล้อมด้วย min/max ⇒ `DateInput` กลืนค่าที่พิมพ์แล้วเด้งกลับเงียบ ๆ
   ⇒ ฟอร์มรับค่าเข้ามาแล้วโชว์กฎแทน · ข้อความต้องเป็นก้อนเดียวกับที่แผนตีกลับ (ไม่งั้นมีกฎสองชุด) */
test('⭐ กฎของสองช่องวันสัญญาโชว์ที่ฟอร์มด้วยข้อความก้อนเดียวกับแผนฝั่ง server', () => {
  const at = (contract) => historicalContractDateIssues({ contract }, { todayIso: '2026-09-23' });
  /* `live: true` = ข้อของค่าที่เพิ่งพิมพ์ — ขึ้นใต้ช่องทันทีแม้ยังไม่กดไปต่อ (historicalVisibleIssues) */
  assert.deepEqual(at({ startDate: '2026-09-24', endDate: '2026-12-31' }), [
    { field: 'contract.startDate', message: CONTRACT_DATE_MESSAGES.startAfterToday, live: true },
  ]);
  assert.deepEqual(at({ startDate: '2026-01-01', endDate: '2025-12-31' }), [
    { field: 'contract.endDate', message: CONTRACT_DATE_MESSAGES.endBeforeStart, live: true },
  ], 'ก่อนวันเริ่ม ชนะ "สิ้นสุดไปแล้ว" — ลำดับเดียวกับ else-if ของแผน');
  assert.deepEqual(at({ startDate: '2026-01-01', endDate: '2026-09-22' }), [
    { field: 'contract.endDate', message: CONTRACT_DATE_MESSAGES.endBeforeToday, live: true },
  ]);
  assert.deepEqual(at({ startDate: '2026-01-01', endDate: '2026-12-31' }), [], 'ช่วงปกติไม่มีอะไรขึ้น');
  assert.deepEqual(at({ startDate: '2026-09-23', endDate: '2026-09-23' }), [], 'วันนี้พอดี = ผ่าน');
  assert.deepEqual(at({ startDate: '', endDate: '' }), [],
    'ยังไม่กรอก = ไม่ใช่กฎของค่าที่พิมพ์ (ข้อ "ต้องระบุ" อยู่ที่ historicalWizardLocalIssues และไม่ live)');
  assert.deepEqual(
    historicalContractDateIssues({ contract: { startDate: '2026-09-24', endDate: '2026-12-31' } }, {}),
    [], 'ไม่รู้วันนี้ = ไม่ตัดสินข้อที่อิงวันนี้',
  );
});

/* ⭐ ต้องไหลไปถึง local issues ด้วย ไม่งั้นปุ่ม "ถัดไป" ปล่อยผ่านแล้วไปตายที่ server
   (และด่านปุ่มบันทึกจะไม่รู้ว่าขั้น ① ยังไม่ผ่าน) */
test('⭐ วันสัญญาที่ผิดกฎติดที่ขั้น ① ของฟอร์มเอง — ไม่ต้องรอ server ตีกลับ', () => {
  const base = { role: 'ac', userId: 'USR-AC', contractFileCount: 1, evidenceFileCount: 1 };
  const future = filledState({ contract: { ...CONTRACT, startDate: '2026-09-24' } });
  const issues = historicalWizardLocalIssues(future, { ...base, todayIso: '2026-09-23' });
  assert.deepEqual(issues.map((i) => i.field), ['contract.startDate']);
  assert.equal(issuesForStep(issues, 'contract').length, 1, 'ต้องตกที่ขั้นที่มีช่องให้แก้');
  assert.deepEqual(historicalWizardLocalIssues(future, base), [], 'ไม่ส่งนาฬิกามา = เงียบไว้ ไม่เดา');
  assert.deepEqual(historicalWizardLocalIssues(filledState(), { ...base, todayIso: '2026-09-23' }), []);
});

test('ยังไม่ตอบว่าเคยเก็บเงินไหม = ติดที่ขั้นงวด (ไม่มีค่าตั้งต้นให้การตัดสินใจ)', () => {
  const issues = historicalWizardLocalIssues(filledState({ hasOpening: null }), {
    role: 'ac', userId: 'USR-AC', contractFileCount: 1,
  });
  assert.ok(issues.some((i) => i.field === 'opening'));
  assert.equal(issuesForStep(issues, 'money').length, 1);
});

/* 🪤 ทางตันที่รีวิว S8 จับได้: ใบยอด 0 บาทไม่มีงวดเลย ⇒ ขั้น ③ ซ่อนแผ่นเลือก "เคยเก็บเงินหรือยัง"
   ตารางงวด และช่องหลักฐานทั้งชุด · ถ้าคำถามยังอยู่ = ด่านใบซ้ำค้างที่ missing>0 ตลอดกาล
   และปุ่มบันทึกเด้งกลับขั้น ③ ที่ไม่มีอะไรให้กด — ใบ ฿0 บันทึกไม่ได้เลยสักใบ */
test('⭐ ใบยอด 0 บาท: เลิกถามงวดยกมา/หลักฐาน เพราะขั้น ③ ไม่มีช่องให้ตอบ', () => {
  const base = { role: 'ac', userId: 'USR-AC', contractFileCount: 1 };
  const unanswered = filledState({ hasOpening: null, installments: [] });
  assert.ok(historicalWizardLocalIssues(unanswered, base).some((i) => i.field === 'opening'));
  assert.deepEqual(historicalWizardLocalIssues(unanswered, { ...base, zeroValue: true }), []);

  /* เคยตอบว่าเก็บแล้วไว้ก่อนยอดจะกลายเป็น 0 — หลักฐานก็ต้องไม่ถูกถามที่นี่
     (ของจริงแผนตีกลับ "ใบยอด 0 บาทไม่มีงวด" ที่ช่อง installments ซึ่งมีที่ให้โชว์บนขั้น ③) */
  const answered = filledState({ hasOpening: true });
  assert.ok(historicalWizardLocalIssues(answered, base).some((i) => i.field === 'opening.evidence'));
  assert.deepEqual(historicalWizardLocalIssues(answered, { ...base, zeroValue: true }), []);

  /* ธง ฿0 ต้องไม่กลืนข้ออื่นที่ยังมีช่องให้แก้อยู่บนขั้น ① */
  const noFile = historicalWizardLocalIssues(unanswered, { ...base, contractFileCount: 0, zeroValue: true });
  assert.deepEqual(noFile.map((i) => i.field), ['contract.file']);
});

// ── ตัวช่วยของขั้น ② ③ ──────────────────────────────────────────────────────────

test('จำนวนเดือนของสัญญา: 1 ม.ค.–31 ธ.ค. = 12 เดือน · ช่วงที่อ่านไม่ออก = null', () => {
  assert.equal(contractMonths('2026-01-01', '2026-12-31'), 12);
  assert.equal(contractMonths('2026-01-01', '2026-03-31'), 3);
  assert.equal(contractMonths('2026-01-15', '2026-02-14'), 1);
  assert.equal(contractMonths('2026-12-31', '2026-01-01'), null);
  assert.equal(contractMonths('', '2026-12-31'), null);
});

/* 🐞 UAT 23/09 (เรื่องเงิน): ตัวเดิม **ปัดเดือนลง** ทั้งที่คอมเมนต์เขียนว่าคืน null
   ⇒ 1 ม.ค.–30 ธ.ค. (ขาดวันเดียว) ตอบ 11 แล้วปุ่มลัดเสนอยอด 11/12 ของของจริง
   ⇒ กติกาเดียว: ลงตัวเป็นเดือนเท่านั้นถึงจะตอบเป็นตัวเลข */
test('🪤 ช่วงที่ไม่ลงตัวเป็นเดือน = null เสมอ — ห้ามปัดลง (ยอดที่เสนอจะขาดไปทั้งเดือน)', () => {
  assert.equal(contractMonths('2026-01-01', '2026-03-15'), null, 'เดิมตอบ 2');
  assert.equal(contractMonths('2026-01-01', '2026-12-30'), null, 'เดิมตอบ 11 — ขาดวันเดียวแต่ยอดขาดทั้งเดือน');
  assert.equal(contractMonths('2026-01-01', '2026-12-31'), 12, 'ลงตัวพอดี = ตอบตามเดิม');
  assert.equal(contractMonths('2026-01-15', '2026-02-14'), 1);
  /* วันสิ้นเดือนที่เดือนถัดไปไม่มี (31 ม.ค. + 1 เดือน) — JS ล้นไปเป็น 3 มี.ค. เอง
     ⇒ ไม่ดัก = ระบบจะบอกว่า 31 ม.ค.–2 มี.ค. คือ "1 เดือน" · ถามผู้คีย์ดีกว่าเดาเรื่องเงิน */
  assert.equal(contractMonths('2026-01-31', '2026-02-28'), null);
  assert.equal(contractMonths('2026-01-31', '2026-03-02'), null, 'ห้ามให้เดือนที่ล้นนับเป็นเดือนเต็ม');
  assert.equal(contractMonths('2026-01-31', '2026-03-30'), 2, 'ขอบเดือนที่มีอยู่จริงยังนับได้');
  assert.equal(contractMonths('2026-12-31', '2026-01-01'), null, 'กลับหัวกลับหาง');
  assert.equal(contractMonths('', '2026-12-31'), null);
  assert.equal(contractMonths('2026-01-01', ''), null);
  assert.equal(contractMonths(null, null), null);
});

test('⭐ contractSpan แยก "ยังกรอกไม่ครบ" ออกจาก "กรอกครบแล้วแต่ไม่ลงตัวเป็นเดือน" · ช่วงไม่ลงตัวกระทบแค่การแบ่งงวด (มติ 23/09)', () => {
  assert.equal(CONTRACT_PARTIAL_NOTE, 'ช่วงสัญญาไม่ลงตัวเป็นเดือน — แบ่งงวดชำระเอง (ขั้น ③)');
  assert.doesNotMatch(CONTRACT_PARTIAL_NOTE, /ยอดต่อโซน/, 'ยอดของโซนไม่ได้คิดจากเดือนอีกแล้ว');
  assert.deepEqual(contractSpan('2026-01-01', '2026-12-31'), { months: 12, dated: true, partial: false, anniversary: false, monthsText: '12 เดือน', note: null });
  assert.deepEqual(contractSpan('2026-01-01', '2026-12-30'), {
    months: null, dated: true, partial: true, anniversary: false, monthsText: null, note: CONTRACT_PARTIAL_NOTE,
  });
  assert.deepEqual(contractSpan('2026-01-01', ''), { months: null, dated: false, partial: false, anniversary: false, monthsText: null, note: null });
  assert.deepEqual(contractSpan('2026-12-31', '2026-01-01'), { months: null, dated: false, partial: false, anniversary: false, monthsText: null, note: null });
});

/* 🐞 มติเจ้าของ 23/09: ปุ่มลัด "ราคาแพ็คเกจ × แพ็ค × เดือน" คูณเดือนซ้ำบนจำนวนที่นับเดือนไปแล้ว
   (1 ชุด × 12 เดือน = จำนวน 12 แล้วปุ่มเสนอ 3,500 × 12 × 12 = 504,000) ⇒ ถอดทั้งตัวเสนอยอดและตัวบอกเหตุ */
test('🚫 ไม่มีตัวเสนอยอดโซนจากเดือนอีกแล้ว', () => {
  assert.equal(intakeForm.zoneAmountSuggestion, undefined);
  assert.equal(intakeForm.zoneAmountSuggestionNote, undefined);
});

// ── ช่องต้นน้ำเปลี่ยน = ล้างปลายน้ำให้ครบ และถามก่อน ────────────────────────────────

/* 🐞 UAT 23/09 (ข้อมูลหาย): สลับลูกค้าล้างแค่ `zones` + `packageProductId` แล้ว **ทิ้งงวดไว้**
   ทั้งที่ยอดของงวดคิดมาจากโซนที่เพิ่งลบ ⇒ ขั้น ③ ค้างยอดของบรรทัดที่ไม่มีอยู่แล้ว
   และผู้คีย์ไปโผล่ที่ "ยอดงวดรวมไม่เท่ายอดใบ" โดยไม่มีใครบอกว่าทำไม
   ⭐ มติเจ้าของ 25/09: `packageProductId` ถูกถอดจาก state ทั้งตัว ⇒ ชุดที่ล้างเหลือ "รายการ (พร้อมโซนที่ผูก)" + งวด */
test('⭐ เปลี่ยนลูกค้า = ล้างรายการทุกบรรทัด (พร้อมโซนที่ผูก) **และงวดทั้งชุด** เป็นก้อนเดียว', () => {
  const reset = historicalDownstreamReset(filledState(), 'customer');
  assert.equal(reset.ask, true, 'มีของจะหาย = ต้องถามก่อน');
  assert.deepEqual(reset.patch.zones, []);
  assert.ok(!('packageProductId' in reset.patch), 'ช่องที่ถอดแล้วห้ามถูก patch กลับเข้า state (คีย์ผี)');
  assert.deepEqual(reset.patch.installments, [], 'งวดที่เหลือต้องหายไปด้วย');
  assert.equal(reset.patch.hasOpening, null, 'คำถามงวดยกมากลับไปเป็น "ยังไม่ตัดสินใจ" ไม่ใช่ false');
  assert.deepEqual(reset.patch.opening, emptyHistoricalWizard().opening);
  assert.ok(!('openingEvidence' in reset.patch), 'หลักฐานที่อยู่บนเซิร์ฟเวอร์แล้วห้ามล้างจากฟอร์ม (ไฟล์กำพร้า)');

  /* คำถามต้องพูดถึงของที่จะหายครบทุกกอง — ไม่งั้นโมดัลบอกครึ่งเดียวแล้วของหายเกินที่บอก */
  for (const piece of ['รายการ 1 บรรทัด', 'โซนที่ผูก', OPENING_INSTALLMENT_LABEL, '1 งวด']) {
    assert.ok(reset.description.includes(piece), `คำถามต้องบอกว่า "${piece}" จะหาย · ได้ "${reset.description}"`);
  }
  assert.deepEqual(reset.clears.length, 3);
  assert.doesNotMatch(reset.description, /ทุกโซน/, 'ไม่มีช่อง "แพ็คเกจที่ใช้กับทุกโซน" ให้พูดถึงแล้ว');
});

test('⭐ ฟอร์มเปล่า = ไม่ต้องถาม แต่ยังล้างให้ครบเหมือนกัน (ผู้เรียกใช้ patch ก้อนเดียวเสมอ)', () => {
  const clean = historicalDownstreamReset(emptyHistoricalWizard(), 'customer');
  assert.equal(clean.ask, false);
  assert.deepEqual(clean.clears, []);
  assert.deepEqual(clean.patch.zones, []);
  assert.deepEqual(clean.patch.installments, []);
  const onlyZones = historicalDownstreamReset(filledState({ hasOpening: null, installments: [] }), 'customer');
  assert.equal(onlyZones.ask, true);
  assert.deepEqual(onlyZones.clears, ['รายการ 1 บรรทัด (พร้อมโซนที่ผูก)']);
  /* ⭐ บรรทัดใหม่ที่ยังไม่เลือกโซน (ปุ่ม "เพิ่มรายการ") ก็นับ — จำนวน/ส่วนลดที่พิมพ์ไว้หายเหมือนกัน */
  const blankLines = historicalDownstreamReset(
    filledState({ hasOpening: null, installments: [], zones: [emptyHistoricalZone(), emptyHistoricalZone({ qty: '3' })] }),
    'customer',
  );
  assert.equal(blankLines.ask, true);
  assert.deepEqual(blankLines.clears, ['รายการ 2 บรรทัด (พร้อมโซนที่ผูก)']);
});

/* VAT เปลี่ยน = ยอดใบเปลี่ยน ⇒ งวดไม่ตรงยอดอีก · แต่ **รายการไม่หาย** (บรรทัดเป็นของที่ผู้คีย์พิมพ์เอง)
   ⭐ มติ 25/09: ช่อง VAT ย้ายลงกล่องสรุปของขั้น ② (WizardZonesStep.changeVat) — ตัวตัดสินตัวเดิม ถามแบบเดิม */
test('⭐ เปลี่ยน VAT = ล้างเฉพาะงวด · รายการ และส่วนลดท้ายใบยังอยู่', () => {
  const reset = historicalDownstreamReset(filledState({ discountType: 'percent', discountValue: '5' }), 'vat');
  assert.equal(reset.ask, true);
  assert.ok(!('zones' in reset.patch), 'รายการต้องไม่ถูกแตะ');
  assert.ok(!('discountType' in reset.patch) && !('discountValue' in reset.patch),
    'ส่วนลดท้ายใบอยู่กล่องเดียวกับ VAT แต่เป็นการตัดสินใจคนละข้อ — ห้ามล้างพ่วง');
  assert.match(reset.detail, /รายการทุกบรรทัดยังอยู่ครบ/);
  assert.deepEqual(reset.patch.installments, []);
  assert.equal(reset.patch.hasOpening, null);
  assert.match(reset.description, /ยอดใบคิดใหม่/);
  assert.equal(historicalDownstreamReset(filledState({ hasOpening: null, installments: [] }), 'vat').ask, false,
    'ยังไม่มีงวด = ไม่มีอะไรจะหาย ⇒ ไม่ต้องถาม');
});

/* วันสัญญาพิมพ์ทีละตัว ⇒ ถามไม่ได้ · แต่ต้องบอกว่าจะเกิดอะไรกับงวดที่คีย์ไว้ */
test('⭐ แก้วันสัญญา: ไม่ล้างงวดให้เอง แต่ต้องมีคำเตือนว่าต้องกลับไปตรวจขั้น ③', () => {
  assert.equal(historicalCoverageWarning(emptyHistoricalWizard()), null, 'ยังไม่มีงวด = ไม่มีอะไรต้องเตือน');
  assert.equal(historicalCoverageWarning(filledState({ hasOpening: false, installments: [] })), null);
  const warn = historicalCoverageWarning(filledState());
  assert.match(warn, new RegExp(OPENING_INSTALLMENT_LABEL));
  assert.match(warn, /1 งวด/);
  assert.match(warn, /ขั้น ③/);
  assert.ok(!/ล้าง(?!ให้เอง)/.test(warn.replace('ไม่ถูกล้าง', '')), 'ต้องไม่สัญญาว่าจะล้างให้');
  /* ⭐ 25/09 ห่วงโซ่: งวดแรก/งวดสุดท้ายขยับตามสัญญาเอง — คำเตือนต้องไม่บอกให้ผู้คีย์ไล่แก้ช่วงเองทั้งตาราง */
  assert.match(warn, /งวดแรกเริ่มและงวดสุดท้ายจบตามสัญญาให้เอง/);
  assert.doesNotMatch(warn, /ต้องเต็มสัญญาพอดี/);
  assert.equal(historicalCoverageWarning(filledState({ openingFull: true })), null, 'จ่ายครบทั้งใบครอบตามสัญญาเอง — ไม่มีอะไรต้องเตือน');
});

// ── ทะเบียนไซต์/โซนของขั้น ② (ของจริง 26 ไซต์ 43 โซน) ────────────────────────────────
// ⭐ มติเจ้าของ 25/09: การ์ดไซต์ + ติ๊กโซน + ช่องค้นบนขั้น ถูกถอด ⇒ `historicalZoneBrowser` เหลือสองงาน:
//    ตัวกางทะเบียนของหน้าต่าง "เพิ่มหลายโซน" (ค้น → ติ๊ก) และตัวตัดสินกองกำพร้า/อ่านไม่ได้ของขั้น ② (R10 · N1)

const site = (id, code, name) => ({ id, code, name });
const zone = (id, code, name, extra = {}) => ({ id, code, name, ...extra });
const BROWSE = {
  sites: [
    site('ST-1', 'ST-1002', 'สยามพารากอน'),
    site('ST-2', 'ST-1044', 'สยามดิสคัฟเวอรี่'),
    site('ST-3', 'ST-2050', 'เซ็นทรัล ลาดพร้าว'),
    site('ST-4', 'ST-2051', 'เซ็นทรัล พระราม 9'),
    site('ST-5', 'ST-2052', 'ท็อปส์ สุขุมวิท'),
  ],
  zonesBySite: {
    'ST-1': [zone('Z-1', 'Z-1002-01', 'ชั้น G ล็อบบี้'), zone('Z-2', 'Z-1002-02', 'ชั้น M ทางเชื่อม BTS')],
    'ST-2': [zone('Z-3', 'Z-1044-01', 'ทางเข้าหลัก')],
    'ST-3': [zone('Z-4', 'Z-2050-01', 'ล็อบบี้ชั้น 1')],
    'ST-4': [zone('Z-5', 'Z-2051-01', 'ทางเข้าหลัก')],
    'ST-5': [],
  },
};

test('⭐ ค้นคำเดียวเจอทั้งรหัสไซต์ ชื่อไซต์ ชื่อโซน และรหัสโซน (กฎ search haystack)', () => {
  const only = (query) => historicalZoneBrowser({ ...BROWSE, query }).rows.map((r) => r.site.id);
  assert.deepEqual(only('ST-1044'), ['ST-2'], 'รหัสไซต์');
  assert.deepEqual(only('พารากอน'), ['ST-1'], 'ชื่อไซต์');
  assert.deepEqual(only('ล็อบบี้'), ['ST-1', 'ST-3'], 'ชื่อโซนข้ามไซต์');
  assert.deepEqual(only('z-2050-01'), ['ST-3'], 'รหัสโซน · ไม่สนตัวพิมพ์');
  assert.deepEqual(only('ทางเข้าหลัก'), ['ST-2', 'ST-4']);
  assert.deepEqual(only('ไม่มีคำนี้'), []);

  /* ไซต์ที่ตรงชื่อ/รหัสกางทั้งใบ · ไซต์ที่ตรงเฉพาะบางโซนโชว์เฉพาะโซนนั้น */
  const byName = historicalZoneBrowser({ ...BROWSE, query: 'พารากอน' });
  assert.deepEqual(byName.rows[0].zones.map((z) => z.id), ['Z-1', 'Z-2']);
  const byZone = historicalZoneBrowser({ ...BROWSE, query: 'ล็อบบี้' });
  assert.deepEqual(byZone.rows[0].zones.map((z) => z.id), ['Z-1'], 'โซนที่ไม่ตรงในไซต์เดียวกันถูกซ่อน');
  assert.equal(byZone.shownZones, 2);
  assert.equal(byZone.siteTotal, 5);
  /* จำนวนไซต์ที่คำค้นซ่อน = `siteTotal − rows.length` (ที่นี่ 3) — จอบอกเลขคู่นี้อยู่แล้วที่บรรทัด
     "แสดง N จาก M ไซต์" ⇒ ของเดิมมีคีย์ `hiddenSites` คู่กันด้วย แต่ไม่มีใครอ่าน ⇒ ถอดออก 23/09
     (คีย์ที่ไม่มีใครอ่าน = ของที่รอเพี้ยนจากจอ แล้วไม่มีอะไรบนจอฟ้อง) */
  assert.equal(byZone.rows.length, 2);
  assert.ok(!('hiddenSites' in byZone), 'ผลลัพธ์ต้องไม่มีคีย์ที่ไม่มีใครอ่าน');
  assert.equal(byZone.zoneTotal, 5, 'จำนวนโซนทั้งทะเบียนไม่ขึ้นกับคำค้น');
});

/* 🪤 ยอดรวมท้ายจอนับโซนที่ติ๊กไว้ทุกโซน ⇒ โซนที่ถูกคำค้นซ่อนต้องถูกนับมาบอก */
test('⭐ โซนที่เลือกไว้แล้วแต่คำค้นซ่อน ต้องถูกรายงานกลับมา', () => {
  const picked = ['Z-1', 'Z-4'];
  const hit = historicalZoneBrowser({ ...BROWSE, query: 'ทางเข้าหลัก', pickedZoneIds: picked });
  assert.equal(hit.hiddenPicked, 2, 'ทั้งโซนของไซต์ที่หายทั้งใบ และโซนที่ถูกกรองในไซต์ที่ยังโชว์');
  assert.equal(historicalZoneBrowser({ ...BROWSE, pickedZoneIds: picked }).hiddenPicked, 0, 'ไม่ค้น = ไม่ซ่อนอะไร');
  const partial = historicalZoneBrowser({ ...BROWSE, query: 'ชั้น M', pickedZoneIds: ['Z-1'] });
  assert.deepEqual(partial.rows.map((r) => r.site.id), ['ST-1']);
  assert.equal(partial.hiddenPicked, 1, 'โซนที่เลือกไว้ในไซต์ที่ยังโชว์อยู่ แต่ถูกกรองออกจากตาราง');
});

/* 🐞 ของเดิมใช้ `Promise.all` ก้อนเดียว ⇒ ไซต์เดียวพัง = ลิสต์ว่างทั้งจอ
   ⭐ มติ 25/09: ไม่มีการ์ดให้กาง/พับแล้ว — แถวของไซต์ที่พังในหน้าต่าง "เพิ่มหลายโซน" พูดเหตุเอง และปุ่ม
   "ลองอ่านไซต์ที่พังอีกครั้ง" อยู่บนก้อนเตือนของขั้น ② (ไม่ได้ซ่อนอยู่ในการ์ดที่ต้องกางก่อนอีกแล้ว) */
test('⭐ ไซต์ที่โหลดโซนไม่สำเร็จมีแถวของตัวเอง (พร้อมเหตุ) · ไซต์ที่เหลือใช้งานได้ปกติ', () => {
  const broken = historicalZoneBrowser({
    ...BROWSE,
    zonesBySite: { ...BROWSE.zonesBySite, 'ST-2': [] },
    siteErrors: { 'ST-2': 'โหลดโซนของไซต์ ST-1044 ไม่สำเร็จ' },
  });
  assert.equal(broken.rows.length, 5, 'ไซต์ที่พังไม่ทำให้ใบอื่นหาย');
  const row = broken.rows.find((r) => r.site.id === 'ST-2');
  assert.equal(row.error, 'โหลดโซนของไซต์ ST-1044 ไม่สำเร็จ');
  assert.deepEqual(row.zones, [], 'ไซต์ที่อ่านไม่ได้ไม่มีโซนให้ติ๊ก — ไม่ใช่ "ไม่มีโซน"');
  assert.ok(!('defaultOpen' in row), 'ไม่มีการ์ดให้กางแล้ว — คีย์ที่ไม่มีใครอ่านคือของที่รอเพี้ยนจากจอ');
  assert.deepEqual(broken.rows.find((r) => r.site.id === 'ST-1').zones.map((z) => z.id), ['Z-1', 'Z-2']);

  /* ค้นอยู่ก็ยังต้องโชว์ — ยังไม่รู้ว่าข้างในมีโซนที่ตรงคำค้นไหม การซ่อนคือการตอบแทนข้อมูลที่ไม่มี */
  const searching = historicalZoneBrowser({
    ...BROWSE,
    siteErrors: { 'ST-2': 'พัง' },
    query: 'พารากอน',
  });
  assert.deepEqual(searching.rows.map((r) => r.site.id), ['ST-1', 'ST-2']);
});

/* 🐞 UAT 23/09: AR-374 มี 26 ไซต์ — การ์ด 26 ใบกางรวดเลื่อนหาไม่ไหว (ของเดิมแก้ด้วยการพับ + เพดานกางอัตโนมัติ)
   ⭐ มติเจ้าของ 25/09: การ์ดถูกถอดทั้งชุด (ZONE_SITE_AUTO_OPEN_MAX / defaultOpen หายไปด้วย) ⇒ ความต้องการเดิม
   "26 ไซต์ต้องหาไหว" ย้ายไปอยู่ที่ **ช่อง "ไซต์ · โซน" ในบรรทัด** (ค้นคำเดียว · หัวกลุ่มต่อไซต์) และหน้าต่าง
   "เพิ่มหลายโซน" (ค้นแล้วเหลือไซต์เดียว) — ยามตัวนี้ตรึงสองทางนั้นแทน */
test('⭐ ลูกค้าไซต์เยอะ (26 ไซต์ของจริง): หาโซนได้ด้วยคำค้นเดียว ทั้งในช่องของบรรทัดและในหน้าต่างเพิ่มหลายโซน', () => {
  const many = Array.from({ length: 26 }, (_, i) => site(`ST-${i}`, `ST-30${i}`, `สาขา ${i}`));
  const zonesBySite = Object.fromEntries(many.map((s, i) => [s.id, [zone(`Z-${i}`, `Z-30${i}-01`, 'ล็อบบี้')]]));

  const options = historicalZonePickerOptions({ sites: many, zonesBySite, rows: [], rowKey: null });
  assert.equal(options.filter((o) => o.group).length, 26, 'หัวกลุ่มหนึ่งหัวต่อไซต์ — รู้ว่าโซนไหนของสาขาไหน');
  assert.equal(options.filter((o) => !o.group).length, 26);
  /* ทุกโซนชื่อ "ล็อบบี้" เหมือนกันหมด ⇒ ต้องค้นด้วยรหัสไซต์ได้ ไม่งั้นเลือกผิดสาขาเงียบ ๆ */
  const byCode = options.filter((o) => !o.group && o.search.includes('st-307'));
  assert.deepEqual(byCode.map((o) => o.value), ['Z-7']);
  assert.equal(byCode[0].label, 'ST-307 สาขา 7 · ล็อบบี้', 'ป้ายบนช่องที่ปิดอยู่บอกสาขา ไม่ใช่แค่ "ล็อบบี้"');

  const big = historicalZoneBrowser({ sites: many, zonesBySite, query: 'ST-307', pickedZoneIds: ['Z-7'] });
  assert.deepEqual(big.rows.map((r) => r.site.id), ['ST-7'], 'หน้าต่างเพิ่มหลายโซนค้นแล้วเหลือไซต์เดียว');
  assert.equal(big.rows[0].picked, 1);
  assert.ok(historicalZoneBrowser({ sites: many, zonesBySite }).rows.every((r) => !('defaultOpen' in r)),
    'ไม่มีการ์ดให้พับแล้ว — ห้ามคืนธงที่ไม่มีใครอ่าน');
  assert.equal(intakeForm.ZONE_SITE_AUTO_OPEN_MAX, undefined, 'เพดานกางอัตโนมัติถูกถอดพร้อมการ์ด');
});

/* 🐞 ของเดิม (`splitRemaining` → `splitCoverageEvenly`) หารจำนวนวันเท่ากัน ⇒ 1 ม.ค.–31 ธ.ค. แบ่ง 12 ได้ 01/01–30/01 · 31/01–01/03 …
   (SO-26090232-0 ลงฐานไปแบบนั้น) · หลังมีงวดยกมายังแบ่งเป็น "จำนวนเดือนของทั้งสัญญา" ⇒ มติ 25/09: เดือนปฏิทินของช่วงที่เหลือ */
test('⭐ แบ่งงวดอัตโนมัติ: เดือนปฏิทินของช่วงที่เหลือ · ผลรวมเท่ายอดเป๊ะ · ต่อเนื่อง · เศษสตางค์ลงงวดสุดท้าย', () => {
  const pv = intakeForm.historicalSplitPreview({
    from: '2026-04-01', to: '2026-12-31', amount: 67410, period: '1', dueRule: 'start', todayIso: '2026-09-25',
  });
  assert.equal(pv.blocked, null);
  assert.equal(pv.count, 9, 'ช่วงที่เหลือ 9 เดือน = 9 งวด (ไม่ใช่ 12 ของทั้งสัญญา)');
  assert.deepEqual(pv.rows.slice(0, 2).map((row) => [row.coversFrom, row.coversTo]),
    [['2026-04-01', '2026-04-30'], ['2026-05-01', '2026-05-31']], 'ตรงเดือนปฏิทิน ไม่ใช่ก้อนละ 30 วัน');
  assert.equal(pv.rows[8].coversTo, '2026-12-31');
  assert.ok(coverageIsContinuous(pv.rows, { start: '2026-04-01', end: '2026-12-31' }));
  assert.equal(pv.rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0), 6741000);
  assert.equal(pv.overdue, 6, 'ครบกำหนด 01/04–01/09 เลยวันนี้ (25/09) แล้ว');
  assert.equal(intakeForm.historicalSplitConsequence(pv), 'จะสร้าง 9 งวด งวดละ ฿7,490.00');
  assert.equal(intakeForm.historicalSplitConsequence(pv, { replacing: 2 }), 'จะสร้าง 9 งวด งวดละ ฿7,490.00 · แทนที่งวดที่คีย์ไว้ 2 งวด');

  const odd = intakeForm.historicalSplitPreview({ from: '2026-10-01', to: '2026-12-31', amount: 100, period: '1', dueRule: 'start' });
  assert.deepEqual(odd.rows.map((row) => row.amount), [33.33, 33.33, 33.34], 'เศษสตางค์ลงงวดสุดท้าย');
  assert.equal(intakeForm.historicalSplitConsequence(odd), 'จะสร้าง 3 งวด งวดละ ฿33.33 · งวดสุดท้าย ฿33.34');

  const once = intakeForm.historicalSplitPreview({ from: '2026-10-16', to: '2026-12-31', amount: 500, period: 'once', dueRule: 'start' });
  assert.deepEqual(once.rows.map((row) => [row.label, row.coversFrom, row.coversTo, row.amount]),
    [['ชำระครั้งเดียว', '2026-10-16', '2026-12-31', 500]], 'ก้อนเดียวใช้ได้เสมอ แม้ช่วงไม่ลงตัวเป็นเดือน');
});

test('⭐ แบ่งงวด: ตัวเลือกที่แบ่งไม่ลงตัวโชว์พร้อมเหตุ (ไม่ซ่อน) · ไม่มีค่าตั้งต้น · ช่วงไม่ลงตัวเหลือก้อนเดียว', () => {
  const nine = intakeForm.historicalSplitOptions({ from: '2026-04-01', to: '2026-12-31' });
  assert.deepEqual(nine.options.map((option) => [option.value, option.count, option.disabled]), [
    ['once', 1, false], ['1', 9, false], ['3', 3, false], ['6', null, true], ['12', null, true],
  ]);
  assert.equal(nine.options[3].reason, 'ช่วงที่เหลือ 9 เดือน แบ่งไม่ลงตัว');
  assert.match(nine.note, /^ทุก 6 เดือน · ทุกปี: /);
  const partial = intakeForm.historicalSplitOptions({ from: '2026-04-16', to: '2026-12-31' });
  assert.deepEqual(partial.options.filter((option) => !option.disabled).map((option) => option.value), ['once']);
  assert.match(partial.note, /ไม่ลงตัวเป็นเดือน — ใช้ “ก้อนเดียว” หรือกด “เพิ่มงวด”/);
  /* ไม่เลือกรอบ/วันครบกำหนด = ยังสร้างไม่ได้ พร้อมเหตุ (ไม่เดาแทนผู้คีย์) */
  const base = { from: '2026-04-01', to: '2026-12-31', amount: 900 };
  assert.equal(intakeForm.historicalSplitPreview(base).blocked, 'เลือกรอบการเก็บเงินก่อน');
  assert.equal(intakeForm.historicalSplitPreview({ ...base, period: '1' }).blocked, 'เลือกวันครบกำหนดก่อน');
  assert.equal(intakeForm.historicalSplitPreview({ ...base, period: '1', dueRule: 'day' }).blocked, 'ใส่วันที่ครบกำหนด 1–31');
  assert.equal(intakeForm.historicalSplitPreview({ ...base, amount: 0, period: '1', dueRule: 'start' }).blocked,
    'ยอดที่เหลือเป็น 0 — ไม่มีอะไรให้แบ่งเป็นงวด');
  assert.equal(intakeForm.historicalSplitPreview({ ...base, period: '6', dueRule: 'start' }).blocked, 'ช่วงที่เหลือ 9 เดือน แบ่งไม่ลงตัว');
});

/* ⭐ มติเจ้าของ 25/09 ข้อ 3: สัญญาที่จบตรงวันครบรอบ (28 จาก 81 กลุ่มในชีต) แบ่งได้ — งวดสุดท้ายยาวขึ้นหนึ่งวัน */
test('⭐ สัญญาจบตรงวันครบรอบ: นับเป็น n เดือน · แบ่งทุกเดือน/3/6/รายปีได้ · งวดสุดท้ายยาวขึ้นหนึ่งวัน', () => {
  assert.deepEqual(intakeForm.serviceMonthSpan('2025-09-25', '2026-09-25'), { months: 12, extraDay: true });
  assert.deepEqual(intakeForm.serviceMonthSpan('2026-01-01', '2026-12-31'), { months: 12, extraDay: false });
  assert.equal(intakeForm.serviceMonthSpan('2026-01-01', '2026-12-30'), null);
  assert.equal(contractMonths('2025-09-25', '2026-09-25'), null, 'contractMonths ยังเคร่งเหมือนเดิม — ข้อยกเว้นอยู่ที่ serviceMonthSpan');
  const span = contractSpan('2025-09-25', '2026-09-25');
  assert.deepEqual([span.months, span.partial, span.anniversary, span.note], [12, false, true, null]);
  const pv = intakeForm.historicalSplitPreview({
    from: '2025-09-25', to: '2026-09-25', amount: 12000, period: '3', dueRule: 'start',
  });
  assert.deepEqual(pv.rows.map((row) => [row.coversFrom, row.coversTo]), [
    ['2025-09-25', '2025-12-24'], ['2025-12-25', '2026-03-24'], ['2026-03-25', '2026-06-24'], ['2026-06-25', '2026-09-25'],
  ]);
  assert.match(intakeForm.historicalSplitOptions({ from: '2025-09-25', to: '2026-09-25' }).note, /งวดสุดท้ายยาวขึ้น 1 วัน/);
});

/* ชีตจริงใช้วันครบกำหนดสามแบบ: วันเริ่มงวด · วันที่คงที่ (Jim Thompson ทุกวันที่ 25) · สิ้นเดือน (SO-26090232-0 แก้เองทั้ง 12 งวด) */
test('⭐ วันครบกำหนดสี่แบบ: วันเริ่มงวด · สิ้นเดือน · ทุกวันที่ n (เดือนสั้นใช้สิ้นเดือน) · กรอกเอง = ว่าง', () => {
  const at = (dueRule, dueDay = '') => intakeForm.historicalSplitPreview({
    from: '2026-01-26', to: '2026-04-25', amount: 300, period: '1', dueRule, dueDay,
  }).rows.map((row) => row.dueDate);
  assert.deepEqual(at('start'), ['2026-01-26', '2026-02-26', '2026-03-26']);
  assert.deepEqual(at('monthEnd'), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.deepEqual(at('day', '25'), ['2026-02-25', '2026-03-25', '2026-04-25'], 'วันแรกที่ตรงวันที่ 25 นับจากวันเริ่มงวด');
  assert.deepEqual(at('day', '31').slice(0, 2), ['2026-01-31', '2026-02-28'], 'เดือนที่ไม่มีวันที่ 31 ใช้สิ้นเดือน');
  assert.deepEqual(at('manual'), ['', '', ''], 'กรอกเอง = ว่าง (ช่องบังคับ ต้องกรอกในตาราง)');
  const rows = intakeForm.historicalSplitRows(intakeForm.historicalSplitPreview({
    from: '2026-01-26', to: '2026-04-25', amount: 300, period: '1', dueRule: 'start',
  }));
  assert.deepEqual(rows.map((row) => [row.label, row.amount]), [['งวด 1/3', '100.00'], ['งวด 2/3', '100.00'], ['งวด 3/3', '100.00']]);
  assert.ok(rows.every((row) => row.key), 'แถวใหม่มี key ของตัวเอง');
});

// ── ③ ลำดับการบันทึก ────────────────────────────────────────────────────────────

test('⭐ ลำดับเต็ม: persist → contractFiles → evidence → persistEvidence → submit', () => {
  let progress = emptySaveProgress({ orderId: null, pendingContractFiles: 2, pendingEvidence: 1 });
  const seen = [];
  for (let guard = 0; guard < 10; guard += 1) {
    const stage = nextSaveStage(progress);
    if (!stage) break;
    seen.push(stage);
    progress = saveProgressAfter(progress, stage, { orderId: 'SOR-H1' });
  }
  assert.deepEqual(seen, ['persist', 'contractFiles', 'evidence', 'persistEvidence', 'submit']);
  assert.equal(nextSaveStage(progress), null);
});

test('⭐ ไม่มีไฟล์ใหม่ = ข้ามทั้งขาอัปและการแก้ใบรอบสอง (ref เดิมไปกับจังหวะแรกแล้ว)', () => {
  let progress = emptySaveProgress({ orderId: 'SOR-H1', pendingContractFiles: 0, pendingEvidence: 0 });
  assert.equal(nextSaveStage(progress), 'persist');
  progress = saveProgressAfter(progress, 'persist');
  assert.equal(nextSaveStage(progress), 'submit');
});

/* 🐞 กดใหม่หลังพังกลางทางต้องไม่อัปไฟล์ซ้ำ (retry-must-not-reupload) — ผู้เรียกนับเฉพาะไฟล์ที่ยังไม่มี ref */
test('⭐ กดใหม่หลังล้มที่ขาส่งอนุมัติ: เริ่มที่ persist ใหม่ แต่ไม่อัปไฟล์ซ้ำ', () => {
  let progress = emptySaveProgress({ orderId: 'SOR-H1', pendingContractFiles: 1, pendingEvidence: 1 });
  for (const stage of ['persist', 'contractFiles', 'evidence', 'persistEvidence']) {
    progress = saveProgressAfter(progress, stage, { orderId: 'SOR-H1' });
  }
  assert.equal(nextSaveStage(progress), 'submit', 'ล้มที่ส่งอนุมัติ = กดใหม่แล้วกลับมาที่ขาเดิม');
  // ผู้คีย์แก้ฟอร์มแล้วกดใหม่ = เริ่มรอบใหม่ แต่ไฟล์ที่อัปแล้วนับเป็น 0 ที่ค้าง
  const retry = emptySaveProgress({ orderId: 'SOR-H1', pendingContractFiles: 0, pendingEvidence: 0 });
  const order = [];
  let cursor = retry;
  for (let guard = 0; guard < 10; guard += 1) {
    const stage = nextSaveStage(cursor);
    if (!stage) break;
    order.push(stage);
    cursor = saveProgressAfter(cursor, stage);
  }
  assert.deepEqual(order, ['persist', 'submit'], 'ไม่มี contractFiles/evidence ซ้ำอีกรอบ');
});

/* 🔴 ใบที่ถูกตีกลับต้องผ่าน persist ก่อนเสมอ — ด่านอัปหลักฐานการชำระไม่รับใบสถานะ 'rejected'
   และ RPC แก้ใบพลิกใบกลับเป็นร่างให้ ⇒ สลับลำดับ = อัปหลักฐานไม่ผ่านทุกครั้ง */
test('⭐ ใบที่ถูกตีกลับ: หลักฐานไม่มีทางถูกอัปก่อน persist', () => {
  const progress = emptySaveProgress({ orderId: 'SOR-H1', pendingContractFiles: 0, pendingEvidence: 3 });
  assert.equal(nextSaveStage(progress), 'persist');
  assert.equal(nextSaveStage(saveProgressAfter(progress, 'persist')), 'evidence');
});

test('⭐ หลังสร้างสำเร็จ รอบถัดไปจำ orderId ไว้ ⇒ ผู้เรียกใช้ทางแก้ใบ ไม่ใช่สร้างซ้ำ', () => {
  let progress = emptySaveProgress({ orderId: null, pendingContractFiles: 1, pendingEvidence: 0 });
  assert.equal(progress.orderId, null);
  progress = saveProgressAfter(progress, 'persist', { orderId: 'SOR-Hnew' });
  assert.equal(progress.orderId, 'SOR-Hnew');
  assert.equal(progress.persisted, true);
});

// ── ④ ทางออกตอนบันทึกไม่สำเร็จ ──────────────────────────────────────────────────

const apiError = (status, data) => Object.assign(new Error(data?.error || 'x'), { status, data });

test('⭐ รหัสการคีย์ชนใบเดิม: เสนอ "เปิดใบที่สร้างไว้ในฟอร์มแก้ไข" พร้อม id ที่ server คำนวณ', () => {
  const exit = historicalSaveExit(apiError(409, {
    code: 'historical_so_intake_key_conflict', error: 'รหัสการคีย์นี้ถูกใช้แล้ว', orderId: 'SOR-Habc',
  }));
  assert.equal(exit.kind, 'intake_key_conflict');
  assert.equal(exit.existingOrderId, 'SOR-Habc');
  assert.equal(exit.canOpenExisting, true);
  assert.equal(exit.canRetry, false, 'กดซ้ำก้อนเดิมจะชนอีกทุกครั้ง');
  const view = historicalSaveResultView(exit);
  assert.equal(view.action.key, 'open');
  assert.equal(view.action.orderId, 'SOR-Habc');
});

test('ชนการหาดีลภาชนะ = ยังไม่มีอะไรลงฐาน ⇒ กดใหม่ได้เลย (คนละคำกับเน็ตหลุด)', () => {
  const exit = historicalSaveExit(apiError(409, { code: 'historical_so_container_deal_race', error: 'ชนกัน' }));
  assert.equal(exit.kind, 'container_deal_race');
  assert.equal(exit.canRetry, true);
  assert.match(exit.hint, /ยังไม่มีอะไรลงฐาน/);
});

test('⭐ ใบซ้ำ: กลับไปขั้น ④ พร้อมรายการใหม่และสวิตช์ปิด — ไม่ใช่จอ "บันทึกไม่สำเร็จ"', () => {
  const exit = historicalSaveExit(apiError(409, {
    code: 'historical_so_duplicate_unacknowledged', error: 'พบใบที่อาจซ้ำ',
    duplicates: [{ id: 'SOR-H9', orderNumber: 'SO-1' }],
  }));
  assert.equal(exit.kind, 'duplicate');
  /* ไม่มีทางออกให้กด — ฟอร์มรีเฟรชการ์ดใบที่อาจซ้ำ ปิดสวิตช์ แล้วอยู่ขั้น ④ (catch ของ runSave · ตรึงที่ historicalRegisterUi) */
  assert.deepEqual([exit.canRetry, exit.canEdit, exit.canOpenExisting], [false, false, false]);
  assert.equal(exit.goToStep, 'review');
  assert.equal(exit.duplicates.length, 1);
});

test('400 พร้อม errors[] = กลับไปแก้ที่ขั้นแรกที่มีปัญหา · ไม่มี errors[] ก็ยังพกข้อความไปด้วย', () => {
  const withFields = historicalSaveExit(apiError(400, {
    error: 'ต้องเลือกอย่างน้อย 1 โซน', errors: [{ field: 'zones', message: 'ต้องเลือกอย่างน้อย 1 โซน' }],
  }));
  assert.equal(withFields.goToStep, 'zones');
  /* แผงบันทึกบอกขั้นที่พาไป + ข้อที่ต้องแก้อยู่ในก้อนแดงของขั้นนั้น (ไม่ซ้ำข้อความ) · ไม่มีปุ่ม — ฟอร์มพาไปแล้ว */
  const fieldsView = historicalSaveResultView(withFields, { currentStep: 'zones' });
  assert.match(fieldsView.title, /ขั้น ② .* มี 1 ข้อต้องแก้/);
  assert.equal(fieldsView.action, null);
  const plain = historicalSaveExit(apiError(400, { error: 'ยอดงวดรวมไม่เท่ายอดใบ' }));
  assert.equal(plain.goToStep, 'contract');
  /* ไม่มี errors[] = ข้อความของ server คือเหตุผลเดียว ⇒ พกไปในแผงบันทึก (รอดการพาไปขั้นอื่น) */
  assert.match(historicalSaveResultView(plain, { currentStep: 'contract' }).body, /ยอดงวดรวมไม่เท่ายอดใบ/);
});

test('🔴 รหัสอื่นของ 409/500 ห้ามเสนอ "บันทึกอีกครั้ง" — ก้อนเดิมได้รหัสเดิมวนไม่รู้จบ', () => {
  const exit = historicalSaveExit(apiError(409, { code: 'workflow_stale', error: 'เอกสารถูกเปลี่ยน' }));
  assert.equal(exit.canRetry, false);
  assert.equal(exit.canEdit, true);
  /* ทางออกเดียวคือโหลดใบล่าสุด (ใบถูกแก้จากที่อื่น) — ไม่มี "บันทึกอีกครั้ง" */
  assert.equal(historicalSaveResultView(exit).action.key, 'reload');
});

test('เน็ตหลุด / 5xx = อาจลงฐานไปแล้ว ⇒ กดซ้ำได้ (ระบบจำใบและไฟล์ที่ทำไปแล้ว)', () => {
  const offline = historicalSaveExit(Object.assign(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'), { status: 0 }));
  assert.equal(offline.canRetry, true);
  assert.match(offline.hint, /ไม่เกิดใบซ้ำหรืออัปไฟล์ซ้ำ/);
  assert.equal(historicalSaveExit(apiError(500, { error: 'พัง' })).canRetry, true);
  assert.equal(historicalSaveExit(apiError(403, { error: 'ไม่มีสิทธิ์' })).kind, 'forbidden');
  assert.equal(historicalSaveExit(apiError(503, { error: 'ยังไม่ได้รัน 0374' })).kind, 'schema');
});

// ── ด่านก่อนกดบันทึก ────────────────────────────────────────────────────────────

test('⭐ ด่านของปุ่มบันทึก: ใบซ้ำที่ยังไม่ยืนยัน และช่องที่ยังขาด ต่างกันคนละข้อความ', () => {
  const clean = historicalDuplicateGate({ duplicates: [], acknowledged: false });
  assert.equal(clean.gated, false);
  assert.equal(clean.blockedNote, null);

  const dup = historicalDuplicateGate({ duplicates: [{ id: 'x' }], acknowledged: false });
  assert.equal(dup.gated, true);
  assert.match(dup.blockedNote, /ใบที่อาจซ้ำ/);
  assert.equal(historicalDuplicateGate({ duplicates: [{ id: 'x' }], acknowledged: true }).gated, false);

  const missing = historicalDuplicateGate({ localIssues: [{ field: 'contract.file' }, { field: 'opening.evidence' }] });
  assert.equal(missing.gated, true);
  assert.match(missing.blockedNote, /ยังมี 2 ข้อที่ต้องแก้/);
  /* 🐞 UAT 23/09: คำว่า "ยังกรอกไม่ครบ N ข้อ" อ่านเป็นคำสัญญาว่าเหลือแค่ N ช่อง ทั้งที่ N นับ
     เฉพาะข้อที่จอตรวจเองได้ (ช่องบังคับที่เหลือเป็นหน้าที่ของพรีวิว) */
  assert.doesNotMatch(missing.blockedNote, /ยังกรอกไม่ครบ/);
});

// ── ⑤ เปลือกของฟอร์ม: ทางตันของปุ่ม · รางที่โกหก · แถบสรุปที่ค้างอยู่ในอดีต (UAT 23/09) ──────

/* 🐞 ของเดิม: `if (issuesForStep(localIssues, from).length) { setIssues([]); return; }`
   = กด "ถัดไป" แล้ว **ไม่มีอะไรเกิดขึ้นบนจอเลย** (ซ้ำยังล้าง error ของ server ทิ้ง)
   ⇒ ตัวตัดสินต้องตอบได้ว่า "ติดข้อไหน · ช่องไหน · ข้อความว่าอะไร" ให้ผู้เรียกพาไปหา */
test('🐞 "ถัดไป" ที่ติดด่าน ต้องบอกได้ว่าติดช่องไหน — ไม่ใช่คืนเงียบ ๆ', () => {
  /* ฟอร์มเปล่า: ข้อแรกของขั้น = ช่องแรกบนจอ (ลูกค้า) — ปุ่มพาไปที่นั่น */
  const blank = historicalNextBlock(historicalWizardLocalIssues(emptyHistoricalWizard(), { contractFileCount: 0 }), 'contract');
  assert.equal(blank.field, 'customerId');
  assert.equal(blank.anchorId, historicalFieldAnchorId('customerId'));

  const state = filledState({ vatRate: 7, hasOpening: null });
  const stuck = historicalNextBlock(historicalWizardLocalIssues(state, { contractFileCount: 0 }), 'contract');
  assert.equal(stuck.blocked, true);
  assert.equal(stuck.field, 'contract.file', 'ไฟล์เอกสารแทนสัญญาคือตัวบล็อกที่เหลืออยู่');
  assert.equal(stuck.anchorId, historicalFieldAnchorId('contract.file'));
  assert.match(stuck.message, /ไฟล์เอกสาร/);

  const free = historicalNextBlock(historicalWizardLocalIssues(state, { contractFileCount: 1 }), 'contract');
  assert.equal(free.blocked, false);
  assert.equal(free.field, null);
  assert.equal(free.anchorId, null);

  /* ข้อของขั้น ③ ต้องไม่บล็อกขั้น ① (ไม่งั้นเดินไปกรอกไม่ได้เลยสักขั้น) */
  const money = historicalNextBlock(historicalWizardLocalIssues(state, { contractFileCount: 1 }), 'money');
  assert.equal(money.blocked, true);
  assert.equal(money.field, 'opening');
});

test('⭐ จุดยึดของช่อง: คำถามเดียวกันบนจอ = id เดียวกัน · ช่องคนละใบ = คนละ id', () => {
  /* VAT ของใบคือช่องเลือกช่องเดียว — ทั้งข้อที่จอตรวจเองและข้อที่ server ตีกลับ (รวมโหมดรุ่นก่อน) ตกที่ vatRate
     ⭐ มติ 25/09: ช่องนั้นอยู่ในกล่องสรุปของขั้น ② (`QuoteLineTotalsEditor` vatId) · ส่วนลดท้ายใบได้จุดยึดของตัวเอง (discountId) */
  assert.equal(historicalFieldAnchorId('vatRate'), 'hist-f-vat');
  assert.equal(stepOfField('vatRate'), 'zones');
  assert.equal(historicalFieldAnchorId('discount'), 'hist-f-discount');
  assert.equal(stepOfField('discount'), 'zones');
  assert.notEqual(historicalFieldAnchorId('discount'), historicalFieldAnchorId('vatRate'), 'สองช่องในกล่องเดียวกัน = คนละ id');
  assert.notEqual(historicalFieldAnchorId('contract.file'), historicalFieldAnchorId('opening.evidence'));
  assert.match(historicalFieldAnchorId('contract.file'), /^hist-f-[a-z0-9-]+$/);
  assert.equal(historicalFieldAnchorId(''), null);
  assert.equal(historicalFieldAnchorId(null), null);
});

/* 🐞 รางเดิมส่ง `count: { filled: stepIssues ? 0 : 1, total: 1 }` ⇒ ขั้นที่ error มาจากพรีวิว
   (โซน · ตรวจและส่งอนุมัติ) ขึ้น "1/1" ตั้งแต่ฟอร์มยังเปล่า = รางบอกว่างานเสร็จก่อนเริ่ม */
test('🐞 ฟอร์มเปล่า: ต้องไม่มีขั้นไหนบนรางอ่านว่าครบ', () => {
  const rail = historicalWizardRail(emptyHistoricalWizard(), { step: 'contract' });
  assert.deepEqual(rail.map((item) => item.key), [...HISTORICAL_WIZARD_STEP_ORDER]);
  assert.equal(rail.some((item) => item.tone === 'full'), false, 'ยังไม่มีขั้นไหนกรอกอะไรเลย');
  assert.equal(rail.some((item) => item.filled), false);
  for (const item of rail) {
    /* ไม่มีอะไรจะสรุป = บอกว่าขั้นนั้นถามอะไร ไม่ใช่เศษส่วนที่เดาเอาเอง */
    assert.equal(item.summary, HISTORICAL_WIZARD_STEPS.find((s) => s.key === item.key).hint);
  }
});

/* ⭐ มติ 25/09: ขั้น ② เป็นตารางรายการ ⇒ สรุปพูด "บรรทัด" ก่อน "โซน" (`historicalLinesSummary` คำเดียวกับหัวตาราง
   และแถบสรุป) · บรรทัดใหม่ที่ยังไม่เลือกโซนนับเป็นบรรทัด ไม่นับเป็นโซน */
test('⭐ รางสรุปของจริงตามม็อก ("4 บรรทัด · 4 โซน" · "ยกมา 1 งวด · ต้องเก็บ 1 งวด") — ไม่นับ "แพ็ค" แล้ว (มติ 23/09)', () => {
  const state = filledState({
    zones: [
      emptyHistoricalZone({ zoneId: 'ZN-1', qty: '72' }),
      emptyHistoricalZone({ zoneId: 'ZN-2', qty: '60' }),
      emptyHistoricalZone({ zoneId: 'ZN-3', qty: '48' }),
      emptyHistoricalZone({ zoneId: 'ZN-4', qty: '24' }),
    ],
  });
  const rail = historicalWizardRail(state, { step: 'zones', customerLabel: 'บจก. สยามพิวรรธน์' });
  const by = Object.fromEntries(rail.map((item) => [item.key, item]));
  assert.equal(by.zones.summary, '4 บรรทัด · 4 โซน');
  assert.equal(by.zones.label, 'ไซต์ โซน และรายการ');
  const withBlank = historicalWizardRail(filledState({ zones: [...state.zones, emptyHistoricalZone()] }), { step: 'zones' });
  assert.equal(withBlank.find((item) => item.key === 'zones').summary, '5 บรรทัด · 4 โซน', 'บรรทัดที่ยังไม่เลือกโซนไม่นับเป็นโซน');
  assert.ok(rail.every((item) => !/แพ็ค/.test(`${item.label} ${item.summary}`)), 'ราง/สรุปไม่มีคำว่าแพ็ค');
  assert.equal(by.money.summary, 'ยกมา 1 งวด · ต้องเก็บ 1 งวด');
  assert.match(by.contract.summary, /สยามพิวรรธน์/);
  assert.match(by.contract.summary, /ใบสั่งซื้อ/, 'ชนิดเอกสารมาจากป้ายกลางของทะเบียนสัญญา');
  assert.equal(by.review.summary, HISTORICAL_WIZARD_STEPS[3].hint, 'ยังไม่มีแผน = ยังไม่มีอะไรถูกตรวจ');
  assert.equal(by.review.tone, 'none');
});

test('⭐ ราง: ขั้นที่มีข้อต้องแก้เป็นเหลือง · ขั้นข้างหน้าบอกเหตุที่ไปไม่ได้ (ไม่ใช่แตะแล้วเงียบ)', () => {
  const state = { ...emptyHistoricalWizard(), customerId: 'CUS-1' };
  const localIssues = historicalWizardLocalIssues(state, { contractFileCount: 0 });
  const rail = historicalWizardRail(state, { step: 'contract', localIssues, customerLabel: 'AR-1 · ลูกค้า' });
  const by = Object.fromEntries(rail.map((item) => [item.key, item]));
  assert.equal(by.contract.tone, 'some');
  assert.equal(by.contract.blocked, null, 'ขั้นที่ยืนอยู่ไม่ใช่ขั้นที่ "ไปไม่ได้"');
  for (const key of ['zones', 'money', 'review']) {
    assert.match(by[key].blocked, /ยังไปขั้นนี้ไม่ได้ —/, key);
    assert.ok(by[key].title.includes(by[key].blocked), 'เหตุผลต้องอยู่ใน title ของแถวนั้นด้วย');
  }
  /* แก้ครบแล้วเหตุผลต้องหายไป ไม่ใช่ค้างเป็นป้ายถาวร */
  const cleared = historicalWizardRail(state, { step: 'contract', localIssues: [] });
  assert.equal(cleared.every((item) => item.blocked === null), true);
});

/* 🐞 แถวลูกค้า/AE อ่าน `plan?.header` อย่างเดียว ⇒ ค้างเป็นขีดจนกว่าจะมีคนกดตรวจ
   ทั้งที่แถว "ช่วงสัญญา" ใต้มันขยับทันทีเพราะอ่าน state — ครึ่งแถบพูดคนละเวลากัน */
test('🐞 แถบสรุปต้องขยับตั้งแต่ยังไม่เคยตรวจ — ทุกแถวถอยมาที่ state ของฟอร์ม', () => {
  const state = filledState({ hasOpening: false, installments: [] });
  const rows = historicalAsideRows(state, {
    plan: null, customerLabel: 'AR-1207 · บจก. สยามพิวรรธน์', ownerLabel: 'พิมพ์ชนก รัตนา',
    contractFileCount: 1,
  });
  const by = Object.fromEntries(rows.map((row) => [row.id, row.value]));
  assert.equal(by.customer, 'AR-1207 · บจก. สยามพิวรรธน์');
  assert.equal(by.owner, 'พิมพ์ชนก รัตนา');
  assert.match(by.contract, /PO-SPW-2026-0118/);
  assert.match(by.span, /12 เดือน/);
  assert.equal(by.files, 'แนบแล้ว 1 ไฟล์');
  assert.equal(by.refs, 'IV-2601-0412');
  assert.equal(by.tax, '+ VAT 7% ท้ายใบ', 'ป้ายตัวเลือกเดียวกับใบเสนอราคา');
  /* ⭐ มติ 25/09: แถว "รายการ" พูดคำเดียวกับรางและหัวตาราง (`historicalLinesSummary`) */
  assert.equal(by.zones, '1 บรรทัด · 1 โซน');
  assert.ok(!('discount' in by), 'ใบที่ไม่มีส่วนลดท้ายใบไม่มีแถวส่วนลด (แถวขีดทุกใบ = เสียงรบกวน)');
  /* 🔴 เปลี่ยนโดยเจตนา 23/09 (รีวิว R7): ยอดรวมสินค้า/บริการ / VAT **ไม่ต้องรอแผน** — คิดจากบรรทัดบนฟอร์ม
     (จำนวน × ราคา/หน่วย − ส่วนลด) ด้วย `historicalLinesMoney` ก้อนเดียวกับ server */
  assert.equal(by.subtotal, '฿244,800.00');
  assert.equal(by.vat, '฿17,136.00');
  const labels = Object.fromEntries(rows.map((row) => [row.id, row.label]));
  assert.equal(labels.subtotal, 'ยอดรวมสินค้า/บริการ', 'ป้ายท้ายตารางของใบเสนอราคา');
  assert.equal(labels.vat, 'ภาษีมูลค่าเพิ่ม');
  assert.equal(labels.zones, 'รายการ');
  assert.ok(rows.every((row) => !/แพ็ค/.test(`${row.label} ${row.value || ''}`)), 'แถบสรุปไม่มีคำว่าแพ็ค');
  const vat0 = Object.fromEntries(historicalAsideRows(filledState({ vatRate: 0 }), {}).map((row) => [row.id, row.value]));
  assert.equal(vat0.tax, 'รวม VAT แล้ว');
  /* ยังไม่เลือก VAT = ยอดใบยังคิดไม่ได้จริง ⇒ ว่างตามเดิม (ไม่เดาเป็น 0)
     ⚠️ มติ 25/09: historicalMoneyView คืนยอดรวมสินค้า/บริการ "ครึ่งเดียว" มาด้วยตอนยังไม่เลือก VAT — ของนั้นมีไว้ให้
        กล่องสรุปของขั้น ② เท่านั้น · แถบสรุป (ขั้น ① ③) เชื่อเฉพาะ `ok` ⇒ ยังเป็นขีด */
  const noVat = Object.fromEntries(historicalAsideRows(
    filledState({ hasOpening: false, installments: [], vatRate: null }), { plan: null },
  ).map((row) => [row.id, row.value]));
  assert.equal(noVat.subtotal, null);
  assert.equal(noVat.vat, null);
});

test('⭐ แถบสรุป: มีแผนแล้วเชื่อแผน (ชื่อจากฐาน) · ยังไม่ตอบงวดยกมา = ว่าง ไม่ใช่ "ไม่มี"', () => {
  const state = filledState();
  const plan = {
    header: { customerName: 'บจก. สยามพิวรรธน์', ownerName: 'พิมพ์ชนก รัตนา', subtotal: 244800, vatAmount: 17136 },
    opening: { amount: 196452 },
    installments: [{ amount: 65484 }],
  };
  const by = Object.fromEntries(historicalAsideRows(state, { plan, evidenceFileCount: 2, customerLabel: 'ป้ายเก่า' })
    .map((row) => [row.id, row.value]));
  assert.equal(by.customer, 'บจก. สยามพิวรรธน์');
  assert.match(by.opening, /หลักฐาน 2 ไฟล์/);
  assert.equal(by.rest, '1 งวด');
  assert.ok(by.subtotal);

  const blank = Object.fromEntries(historicalAsideRows(emptyHistoricalWizard(), {})
    .map((row) => [row.id, row.value]));
  assert.equal(blank.opening, null, 'ยังไม่ตอบว่าเคยเก็บเงินไหม = ไม่ตอบแทน');
  assert.equal(blank.tax, null);
  assert.equal(blank.customer, null);
});

/* 🐞 ขั้น ①–③ มีปุ่มเดียวคือ "ถัดไป" แต่บรรทัดใต้ปุ่มเขียนว่า "ส่งให้ AE Sup อนุมัติทันทีที่บันทึก" */
test('🐞 บรรทัดใต้ปุ่ม: ขั้นที่ยังไม่บันทึก ห้ามพูดเหมือนกำลังจะบันทึก', () => {
  for (const step of ['contract', 'zones', 'money']) {
    const note = historicalFootNote({ step });
    assert.doesNotMatch(note, /อนุมัติทันทีที่บันทึก/, step);
    assert.ok(note.includes(HISTORICAL_SAVE_BUTTON_LABEL), 'บอกด้วยว่าใบจะถูกส่งตอนกดปุ่มไหน');
  }
  /* ขั้น ④ มีตัวตัดสินของตัวเอง (historicalReviewFootNote — ทดสอบที่ historicalReviewView.test.mjs) */
  assert.equal(historicalFootNote({ step: 'review' }), '');
});

/* 🐞 ฟอร์มเปล่าขึ้น "ยังกรอกไม่ครบ 3 ข้อ" ทั้งที่ช่องดาวแดงยังว่างอีกราว 7 ช่อง */
test('🐞 หัวก้อน error ของขั้น: ตัวเลขต้องไม่อ้างว่านับทุกช่องที่บังคับ', () => {
  const notice = historicalStepIssueNotice(3);
  assert.doesNotMatch(notice.title, /ยังกรอกไม่ครบ/);
  assert.match(notice.title, /3/);
  assert.match(notice.note, /ดาวแดง/, 'ต้องบอกว่ายังมีช่องบังคับอื่นที่พรีวิวเป็นคนตรวจ');
});

/* 🐞 ขั้น ④ เคยสั่งให้กด "ตรวจอีกครั้ง" ซึ่งไม่มีปุ่มนั้นอยู่บนจอเลย */
test('🐞 ขั้น ④ ที่ยังไม่มีแผน ต้องชี้ปุ่มที่มีอยู่จริงบนแถบท้าย', () => {
  const stale = historicalReviewStaleNotice();
  assert.ok(stale.body.includes(HISTORICAL_SAVE_BUTTON_LABEL));
  assert.doesNotMatch(stale.body, /ตรวจอีกครั้ง/);
  assert.match(stale.body, /ยังไม่บันทึก/, 'กดครั้งแรกคือการตรวจ ไม่ใช่การบันทึก');
});

test('รหัสการคีย์ไม่ซ้ำกันในหน้าเดียว', () => {
  const keys = new Set(Array.from({ length: 20 }, () => newHistoricalIntakeKey()));
  assert.equal(keys.size, 20);
});

// ── ⑤ รอบแก้จากรีวิว 23/09 (R6 · R7 · R10 + กระจกวันสัญญา/กติกาวันสิ้นเดือน) ────────────────

/* 🐞 **R6 (สูง) — ด่าน "ต้องแนบไฟล์เอกสารแทนสัญญา" นับจากภาพนิ่งตอน mount**
   ขั้น ① สลับไปเรนเดอร์ `AttachmentsPanel` ทันทีที่มี `contractId` ซึ่งอัป/ลบไฟล์ขึ้น server
   ตรง ๆ ⇒ ตัวนับไม่ขยับตามของจริงทั้งสองทาง: แนบแล้วด่านยังค้าง (ส่งอนุมัติไม่ได้อีกเลย) ·
   ลบแล้วด่านยังผ่าน (RPC ตีกลับ historical_so_contract_file_missing) */
test('⭐ R6: จำนวนไฟล์เอกสารแทนสัญญามาจากของจริง — ไม่ใช่ภาพนิ่ง และ "ยังไม่รู้" ≠ 0', () => {
  /* ยังไม่มีสัญญา = ตะกร้าไฟล์ในเครื่องล้วน */
  assert.equal(historicalContractFileCount({ contractId: null, pendingCount: 2 }), 2);
  assert.equal(historicalContractFileCount({ contractId: null }), 0);

  /* มีสัญญาแล้ว: แผงรายงานมาเท่าไรคือเท่านั้น — ทั้งตอนแนบเพิ่มและตอนลบทิ้ง */
  assert.equal(historicalContractFileCount({ contractId: 'CT-1', serverCount: 1, hydratedCount: 0 }), 1,
    'แนบไฟล์ในแผงแล้วด่านต้องปลด (นี่คือทางตันของ R6)');
  assert.equal(historicalContractFileCount({ contractId: 'CT-1', serverCount: 0, hydratedCount: 3 }), 0,
    'ลบไฟล์ในแผงแล้วด่านต้องกลับมาติด ไม่ใช่ค้างที่เลขตอนเปิดฟอร์ม');

  /* แผงยังไม่รายงาน (กำลังโหลด/โหลดไม่สำเร็จ) = ถอยไปใช้จำนวนที่ติดมากับใบ */
  assert.equal(historicalContractFileCount({ contractId: 'CT-1', serverCount: null, hydratedCount: 2 }), 2);
  /* ไม่มีอะไรให้ถอยเลย = **ยังไม่รู้** ห้ามตอบ 0 (0 อ่านว่า "ยังไม่แนบ" ซึ่งอาจไม่จริง) */
  assert.equal(historicalContractFileCount({ contractId: 'CT-1' }), null);
  /* ไฟล์ที่ยังไม่ได้อัปนับเพิ่ม — ที่อัปแล้วอยู่ในจำนวนของ server แทน (ห้ามนับซ้ำ) */
  assert.equal(historicalContractFileCount({ contractId: 'CT-1', serverCount: 1, pendingCount: 2 }), 3);
  assert.equal(historicalContractFileCount({ contractId: 'CT-1', serverCount: 2, pendingCount: 0 }), 2);
});

test('⭐ R6: "ยังไม่รู้จำนวนไฟล์" ต้องไม่เงียบและไม่ปล่อยผ่าน', () => {
  const base = { role: 'ac', userId: 'USR-AC', evidenceFileCount: 1, todayIso: '2026-09-23' };
  const unknown = historicalWizardLocalIssues(filledState(), { ...base, contractFileCount: null });
  const file = unknown.find((issue) => issue.field === 'contract.file');
  assert.ok(file, 'ยังไม่รู้ = ต้องยังติดด่าน (ปล่อยผ่าน = RPC ตีกลับตอนส่งอนุมัติ)');
  assert.doesNotMatch(file.message, /ต้องแนบไฟล์/, 'ห้ามบอกว่า "ยังไม่แนบ" ทั้งที่ยังไม่รู้');
  assert.match(file.message, /โหลดหน้านี้ใหม่/, 'ต้องบอกทางออกที่ทำได้จริง');

  const attached = historicalWizardLocalIssues(filledState(), { ...base, contractFileCount: 1 });
  assert.equal(attached.some((issue) => issue.field === 'contract.file'), false);

  /* แถบสรุปก็ห้ามอ่าน null ว่า "ยังไม่แนบ" — 0 (รู้แล้ว) กับ null (ยังไม่รู้) คนละคำตอบ */
  const filesRow = (count) => historicalAsideRows(filledState(), { contractFileCount: count })
    .find((row) => row.id === 'files').value;
  assert.equal(filesRow(null), null, 'ยังไม่รู้ = ขีด');
  assert.equal(filesRow(0), 'ยังไม่แนบ');
  assert.equal(filesRow(2), 'แนบแล้ว 2 ไฟล์');
});

/* 🐞 **R7 — พรีวิวตอบ 400 โดยไม่คืน plan** ⇒ ขั้น ③ ไม่รู้ยอดใบตลอดรอบคีย์ใบใหม่ (ฟอร์มที่ยัง
   ไม่มีงวดสักงวดมี error `installments` เสมอ) ⇒ แผ่น "แบ่งงวดที่เหลืออัตโนมัติ" เทาทั้งชุด
   และผู้คีย์ต้องคิดยอดให้ตรง ±1 สตางค์โดยไม่เห็นยอดใบ */
/* ⭐ ยอดที่ฟอร์มคิดเองต้องเท่ากับแผนของ server ทุกสตางค์ — ป้อนแผนตัวจริงด้วยสินค้าราคาเดียวกัน */
const PRD = { id: 'PRD-1', fgCode: 'FG-SNS-02-001-0012', productDescription: 'แพ็คเกจรายเดือน', saleUnit: 'แพ็คเกจ', costPrice: 1200 };
const planCtx = {
  actor: { id: 'USR-AE', role: 'ae', team: 'KA', teams: ['KA'] },
  customer: { id: 'CUS-1', name: 'บจก. สยามพิวรรธน์', approvalStatus: 'approved', isActive: true },
  owner: { ok: true, ownerId: 'USR-AE', ownerName: 'AE', team: 'KA', teams: ['KA'] },
  products: [PRD],
  zones: [{ id: 'ZN-1', siteId: 'ST-1', name: 'ล็อบบี้', isActive: true }, { id: 'ZN-2', siteId: 'ST-1', name: 'ห้องน้ำ', isActive: true }],
  sites: [{ id: 'ST-1', code: 'ST-1', name: 'สยามพารากอน', customerId: 'CUS-1', kind: 'customer', isActive: true }],
  todayIso: '2026-09-23',
};
const zoneFromProduct = (defaults) => emptyHistoricalZone(quoteLineFromProduct(defaults, PRD));

test('⭐ R7: ยอดใบคิดได้ตั้งแต่ยังไม่มีแผน — ตัวเลขเท่าแผนของ server ทุกสตางค์ (สูตรใบเสนอราคา)', () => {
  /* ⭐ มติ 25/09: ส่วนลดท้ายใบเข้าสูตรด้วย (quoteTotals: ลดจากยอดหลังส่วนลดรายบรรทัด แล้ว VAT คิดจากยอดหลังหัก)
     ⇒ ยอดที่ฟอร์มคิดเองกับแผนต้องตรงกันทุกชุดของ (VAT × ส่วนลดท้ายใบ) — รวมเศษสตางค์ของ % และค่าว่าง = 0 */
  const DISCOUNTS = [
    { discountType: null, discountValue: '' },
    { discountType: 'percent', discountValue: '12.5' },
    { discountType: 'amount', discountValue: '1000.555' },
    { discountType: 'percent', discountValue: '' },
  ];
  for (const vatRate of [0, 7]) {
    for (const discount of DISCOUNTS) {
      const state = filledState({
        vatRate,
        ...discount,
        zones: [
          zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty: '163', rounds: '12', discountType: 'percent', discountValue: '7.5' }),
          zoneFromProduct({ zoneId: 'ZN-2', productId: 'PRD-1', qty: '54', rounds: '12', discountType: 'amount', discountValue: '100.555' }),
        ],
      });
      const view = historicalMoneyView(state, null);
      const plan = planHistoricalServiceOrder(historicalWizardBody(state, {}), planCtx);
      const label = `VAT ${vatRate} · ${JSON.stringify(discount)}`;
      assert.equal(view.ok, true, label);
      assert.equal(view.source, 'local');
      assert.deepEqual(
        [view.subtotal, view.discountAmount, view.vatAmount, view.totalAmount],
        [plan.header.subtotal, plan.header.discountAmount, plan.header.vatAmount, plan.header.totalAmount],
        `ต้องเป็นก้อนเดียวกับ server ไม่ใช่กฎชุดที่สอง · ${label}`,
      );
      assert.equal(view.discountAmount > 0, Boolean(discount.discountType && discount.discountValue), label);
    }
  }
  const state = filledState({
    zones: [
      zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty: '163', rounds: '12' }),
      zoneFromProduct({ zoneId: 'ZN-2', productId: 'PRD-1', qty: '41', rounds: '12' }),
    ],
    vatRate: 7,
  });
  const view = historicalMoneyView(state, null);
  assert.deepEqual([view.subtotal, view.vatAmount, view.totalAmount], [244800, 17136, 261936], 'ชุดตัวเลขของม็อก');

  /* มีแผนแล้วเชื่อแผนเสมอ (แผนคืนมาเฉพาะตอนไม่มี error ⇒ เงินผ่านด่านครบแล้ว) */
  const fromPlan = historicalMoneyView(state, { header: { subtotal: 1, vatAmount: 2, totalAmount: 3 } });
  assert.deepEqual(
    [fromPlan.source, fromPlan.subtotal, fromPlan.discountAmount, fromPlan.vatAmount, fromPlan.totalAmount],
    ['plan', 1, 0, 2, 3],
    'แผนที่ไม่มี discountAmount (รุ่นก่อน 25/09) = ไม่มีส่วนลด ไม่ใช่ undefined ที่กล่องสรุปอ่านเป็น NaN',
  );

  /* 🪤 แผนที่ยังมี error คืนบล็อกเงินเป็น 0 ทั้งก้อน — เชื่อมันคือพิมพ์ "฿0.00" ว่าเป็นยอดใบ
     (วันนี้เส้นพรีวิวไม่เคยคืนแผนแบบนั้น · ด่านนี้กันวันที่มันเปลี่ยน) */
  const errored = historicalMoneyView(state, {
    header: { subtotal: 0, vatAmount: 0, totalAmount: 0 },
    errors: [{ field: 'installments', message: 'ต้องมีงวดอย่างน้อย 1 งวด' }],
  });
  assert.equal(errored.source, 'local');
  assert.equal(errored.totalAmount, 261936, 'ต้องถอยไปคิดเองจากบรรทัดโซน ไม่ใช่เชื่อ 0 ของแผนที่ยังไม่ผ่าน');
});

/* ⭐ มติเจ้าของ 23/09: เซลล์ "จำนวนเงิน" ของขั้น ② (และยอดของแต่ละไซต์) ถามตัวตัดสินตัวเดียวกับยอดใบ
   ⇒ แถวที่เซลล์พูดขีด = แถวที่ทำให้ยอดใบยังคิดไม่ได้ · ผลรวมของแถว = ยอดรวมสินค้า/บริการของใบ */
test('⭐ historicalZoneLineAmount: 12 × 3,500 = 42,000 · ยังคิดไม่ได้ = ขีด ไม่ใช่ 0 · ผลรวมแถว = ยอดรวมสินค้า/บริการ', () => {
  const OWNER_EXAMPLE = { ...PRD, id: 'PRD-35', costPrice: 3500 };
  const row = emptyHistoricalZone(quoteLineFromProduct({ zoneId: 'ZN-1', qty: 12 }, OWNER_EXAMPLE));
  assert.deepEqual(historicalZoneLineAmount(row), { known: true, lineTotal: 42000 }, '1 ชุด × 12 เดือน = จำนวน 12 × 3,500');
  /* 🐞 รีวิว 23/09: จำนวน 1.5 / 0 เคยได้เหตุเดียวกับจำนวนว่าง ("เลือกแพ็คเกจ / ใส่จำนวน…ให้ครบ") ทั้งที่กรอกครบแล้ว —
     เหตุจริงโผล่ตอนกด "ถัดไป" เท่านั้น ⇒ ว่าง = ยังไม่ได้ใส่ (lines) · ผิดรูป = ใส่แล้วใช้ไม่ได้ (qty + ข้อความใต้ช่อง) */
  for (const [bad, reason] of [
    [{ ...row, qty: '' }, 'lines'], [{ ...row, qty: 1.5 }, 'qty'], [{ ...row, qty: 0 }, 'qty'], [{ ...row, qty: -3 }, 'qty'],
    [{ ...row, qty: 'abc' }, 'qty'], [{ ...row, productId: '' }, 'lines'],
    [{ ...row, unitPrice: '' }, 'lines'], [{ ...row, unitPrice: 0 }, 'price'],
  ]) {
    assert.deepEqual(historicalZoneLineAmount(bad), {
      known: false, lineTotal: null, reason, qtyNote: reason === 'qty' ? HISTORICAL_LINE_MESSAGES.qty : null,
    }, JSON.stringify(bad));
    /* ชุดเดียวกับที่ทำให้ยอดใบคิดไม่ได้ — เซลล์กับกล่องสรุปพูดตรงกัน และพูดเหตุเดียวกัน */
    const view = historicalMoneyView(filledState({ zones: [bad] }), null);
    assert.equal(view.ok, false, JSON.stringify(bad));
    assert.equal(view.reason, HISTORICAL_MONEY_UNKNOWN[reason], JSON.stringify(bad));
  }
  assert.ok(HISTORICAL_MONEY_UNKNOWN.qty.startsWith(HISTORICAL_LINE_MESSAGES.qty),
    'ข้อความเดียวกับที่แผนตีกลับตอนกด "ถัดไป" — ไม่ใช่คำที่สอง');
  assert.equal(historicalZoneLineAmount({ ...row, discountType: 'percent', discountValue: 10 }).lineTotal, 37800);
  assert.equal(historicalZoneLineAmount({ ...row, discountType: 'amount', discountValue: 50000 }).lineTotal, 0,
    'ส่วนลดเกินยอดตัดที่ยอดบรรทัด (quoteLineNet) — ไม่ติดลบ');
  assert.equal(historicalZoneLineAmount({ ...row, discountType: 'foo', discountValue: 10 }).lineTotal, 42000,
    'ชนิดที่ไม่รู้จัก = ไม่ลด ตามที่บันทึกจริง');

  const rows = [
    zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty: '163', discountType: 'percent', discountValue: '7.5' }),
    zoneFromProduct({ zoneId: 'ZN-2', productId: 'PRD-1', qty: '54', discountType: 'amount', discountValue: '100.555' }),
  ];
  const view = historicalMoneyView(filledState({ vatRate: 0, zones: rows }), null);
  const sum = rows.reduce((total, one) => total + historicalZoneLineAmount(one).lineTotal, 0);
  assert.equal(Math.round(sum * 100) / 100, view.subtotal);
});

test('⭐ R7: คิดยอดไม่ได้ ต้องตอบ null + เหตุที่จริง — ห้ามตอบ 0 (0 อ่านเหมือนใบยอด ฿0)', () => {
  const noVat = historicalMoneyView(filledState({ vatRate: null }), null);
  assert.equal(noVat.ok, false);
  assert.equal(noVat.totalAmount, null, 'ห้ามเป็น 0 — ใบยอด 0 บาทเป็นสถานะจริงที่ซ่อนทั้งขั้น ③');
  assert.equal(noVat.vatAmount, null);
  assert.equal(noVat.reason, HISTORICAL_MONEY_UNKNOWN.vat);
  /* ⭐ มติ 25/09: ยังไม่เลือก VAT แต่ยอดรวมสินค้า/บริการกับส่วนลดรู้แล้ว — กล่องสรุปของขั้น ② พูดสองแถวนั้นได้
     ตั้งแต่ก่อนเลือก VAT (ใบเสนอราคาพูดได้เสมอ) · `ok` ยังเท็จ ⇒ ขั้น ③/แถบสรุปไม่เชื่อ */
  assert.equal(noVat.subtotal, 244800, '204 × 1,200');
  assert.equal(noVat.discountAmount, 0);

  const noZones = historicalMoneyView(filledState({ zones: [] }), null);
  assert.equal(noZones.reason, HISTORICAL_MONEY_UNKNOWN.zones);

  /* จำนวนว่าง = ยังคิดไม่ได้ (ไม่ใช่ 1 แบบใบเสนอราคา) · ยังไม่เลือกแพ็คเกจ — "ใส่ให้ครบ" */
  for (const zone of [
    zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty: '' }),
    emptyHistoricalZone({ zoneId: 'ZN-1', qty: '12' }),
  ]) {
    const blank = historicalMoneyView(filledState({ zones: [zone] }), null);
    assert.equal(blank.ok, false);
    assert.equal(blank.totalAmount, null);
    assert.equal(blank.reason, HISTORICAL_MONEY_UNKNOWN.lines);
    assert.equal(blank.subtotal, null, 'บรรทัดยังไม่ครบ = ยอดรวมก็ยังไม่รู้ (ไม่ใช่ผลรวมของบรรทัดที่ครบ)');
  }
  /* ⭐ มติ 25/09: ขั้น ② เป็นตารางรายการ — เหตุพูดถึง "บรรทัด" ที่ตาเห็นในตาราง (บรรทัดใหม่อาจยังไม่มีโซน) */
  assert.match(HISTORICAL_MONEY_UNKNOWN.lines, /เลือกแพ็คเกจ \/ ใส่จำนวนของทุกบรรทัด/);
  /* 🐞 รีวิว 23/09: จำนวนไม่เต็ม/ศูนย์ ใส่ครบแล้ว — เหตุต้องเป็น "จำนวนต้องเป็นจำนวนเต็ม" ไม่ใช่ "ใส่ให้ครบ" */
  for (const qty of ['2.5', '0']) {
    const wrong = historicalMoneyView(filledState({ zones: [zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty })] }), null);
    assert.equal(wrong.ok, false);
    assert.equal(wrong.totalAmount, null);
    assert.equal(wrong.reason, HISTORICAL_MONEY_UNKNOWN.qty, qty);
  }
  /* แพ็คเกจยังไม่ตั้งราคา = คิดไม่ได้ พร้อมเหตุของมันเอง (ไม่ใช่ยอด 0) */
  const unpriced = historicalMoneyView(filledState({
    zones: [emptyHistoricalZone(quoteLineFromProduct({ zoneId: 'ZN-1', qty: '12' }, { ...PRD, costPrice: null }))],
  }), null);
  assert.equal(unpriced.ok, false);
  assert.equal(unpriced.reason, HISTORICAL_MONEY_UNKNOWN.price);

  /* ใบยอด 0 บาทของจริง (ส่วนลดเต็มจำนวน) ยังต้องตอบได้ว่า "รู้แล้วว่าเป็น 0" */
  const zero = historicalMoneyView(filledState({
    zones: [zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty: '1', discountType: 'percent', discountValue: 100 })],
  }), null);
  assert.equal(zero.ok, true);
  assert.equal(zero.totalAmount, 0);
});

/* ⭐ มติ 25/09 (รื้อขั้น ③): ห่วงโซ่ของงวด — ช่วงต่อจากงวดก่อน · งวดสุดท้ายรับยอดที่เหลือและถึงวันสิ้นสุดสัญญา */
test('⭐ ห่วงโซ่งวด: ช่วงเริ่มต่อจากงวดยกมา/งวดก่อน · งวดสุดท้ายรับยอดที่เหลือ · เลขงวดนับงวดยกมาเป็นงวดที่ 1', () => {
  const two = filledState({
    installments: [
      emptyHistoricalInstallment({ label: 'ต.ค.', amount: '20000', dueDate: '2026-10-01', coversTo: '2026-10-31' }),
      emptyHistoricalInstallment({ label: 'พ.ย.–ธ.ค.', amount: '1', dueDate: '2026-11-01', coversTo: '2026-11-15' }),
    ],
  });
  const chain = intakeForm.historicalInstallmentChain(two, { totalAmount: 261936, todayIso: '2026-10-15' });
  assert.equal(chain.mode, 'part');
  assert.equal(chain.chainStart, '2026-10-01', 'ถัดจากงวดยกมา (ครอบถึง 30/09)');
  assert.equal(chain.remaining, 65484);
  assert.deepEqual(chain.rows.map((row) => [row.seq, row.coversFrom, row.coversTo, row.amount, row.last]), [
    [2, '2026-10-01', '2026-10-31', 20000, false],
    [3, '2026-11-01', '2026-12-31', 45484, true],
  ], 'งวดสุดท้าย: ยอด = 65,484 − 20,000 · ครอบถึงวันสิ้นสุดสัญญา (ค่าที่พิมพ์ในแถวนั้นไม่ถูกใช้)');
  assert.deepEqual(chain.rows.map((row) => row.overdue), [true, false]);
  assert.equal(chain.overflow, false);

  const over = intakeForm.historicalInstallmentChain(filledState({
    installments: [
      emptyHistoricalInstallment({ label: 'ก', amount: '70000', dueDate: '2026-10-01', coversTo: '2026-10-31' }),
      emptyHistoricalInstallment({ label: 'ข', dueDate: '2026-11-01' }),
    ],
  }), { totalAmount: 261936 });
  assert.equal(over.overflow, true, 'งวดอื่นรวมกันเกินยอดที่ต้องเก็บ');
  assert.equal(over.rows[1].amount, -4516);

  const none = intakeForm.historicalInstallmentChain(filledState({ hasOpening: false }), { totalAmount: 261936 });
  assert.deepEqual([none.chainStart, none.remaining, none.rows[0].seq, none.rows[0].coversFrom], ['2026-01-01', 261936, 1, '2026-01-01']);
  const unknown = intakeForm.historicalInstallmentChain(filledState(), { totalAmount: null });
  assert.equal(unknown.remaining, null, 'ไม่รู้ยอดใบ = ไม่รู้ยอดงวดสุดท้าย (ห้ามเดา 0)');
  assert.equal(unknown.rows[0].amount, null);
});

test('⭐ ห่วงโซ่งวด: จ่ายครบทั้งใบ = งวดยกมาเท่ายอดใบ ครอบเต็มสัญญา · เหตุที่ยังเริ่มงวดไม่ได้พูดช่องที่ต้องกรอก', () => {
  const full = intakeForm.historicalInstallmentChain(filledState({ openingFull: true }), { totalAmount: 261936 });
  assert.deepEqual([full.mode, full.opening.amount, full.opening.coversTo, full.rows.length, full.remaining],
    ['full', 261936, '2026-12-31', 0, 0], 'แถวงวดที่ค้างใน state ถูกเมิน — จ่ายครบไม่มีงวดต้องเก็บ');
  const noTo = intakeForm.historicalInstallmentChain(filledState({ opening: { amount: '1000', coversTo: '' } }), { totalAmount: 261936 });
  assert.match(noTo.startReason, /กรอก “ครอบบริการ ถึง” ของเงินที่เก็บแล้วก่อน/);
  const atEnd = intakeForm.historicalInstallmentChain(filledState({ opening: { amount: '1000', coversTo: '2026-12-31' } }), { totalAmount: 261936 });
  assert.match(atEnd.startReason, /ครอบถึงวันสิ้นสุดสัญญาแล้ว/);
  const noDates = intakeForm.historicalInstallmentChain(filledState({ hasOpening: false, contract: { ...CONTRACT, endDate: '' } }), {});
  assert.equal(noDates.startReason, 'กรอกวันเริ่ม–วันสิ้นสุดสัญญาในขั้น ① ก่อน');
});

test('⭐ body ส่งตามห่วงโซ่: จ่ายครบ = งวดยกมาเท่ายอดใบ ไม่มีงวด · งวดสุดท้ายส่งยอดที่เหลือ · ช่วงเริ่มคิดให้', () => {
  const full = historicalWizardBody(filledState({ openingFull: true }), { totalAmount: 261936 });
  assert.deepEqual([full.opening.amount, full.opening.coversTo, full.installments.length], ['261936.00', '2026-12-31', 0]);
  const part = historicalWizardBody(filledState({
    installments: [
      emptyHistoricalInstallment({ label: 'ต.ค.', amount: '20000', dueDate: '2026-10-01', coversTo: '2026-10-31' }),
      emptyHistoricalInstallment({ label: 'ที่เหลือ', amount: '999', dueDate: '2026-11-01', coversTo: '2026-11-02' }),
    ],
  }), { totalAmount: 261936 });
  assert.deepEqual(part.installments.map((row) => [row.amount, row.coversFrom, row.coversTo]), [
    ['20000.00', '2026-10-01', '2026-10-31'],
    ['45484.00', '2026-11-01', '2026-12-31'],
  ]);
  /* ไม่ส่งยอดใบ = คิดจากฟอร์มด้วยสูตรเดียวกับ server (fixture: 261,936) */
  assert.equal(historicalWizardBody(filledState(), {}).installments[0].amount, '65484.00');
});

/* 🔴 **กระจกวันสัญญาที่ลืม `editing`** — แผนฝั่ง server ทำให้ "สัญญาสิ้นสุดไปแล้ว" เป็น **คำเตือน**
   เมื่อ `ctx.editing` (มติข้อ 9 กันเฉพาะใบที่คีย์ใหม่) · กระจกฝั่งจอที่ยังบล็อกอยู่ = ทางตันตัวเดิม
   ย้ายมาอยู่ฝั่งจอแทน: server ยอมรับ PATCH แล้ว แต่ "ถัดไป" ไม่เดินและปุ่มบันทึกเด้งกลับขั้น ① */
test('⭐ สัญญาที่สิ้นสุดไปแล้ว: ใบใหม่ = ด่าน · ใบที่มีอยู่แล้ว = คำเตือน (ตรงกับ ctx.editing ของแผน)', () => {
  const lapsed = { startDate: '2025-01-01', endDate: '2025-12-31' };
  const at = (options) => historicalContractDateIssues({ contract: lapsed }, { todayIso: '2026-09-23', ...options });
  assert.deepEqual(at({}), [
    { field: 'contract.endDate', message: CONTRACT_DATE_MESSAGES.endBeforeToday, live: true },
  ], 'ใบใหม่ยังติดด่านเหมือนเดิม');
  assert.deepEqual(at({ editing: true }), [], 'ใบที่มีอยู่แล้วต้องไม่ติดด่าน');

  const warn = historicalContractDateWarnings({ contract: lapsed }, { todayIso: '2026-09-23', editing: true });
  assert.deepEqual(warn, [
    { field: 'contract.endDate', message: CONTRACT_DATE_MESSAGES.endBeforeTodayEditing },
  ], 'ไม่บล็อกแล้วก็ยังต้องบอก ไม่ใช่เงียบ');
  assert.deepEqual(
    historicalContractDateWarnings({ contract: lapsed }, { todayIso: '2026-09-23' }), [],
    'ใบใหม่ไม่มีคำเตือนข้อนี้ — มันเป็น error ของมันอยู่แล้ว',
  );
  assert.deepEqual(
    historicalContractDateWarnings({ contract: { startDate: '2026-01-01', endDate: '2025-12-31' } },
      { todayIso: '2026-09-23', editing: true }),
    [], '"ก่อนวันเริ่ม" เป็น error ที่ชนะข้อนี้ — ช่องเดียวห้ามขึ้นสองเหตุผล',
  );
});

test('⭐ ทางตันของใบที่ถูกตีกลับหลังสัญญาหมดอายุ ต้องไม่กลับมา (ทั้ง "ถัดไป" และปุ่มบันทึก)', () => {
  const lapsed = { ...CONTRACT, startDate: '2025-01-01', endDate: '2025-12-31' };
  const base = {
    role: 'ac', userId: 'USR-AC', contractFileCount: 1, evidenceFileCount: 1, todayIso: '2026-09-23',
  };
  /* งวดของใบต้องอยู่ในช่วงสัญญาของใบเอง (ตัวตรวจขั้น ③ ของจอตรวจช่วงด้วยแล้ว — มติ 25/09) */
  const lapsedMoney = {
    opening: { amount: '196452', coversTo: '2025-09-30', paidOn: '2025-09-22', note: '' },
    installments: [emptyHistoricalInstallment({ label: 'งวด ต.ค.–ธ.ค. 2025', amount: '65484', dueDate: '2025-10-01' })],
  };
  const editing = filledState({ orderId: 'SO-1', status: 'rejected', contract: lapsed, ...lapsedMoney });
  const issues = historicalWizardLocalIssues(editing, base);
  assert.equal(issues.some((issue) => issue.field === 'contract.endDate'), false);
  assert.equal(historicalNextBlock(issues, 'contract').blocked, false, 'ปุ่ม "ถัดไป" ต้องเดินได้');
  assert.equal(historicalDuplicateGate({ localIssues: issues }).gated, false, 'ปุ่มบันทึกต้องไม่ติดด่าน');

  /* ใบใหม่ที่สัญญาสิ้นสุดไปแล้วยังต้องติดเหมือนเดิม (มติข้อ 9) */
  const fresh = historicalWizardLocalIssues(filledState({ contract: lapsed, ...lapsedMoney }), base);
  assert.deepEqual(fresh.map((issue) => issue.field), ['contract.endDate']);
  assert.equal(historicalNextBlock(fresh, 'contract').blocked, true);
});

/* 🐞 กติกาวันสิ้นเดือนของ `contractMonths` เคยแคบไปหนึ่งกรณี: 31 ม.ค.–30 เม.ย. ตอบ null (เดิมตอบ 3)
   ⇒ ลูกค้าที่สัญญาเริ่มวันที่ 31 เสียปุ่มลัดยอดโซนและชุดแบ่งงวดทั้งใบโดยไม่มีอะไรบอกว่าทำไม */
test('⭐ วันสิ้นเดือน: 31 ที่ตกเดือน 30 วัน = สิ้นเดือนนั้น · ที่ตก ก.พ. ยังตอบ null', () => {
  assert.equal(contractMonths('2026-01-31', '2026-04-30'), 3, '31 ม.ค. + 3 เดือน = สิ้น เม.ย.');
  assert.equal(contractMonths('2026-03-31', '2026-04-30'), 1, '31 มี.ค. + 1 เดือน = สิ้น เม.ย.');
  assert.equal(contractMonths('2026-01-31', '2026-11-30'), 10);
  assert.equal(contractMonths('2026-01-31', '2026-12-30'), 11, 'ธ.ค. มี 31 วัน ⇒ ไม่ล้น (ขอบปกติ)');
  /* ก.พ. ล้น 2–3 วัน ⇒ ยังกำกวม ⇒ ถามผู้คีย์ดีกว่าเดาแทนเขาในเรื่องเงิน */
  assert.equal(contractMonths('2026-01-31', '2026-02-28'), null);
  assert.equal(contractMonths('2026-01-31', '2026-03-02'), null);
  assert.equal(contractMonths('2028-01-31', '2028-02-29'), null, 'ปีอธิกสุรทินก็ยังกำกวมเหมือนกัน');
  assert.equal(contractMonths('2028-01-30', '2028-02-29'), null, 'วันที่ 30 ตก ก.พ. อธิกสุรทิน = ไม่รับ');
  /* ขอบที่ลงตัวอยู่แล้วต้องไม่เปลี่ยนคำตอบ */
  assert.equal(contractMonths('2026-01-01', '2026-12-31'), 12);
  assert.equal(contractMonths('2026-01-31', '2026-03-30'), 2);
  assert.equal(contractSpan('2026-01-31', '2026-04-30').months, 3);
  assert.equal(contractSpan('2026-01-31', '2026-04-30').partial, false);
});

/* 🐞 **R10 — โซนที่ใบผูกไว้แต่ทะเบียนไม่มีให้เห็น** (ไซต์ถูกปิดใช้งาน · ไซต์ถูกโอนไปลูกค้ารายอื่น ·
   โซนถูกลบ) ⇒ ไม่มีแถวให้ถอนติ๊ก ⇒ `state.zones` ลดลงไม่ได้เลย ⇒ ใบนั้นแก้ไม่ได้อีก */
test('⭐ R10: โซนกำพร้าถูกนับมาบอก แยกจาก "ถูกคำค้นซ่อน"', () => {
  const sites = [{ id: 'ST-1', code: 'ST-1044', name: 'สาขาพระราม 9' }];
  const zonesBySite = { 'ST-1': [{ id: 'ZN-1', code: 'Z-1044-01', name: 'ทางเข้าหลัก' }] };

  const gone = historicalZoneBrowser({ sites, zonesBySite, pickedZoneIds: ['ZN-1', 'ZN-DEAD'] });
  assert.deepEqual(gone.orphans, ['ZN-DEAD'], 'โซนที่ทะเบียนไม่มี ต้องถูกยกมาให้จอวาดปุ่มถอด');

  /* ถูกคำค้นซ่อน ≠ กำพร้า — มันยังอยู่ในทะเบียน แค่ไม่ตรงคำค้น */
  const searched = historicalZoneBrowser({
    sites, zonesBySite, query: 'ไม่มีทางตรง', pickedZoneIds: ['ZN-1'],
  });
  assert.deepEqual(searched.orphans, []);
  assert.equal(searched.hiddenPicked, 1);

  /* ระหว่างโหลด/โหลดพัง ยังตัดสินไม่ได้ — ไม่งั้นทุกโซนของใบขึ้นแดงชั่วครู่ทุกครั้งที่เปิดฟอร์ม */
  assert.deepEqual(
    historicalZoneBrowser({ sites: [], zonesBySite: {}, pickedZoneIds: ['ZN-1'], ready: false }).orphans,
    [],
  );
  assert.deepEqual(historicalZoneBrowser({}).orphans, []);
});

/* 🐞 **N1 (สูง · ของเดิมทำลายข้อมูล)** — `orphans` เคยสร้างจากทุกไซต์โดยไม่ดู `siteErrors` เลย
   ⇒ ไซต์เดียวอ่านโซนไม่สำเร็จ (เน็ตกระตุก · 500 ชั่วคราว) = ทุกโซนของไซต์นั้นขึ้นก้อน
   "โซนกำพร้า" พร้อมปุ่ม **ถอดโซนนี้ออกจากใบ** ⇒ ผู้คีย์ทำตามที่จอสั่งแล้วลบบรรทัดจริงของใบ
   ⇒ กำพร้าได้เฉพาะ "อ่านทะเบียนครบแล้วยังหาไม่เจอ" · มีไซต์ที่อ่านไม่ได้ = ตอบ `unresolved` */
test('⭐ N1: ไซต์เดียวอ่านทะเบียนไม่ได้ ⇒ โซนที่หาไม่เจอเป็น "ยังอ่านไม่ได้" ไม่ใช่ "กำพร้า"', () => {
  const sites = [
    { id: 'ST-1', code: 'ST-1044', name: 'สาขาพระราม 9' },
    { id: 'ST-2', code: 'ST-1045', name: 'สาขาบางนา' },
  ];
  /* ไซต์ที่พังถูกตั้งเป็น [] เหมือนที่จอทำจริง (loadSiteZones คืน zones: [] พร้อม error) */
  const zonesBySite = { 'ST-1': [{ id: 'ZN-1', code: 'Z-1044-01', name: 'ทางเข้าหลัก' }], 'ST-2': [] };
  const picked = ['ZN-1', 'ZN-9'];

  const broken = historicalZoneBrowser({
    sites, zonesBySite, pickedZoneIds: picked,
    siteErrors: { 'ST-2': 'โหลดโซนของไซต์ ST-1045 ไม่สำเร็จ' },
  });
  assert.deepEqual(broken.orphans, [], 'ห้ามเรียกว่ากำพร้า — ปุ่มถอดของก้อนนั้นลบบรรทัดจริง');
  assert.deepEqual(broken.unresolved, ['ZN-9'], 'ต้องยกมาบอกในกองที่มีแต่ปุ่มลองอ่านใหม่');
  /* โซนที่อยู่ในไซต์ที่อ่านสำเร็จยังต้องไม่ถูกลากมาด้วย (มันมีแถวให้ถอนติ๊กอยู่แล้ว) */
  assert.equal(broken.unresolved.includes('ZN-1'), false);

  /* กดลองอีกครั้งแล้วอ่านผ่าน (ไม่มี error เหลือ) ⇒ ตัดสินได้ว่าหายจริง ⇒ ปุ่มถอดกลับมา */
  const healed = historicalZoneBrowser({ sites, zonesBySite, pickedZoneIds: picked });
  assert.deepEqual(healed.orphans, ['ZN-9']);
  assert.deepEqual(healed.unresolved, []);

  /* ค่าว่าง/undefined ใน siteErrors ไม่ใช่ "พัง" — retrySite เขียน undefined ทับตอนอ่านผ่าน */
  const cleared = historicalZoneBrowser({
    sites, zonesBySite, pickedZoneIds: picked, siteErrors: { 'ST-2': undefined, 'ST-1': '' },
  });
  assert.deepEqual(cleared.orphans, ['ZN-9']);
  assert.deepEqual(cleared.unresolved, []);

  /* ยังโหลดไม่เสร็จ = ยังไม่ตัดสินทั้งสองกอง */
  const loading = historicalZoneBrowser({ sites, zonesBySite, pickedZoneIds: picked, ready: false });
  assert.deepEqual(loading.orphans, []);
  assert.deepEqual(loading.unresolved, []);
  assert.deepEqual(historicalZoneBrowser({}).unresolved, []);
});

// ── รีวิว/UAT 23/09 รอบ "ไม่ต่างจากใบเสนอราคา": แถวใหม่ · ความกว้าง · ราคาของแผน · กล่องสรุป · บรรทัดของตาราง ──

/* 🐞 แถวที่ติ๊กโซนแล้วแต่ยังไม่เลือกแพ็คเกจ (ทางปกติเมื่อ "ใช้แพ็คเกจเดียวกันทุกโซน" ยังว่าง) ไม่มี `_lineKind`
   ⇒ เซลล์เปิดดรอปดาวน์หน่วยให้เลือก ทั้งที่บรรทัดสินค้าใหม่ของใบเสนอราคาล็อกเป็น "หน่วย: ชิ้น"
   และหน่วยที่เลือก (เช่น "ชุด") ถูกแพ็คเกจทับทิ้งเงียบ ๆ · โหลดใบมาแก้ก็ต้องได้แถวรูปเดียวกัน */
test('⭐ แถวโซน = บรรทัดสินค้าใหม่ของใบเสนอราคา (`_lineKind: product` · หน่วยตั้งต้น) ทั้งตอนติ๊กและตอนโหลดใบมาแก้', () => {
  const fresh = emptyHistoricalZone({ zoneId: 'ZN-1', siteId: 'ST-1' });
  assert.equal(fresh._lineKind, 'product');
  assert.equal(fresh.unit, 'ชิ้น', 'หน่วยตั้งต้นของบรรทัดสินค้าใหม่ในใบเสนอราคา (DEFAULT_SALE_UNIT)');
  assert.equal(fresh.unitPrice, '');
  assert.equal(fresh.qty, '', 'จำนวนเริ่มที่ว่าง — ข้อยกเว้นที่ตั้งใจ (ว่าง = ตีกลับ ไม่ใช่ 1)');
  const hydrated = wizardStateFromOrder({
    id: 'SO-1', status: 'draft',
    lines: [{ serviceZoneId: 'ZN-1', productId: 'PRD-1', fgCode: 'FG-1', unit: 'แพ็คเกจ', unitPrice: 3500, qty: 12, sortOrder: 0 }],
  });
  assert.equal(hydrated.zones[0]._lineKind, 'product');
  assert.equal(hydrated.zones[0].unit, 'แพ็คเกจ');
});

/* 🐞 วัดจริง 23/09: รางขั้น + แถบสรุป 330px ⇒ เนื้อขั้น 816px (จอ 1440) · 866px (จอ 1920) — ตารางรายการของใบเสนอราคา
   พับเป็นการ์ดต่อบรรทัดเมื่อกล่องแคบกว่า 900 ⇒ ขั้นที่วาดตารางรายการ (② แก้ไข · ④ ฝั่งอ่าน) ต้องไม่มีแถบสรุป */
test('⭐ ไม่มีแถบสรุปข้างขวาในขั้นไหนแล้ว — ① ย้ายขึ้นหัวเอกสาร · ③ อยู่ในกล่องสรุปท้ายตารางงวด (มติ 25/09)', () => {
  assert.deepEqual([...HISTORICAL_FULL_WIDTH_STEPS], [...HISTORICAL_WIZARD_STEP_ORDER]);
  assert.equal(intakeForm.historicalStepShowsAside, undefined, 'ตัวตัดสินรายขั้นถูกถอด — ไม่มีขั้นไหนต้องถามแล้ว');
});

/* 🐞 แผนอ่านราคาจากทะเบียนตอนกดตรวจ แต่แถวถือราคาที่เติมตอนเลือกแพ็คเกจ (ลิสต์แคช 2 นาที · ใบที่ถูกตีกลับ
   แล้วเปิดใหม่) ⇒ เซลล์ "จำนวนเงิน" กับยอดไซต์พูดราคาเก่า ขณะที่ยอดใบ/ขั้น ③/④ พูดราคาของแผน = จอเดียวสองตัวเลข */
test('⭐ ราคา/หน่วยของแผนไหลกลับลงแถวบนจอ — เซลล์ ยอดไซต์ และยอดใบพูดเลขเดียวกันหลังตรวจ', () => {
  const stale = filledState({
    vatRate: 7,
    zones: [
      emptyHistoricalZone({ ...zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty: '12' }), unitPrice: 1000 }),
      emptyHistoricalZone({ ...zoneFromProduct({ zoneId: 'ZN-2', productId: 'PRD-1', qty: '5' }), unit: 'ชิ้น' }),
    ],
    installments: [], hasOpening: false,
  });
  const plan = planHistoricalServiceOrder(historicalWizardBody(stale, {}), planCtx);
  const cleanPlan = { ...plan, errors: [] };   // เส้นพรีวิวคืนแผนเฉพาะตอนไม่มี error
  assert.notEqual(historicalZoneLineAmount(stale.zones[0]).lineTotal, cleanPlan.lines[0].lineTotal, 'ก่อนแก้: เซลล์พูดราคาเก่า');

  const synced = historicalZonesWithPlanPrices(stale.zones, cleanPlan);
  assert.notEqual(synced, stale.zones);
  assert.deepEqual(synced.map((row) => [row.unit, row.unitPrice]), [['แพ็คเกจ', 1200], ['แพ็คเกจ', 1200]]);
  assert.deepEqual(synced.map((row) => [row.key, row.qty, row.zoneId]), stale.zones.map((row) => [row.key, row.qty, row.zoneId]),
    'แตะแค่หน่วยกับราคา — ช่องที่ผู้คีย์กรอกไม่ขยับ');
  const cells = synced.map((row) => historicalZoneLineAmount(row).lineTotal);
  assert.deepEqual(cells, cleanPlan.lines.map((line) => line.lineTotal), 'เซลล์ "จำนวนเงิน" = บรรทัดของแผน');
  assert.equal(cells.reduce((sum, value) => sum + value, 0), cleanPlan.header.subtotal, 'ผลรวมเซลล์ = ยอดรวมสินค้า/บริการของแผน');

  /* ไม่มีอะไรเปลี่ยน = อ้างอิงเดิม (ผู้เรียกใช้ !== ตัดสินว่าจะตั้ง state/อ่านทะเบียนใหม่ไหม) */
  assert.equal(historicalZonesWithPlanPrices(synced, cleanPlan), synced);
  /* แผนที่ยังมี error ไม่ถูกเชื่อ · ไม่มีแผน · แพ็คเกจไม่ตรงกับบรรทัดของแผน (ผู้คีย์เปลี่ยนไปแล้ว) = ไม่แตะ */
  assert.equal(historicalZonesWithPlanPrices(stale.zones, { ...cleanPlan, errors: [{ field: 'x', message: 'y' }] }), stale.zones);
  assert.equal(historicalZonesWithPlanPrices(stale.zones, null), stale.zones);
  const switched = [{ ...stale.zones[0], productId: 'PRD-9' }];
  assert.equal(historicalZonesWithPlanPrices(switched, cleanPlan), switched);
  /* ราคาในแผนเป็นศูนย์ (ยังไม่ตั้งราคา) ไม่เขียนทับ — แผนแบบนั้นมี error อยู่แล้ว แต่ตัวนี้ไม่ฝากความถูกไว้กับข้อนั้น */
  const unpriced = { ...cleanPlan, lines: cleanPlan.lines.map((line) => ({ ...line, unitPrice: 0 })) };
  assert.equal(historicalZonesWithPlanPrices(stale.zones, unpriced), stale.zones);
});

/* ⭐ กล่องสรุปท้ายตารางของขั้น ② และ ④ อ่านตัวเดียวกัน — ป้ายของใบเสนอราคา · ยังไม่รู้ยอด = ขีด (ห้าม 0.00) */
test('⭐ historicalTotalsView: ป้ายท้ายตารางของใบเสนอราคา · VAT บอกตัวเลือกของใบ · ไม่รู้ยอด = ขีด', () => {
  const known = historicalTotalsView({ ok: true, subtotal: 42000, vatAmount: 2940, totalAmount: 44940 }, 7);
  assert.deepEqual(known.rows.map((row) => row.id), ['subtotal', 'vat']);
  assert.equal(known.rows[0].label, 'ยอดรวมสินค้า/บริการ');
  assert.equal(known.rows[1].label, `ภาษีมูลค่าเพิ่ม (${QUOTE_VAT_OPTIONS.find((o) => o.value === 7).label})`);
  assert.match(known.rows[0].value, /42,000\.00/);
  assert.match(known.rows[1].value, /2,940\.00/);
  assert.match(known.grandTotal, /44,940\.00/);
  const included = historicalTotalsView({ ok: true, subtotal: 42000, vatAmount: 0, totalAmount: 42000 }, 0);
  assert.equal(included.rows[1].label, `ภาษีมูลค่าเพิ่ม (${QUOTE_VAT_OPTIONS.find((o) => o.value === 0).label})`);
  assert.equal(included.rows[1].value, null, 'รวม VAT แล้ว = แถว VAT เป็นขีด เหมือนท้ายตารางใบเสนอราคา');
  const unknown = historicalTotalsView({ ok: false, subtotal: null, vatAmount: null, totalAmount: null }, null);
  assert.equal(unknown.rows[1].label, 'ภาษีมูลค่าเพิ่ม', 'ยังไม่เลือก VAT = ไม่เดาตัวเลือก');
  assert.deepEqual(unknown.rows.map((row) => row.value), [null, null]);
  assert.equal(unknown.grandTotal, '—');
  /* ⭐ มติ 25/09: กล่องสรุปของขั้น ② เป็นกล่องแบบแก้ได้ (`QuoteLineTotalsEditor`) — อ่าน `values` ชุดเดียวกับแถว */
  assert.deepEqual(unknown.values, { subtotal: null, discount: null, afterDiscount: null, vat: null, total: null });
  assert.deepEqual(known.values, {
    subtotal: '฿42,000.00', discount: null, afterDiscount: null, vat: '฿2,940.00', total: '฿44,940.00',
  });
  assert.equal(included.values.vat, null);
});

/* ⭐ บรรทัดของตารางรายการ — ชื่อจุดแบบที่แผนเขียนลงบรรทัด · ปุ่มลบ = ลบบรรทัด
   ⭐ มติ 25/09: ชื่อบรรทัดของโปรแกรมอ่านหน้าจอเป็น "รายการ N" เสมอ (คำเดียวกับใบเสนอราคา · เลขเดียวกับคอลัมน์ "#" ·
      ป้ายเดียวกับที่แผนใช้นำ error) — ของเดิม "รายการของโซน <ชื่อ>" พูดไม่ได้กับบรรทัดใหม่ที่ยังไม่เลือกโซน
   🔴 N1: ยังอ่านทะเบียนไม่ครบ/กำลังโหลด = ลบไม่ได้ (ยังไม่รู้ว่าหายจริงไหม) · กำพร้าจริง = ลบได้ (R10) */
test('⭐ historicalZoneLines: ไซต์ · โซนใต้คำอธิบาย · ลำดับตามใบ · ปุ่มลบปิดเฉพาะตอนยังตัดสินไม่ได้', () => {
  const sites = [{ id: 'ST-1', code: 'ST-1', name: 'สยามพารากอน' }, { id: 'ST-2', code: 'ST-2', name: 'เซ็นทรัลเวิลด์' }];
  const zonesBySite = { 'ST-1': [{ id: 'ZN-1', name: 'ล็อบบี้' }], 'ST-2': [{ id: 'ZN-2', name: 'ห้องน้ำ' }] };
  const zones = [emptyHistoricalZone({ zoneId: 'ZN-2' }), emptyHistoricalZone({ zoneId: 'ZN-1' }), emptyHistoricalZone({ zoneId: 'ZN-X' })];

  const ok = historicalZoneLines({ zones, sites, zonesBySite, ready: true });
  assert.deepEqual(ok.map((line) => line.index), [0, 1, 2]);
  assert.deepEqual(ok.map((line) => line.point), ['ST-2 เซ็นทรัลเวิลด์ · ห้องน้ำ', 'ST-1 สยามพารากอน · ล็อบบี้', null]);
  assert.deepEqual(ok.map((line) => line.name), ['รายการ 1', 'รายการ 2', 'รายการ 3']);
  assert.deepEqual(ok.map((line) => line.site?.id || null), ['ST-2', 'ST-1', null]);
  assert.match(ok[2].note, /ZN-X — ไม่อยู่ในทะเบียนที่โหลดมา/);
  assert.equal(ok[0].note, null);
  assert.deepEqual(ok.map((line) => line.removable), [true, true, true], 'กำพร้าจริงถอดได้ (R10)');

  const blind = historicalZoneLines({ zones, sites, zonesBySite, siteErrors: { 'ST-2': 'พัง' }, ready: true });
  assert.equal(blind[2].removable, false, 'N1: ยังมีไซต์ที่อ่านไม่ได้ = ห้ามลบบรรทัดที่หาไม่เจอ');
  assert.match(blind[2].removeTitle, /ลองอ่านไซต์ที่พังอีกครั้ง/);
  assert.match(blind[2].note, /ZN-X — ยังอ่านทะเบียนไม่ได้/);
  assert.equal(blind[0].removable, true, 'บรรทัดที่หาเจอแล้วถอดได้ตามปกติ');

  const loading = historicalZoneLines({ zones, sites: [], zonesBySite: {}, ready: false });
  assert.deepEqual(loading.map((line) => line.removable), [false, false, false]);
  assert.ok(loading.every((line) => line.note === 'กำลังโหลดทะเบียนไซต์…'));
});

/* ⭐ มติ 25/09: บรรทัดใหม่จากปุ่ม "เพิ่มรายการ" ยังไม่มีโซน — **ไม่ใช่ของที่หาย** ⇒ ไม่มีเหตุค้าง และลบได้เสมอ
   🪤 ถ้าตัวตัดสินอ่าน "ไม่มีโซน" เป็น "หาโซนไม่เจอ": ระหว่างโหลด/ไซต์พัง บรรทัดที่เพิ่งกดเพิ่มจะลบไม่ได้
      (ปุ่มลบปิดด้วยเหตุ N1 ที่ไม่เกี่ยวกับมัน) และขึ้นเหตุ " — ไม่อยู่ในทะเบียน" ที่มีแต่ขีดนำหน้า */
test('⭐ historicalZoneLines: บรรทัดที่ยังไม่เลือกโซน = ไม่มีเหตุ · ลบได้ แม้ทะเบียนกำลังโหลดหรือมีไซต์ที่พัง', () => {
  const zones = [emptyHistoricalZone(), emptyHistoricalZone({ zoneId: 'ZN-9' })];
  for (const options of [
    { sites: [], zonesBySite: {}, ready: false },
    { sites: [{ id: 'ST-1' }], zonesBySite: { 'ST-1': [] }, siteErrors: { 'ST-1': 'พัง' }, ready: true },
    { sites: [{ id: 'ST-1' }], zonesBySite: { 'ST-1': [] }, ready: true },
  ]) {
    const [fresh, bound] = historicalZoneLines({ zones, ...options });
    assert.deepEqual(
      [fresh.note, fresh.point, fresh.removable, fresh.removeTitle, fresh.name],
      [null, null, true, null, 'รายการ 1'],
      JSON.stringify(options),
    );
    assert.ok(bound.note, 'บรรทัดที่ผูกโซนไว้แต่หาไม่เจอยังต้องบอกเหตุ');
  }
});

// ── ⑥ มติเจ้าของ 25/09: ขั้น ② = ตารางรายการของใบเสนอราคาตารางเดียว + ไซต์ · โซนในบรรทัด · ส่วนลดท้ายใบ · VAT ในกล่องสรุป ──
//
// 🐞 ที่มา (ของเดิมกลับหัวกับใบเสนอราคา): ติ๊กโซนบนการ์ดไซต์นอกตารางก่อนบรรทัดถึงเกิด · โซนในบรรทัดเป็นตัวหนังสือเปลี่ยนไม่ได้ ·
//    ถอนติ๊ก = บรรทัดหายพร้อมจำนวน/ส่วนลดไม่ถาม · error เดียวกันขึ้นสามที่และค้างแม้แก้แล้ว · ช่อง "ใช้แพ็คเกจเดียวกันทุกโซน"
//    เททับทุกบรรทัดเงียบ ๆ · ใบย้อนหลังไม่มีส่วนลดท้ายใบ ("ส่วนลดรายบรรทัด รายใบก็ควรครบ")

/* 🐞 ช่อง "ใช้แพ็คเกจเดียวกันทุกโซน" ไม่บันทึกอะไรของตัวเอง แต่ **เททับแพ็คเกจของทุกบรรทัดที่มีอยู่เงียบ ๆ** และตอนเปิดแก้ใบ
   อ่านค่าจากบรรทัดแรก (ใบที่แต่ละบรรทัดใช้คนละแพ็คเกจโชว์เหมือนใช้แพ็คเกจเดียว) ⇒ มติ 25/09 ถอดทั้งช่องและ state
   (งานเดียวที่ช่องนั้นตั้งใจทำย้ายไปหน้าต่าง "เพิ่มหลายโซน" ซึ่ง **เพิ่มบรรทัดใหม่อย่างเดียว** ไม่แตะบรรทัดเดิม) */
test('🚫 มติ 25/09: state ไม่มี packageProductId แล้ว — ทั้งฟอร์มเปล่า ใบที่โหลดมาแก้ body และชุดที่ล้างตอนเปลี่ยนลูกค้า', () => {
  assert.ok(!('packageProductId' in emptyHistoricalWizard()));
  const hydrated = wizardStateFromOrder(ORDER);
  assert.ok(!('packageProductId' in hydrated), 'ของเดิมเติมจากบรรทัดแรก = ใบหลายแพ็คเกจโชว์เหมือนแพ็คเกจเดียว');
  assert.ok(!('packageProductId' in historicalWizardBody(hydrated, {})));
  assert.ok(!('packageProductId' in historicalDownstreamReset(hydrated, 'customer').patch));
});

/* ⭐ ปุ่ม "เพิ่มรายการ" = บรรทัดสินค้าใหม่ของใบเสนอราคา: ว่างทุกช่องที่เป็นการตัดสินใจ (โซน · แพ็คเกจ · จำนวน)
   · `key` คือตัวตนของแถว ไม่ใช่ zoneId (บรรทัดใหม่ยังไม่มีโซน และเปลี่ยนโซนในบรรทัดได้) */
test('⭐ บรรทัดใหม่จาก "เพิ่มรายการ": ไม่มีโซน ไม่มีแพ็คเกจ จำนวนว่าง · key ไม่ซ้ำ · body ส่งต่อให้แผนตีกลับรายช่อง', () => {
  const [a, b] = [emptyHistoricalZone(), emptyHistoricalZone()];
  assert.deepEqual([a.zoneId, a.siteId, a.productId, a.qty, a.rounds, a.discountType], ['', '', '', '', '', null]);
  assert.equal(a._lineKind, 'product');
  assert.notEqual(a.key, b.key);
  /* บรรทัดว่างต้องไม่หายเงียบ ๆ ก่อนถึงด่าน — แผนเป็นคนบอกว่าขาดช่องไหน (ดูเทสต์ historicalLineIssues) */
  assert.deepEqual(historicalWizardBody({ ...emptyHistoricalWizard(), zones: [a] }, {}).zones, [{
    zoneId: null, productId: null, qty: '', discountType: null, discountValue: '', rounds: '',
  }]);
});

/* 🐞 อาการเดียวกับ UAT 23/09 (จอพูดถึงของที่ไม่มีอยู่จริง): VAT ย้ายลงขั้น ② แล้ว แต่ป้ายรองของรางยังบอกว่าขั้น ① ถาม VAT
   ⇒ ผู้คีย์ย้อนไปหาช่องที่ไม่มี (ป้ายรองโผล่ทั้งบนรางตอนขั้นยังว่าง และใน title ของแถวราง) */
test('⭐ ป้ายรองของรางตรงกับช่องที่อยู่บนแต่ละขั้นจริง — ขั้น ① ไม่ถาม VAT แล้ว · ขั้น ② เป็นรายการแบบใบเสนอราคา', () => {
  const hint = Object.fromEntries(HISTORICAL_WIZARD_STEPS.map((s) => [s.key, s.hint]));
  assert.equal(hint.contract, 'ลูกค้า · เอกสารแทนสัญญา');
  assert.doesNotMatch(hint.contract, /VAT/);
  assert.equal(hint.zones, 'รายการแบบใบเสนอราคา + ไซต์ · โซน');
});

/* 🔴 กฎเหล็กรีวิว S8 ("ถามได้เฉพาะข้อที่มีช่องให้ตอบอยู่บนจอจริง") กับการย้าย VAT (มติ 25/09):
   ถ้าข้อ VAT ยังสังกัดขั้น ① ⇒ "ถัดไป" ของขั้น ① ติดด่านที่ไม่มีช่องให้ตอบวนไม่จบ · ปุ่มบันทึก/"กลับไปแก้" พาไปขั้น ①
   ที่ไม่มีช่อง VAT · จุดยึดชี้ id ที่ไม่มีบนขั้นนั้น — ทางตันเดียวกับช่องทีมและใบ ฿0 ที่ S8 จับได้ */
test('🔴 VAT ที่ยังไม่เลือกบล็อกขั้น ② (ที่มีช่อง) ไม่ใช่ขั้น ① — ทั้ง "ถัดไป" ราง และทางกลับไปแก้', () => {
  const base = { role: 'ac', userId: 'USR-AC', contractFileCount: 1, evidenceFileCount: 1 };
  const state = filledState({ vatRate: null });
  const local = historicalWizardLocalIssues(state, base);
  assert.deepEqual(local.map((i) => i.field), ['vatRate']);
  assert.equal(historicalNextBlock(local, 'contract').blocked, false, 'ขั้น ① ไม่มีช่อง VAT แล้ว — ห้ามติดด่านที่นี่');
  const atZones = historicalNextBlock(local, 'zones');
  assert.equal(atZones.blocked, true);
  assert.equal(atZones.field, 'vatRate');
  assert.equal(atZones.anchorId, 'hist-f-vat', 'พาไปช่อง VAT ในกล่องสรุป (vatId ของ QuoteLineTotalsEditor)');
  assert.equal(firstStepWithIssues(local), 'zones');

  /* ข้อที่ server ตีกลับ (ส่วนลดท้ายใบ) ก็พากลับขั้น ② — ช่องอยู่กล่องเดียวกัน */
  const exit = historicalSaveExit(apiError(400, {
    error: PLAN_DISCOUNT_MESSAGES.percent, errors: [{ field: 'discount', message: PLAN_DISCOUNT_MESSAGES.percent }],
  }));
  assert.equal(exit.goToStep, 'zones');

  /* ราง: ข้อ VAT ทำให้ขั้น ② เหลือง ไม่ใช่ขั้น ① · ขั้น ① ผ่านแล้ว ⇒ แตะขั้น ② ได้ (ช่องที่ต้องแก้อยู่ที่นั่น) */
  const rail = Object.fromEntries(historicalWizardRail(state, { step: 'contract', localIssues: local }).map((r) => [r.key, r]));
  assert.equal(rail.contract.issues, 0);
  assert.equal(rail.zones.tone, 'some');
  assert.equal(rail.zones.blocked, null);
});

/* 🐞 อาการเดียวกับ UAT 23/09 ("ตรวจอีกครั้ง" ที่ไม่มีปุ่ม): เหตุของยอดใบเคยสั่ง "เลือก VAT ของใบในขั้น ①" — หลังช่องย้ายไปขั้น ②
   ข้อความนี้ขึ้นใต้กล่องสรุปของขั้น ② เองและบนขั้น ③ ⇒ ชี้ผิดที่ = ผู้คีย์เดินกลับไปขั้นที่ไม่มีช่อง */
test('⭐ เหตุที่ยอดใบยังคิดไม่ได้ชี้ช่องที่มีอยู่จริง: VAT/ส่วนลด = กล่องสรุปขั้น ② · บรรทัด = ตาราง (พูดเป็น "บรรทัด")', () => {
  assert.match(HISTORICAL_MONEY_UNKNOWN.vat, /กล่องสรุปท้ายตารางรายการ \(ขั้น ②\)/);
  assert.ok(HISTORICAL_MONEY_UNKNOWN.discount.startsWith(HISTORICAL_DISCOUNT_MESSAGES.value),
    'ข้อความก้อนเดียวกับที่แผนตีกลับ — ไม่ใช่คำที่สอง');
  assert.match(HISTORICAL_MONEY_UNKNOWN.discount, /กล่องสรุป \(ขั้น ②\)/);
  assert.match(HISTORICAL_MONEY_UNKNOWN.zones, /เพิ่มรายการอย่างน้อย 1 บรรทัด/);
  for (const [key, message] of Object.entries(HISTORICAL_MONEY_UNKNOWN)) {
    assert.doesNotMatch(message, /ขั้น ①/, key);
    assert.doesNotMatch(message, /ของทุกโซน|บางโซน|โซนนั้น/, `${key}: ขั้น ② พูดเป็นบรรทัดแล้ว (บรรทัดใหม่อาจยังไม่มีโซน)`);
  }
  assert.equal(HISTORICAL_DISCOUNT_MESSAGES, PLAN_DISCOUNT_MESSAGES, 're-export ก้อนเดียวกับแผน');
});

// ── ส่วนลดท้ายใบ (มติ 25/09 — "ส่วนลดรายบรรทัด รายใบก็ควรครบ") ────────────────────────────────

/* ⭐ ลำดับเหตุตามลำดับบนจอ: ตารางรายการอยู่บน กล่องสรุป (ส่วนลด → VAT) อยู่ล่าง ⇒ ข้อบนสุดที่ยังผิดคือเหตุที่พูด
   ⭐ ยังไม่เลือก VAT แต่บรรทัดและส่วนลดครบ = รู้ยอดรวมสินค้า/บริการกับส่วนลดแล้ว (กล่องของใบเสนอราคาพูดได้เสมอ) */
test('⭐ ยอดใบ: ลำดับเหตุ รายการ → ส่วนลดท้ายใบ → VAT · ยังไม่เลือก VAT ก็ยังพูดยอดรวมกับส่วนลดได้ (ok ยังเท็จ)', () => {
  const lines = [zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty: '10' })];   // 10 × 1,200 = 12,000
  const at = (extra) => historicalMoneyView(filledState({ zones: lines, ...extra }), null);

  const blankLine = historicalMoneyView(filledState({
    zones: [...lines, emptyHistoricalZone()], vatRate: null, discountType: 'percent', discountValue: '150',
  }), null);
  assert.equal(blankLine.reason, HISTORICAL_MONEY_UNKNOWN.lines, 'บรรทัดที่ยังไม่ครบชนะทุกข้อในกล่องสรุป');

  const badDiscount = at({ vatRate: null, discountType: 'percent', discountValue: '150' });
  assert.equal(badDiscount.reason, HISTORICAL_MONEY_UNKNOWN.discountPercent,
    'ส่วนลด (บนกว่า) ชนะ VAT ที่ยังไม่เลือก · % เกิน 100 พูดเหตุของตัวเอง (รีวิว 25/09 — ไม่ใช่ "ต้องเป็นตัวเลข ≥ 0")');
  assert.equal(at({ vatRate: null, discountType: 'amount', discountValue: '-5' }).reason, HISTORICAL_MONEY_UNKNOWN.discount,
    'ติดลบ/ไม่ใช่ตัวเลข = เหตุ "ต้องเป็นตัวเลขตั้งแต่ 0"');
  assert.deepEqual([badDiscount.subtotal, badDiscount.discountAmount], [null, null], 'ส่วนลดผิด = ยังไม่มียอดครึ่งไหนให้พูด');

  const noVat = at({ vatRate: null, discountType: 'percent', discountValue: '10' });
  assert.deepEqual(
    [noVat.ok, noVat.reason, noVat.subtotal, noVat.discountAmount, noVat.vatAmount, noVat.totalAmount],
    [false, HISTORICAL_MONEY_UNKNOWN.vat, 12000, 1200, null, null],
  );
  const done = at({ vatRate: 7, discountType: 'percent', discountValue: '10' });
  assert.deepEqual(
    [done.ok, done.source, done.subtotal, done.discountAmount, done.vatAmount, done.totalAmount],
    [true, 'local', 12000, 1200, 756, 11556],
    'VAT คิดจากยอดหลังหักส่วนลด (10,800 × 7%) แบบใบเสนอราคา',
  );
});

/* ⭐ กระจกของด่านในแผน (ไม่ใช่กฎชุดที่สอง): ชนิดที่รู้จัก · ค่า ≥ 0 · % ไม่เกิน 100 · เลือกชนิดแล้วเว้นว่าง = 0
   ⇒ ฟอร์มพูด "ยังคิดไม่ได้เพราะส่วนลด" ⇔ แผนตีกลับที่ช่อง `discount` · ยอดส่วนลดที่ผ่านต้องเท่ากันทุกสตางค์ */
test('⭐ ส่วนลดท้ายใบ: ฟอร์มคิดไม่ได้ ⇔ แผนตีกลับที่ช่อง discount · ยอดที่ผ่านเท่าแผน (ทุกกรณีขอบ)', () => {
  const lines = [zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty: '10' })];   // 12,000
  for (const [discountType, discountValue, bad, amount] of [
    [null, '', false, 0],
    [null, '999', false, 0],                  // ไม่เลือกชนิด = ไม่ลด · ค่าที่ค้างจากตอนเลือกไว้ไม่ถูกอ่าน
    ['percent', '', false, 0],                // เลือกชนิดแล้วเว้นว่าง = 0 ไม่ใช่ error (ศูนย์ไม่ใช่การตัดสินใจ)
    ['amount', '', false, 0],
    ['percent', '0', false, 0],
    ['percent', '100', false, 12000],
    ['percent', '100.01', true, null],
    ['amount', '-1', true, null],
    ['amount', 'abc', true, null],
    ['amount', '500', false, 500],
    ['amount', '20000', false, 12000],        // เกินยอด = ตัดที่ยอด (quoteTotals) ไม่ติดลบ
    ['foo', '10', false, 0],                  // ชนิดที่ไม่รู้จักไม่ไหลขึ้น body ⇒ ไม่ลดทั้งสองฝั่ง
  ]) {
    const label = `${discountType} / ${JSON.stringify(discountValue)}`;
    const state = filledState({ zones: lines, vatRate: 7, discountType, discountValue });
    const view = historicalMoneyView(state, null);
    const plan = planHistoricalServiceOrder(historicalWizardBody(state, {}), planCtx);
    const formBad = [HISTORICAL_MONEY_UNKNOWN.discount, HISTORICAL_MONEY_UNKNOWN.discountPercent].includes(view.reason);
    assert.equal(formBad, bad, `ฟอร์ม · ${label}`);
    if (bad) {
      /* เหตุของฟอร์มพูดคำเดียวกับที่แผนตีกลับ (ข้อความของแผนอยู่หน้าขีดของเหตุฝั่งฟอร์ม) */
      const planMessage = plan.errors.find((issue) => issue.field === 'discount')?.message || '';
      assert.ok(view.reason.startsWith(planMessage), `เหตุตรงกัน · ${label}: ${view.reason} vs ${planMessage}`);
    }
    assert.equal(plan.errors.some((issue) => issue.field === 'discount'), bad, `แผน · ${label}`);
    if (!bad) {
      assert.equal(view.discountAmount, amount, label);
      assert.equal(plan.header.discountAmount, amount, label);
      assert.equal(view.totalAmount, plan.header.totalAmount, label);
    }
  }
});

test('⭐ historicalMoneyView: ยอดส่วนลดท้ายใบมากับทั้งสามทาง — แผน · ยอดที่ server ส่งมากับ 400 · คิดเอง', () => {
  const state = filledState({ zones: [zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty: '10' })], discountType: 'amount', discountValue: '200' });
  const local = historicalMoneyView(state, null);
  assert.deepEqual([local.source, local.discountAmount], ['local', 200]);

  const plan = { header: { subtotal: 12000, discountAmount: 1200, vatAmount: 756, totalAmount: 11556 }, errors: [] };
  const fromPlan = historicalMoneyView(state, plan);
  assert.deepEqual([fromPlan.source, fromPlan.discountAmount, fromPlan.totalAmount], ['plan', 1200, 11556],
    'แผนชนะเสมอ (ยอดส่วนลดของแผนคือยอดที่ลงฐาน)');

  /* R7 ครึ่ง server: `previewPlanMoney` พก discountAmount มาด้วย ⇒ ขั้น ③ พูดเลขเดียวกับฐานตั้งแต่ก่อนแผนผ่าน */
  const fromServer = historicalMoneyView(state, null, { subtotal: 12000, discountAmount: 300, vatAmount: 819, totalAmount: 12519 });
  assert.deepEqual([fromServer.source, fromServer.discountAmount, fromServer.totalAmount], ['server', 300, 12519]);
  assert.equal(historicalMoneyView(state, null, { subtotal: 1, vatAmount: 0, totalAmount: 1 }).discountAmount, 0,
    'ยอดจาก server รุ่นที่ไม่มี discountAmount = ไม่มีส่วนลด (ไม่ใช่ undefined)');
});

/* ⭐ กล่องสรุปแบบใบเสนอราคา: "หัก ส่วนลด" / "ยอดหลังหักส่วนลด" ขึ้นเฉพาะตอนมีส่วนลดจริง · ขั้น ② (แก้ได้) และ ④ (อ่าน) อ่านตัวเดียวกัน */
test('⭐ historicalTotalsView + ส่วนลดท้ายใบ: แถวแบบกล่องของใบเสนอราคา · ยังไม่เลือก VAT ก็พูดยอดรวม/ส่วนลดได้ · ขั้น ④ จาก header ของแผน', () => {
  const full = historicalTotalsView({ ok: true, subtotal: 12000, discountAmount: 1200, vatAmount: 756, totalAmount: 11556 }, 7);
  assert.deepEqual(full.rows.map((row) => [row.id, row.label, row.value]), [
    ['subtotal', 'ยอดรวมสินค้า/บริการ', '฿12,000.00'],
    ['discount', 'หัก ส่วนลด', '-฿1,200.00'],
    ['afterDiscount', 'ยอดหลังหักส่วนลด', '฿10,800.00'],
    ['vat', `ภาษีมูลค่าเพิ่ม (${QUOTE_VAT_OPTIONS.find((o) => o.value === 7).label})`, '฿756.00'],
  ]);
  assert.equal(full.grandTotal, '฿11,556.00');
  assert.deepEqual(full.values, {
    subtotal: '฿12,000.00', discount: '-฿1,200.00', afterDiscount: '฿10,800.00', vat: '฿756.00', total: '฿11,556.00',
  });

  /* ยังไม่เลือก VAT (historicalMoneyView ok:false พร้อมยอดครึ่งแรก) ⇒ สามแถวบนพูดได้ · VAT/ยอดทั้งสิ้นเป็นขีด (ห้าม 0.00) */
  const partial = historicalTotalsView({ ok: false, subtotal: 12000, discountAmount: 1200, vatAmount: null, totalAmount: null }, null);
  assert.deepEqual(partial.values, {
    subtotal: '฿12,000.00', discount: '-฿1,200.00', afterDiscount: '฿10,800.00', vat: null, total: null,
  });
  assert.equal(partial.grandTotal, '—');
  assert.equal(partial.rows.find((row) => row.id === 'vat').label, 'ภาษีมูลค่าเพิ่ม');

  /* ส่วนลด 0 = ไม่มีแถวส่วนลด · ยอดรวมยังไม่รู้ = ห้ามพูด "หัก" จากยอดที่ไม่รู้ */
  assert.deepEqual(historicalTotalsView({ ok: true, subtotal: 12000, discountAmount: 0, vatAmount: 840, totalAmount: 12840 }, 7)
    .rows.map((row) => row.id), ['subtotal', 'vat']);
  const noSubtotal = historicalTotalsView({ ok: false, subtotal: null, discountAmount: 500 }, 7);
  assert.deepEqual(noSubtotal.rows.map((row) => row.id), ['subtotal', 'vat']);
  assert.equal(noSubtotal.values.discount, null);

  /* ขั้น ④ (WizardReviewStep): `historicalTotalsView({ ok: true, ...header }, header.vatRate)` จากแผนตัวจริง */
  const state = filledState({
    zones: [zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty: '10' })], discountType: 'percent', discountValue: '10',
  });
  const { header } = planHistoricalServiceOrder(historicalWizardBody(state, {}), planCtx);
  const review = historicalTotalsView({ ok: true, ...header }, header.vatRate);
  assert.deepEqual(review.values, full.values, 'ขั้นคีย์กับขั้นตรวจพูดเลขและป้ายเดียวกัน');
});

test('⭐ แถบสรุป: แถว "ส่วนลดท้ายใบ" ขึ้นเฉพาะใบที่มีส่วนลดจริง · อยู่ระหว่างยอดรวมกับ VAT', () => {
  const rows = historicalAsideRows(filledState({ discountType: 'amount', discountValue: '400' }), {});
  const ids = rows.map((row) => row.id);
  assert.deepEqual(ids.slice(ids.indexOf('subtotal'), ids.indexOf('vat') + 1), ['subtotal', 'discount', 'vat']);
  const by = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(by.discount.label, 'ส่วนลดท้ายใบ');
  assert.equal(by.discount.value, '-฿400.00');
  assert.equal(by.subtotal.value, '฿244,800.00');
  assert.equal(by.vat.value, '฿17,108.00', 'VAT จากยอดหลังหัก (244,400 × 7%)');
  /* ยังไม่เลือก VAT = แถบสรุปไม่เชื่อยอดครึ่งเดียว ⇒ ไม่มีแถวส่วนลดลอยอยู่ใต้ยอดรวมที่เป็นขีด */
  assert.ok(!historicalAsideRows(filledState({ vatRate: null, discountType: 'amount', discountValue: '400' }), {})
    .some((row) => row.id === 'discount'));
  /* มีแผนแล้วเชื่อแผน */
  const fromPlan = historicalAsideRows(filledState(), {
    plan: { header: { subtotal: 1000, discountAmount: 100, vatAmount: 63, totalAmount: 963 } },
  });
  assert.equal(fromPlan.find((row) => row.id === 'discount').value, '-฿100.00');
});

/* ⭐ ชนิด/ค่าของส่วนลดท้ายใบเก็บใน `metadata.historicalIntake` (คอลัมน์ของใบเก็บแค่ยอด `discountAmount`) — 0374 เขียน
   `p_header->'intake'` ทั้งก้อน ไม่ต้องแก้ฐาน · เปิดแก้แล้วต้องได้ % / บาท ตามที่คีย์ ไม่ใช่ยอดบาทที่คิดแล้ว
   🪤 ใบที่มียอดแต่ไม่มีชนิดใน intake (คีย์ก่อนมีช่องนี้) ⇒ ถอยเป็น "บาท" เท่ายอดเดิม — ทิ้งยอด = เปิดแก้แล้วยอดใบโตขึ้นเงียบ ๆ */
test('⭐ โหลดใบมาแก้: ส่วนลดท้ายใบอ่านกลับจาก intake · มียอดแต่ไม่มีชนิด ถอยเป็น "บาท" เท่ายอดเดิม', () => {
  const at = (intake, discountAmount) => {
    const state = wizardStateFromOrder({ ...ORDER, discountAmount, metadata: { historicalIntake: intake } });
    return [state.discountType, state.discountValue];
  };
  assert.deepEqual(at({ vatRate: 7, discountType: 'percent', discountValue: 10 }, 13908), ['percent', '10'],
    'ชนิด % ต้องกลับมาเป็น % — ไม่ใช่ยอดบาทที่คิดแล้ว (แก้บรรทัดแล้วส่วนลดต้องคิดใหม่ตาม %)');
  assert.deepEqual(at({ vatRate: 7, discountType: 'amount', discountValue: 1500 }, 1500), ['amount', '1500']);
  assert.deepEqual(at({ vatRate: 7, discountType: 'amount', discountValue: 0 }, 900), ['amount', '0'], 'intake ชนะยอดในคอลัมน์');
  assert.deepEqual(at({ vatRate: 7 }, 0), [null, '']);
  assert.deepEqual(at({ vatRate: 7 }, null), [null, '']);
  assert.deepEqual(at({ vatRate: 7 }, undefined), [null, '']);
  assert.deepEqual(at({ vatRate: 7 }, 1234.5), ['amount', '1234.5']);
  assert.deepEqual(at({ vatRate: 7, discountType: 'foo', discountValue: 5 }, 300), ['amount', '300'], 'ชนิดที่ไม่รู้จัก = เหมือนไม่มีชนิด');
  assert.deepEqual(at(undefined, '250'), ['amount', '250'], 'ยอดจากฐานมาเป็นสตริงตัวเลขได้');

  /* ถอยแล้วยอดใบต้องเท่าเดิม: บรรทัดของ ORDER = 82,080 + 57,000 = 139,080 · ส่วนลดเดิม 1,080 */
  const legacy = wizardStateFromOrder({ ...ORDER, discountAmount: 1080, metadata: { historicalIntake: { vatRate: 7 } } });
  const view = historicalMoneyView(legacy, null);
  assert.deepEqual([view.subtotal, view.discountAmount], [139080, 1080]);
});

/* ⭐ "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง" (AGENTS.md) — ส่วนลดท้ายใบต้องเดินครบวงโดยไม่เพี้ยน:
   ฟอร์ม → body → แผน → อาร์กิวเมนต์ RPC (`intake`) → ใบที่ลงฐาน → ฟอร์มแก้ → body ชุดเดิม */
test('⭐ สร้าง = แก้: ส่วนลดท้ายใบเดินครบวง ฟอร์ม → แผน → RPC intake → ใบ → ฟอร์มแก้ ได้ค่าชุดเดิม', () => {
  for (const discount of [
    { discountType: 'percent', discountValue: '12.5' },
    { discountType: 'amount', discountValue: '999.99' },
    { discountType: null, discountValue: '' },
  ]) {
    const state = filledState({ vatRate: 7, ...discount, zones: [zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty: '10', rounds: '12' })] });
    const body = historicalWizardBody(state, {});
    const plan = planHistoricalServiceOrder(body, planCtx);
    assert.ok(!plan.errors.some((issue) => issue.field === 'discount'), JSON.stringify(discount));
    const { p_header: header } = historicalServiceRpcArgs(plan, 'create');
    const back = wizardStateFromOrder({
      id: 'SOR-H1', status: 'draft', discountAmount: header.discountAmount, metadata: { historicalIntake: header.intake },
    });
    assert.deepEqual([back.discountType, back.discountValue, back.vatRate], [discount.discountType, discount.discountValue, 7],
      JSON.stringify(discount));
    const again = historicalWizardBody(back, {});
    assert.deepEqual([again.discountType, again.discountValue], [body.discountType, body.discountValue]);
  }
});

test('⭐ body: ส่วนลดท้ายใบส่ง discountType/discountValue ระดับหัวใบ — ไม่ลด = null / "" · ชนิดที่ไม่รู้จักไม่ไหลขึ้นไป', () => {
  const at = (discountType, discountValue) => {
    const body = historicalWizardBody(filledState({ discountType, discountValue }), {});
    return [body.discountType, body.discountValue];
  };
  assert.deepEqual(at(null, ''), [null, '']);
  assert.deepEqual(at(null, '50'), [null, ''], 'ค่าที่ค้างจากตอนเลือกชนิดไว้ ไม่ไหลขึ้นไปเมื่อเลิกลด');
  assert.deepEqual(at(undefined, undefined), [null, '']);
  assert.deepEqual(at('percent', '10'), ['percent', '10']);
  assert.deepEqual(at('amount', 500), ['amount', '500']);
  assert.deepEqual(at('amount', ' 7.25 '), ['amount', '7.25']);
  assert.deepEqual(at('percent', ''), ['percent', ''], 'ว่าง = 0 เป็นหน้าที่ของแผน — ตัวประกอบไม่เดาเลขให้');
  assert.deepEqual(at('foo', '10'), [null, '']);
  /* อยู่หัวใบ ไม่ใช่ในบรรทัด — ส่วนลดรายบรรทัดยังเป็นของบรรทัด (สองช่องคนละความหมาย) */
  const body = historicalWizardBody(filledState({ discountType: 'percent', discountValue: '10' }), {});
  assert.equal(body.zones[0].discountType, null);
  assert.ok(!('discount' in body), 'ไม่มีก้อนซ้อน — ชื่อคีย์เดียวกับที่แผนอ่าน (body.discountType/discountValue)');
});

// ── ช่อง "ไซต์ · โซน" ในบรรทัด (historicalZonePickerOptions) ─────────────────────────────────────

const PICK = {
  sites: [
    site('ST-1', 'ST-1002', 'สยามพารากอน'),
    site('ST-2', 'ST-1044', 'สยามดิสคัฟเวอรี่'),
    site('ST-3', 'ST-2050', 'ไซต์ที่ยังไม่มีโซน'),
  ],
  zonesBySite: {
    'ST-1': [zone('Z-1', 'Z-1002-01', 'ชั้น G ล็อบบี้'), zone('Z-2', 'Z-1002-02', 'ทางเชื่อม BTS', { isActive: false })],
    'ST-2': [zone('Z-3', 'Z-1044-01', 'ทางเข้าหลัก'), zone('Z-4', 'Z-1044-02', 'ห้องน้ำ', { isActive: false })],
    'ST-3': [],
  },
};
const pickerOf = (rows, row, extra = {}) => Object.fromEntries(
  historicalZonePickerOptions({ ...PICK, rows, rowKey: row.key, ...extra }).filter((o) => !o.group).map((o) => [o.value, o]),
);

/* ⭐ มติ 25/09: โซนเลือกใน **บรรทัด** (ของเดิมเป็นตัวหนังสือเปลี่ยนไม่ได้ — ต้องถอนติ๊กแล้วคีย์บรรทัดใหม่ทั้งบรรทัด)
   · ป้าย = ชื่อจุด (`historicalZonePoint`) คำเดียวกับตารางฝั่งอ่านของขั้น ④ และหน้าใบสั่งขาย
   · ค้นได้ทุกอย่างที่ตาเห็น (กฎบ้าน search haystack) — `search` ของโซนพกชื่อไซต์ด้วยเพราะหัวกลุ่มไม่ถูกกรอง */
test('⭐ ช่อง "ไซต์ · โซน": หัวกลุ่มต่อไซต์ · ป้าย = ชื่อจุด · ค้นได้ทั้งรหัส/ชื่อไซต์และชื่อ/รหัสโซน', () => {
  const rows = [emptyHistoricalZone()];
  const options = historicalZonePickerOptions({ ...PICK, rows, rowKey: rows[0].key });
  assert.deepEqual(options.map((o) => o.value), ['site:ST-1', 'Z-1', 'Z-2', 'site:ST-2', 'Z-3', 'Z-4'],
    'ไซต์ที่ไม่มีโซนไม่มีหัวลอย (หัวลอย = คำโกหกว่ามีของให้เลือก)');
  assert.deepEqual(options.filter((o) => o.group).map((o) => o.label), ['ST-1002 สยามพารากอน', 'ST-1044 สยามดิสคัฟเวอรี่']);

  const z1 = options.find((o) => o.value === 'Z-1');
  assert.equal(z1.label, historicalZonePoint(PICK.zonesBySite['ST-1'][0], PICK.sites[0]));
  assert.equal(z1.label, 'ST-1002 สยามพารากอน · ชั้น G ล็อบบี้');
  const lines = historicalZoneLines({ zones: [emptyHistoricalZone({ zoneId: 'Z-1' })], ...PICK, ready: true });
  assert.equal(z1.label, lines[0].point, 'ป้ายในช่อง = ชื่อจุดที่บรรทัดพูด (สูตรเดียวกับที่แผนเขียนลงบรรทัด)');
  assert.deepEqual([z1.zoneName, z1.zoneCode, z1.disabled, z1.why], ['ชั้น G ล็อบบี้', 'Z-1002-01', false, null]);
  for (const needle of ['st-1002', 'สยามพารากอน', 'ล็อบบี้', 'z-1002-01']) {
    assert.ok(z1.search.includes(needle), `ค้น "${needle}" ต้องเจอ`);
  }
  assert.ok(!options.some((o) => o.missing), 'บรรทัดใหม่ (ยังไม่มีโซน) ไม่มีตัวเลือกบอกเหตุ');
  assert.deepEqual(historicalZonePickerOptions({}), []);
});

/* 🔴 หนึ่งโซนหนึ่งบรรทัด (ด่านเดียวกับแผน "เลือกโซนนี้ซ้ำ") — โชว์แต่เลือกไม่ได้ พร้อม **เลขบรรทัดที่ตาเห็นในคอลัมน์ "#"**
   🔴 R10 ย้ายมาอยู่ที่นี่: บรรทัดที่ผูกโซนซึ่งถูกปิดใช้งานทีหลัง ต้อง **ยังแก้ได้** — โซนของตัวเองไม่ถูกปิด (ไม่งั้นช่องเด้งว่าง)
      บอกเหตุ + ทางออก · ย้ายไปโซนอื่นที่ว่างได้ · ปุ่มลบท้ายแถวใช้ได้ (ของเดิม: ไม่มีแถวให้ถอนติ๊ก ⇒ ใบแก้ไม่ได้อีก) */
test('🔴 ช่อง "ไซต์ · โซน": โซนของบรรทัดอื่นปิดพร้อมเลขบรรทัด · โซนปิดใช้งานเลือกใหม่ไม่ได้ · โซนของแถวตัวเองไม่ถูกปิด (R10)', () => {
  const rows = [
    emptyHistoricalZone({ zoneId: 'Z-1' }),
    emptyHistoricalZone({ zoneId: 'Z-2' }),   // ผูกไว้ก่อนที่ TS จะปิดใช้งานโซนนี้
    emptyHistoricalZone(),
  ];
  const third = pickerOf(rows, rows[2]);
  assert.deepEqual([third['Z-1'].disabled, third['Z-1'].why], [true, 'อยู่ในรายการ 1 แล้ว']);
  assert.deepEqual([third['Z-2'].disabled, third['Z-2'].why], [true, 'อยู่ในรายการ 2 แล้ว'],
    'เหตุ "อยู่ในรายการแล้ว" มาก่อน "ปิดใช้งาน" — ชี้บรรทัดที่ต้องไปแก้');
  assert.deepEqual([third['Z-3'].disabled, third['Z-3'].why], [false, null]);
  assert.deepEqual([third['Z-4'].disabled, third['Z-4'].why], [true, 'ปิดใช้งานในทะเบียน']);

  const first = pickerOf(rows, rows[0]);
  assert.deepEqual([first['Z-1'].disabled, first['Z-1'].why], [false, null], 'ค่าปัจจุบันของช่องต้องเลือกได้/แสดงได้');
  assert.equal(first['Z-2'].disabled, true);

  const second = pickerOf(rows, rows[1]);
  assert.equal(second['Z-2'].disabled, false, 'R10: บรรทัดที่ผูกโซนปิดใช้งานต้องยังอยู่ในสภาพที่แก้ได้');
  assert.match(second['Z-2'].why, /^ปิดใช้งานในทะเบียน — เปลี่ยนเป็นโซนอื่น/, 'บอกเหตุพร้อมทางออก');
  assert.equal(second['Z-3'].disabled, false, 'ย้ายการผูกไปโซนที่ใช้งานได้');
  assert.equal(second['Z-1'].why, 'อยู่ในรายการ 1 แล้ว');
  assert.ok(!Object.values(second).some((o) => o.missing), 'โซนยังอยู่ในทะเบียน = ไม่ใช่ของที่หาย');
  assert.deepEqual(historicalZoneLines({ zones: rows, ...PICK, ready: true }).map((line) => line.removable), [true, true, true]);

  /* โซนซ้ำที่มาจากใบเก่า (แผนตีกลับ): สองบรรทัดยังเห็นค่าของตัวเอง · เหตุชี้อีกบรรทัด */
  const dup = [emptyHistoricalZone({ zoneId: 'Z-3' }), emptyHistoricalZone({ zoneId: 'Z-3' })];
  assert.deepEqual([pickerOf(dup, dup[0])['Z-3'].disabled, pickerOf(dup, dup[0])['Z-3'].why], [false, 'อยู่ในรายการ 2 แล้ว']);
  assert.deepEqual([pickerOf(dup, dup[1])['Z-3'].disabled, pickerOf(dup, dup[1])['Z-3'].why], [false, 'อยู่ในรายการ 1 แล้ว']);
});

/* 🔴 R10 (กำพร้าจริง — อ่านทะเบียนครบแล้วไม่เจอ: ไซต์ถูกปิด/โอน/โซนถูกลบ): ช่องต้องไม่เด้งเป็น "เลือกไซต์ · โซน"
   (อ่านเป็นว่ายังไม่ได้เลือก ทั้งที่ใบยังผูกโซนนั้น) ⇒ ตัวเลือกบอกเหตุบนสุด เลือกไม่ได้ · ย้ายไปโซนจริงได้ · ลบบรรทัดได้ */
test('🔴 R10: โซนที่บรรทัดผูกแต่ทะเบียนไม่มี = ตัวเลือกบอกเหตุบนสุด (เลือกไม่ได้) · เปลี่ยนโซน/ลบบรรทัดได้', () => {
  const rows = [emptyHistoricalZone({ zoneId: 'Z-DEAD' }), emptyHistoricalZone({ zoneId: 'Z-1' })];
  const lines = historicalZoneLines({ zones: rows, ...PICK, ready: true });
  const options = historicalZonePickerOptions({ ...PICK, rows, rowKey: rows[0].key, missingNote: lines[0].note });
  assert.deepEqual(options[0], {
    value: 'Z-DEAD', label: lines[0].note, zoneName: 'Z-DEAD', zoneCode: null, search: 'z-dead',
    disabled: true, missing: true, why: null,
  });
  assert.match(options[0].label, /ไม่อยู่ในทะเบียนที่โหลดมา/);
  assert.equal(lines[0].removable, true, 'กำพร้าจริงลบได้ (R10)');
  assert.equal(options.find((o) => o.value === 'Z-3').disabled, false, 'ย้ายไปโซนที่มีอยู่จริงได้');
  assert.equal(options.find((o) => o.value === 'Z-1').why, 'อยู่ในรายการ 2 แล้ว');
  assert.deepEqual(historicalZoneBrowser({ ...PICK, pickedZoneIds: rows.map((r) => r.zoneId) }).orphans, ['Z-DEAD']);
  /* ไม่ส่งเหตุมา = ยังมีคำบอกเหตุของตัวเอง (ไม่ใช่ป้ายว่าง) */
  assert.equal(historicalZonePickerOptions({ ...PICK, rows, rowKey: rows[0].key })[0].label, 'Z-DEAD — ไม่อยู่ในทะเบียนที่โหลดมา');
  /* ตัวเลือกบอกเหตุเป็นของแถวนั้นแถวเดียว */
  assert.ok(!historicalZonePickerOptions({ ...PICK, rows, rowKey: rows[1].key }).some((o) => o.missing));
});

/* 🔴 N1 ย้ายมาอยู่ในบรรทัด (มติ 25/09): ไซต์เดียวอ่านโซนไม่สำเร็จ ⇒ ตัวเลือกของไซต์นั้นยังไม่ขึ้น · บรรทัดที่ผูกโซนของมันไว้
   ต้องพูดว่า "ยังอ่านทะเบียนไม่ได้" (ไม่ใช่ "ไม่อยู่ในทะเบียน") และ **ลบไม่ได้** จนกว่าจะอ่านครบ — ของเดิมที่ปุ่มถอด
   ลบบรรทัดจริงเพราะคำขอที่พังชั่วคราว · ทางออกเดียวคือปุ่ม "ลองอ่านไซต์ที่พังอีกครั้ง" บนก้อนเตือนของขั้น ② */
test('🔴 N1: ไซต์อ่านไม่ได้ ⇒ ช่องของบรรทัดบอก "ยังอ่านทะเบียนไม่ได้" · ปุ่มลบปิด · ระหว่างโหลดก็ไม่ตัดสิน', () => {
  const broken = {
    ...PICK,
    zonesBySite: { ...PICK.zonesBySite, 'ST-2': [] },
    siteErrors: { 'ST-2': 'โหลดโซนของไซต์ ST-1044 ไม่สำเร็จ' },
  };
  const rows = [emptyHistoricalZone({ zoneId: 'Z-3' }), emptyHistoricalZone({ zoneId: 'Z-1' })];
  const lines = historicalZoneLines({ zones: rows, ...broken, ready: true });
  const options = historicalZonePickerOptions({ ...broken, rows, rowKey: rows[0].key, missingNote: lines[0].note });
  assert.deepEqual(options.filter((o) => o.group).map((o) => o.value), ['site:ST-1'], 'ไซต์ที่พังไม่มีหัวลอย');
  assert.equal(options[0].missing, true);
  assert.equal(options[0].label, 'Z-3 — ยังอ่านทะเบียนไม่ได้');
  assert.doesNotMatch(options[0].label, /ไม่อยู่ในทะเบียน/, 'ห้ามพูดว่าหายทั้งที่ยังไม่รู้');
  assert.equal(lines[0].removable, false);
  assert.match(lines[0].removeTitle, /ลองอ่านไซต์ที่พังอีกครั้ง/, 'เหตุของปุ่มที่ปิดชี้ปุ่มที่มีอยู่จริงบนจอ');
  assert.equal(lines[1].removable, true);
  const registry = historicalZoneBrowser({ ...broken, pickedZoneIds: rows.map((r) => r.zoneId) });
  assert.deepEqual([registry.orphans, registry.unresolved], [[], ['Z-3']]);

  const loadingLines = historicalZoneLines({ zones: rows, sites: [], zonesBySite: {}, ready: false });
  const loadingOptions = historicalZonePickerOptions({
    sites: [], zonesBySite: {}, rows, rowKey: rows[0].key, missingNote: loadingLines[0].note,
  });
  assert.deepEqual(loadingOptions.map((o) => [o.value, o.label, o.missing, o.disabled]),
    [['Z-3', 'กำลังโหลดทะเบียนไซต์…', true, true]]);
});

test('⭐ historicalLinesSummary: "N บรรทัด · M โซน" — บรรทัดใหม่ไม่นับเป็นโซน · โซนซ้ำนับครั้งเดียว', () => {
  assert.equal(historicalLinesSummary([]), '0 บรรทัด · 0 โซน');
  assert.equal(historicalLinesSummary(), '0 บรรทัด · 0 โซน');
  assert.equal(historicalLinesSummary([
    emptyHistoricalZone({ zoneId: 'Z-1' }), emptyHistoricalZone(), emptyHistoricalZone({ zoneId: 'Z-2' }),
  ]), '3 บรรทัด · 2 โซน');
  assert.equal(historicalLinesSummary([{ zoneId: 'Z-1' }, { zoneId: 'Z-1' }]), '2 บรรทัด · 1 โซน', 'โซนซ้ำ (แผนตีกลับ) ไม่ทำให้นับโซนเกิน');
  assert.equal(historicalLinesSummary(Array.from({ length: 1200 }, (_, i) => ({ zoneId: `Z-${i}` }))), '1,200 บรรทัด · 1,200 โซน');
});

// ── หน้าต่าง "เพิ่มหลายโซน" (แทนช่อง "ใช้แพ็คเกจเดียวกันทุกโซน") ──────────────────────────────────

/* ⭐ หนึ่งโซนที่ติ๊ก = หนึ่งบรรทัดใหม่ต่อท้าย · ลำดับตามทะเบียน (ไซต์ → โซน) ไม่ใช่ลำดับที่ติ๊ก (ติ๊กข้ามไซต์ไปมาแล้ว
   ตารางต้องไม่สลับสาขาไปมา) · กันซ้ำอีกชั้น (หน้าต่างปิดโซนพวกนั้นไว้แล้ว แต่ข้ามเงียบได้เพราะ "ไม่มีอะไรจะเพิ่ม")
   ⚠️ ไม่แตะบรรทัดเดิม — ข้อที่ช่องเก่าพังคือเททับแพ็คเกจของบรรทัดที่คีย์ไว้แล้ว */
test('⭐ historicalBulkAddRows: ลำดับตามทะเบียน · ข้ามโซนที่อยู่ในใบแล้ว/ปิดใช้งาน/ไม่มีในทะเบียน · พกจำนวน · ไม่แตะบรรทัดเดิม', () => {
  const registry = { ...BROWSE, zonesBySite: { ...BROWSE.zonesBySite, 'ST-4': [zone('Z-5', 'Z-2051-01', 'ทางเข้าหลัก', { isActive: false })] } };
  const existing = emptyHistoricalZone({ zoneId: 'Z-3', qty: '5', productId: 'PRD-1' });
  const rows = [existing];
  const added = historicalBulkAddRows({
    ...registry, rows, zoneIds: ['Z-4', 'Z-1', 'Z-3', 'Z-5', 'Z-2', 'Z-1', 'Z-GONE', ''], qty: ' 12 ',
  });
  assert.deepEqual(added.map((row) => [row.zoneId, row.siteId, row.qty]), [
    ['Z-1', 'ST-1', '12'], ['Z-2', 'ST-1', '12'], ['Z-4', 'ST-3', '12'],
  ]);
  const keys = new Set([existing.key, ...added.map((row) => row.key)]);
  assert.equal(keys.size, 4, 'key ไม่ซ้ำกันเองและไม่ซ้ำบรรทัดเดิม (React key + ตัวผูก error)');
  for (const row of added) {
    assert.equal(row._lineKind, 'product');
    assert.equal(row.productId, '', 'แพ็คเกจเติมที่จอด้วย quoteLineFromProduct — ไฟล์นี้ไม่ลากทะเบียนสินค้ามา');
    assert.equal(row.discountType, null);
  }
  assert.equal(rows.length, 1);
  assert.equal(rows[0], existing);
  assert.deepEqual([existing.qty, existing.productId], ['5', 'PRD-1']);

  assert.deepEqual(historicalBulkAddRows({ ...registry, zoneIds: ['Z-1'] }).map((row) => row.qty), [''],
    'ไม่ใส่จำนวน = ว่าง (ใส่ทีละบรรทัด) ไม่ใช่ 1');
  assert.deepEqual(historicalBulkAddRows({ ...registry, zoneIds: [] }), []);
  assert.deepEqual(historicalBulkAddRows(), []);
});

test('⭐ historicalBulkQtyIssue: ว่างได้ (ใส่ทีละบรรทัดทีหลัง) · ใส่แล้วต้องเป็นจำนวนเต็ม > 0 — ข้อความเดียวกับแผน', () => {
  for (const ok of ['', '   ', null, undefined, '12', 12, ' 7 ']) {
    assert.equal(historicalBulkQtyIssue(ok), null, JSON.stringify(ok));
  }
  for (const bad of ['1.5', '0', '-1', 'x', 0, -3, 2.5]) {
    assert.equal(historicalBulkQtyIssue(bad), HISTORICAL_LINE_MESSAGES.qty, JSON.stringify(bad));
  }
});

/* ⭐ กฎบ้าน: บอกผลลัพธ์ก่อนคลิก — ปุ่ม "เพิ่ม N บรรทัด" บอกจำนวนบรรทัด และเงินต่อบรรทัด/รวมเมื่อรู้ครบ
   ⚠️ ไม่มีจำนวน = ไม่มียอดให้พูด (ห้ามเดาจำนวนเป็น 1 แบบใบเสนอราคา — มติ 23/09) */
test('⭐ historicalBulkConsequence: ยังไม่เลือก = บอกว่ายังไม่เลือก · มีจำนวน+ราคา = เงินต่อบรรทัดและรวม · ไม่มีจำนวน = ใส่ทีละบรรทัด', () => {
  assert.equal(historicalBulkConsequence({ count: 0, qty: '12', unitPrice: 1200 }), 'ยังไม่ได้เลือกโซน');
  assert.equal(historicalBulkConsequence(), 'ยังไม่ได้เลือกโซน');
  assert.equal(historicalBulkConsequence({ count: 3, qty: '12', unitPrice: 1200 }),
    'จะเพิ่ม 3 บรรทัด · บรรทัดละ 12 × ฿1,200.00 = ฿14,400.00 · รวม ฿43,200.00');
  assert.equal(historicalBulkConsequence({ count: 43, qty: '1', unitPrice: 3500 }),
    'จะเพิ่ม 43 บรรทัด · บรรทัดละ 1 × ฿3,500.00 = ฿3,500.00 · รวม ฿150,500.00');
  const noQty = historicalBulkConsequence({ count: 43, qty: '', unitPrice: 1200 });
  assert.equal(noQty, 'จะเพิ่ม 43 บรรทัด — จำนวนใส่ทีละบรรทัดในตาราง');
  assert.doesNotMatch(noQty, /฿/);
});

/* 🐞 สงสัยเป็นบั๊ก (ไม่แก้ source ในรอบนี้): แพ็คเกจที่ยังไม่ตั้งราคา + ใส่จำนวน 12 ⇒ ปุ่มบอก "จำนวนใส่ทีละบรรทัดในตาราง"
   ทั้งที่ historicalBulkAddRows พกจำนวน 12 ลงทุกบรรทัดจริง — ผลที่บอกก่อนกดไม่ตรงกับผลที่เกิด */
test('🐞 รีวิว 25/09: ใส่จำนวนแต่แพ็คเกจยังไม่ตั้งราคา = ปุ่มบอกจำนวนที่ทุกบรรทัดได้จริง ไม่ใช่ "ใส่ทีละบรรทัด"', () => {
  const unpriced = historicalBulkConsequence({ count: 3, qty: '12', unitPrice: 0 });
  assert.equal(unpriced, 'จะเพิ่ม 3 บรรทัด · บรรทัดละจำนวน 12 — แพ็คเกจนี้ยังไม่ตั้งราคาในฐานข้อมูลสินค้า จึงยังไม่มียอด');
  assert.doesNotMatch(unpriced, /ทีละบรรทัด/);
  assert.equal(historicalBulkConsequence({ count: 3, qty: '12', unitPrice: null }), unpriced, 'ไม่รู้ราคา = พูดแบบเดียวกัน');
  /* ผลที่บอกก่อนกดต้องตรงกับผลที่เกิด: ทุกบรรทัดที่เพิ่มได้จำนวน 12 จริง */
  const sites = [{ id: 'S1', code: 'ST-1', name: 'ไซต์ 1' }];
  const zonesBySite = { S1: [{ id: 'Z1', name: 'A' }, { id: 'Z2', name: 'B' }, { id: 'Z3', name: 'C' }] };
  const added = historicalBulkAddRows({ zoneIds: ['Z1', 'Z2', 'Z3'], sites, zonesBySite, rows: [], qty: '12' });
  assert.deepEqual(added.map((row) => row.qty), ['12', '12', '12']);
});

// ── error รายช่องของบรรทัด: ผูกกับ key ของแถว · ขึ้นที่เดียว · หายเมื่อแก้ช่องนั้น (มติ 25/09) ──────────────

/* 🐞 ของเดิม: error ของบรรทัดจับคู่กับแถวด้วย **ลำดับตอนวาด** ⇒ ลบบรรทัดหนึ่ง ข้อความของบรรทัดล่างทั้งหมดเลื่อนไปเกาะบรรทัดผิด
   ⇒ ผูก `rowKey` ตอนได้คำตอบ ด้วย `state.zones` ชุดที่ส่งไปตรวจ (ช่องปิดระหว่างตรวจ ⇒ ลำดับ body = ลำดับ state) */
test('⭐ historicalIssuesWithRowKeys: ผูก key ของแถวตามเลขใน field · ข้อที่ไม่ใช่ของบรรทัด/ชี้เกินตารางคงเดิม', () => {
  const zones = [emptyHistoricalZone({ zoneId: 'Z-1' }), emptyHistoricalZone()];
  const issues = [
    { field: 'zones.1.zoneId', message: 'รายการ 2: ต้องเลือกไซต์ · โซน', detail: 'ต้องเลือกไซต์ · โซน' },
    { field: 'zones.0.qty', message: 'รายการ 1 (ล็อบบี้): จำนวน', detail: 'จำนวน' },
    { field: 'zones.0', message: 'รายการ 1: รูปแบบไม่ถูกต้อง', detail: 'รูปแบบไม่ถูกต้อง' },
    { field: 'zones', message: 'ต้องมีอย่างน้อย 1 บรรทัด' },
    { field: 'vatRate', message: 'เลือก VAT' },
    { field: 'zones.7.qty', message: 'รายการ 8: จำนวน' },
    { field: 'zonesX.0', message: 'ไม่ใช่ของบรรทัด' },
  ];
  const keyed = historicalIssuesWithRowKeys(issues, zones);
  assert.deepEqual(keyed.map((issue) => issue.rowKey ?? null), [zones[1].key, zones[0].key, zones[0].key, null, null, null, null]);
  assert.deepEqual(keyed.map((issue) => issue.field), issues.map((issue) => issue.field), 'ไม่แก้ field — ขั้น/จุดยึดยังตัดสินได้เหมือนเดิม');
  assert.equal(keyed[3], issues[3], 'ข้อที่ไม่ใช่ของบรรทัด = อ้างอิงเดิม');
  assert.ok(!('rowKey' in issues[0]), 'ไม่เขียนทับ issue ต้นฉบับของ server');
  assert.deepEqual(historicalIssuesWithRowKeys(null, zones), []);
  assert.ok(historicalIssuesWithRowKeys(issues, undefined).every((issue) => !('rowKey' in issue)));
});

/* ⭐ "error ขึ้นที่เดียว": ใต้ช่องที่ผิดช่องเดียว (ก้อนบนลิสต์ทุกข้อ) · ใต้ช่องใช้ `detail` (ไม่มีป้ายบรรทัด — ซ้ำกับแถวที่มันอยู่)
   ⭐ แผนชี้ช่อง (`zones.<i>.<ช่อง>`) — ช่องที่จอไม่มีที่วางเฉพาะ (หรือ issue ทั้งแถว) ตกที่ `row` ใต้เซลล์รายการ */
test('⭐ historicalLineIssues: ข้อความใต้ช่องของแถว (ตาม key) · ใช้ detail · ข้อแรกของช่องชนะ · ช่องที่ไม่รู้จัก = ทั้งแถว', () => {
  const map = historicalLineIssues([
    { field: 'zones.0.qty', message: 'รายการ 1: จำนวนต้องเป็นจำนวนเต็มมากกว่า 0', detail: 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0', rowKey: 'A' },
    { field: 'zones.0.qty', message: 'รายการ 1: ข้อที่สอง', detail: 'ข้อที่สอง', rowKey: 'A' },
    { field: 'zones.0.productId', message: 'รายการ 1: ต้องเลือกแพ็คเกจบริการ', rowKey: 'A' },
    { field: 'zones.0.zoneId', message: 'รายการ 1: เลือกโซนนี้ซ้ำ', detail: 'เลือกโซนนี้ซ้ำ', rowKey: 'A' },
    { field: 'zones.0.rounds', message: 'รายการ 1: รอบ', detail: 'รอบ', rowKey: 'A' },
    { field: 'zones.1.discountValue', message: 'รายการ 2: ส่วนลด', detail: 'ส่วนลด', rowKey: 'B' },
    { field: 'zones.1', message: 'รายการ 2: รูปแบบไม่ถูกต้อง', detail: 'รูปแบบไม่ถูกต้อง', rowKey: 'B' },
    { field: 'zones.2.rounds', message: 'ผูกแถวไม่ได้', detail: 'ผูกแถวไม่ได้' },
    { field: 'vatRate', message: 'VAT', rowKey: 'A' },
    { field: 'zones', message: 'ต้องมีอย่างน้อย 1 บรรทัด', rowKey: 'A' },
  ]);
  assert.deepEqual([...map.keys()], ['A', 'B'], 'ไม่มี rowKey = ไม่วาดใต้ช่อง (ก้อนบนยังพูด) · ข้อที่ไม่ใช่ของบรรทัดไม่เข้า');
  assert.deepEqual(map.get('A'), {
    qty: 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0',
    productId: 'รายการ 1: ต้องเลือกแพ็คเกจบริการ',   // ไม่มี detail = ถอยไปใช้ message
    zoneId: 'เลือกโซนนี้ซ้ำ',
    rounds: 'รอบ',
  });
  assert.deepEqual(map.get('B'), { row: 'ส่วนลด' });
  assert.equal(historicalLineIssues().size, 0);
});

/* ⭐ ของจริงจากแผน: บรรทัดใหม่ที่ยังว่าง + บรรทัดที่จำนวน/รอบผิด ⇒ แต่ละข้อลงใต้ช่องของแถวนั้นช่องเดียว
   🔴 สัญญาระหว่างแผนกับจอ: `field` ชี้ช่อง · `detail` ไม่มีป้าย · `message` = "รายการ N (ชื่อโซน): detail" (เลขในคอลัมน์ "#") */
test('⭐ error รายช่องของแผนตัวจริง → ใต้ช่องของแถวนั้น (ผ่าน historicalIssuesWithRowKeys + historicalLineIssues)', () => {
  const state = filledState({
    zones: [emptyHistoricalZone(), zoneFromProduct({ zoneId: 'ZN-1', productId: 'PRD-1', qty: '1.5', rounds: 'x' })],
  });
  const plan = planHistoricalServiceOrder(historicalWizardBody(state, {}), planCtx);
  const lineErrors = plan.errors.filter((issue) => /^zones\./.test(issue.field));
  assert.deepEqual(lineErrors.map((issue) => issue.field),
    ['zones.0.zoneId', 'zones.0.productId', 'zones.0.qty', 'zones.1.qty', 'zones.1.rounds']);
  for (const issue of lineErrors) assert.ok(issue.message.endsWith(`: ${issue.detail}`), issue.field);
  assert.equal(lineErrors[0].message, 'รายการ 1: ต้องเลือกไซต์ · โซนจากทะเบียนไซต์ของลูกค้า — ห้ามพิมพ์ชื่อจุดเอง');
  assert.equal(lineErrors[3].message, `รายการ 2 (ล็อบบี้): ${HISTORICAL_LINE_MESSAGES.qty}`);
  assert.ok(lineErrors.every((issue) => stepOfField(issue.field) === 'zones'));

  const byRow = historicalLineIssues(historicalIssuesWithRowKeys(plan.errors, state.zones));
  assert.deepEqual(byRow.get(state.zones[0].key), {
    zoneId: 'ต้องเลือกไซต์ · โซนจากทะเบียนไซต์ของลูกค้า — ห้ามพิมพ์ชื่อจุดเอง',
    productId: 'ต้องเลือกแพ็คเกจบริการ',
    qty: HISTORICAL_LINE_MESSAGES.qty,
  });
  assert.deepEqual(byRow.get(state.zones[1].key), { qty: HISTORICAL_LINE_MESSAGES.qty, rounds: HISTORICAL_LINE_MESSAGES.rounds });
});

/* 🐞 ของเดิม: `patch` ไม่เคยแตะ `issues` ⇒ แก้จำนวนแล้ว "จำนวนต้องเป็นจำนวนเต็มมากกว่า 0" ยังค้างจนกว่าจะกด "ถัดไป" อีกรอบ
   ⇒ มติ 25/09: แก้ช่องไหน error ของ server ที่พูดถึงช่องนั้นหายทันที — **ข้อที่ยังจริงอยู่ห้ามทิ้งเหมารวม**
   ⚠️ ไม่มีอะไรถูกทิ้ง = อ้างอิงเดิม (setIssues ได้ค่าเดิม ⇒ React ไม่ต้องวาดใหม่ทุกการกดแป้น) */
test('⭐ historicalPruneIssues: ทิ้งเฉพาะข้อที่พูดถึงช่องที่เพิ่งเปลี่ยน · ข้ออื่นอยู่ต่อ · ไม่มีอะไรทิ้ง = อ้างอิงเดิม', () => {
  const A = emptyHistoricalZone({ zoneId: 'Z-1', productId: 'PRD-1', qty: '1.5', rounds: '0' });
  const B = emptyHistoricalZone({ productId: 'PRD-1', qty: '3' });
  const prev = filledState({ vatRate: null, discountType: 'percent', discountValue: '150', zones: [A, B] });
  const issues = historicalIssuesWithRowKeys([
    { field: 'vatRate', message: 'VAT' },
    { field: 'discount', message: PLAN_DISCOUNT_MESSAGES.percent },
    { field: 'zones.0.qty', message: 'q', detail: 'q' },
    { field: 'zones.0.rounds', message: 'r', detail: 'r' },
    { field: 'zones.1.zoneId', message: 'z', detail: 'z' },
    { field: 'customerId', message: 'c' },
    { field: 'installments', message: 'i' },
  ], prev.zones);
  const fields = (list) => list.map((issue) => issue.field);
  const edit = (patch) => historicalPruneIssues(issues, prev, { ...prev, ...patch });

  assert.equal(edit({}), issues);
  assert.equal(edit({ notes: 'แก้หมายเหตุ' }), issues, 'แก้ช่องที่ไม่มี error = ไม่แตะ');
  assert.equal(edit({ discountValue: 150 }), issues, 'ค่าเดิมคนละชนิด (สตริง/ตัวเลข) ไม่ใช่การแก้');

  assert.deepEqual(fields(edit({ vatRate: 7 })), fields(issues).filter((f) => f !== 'vatRate'));
  assert.ok(!fields(edit({ discountValue: '15' })).includes('discount'));
  assert.ok(!fields(edit({ discountType: 'amount' })).includes('discount'));

  /* แก้จำนวนของ A = ทิ้งข้อจำนวนของ A ข้อเดียว (รอบของ A ยังผิดอยู่ · ของ B ไม่เกี่ยว) */
  assert.deepEqual(fields(edit({ zones: [{ ...A, qty: '2' }, B] })),
    ['vatRate', 'discount', 'zones.0.rounds', 'zones.1.zoneId', 'customerId', 'installments']);
  /* B เลือกโซน = ทิ้งข้อโซนของ B */
  assert.deepEqual(fields(edit({ zones: [A, { ...B, zoneId: 'Z-3' }] })),
    ['vatRate', 'discount', 'zones.0.qty', 'zones.0.rounds', 'customerId', 'installments']);
  /* แก้ส่วนลดรายบรรทัดของ A = ข้อรายช่อง (จำนวน/รอบ) ยังจริง ⇒ อ้างอิงเดิม แม้ตารางเปลี่ยน */
  assert.equal(edit({ zones: [{ ...A, discountType: 'amount', discountValue: '5' }, B] }), issues);
  /* ช่องอื่นนอกขั้น ② ไม่ถูกแตะเลย */
  assert.ok(fields(edit({ vatRate: 7, discountType: null, zones: [] })).includes('customerId'));
});

test('⭐ historicalPruneIssues: ข้อทั้งแถว · ข้อระดับตาราง · ข้อที่ผูกแถวไม่ได้ · แถวที่ถูกลบ', () => {
  const A = emptyHistoricalZone({ zoneId: 'Z-1', qty: '2' });
  const B = emptyHistoricalZone({ zoneId: 'Z-2', qty: '3' });
  const prev = filledState({ zones: [A, B] });

  /* ข้อทั้งแถว (`zones.N`) ไม่รู้ว่าช่องไหน ⇒ แถวนั้นถูกแก้ช่องไหนก็หาย (รวมส่วนลดรายบรรทัด) · แถวอื่นถูกแก้ = อยู่ต่อ */
  const rowIssue = historicalIssuesWithRowKeys([{ field: 'zones.0', message: 'รายการ 1: รูปแบบไม่ถูกต้อง' }], prev.zones);
  assert.deepEqual(historicalPruneIssues(rowIssue, prev, { ...prev, zones: [{ ...A, discountType: 'percent', discountValue: '5' }, B] }), []);
  assert.equal(historicalPruneIssues(rowIssue, prev, { ...prev, zones: [A, { ...B, qty: '9' }] }), rowIssue);

  /* ข้อระดับตาราง ("ต้องมีอย่างน้อย 1 บรรทัด") จริงอยู่ตราบที่ตารางยังว่าง · กด "เพิ่มรายการ" แล้วหาย
     (ข้อของบรรทัดใหม่จะมาเองตอนตรวจครั้งหน้า) */
  const empty = filledState({ zones: [] });
  const listIssue = [{ field: 'zones', message: 'ต้องมีอย่างน้อย 1 บรรทัด' }];
  assert.equal(historicalPruneIssues(listIssue, empty, { ...empty, notes: 'x' }), listIssue);
  assert.equal(historicalPruneIssues(listIssue, empty, { ...empty, zones: [] }), listIssue);
  assert.deepEqual(historicalPruneIssues(listIssue, empty, { ...empty, zones: [emptyHistoricalZone()] }), []);

  /* ข้อของบรรทัดที่ผูกแถวไม่ได้ (ไม่มี rowKey) พูดต่อได้ตราบที่ตารางไม่เปลี่ยน · ตารางเปลี่ยน = ทิ้ง (ลำดับอาจเลื่อน) */
  const unkeyed = [{ field: 'zones.3.qty', message: 'รายการ 4: จำนวน' }];
  assert.equal(historicalPruneIssues(unkeyed, prev, { ...prev, notes: 'x' }), unkeyed);
  assert.deepEqual(historicalPruneIssues(unkeyed, prev, { ...prev, zones: [...prev.zones] }), []);

  /* แถวที่ถูกลบ = ข้อของมันหายไปด้วย · เปลี่ยนลูกค้า (ล้างทั้งตาราง) = ข้อรายบรรทัดหายหมด แต่ข้อระดับตารางยังจริง */
  const keyed = historicalIssuesWithRowKeys([
    { field: 'zones.0.qty', message: 'q0', detail: 'q0' },
    { field: 'zones.1.qty', message: 'q1', detail: 'q1' },
    { field: 'zones', message: 'ต้องมีอย่างน้อย 1 บรรทัด' },
  ], prev.zones);
  assert.deepEqual(historicalPruneIssues(keyed, prev, { ...prev, zones: [A] }).map((issue) => issue.detail ?? issue.field), ['q0']);
  const reset = historicalDownstreamReset(prev, 'customer');
  assert.deepEqual(historicalPruneIssues(keyed, prev, { ...prev, ...reset.patch }).map((issue) => issue.field), ['zones']);
});

/* 🐞 **บั๊กเดิมที่ตัวนี้ปิด (จับคู่ด้วยลำดับ)**: ลบบรรทัด 1 ⇒ ข้อความของบรรทัด 2 เลื่อนขึ้นไปเกาะแถวที่ขึ้นมาอยู่ตำแหน่งนั้น
   และข้อความของบรรทัด 1 ที่ถูกลบไปแล้วไปเกาะบรรทัด 2 เดิม — ผู้คีย์แก้ช่องที่ไม่ได้ผิด
   ⇒ ข้อของแถวที่ถูกลบหายไปพร้อมแถว · ข้อของแถวที่เหลือตามแถวของมันไป (ด้วย key) ไม่ใช่ตามเลขใน field */
test('🐞 ลบบรรทัด 1 ⇒ error ของบรรทัด 2 ตามแถวของมันไป ไม่เลื่อนไปเกาะแถวอื่น · error ของบรรทัดที่ลบหายไปด้วย', () => {
  const rows = [
    emptyHistoricalZone({ zoneId: 'Z-1', qty: '0' }),
    emptyHistoricalZone({ zoneId: 'Z-2', qty: '1.5' }),
    emptyHistoricalZone({ zoneId: 'Z-3', qty: '4' }),
  ];
  const prev = filledState({ zones: rows });
  const issues = historicalIssuesWithRowKeys([
    { field: 'zones.0.qty', message: 'รายการ 1: จำนวนของ A', detail: 'จำนวนของ A' },
    { field: 'zones.1.qty', message: 'รายการ 2: จำนวนของ B', detail: 'จำนวนของ B' },
  ], rows);
  const next = { ...prev, zones: [rows[1], rows[2]] };   // ลบบรรทัด 1
  const pruned = historicalPruneIssues(issues, prev, next);
  assert.deepEqual(pruned.map((issue) => issue.detail), ['จำนวนของ B']);

  const byRow = historicalLineIssues(pruned);
  assert.deepEqual([...byRow.keys()], [rows[1].key]);
  assert.deepEqual(byRow.get(rows[1].key), { qty: 'จำนวนของ B' }, 'B ย้ายขึ้นเป็นตำแหน่ง 0 แล้วยังได้ข้อความของตัวเอง');
  assert.equal(byRow.get(rows[2].key), undefined, 'แถวที่ขึ้นมาอยู่ตำแหน่งที่ 2 ต้องไม่รับข้อความของบรรทัด 2 เดิม');
  assert.equal(next.zones.findIndex((row) => row.key === rows[1].key), 0);
});

/* 🐞 สงสัยเป็นบั๊ก (ไม่แก้ source ในรอบนี้): ข้อที่อยู่ต่อหลังลบบรรทัดข้างบนยังพกป้าย "รายการ N" ของตำแหน่งเดิม
   ⇒ ก้อนบนของขั้น ② (WizardZonesStep วาด `issue.message`) พูด "รายการ 2: …" ถึงแถวที่ตอนนี้เป็น # 1
   (ใต้ช่องถูกต้องเพราะใช้ `detail` + rowKey) — แถวที่ยังไม่มีโซนไม่มีชื่อในวงเล็บช่วยให้หาเจอ */
test('🐞 รีวิว 25/09: ลบบรรทัด 1 แล้ว ข้อของบรรทัด 2 เดิมในก้อนบนพูดเลขบรรทัดปัจจุบัน (historicalIssueText)', () => {
  const sites = [{ id: 'S1', code: 'ST-1', name: 'ไซต์ 1' }];
  const zonesBySite = { S1: [{ id: 'Z1', name: 'ล็อบบี้' }, { id: 'Z2', name: 'Lobby' }] };
  const rows = [emptyHistoricalZone({ zoneId: 'Z1', siteId: 'S1' }), emptyHistoricalZone({ zoneId: 'Z2', siteId: 'S1' })];
  const issue = {
    field: 'zones.1.qty', rowKey: rows[1].key,
    message: 'รายการ 2 (Lobby): จำนวนต้องเป็นจำนวนเต็มมากกว่า 0', detail: 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0',
  };
  const before = historicalZoneLines({ zones: rows, sites, zonesBySite });
  assert.equal(historicalIssueText(issue, before), 'รายการ 2 (Lobby): จำนวนต้องเป็นจำนวนเต็มมากกว่า 0');
  const after = historicalZoneLines({ zones: [rows[1]], sites, zonesBySite });
  assert.equal(historicalIssueText(issue, after), 'รายการ 1 (Lobby): จำนวนต้องเป็นจำนวนเต็มมากกว่า 0');
  /* แถวที่ยังไม่มีโซน = ไม่มีวงเล็บ · ข้อที่ไม่ผูกแถว / ไม่มี detail / แถวหายไปแล้ว = ข้อความของ server ตามเดิม */
  const blank = emptyHistoricalZone();
  const blankLines = historicalZoneLines({ zones: [blank], sites, zonesBySite });
  assert.equal(historicalIssueText({ field: 'zones.0.zoneId', rowKey: blank.key, message: 'x', detail: 'ต้องเลือกไซต์ · โซน' }, blankLines),
    'รายการ 1: ต้องเลือกไซต์ · โซน');
  assert.equal(historicalIssueText({ field: 'vatRate', message: 'เลือก VAT' }, after), 'เลือก VAT');
  assert.equal(historicalIssueText({ field: 'zones.0.qty', rowKey: 'gone', message: 'เดิม', detail: 'd' }, after), 'เดิม');
  assert.equal(historicalIssueText({ field: 'zones.0', rowKey: rows[1].key, message: 'ไม่มี detail' }, after), 'ไม่มี detail');
});

// ── มติเจ้าของ 25/09 (รื้อขั้น ①): ก้อนแดงหลังกดไปต่อเท่านั้น · หัวเอกสารแทนแถบสรุป ──────────────────

/* 🐞 ของเดิม: ฟอร์มเปล่าเปิดมาก็เจอก้อนแดง "ต้องแก้ 1 ข้อ" (ไฟล์สัญญา) · ขั้น ② เปิดมาเจอ "เลือก VAT" — เจ้าของบอกว่ารก
   ⇒ ขั้นที่ยังไม่เคยกดไปต่อ: ไม่มีก้อนแดง · ใต้ช่องเหลือเฉพาะข้อที่พูดถึงค่าที่เพิ่งพิมพ์ (วันสัญญา — UAT 23/09 ช่องวันกลืนค่า) */
test('⭐ historicalVisibleIssues: ยังไม่กดไปต่อ = ไม่มีก้อนแดง เหลือแต่ข้อของวันสัญญา · กดแล้ว = ทุกข้อ + ก้อนแดง', () => {
  const issues = [
    { field: 'contract.file', message: 'ต้องแนบไฟล์' },
    { field: 'contract.startDate', message: 'วันเริ่มสัญญาต้องไม่เกินวันนี้', live: true },
    { field: 'contract.endDate', message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', live: true },
    { field: 'vatRate', message: 'เลือก VAT' },
  ];
  const before = intakeForm.historicalVisibleIssues(issues, { revealed: false });
  assert.equal(before.summary, false, 'ยังไม่กดไปต่อ = ไม่มีก้อนแดง');
  assert.deepEqual(before.issues.map((issue) => issue.field), ['contract.startDate', 'contract.endDate'],
    'ข้อของค่าที่เพิ่งพิมพ์ขึ้นใต้ช่องทันที · ข้อ "ยังว่าง" รอจนกดไปต่อ');
  const after = intakeForm.historicalVisibleIssues(issues, { revealed: true });
  assert.equal(after.summary, true);
  assert.equal(after.issues.length, 4);
  assert.deepEqual(intakeForm.historicalVisibleIssues([], { revealed: true }), { issues: [], summary: false });
  assert.equal(intakeForm.HISTORICAL_LIVE_ISSUE_FIELDS, undefined, 'ธง live ตัดสิน ไม่ใช่ชื่อช่อง');

  /* 🐞 รีวิว 25/09: ช่องวันที่ยังว่างมี error "ต้องระบุ" แล้ว (ไม่ live) — ต้องไม่ขึ้นแดงตั้งแต่เปิดฟอร์มเปล่า */
  const blank = historicalWizardLocalIssues(emptyHistoricalWizard(), { contractFileCount: 0, todayIso: '2026-09-25' });
  assert.ok(blank.some((issue) => issue.field === 'contract.startDate'));
  assert.deepEqual(intakeForm.historicalVisibleIssues(issuesForStep(blank, 'contract'), { revealed: false }).issues, [],
    'ฟอร์มเปล่า = ไม่มีอะไรแดงสักช่อง');
  const typed = historicalWizardLocalIssues(
    { ...emptyHistoricalWizard(), contract: { ...emptyHistoricalWizard().contract, startDate: '2026-09-30' } },
    { contractFileCount: 0, todayIso: '2026-09-25' },
  );
  assert.deepEqual(
    intakeForm.historicalVisibleIssues(issuesForStep(typed, 'contract'), { revealed: false }).issues.map((issue) => issue.message),
    [CONTRACT_DATE_MESSAGES.startAfterToday], 'พิมพ์วันเริ่มเลยวันนี้ = ขึ้นทันที · ช่องอื่นที่ยังว่างยังเงียบ',
  );
  /* ซ่อนแค่การแสดง — ด่านของปุ่มยังอ่านข้อครบ (historicalNextBlock ไม่รู้จัก revealed) */
  assert.equal(historicalNextBlock(issues, 'contract').blocked, true);
});

/* 🐞 รีวิว 25/09: ช่องบังคับของขั้น ① เคยมีแต่แผนตรวจ ⇒ ฟอร์มเปล่ากด "ถัดไป" เจอแค่ไฟล์สัญญา · แนบแล้วกดอีกรอบ
   ถึงเจอชนิดเอกสาร/วัน = ทีละข้อ (form-design-rules §2 ห้าม) ⇒ จอถามครบรอบเดียว ด้วยคำเดียวกับแผน เรียงตามจอ */
test('🐞 ขั้น ① ช่องบังคับครบในรอบเดียว — เรียงตามลำดับบนจอ · ข้อความเดียวกับที่แผนตีกลับคำต่อคำ', () => {
  const blank = emptyHistoricalWizard();
  const local = issuesForStep(historicalWizardLocalIssues(blank, { contractFileCount: 0, todayIso: '2026-09-25' }), 'contract');
  assert.deepEqual(local.map((issue) => issue.field), [
    'customerId', 'ownerId', 'contract.docKind', 'contract.startDate', 'contract.endDate', 'contract.file',
  ]);
  assert.ok(local.every((issue) => issue.live !== true), 'ข้อ "ยังไม่กรอก" ไม่ live — รอจนกดไปต่อ');
  const plan = planHistoricalServiceOrder(historicalWizardBody(blank, {}), {
    ...planCtx, customer: null, owner: null, todayIso: '2026-09-25',
  });
  for (const issue of local.filter((item) => item.field !== 'contract.file')) {
    const server = plan.errors.find((error) => error.field === issue.field);
    assert.ok(server, `แผนต้องตีกลับ ${issue.field} ด้วย`);
    assert.equal(issue.message, server.message, `${issue.field}: ข้อความบนจอ = ข้อความของแผน`);
  }
  /* ปุ่ม "ถัดไป" พาไปช่องแรกบนจอ */
  assert.equal(historicalNextBlock(local, 'contract').field, 'customerId');
  /* กรอกครบแล้ว = ไม่มีข้อ "ต้องระบุ" ค้าง */
  assert.deepEqual(historicalWizardLocalIssues(filledState(), { contractFileCount: 1, evidenceFileCount: 1 }), []);
});

/* ⭐ ช่องสรุปบนหัวขั้น ① = แถวชุดเดียวกับแถบสรุป (historicalAsideRows) ⇒ สองที่พูดคำเดียวกันเสมอ */
test('⭐ historicalContractFacts: ลูกค้า · AE · ช่วงสัญญา · ไฟล์ จากแถวของแถบสรุป · ค่าว่าง = null (ขีด)', () => {
  const rows = intakeForm.historicalAsideRows(filledState(), {
    customerLabel: 'AR-354 · บริษัท พีเอ็มแอลอินเตอร์ จำกัด', ownerLabel: 'Kamonrat', contractFileCount: 1,
  });
  const facts = intakeForm.historicalContractFacts(rows);
  assert.deepEqual(facts.map((fact) => fact.key), ['customer', 'owner', 'span', 'files']);
  assert.deepEqual(facts.map((fact) => fact.label), ['ลูกค้า', 'AE ผู้ดูแล', 'ช่วงสัญญา', 'ไฟล์เอกสาร']);
  assert.equal(facts[0].value, 'AR-354 · บริษัท พีเอ็มแอลอินเตอร์ จำกัด');
  assert.equal(facts[1].value, 'Kamonrat');
  assert.equal(facts[3].value, 'แนบแล้ว 1 ไฟล์');
  const spanRow = rows.find((row) => row.id === 'span');
  assert.equal(facts[2].value, spanRow.value, 'ช่วงสัญญาพูดคำเดียวกับแถบสรุป');
  const blank = intakeForm.historicalContractFacts(intakeForm.historicalAsideRows(emptyHistoricalWizard(), { contractFileCount: null }));
  assert.deepEqual(blank.map((fact) => fact.value), [null, null, null, null], 'ยังไม่รู้ = ขีด ไม่ใช่ศูนย์');
});

test('⭐ historicalDocStatusLabel: ยังไม่ออกใบ · ร่าง · ถูกตีกลับ', () => {
  assert.equal(intakeForm.historicalDocStatusLabel(emptyHistoricalWizard()), 'ยังไม่ออกใบ');
  assert.equal(intakeForm.historicalDocStatusLabel({ orderId: 'SO-1', status: 'draft' }), 'ฉบับร่าง — ยังไม่ส่งอนุมัติ');
  assert.equal(intakeForm.historicalDocStatusLabel({ orderId: 'SO-1', status: 'rejected' }), 'ถูกตีกลับ — แก้แล้วส่งใหม่');
});

/* ⭐ จุดบนรางเดินกติกาเดียวกับก้อนแดง — ขั้นที่ยังไม่เคยกดไปต่อไม่ขึ้นสี "มีข้อต้องแก้" · ข้อความ "ยังไปขั้นนี้ไม่ได้" ยังครบ */
test('⭐ historicalWizardRail: revealedSteps คุมจุด "มีข้อต้องแก้" · ไม่ส่ง = นับทุกขั้นแบบเดิม', () => {
  const localIssues = [{ field: 'contract.file', message: 'ต้องแนบไฟล์' }];
  const hidden = historicalWizardRail(emptyHistoricalWizard(), { step: 'contract', localIssues, revealedSteps: new Set() });
  assert.equal(hidden[0].issues, 0);
  assert.notEqual(hidden[0].tone, 'some');
  assert.match(hidden[1].blocked || '', /ต้องแนบไฟล์/, 'ขั้นข้างหน้ายังบอกเหตุที่ไปไม่ได้');
  const shown = historicalWizardRail(emptyHistoricalWizard(), { step: 'contract', localIssues, revealedSteps: new Set(['contract']) });
  assert.equal(shown[0].tone, 'some');
  assert.equal(historicalWizardRail(emptyHistoricalWizard(), { step: 'contract', localIssues })[0].tone, 'some');
});

/* 🐞 UAT 25/09: ขั้น ③ ของใบใหม่ถูกต้อนรับด้วยก้อนแดง — ข้อ "ยังว่าง" ของขั้นข้างหน้าติดมากับพรีวิวทุกครั้ง
   ⇒ error ที่พกมาเปิดเผยขั้นปลายทางเฉพาะเมื่อขั้นนั้นมีของอยู่แล้ว */
test('🐞 historicalStepHasInput: ขั้นว่างไม่ถูกเปิดเผยตอนเดินมาถึง · ขั้นที่มีของ (ใบที่ถูกตีกลับ) ถูกเปิดเผย', () => {
  const blank = emptyHistoricalWizard();
  assert.equal(intakeForm.historicalStepHasInput(blank, 'zones'), false);
  assert.equal(intakeForm.historicalStepHasInput(blank, 'money'), false);
  assert.equal(intakeForm.historicalStepHasInput(blank, 'contract'), false);
  const filled = filledState();
  assert.equal(intakeForm.historicalStepHasInput(filled, 'zones'), true);
  assert.equal(intakeForm.historicalStepHasInput(filled, 'money'), true);
  assert.equal(intakeForm.historicalStepHasInput(filled, 'contract'), true);
  /* ตอบงวดยกมาแล้ว (แม้ "ไม่เคยเก็บ" และยังไม่มีงวด) = มีของแล้ว */
  assert.equal(intakeForm.historicalStepHasInput({ ...blank, hasOpening: false }, 'money'), true);
  assert.equal(intakeForm.historicalStepHasInput({ ...blank, installments: [emptyHistoricalInstallment()] }, 'money'), true);
  assert.equal(intakeForm.historicalStepHasInput(blank, 'review'), true);
});

// ── รีวิว 25/09 รอบขั้น ③ — ข้อที่ยืนยันแล้ว ──────────────────────────────────────────────

/* 🐞 ใบกลายเป็น ฿0 หลังตอบขั้น ③ (ส่วนลด 100% ที่ขั้น ②) — ขั้น ③ ซ่อนทุกช่อง แต่ body เคยส่งงวดเดิม ⇒ ทางตัน */
test('🐞 รีวิว 25/09: ใบ ฿0 = body ไม่ส่งงวดยกมาและงวด (แผนรับได้) · ของที่คีย์ไว้ยังอยู่ใน state', () => {
  const full = filledState({ openingFull: true, notes: 'แถมฟรี' });
  const body = historicalWizardBody(full, { totalAmount: 0 });
  assert.equal(body.opening, null);
  assert.deepEqual(body.installments, []);
  const none = historicalWizardBody(filledState({ hasOpening: false, notes: 'แถมฟรี' }), { totalAmount: 0 });
  assert.deepEqual([none.opening, none.installments], [null, []]);
  assert.equal(full.openingFull, true, 'state ไม่ถูกแก้ — ยอดกลับมาเมื่อไรคำตอบยังอยู่');
  /* แผนของจริงรับ body นี้ (ใบ ฿0 ส่วนลด 100%) */
  const zeroState = filledState({
    openingFull: true, notes: 'แถมฟรี', discountType: 'percent', discountValue: '100',
  });
  const plan = planHistoricalServiceOrder(historicalWizardBody(zeroState, {}), planCtx);
  assert.equal(plan.zeroValue, true);
  assert.deepEqual(plan.errors.filter((e) => /^(opening|installments)/.test(e.field)), [], JSON.stringify(plan.errors));
  /* รางพูดธงเดียวกับขั้น ③ (ไม่ต้องรอแผน) */
  const rail = historicalWizardRail(zeroState, { step: 'money', zeroValue: true });
  assert.equal(rail.find((item) => item.key === 'money').summary, 'ใบยอด 0 บาท — ไม่มีงวด');
});

/* 🐞 สัญญาเริ่มวันที่ 29–31: วันครบกำหนดแบบ "สิ้นเดือน"/"ทุกวันที่ n" เคยซ้ำเดือนเดียวกันสองงวดและไม่มีงวดในเดือนสั้น */
test('🐞 รีวิว 25/09: วันครบกำหนดเดือนละหนึ่งวันเสมอ แม้สัญญาเริ่มวันที่ 29–31', () => {
  for (const [from, to, rule, day] of [
    ['2025-01-31', '2026-01-30', 'monthEnd', ''], ['2025-01-31', '2026-01-30', 'day', '31'],
    ['2025-10-30', '2026-10-29', 'day', '30'], ['2025-01-29', '2026-01-28', 'day', '29'],
  ]) {
    const pv = intakeForm.historicalSplitPreview({ from, to, amount: 1200, period: '1', dueRule: rule, dueDay: day });
    const dues = pv.rows.map((row) => row.dueDate);
    assert.equal(new Set(dues).size, dues.length, `${from} ${rule}${day}: ซ้ำ ${dues.join(',')}`);
    assert.equal(new Set(dues.map((d) => d.slice(0, 7))).size, 12, `${from}: ต้องได้ 12 เดือนไม่ซ้ำ`);
    assert.ok(pv.rows.every((row) => row.dueDate <= row.coversTo), 'ครบกำหนดไม่เลยวันสิ้นสุดของงวดนั้น');
  }
  const feb = intakeForm.historicalSplitPreview({ from: '2025-10-30', to: '2026-10-29', amount: 1200, period: '1', dueRule: 'day', dueDay: '30' });
  assert.ok(feb.rows.some((row) => row.dueDate === '2026-02-28'), 'เดือนที่ไม่มีวันที่ 30 ใช้สิ้นเดือน');
});

/* 🐞 สัญญาเริ่มวันที่ 31 จ่ายถึงสิ้นเดือนที่ 3 — ป้ายบอก "ครบ 3 เดือนพอดี" แต่หน้าต่างแบ่งงวดเหลือแค่ก้อนเดียว */
test('🐞 รีวิว 25/09: ช่วงที่เหลือแบ่งบนตารางเดือนของสัญญา (สัญญาเริ่มวันที่ 31)', () => {
  const span = intakeForm.historicalRemainingSpan({ from: '2025-07-01', to: '2026-03-30', gridStart: '2025-03-31' });
  assert.deepEqual(span, { months: 9, extraDay: false, gridStart: '2025-03-31', offset: 3 });
  const opts = intakeForm.historicalSplitOptions({ from: '2025-07-01', to: '2026-03-30', gridStart: '2025-03-31' });
  assert.deepEqual(opts.options.filter((o) => !o.disabled).map((o) => o.value), ['once', '1', '3']);
  const pv = intakeForm.historicalSplitPreview({
    from: '2025-07-01', to: '2026-03-30', gridStart: '2025-03-31', amount: 900, period: '3', dueRule: 'start',
  });
  assert.deepEqual(pv.rows.map((row) => [row.coversFrom, row.coversTo]),
    [['2025-07-01', '2025-09-30'], ['2025-10-01', '2025-12-30'], ['2025-12-31', '2026-03-30']]);
  assert.ok(coverageIsContinuous(pv.rows, { start: '2025-07-01', end: '2026-03-30' }));
  /* ไม่อยู่บนตาราง = นับจากช่วงที่เหลือเองแบบเดิม */
  assert.equal(intakeForm.historicalRemainingSpan({ from: '2026-04-02', to: '2026-12-31', gridStart: '2026-01-01' }), null);
});

/* 🐞 งวดยกมาเกินยอดใบ — เคยโทษ "งวดอื่นรวมกันเกิน" ที่งวดสุดท้าย ทั้งที่ผิดที่ช่องยอดที่เก็บแล้ว */
test('🐞 รีวิว 25/09: งวดยกมาเกินยอดใบ = ข้อของช่องยอดที่เก็บแล้วเท่านั้น', () => {
  const state = filledState({ opening: { amount: '300000', coversTo: '2026-09-30', paidOn: '2026-09-22', note: '' } });
  const issues = intakeForm.historicalMoneyIssues(state, { evidenceFileCount: 1, todayIso: '2026-09-25', totalAmount: 261936 });
  assert.ok(issues.some((issue) => issue.field === 'opening.amount' && /เกิน/.test(issue.message)));
  assert.ok(!issues.some((issue) => /^installments\.\d+\.amount$/.test(issue.field)), JSON.stringify(issues));
});

test('🐞 รีวิว 25/09: "ยังไม่เคยจ่าย" บอกหลักฐานที่อัปไว้แล้วในคำถามด้วย (ไม่ผูกกับใบอีก)', () => {
  const state = filledState({ openingEvidence: [{ storagePath: 'x/a.pdf', fileName: 'a.pdf' }], opening: { amount: '', coversTo: '', paidOn: '', note: '' } });
  const change = intakeForm.historicalOpeningModeChange(state, 'none');
  assert.equal(change.ask, true, 'มีหลักฐานบนเซิร์ฟเวอร์ = ต้องถามแม้ช่องอื่นว่าง');
  assert.match(change.description, /หลักฐานที่แนบไว้แล้ว 1 ไฟล์/);
  assert.equal(intakeForm.historicalOpeningModeChange(emptyHistoricalWizard(), 'none').ask, false, 'ตอบครั้งแรกไม่ถาม');
  assert.deepEqual(intakeForm.historicalOpeningModeChange(filledState({ openingFull: true }), 'part').ask, false);
  const toFull = intakeForm.historicalOpeningModeChange(filledState(), 'full');
  assert.equal(toFull.ask, true);
  assert.deepEqual(toFull.patch, { hasOpening: true, openingFull: true, installments: [] });
});

/* 🐞 ลบงวดบนแล้วข้อของ server (ชื่อช่องตามลำดับตอนตรวจ) ไม่ชนข้อสดของจอ ⇒ ข้อเดียวขึ้นสองบรรทัด */
test('🐞 รีวิว 25/09: ข้อที่จอตรวจเองกับข้อของ server ช่องเดียวกัน = ข้อเดียว (เทียบด้วย key ของแถว + ช่อง)', () => {
  const local = [{ field: 'installments.1.label', rowKey: 'inst-b', message: 'งวดที่ 2: ต้องกรอกรายละเอียดงวด', detail: 'x' }];
  const server = [
    { field: 'installments.2.label', rowKey: 'inst-b', message: 'งวดที่ 3: ชื่องวดต้องมี 1–120 ตัวอักษร', detail: 'y' },
    { field: 'installments.2.dueDate', rowKey: 'inst-b', message: 'งวดที่ 3: ต้องระบุวันครบกำหนด', detail: 'z' },
    { field: 'vatRate', message: 'เลือก VAT' },
  ];
  const merged = intakeForm.historicalMergeIssues(local, server);
  assert.deepEqual(merged.map((issue) => issue.field), ['installments.1.label', 'installments.2.dueDate', 'vatRate']);
  assert.deepEqual(intakeForm.historicalMergeIssues([{ field: 'vatRate', message: 'a' }], [{ field: 'vatRate', message: 'b' }])
    .map((issue) => issue.message), ['a'], 'ช่องที่ไม่มีแถว เทียบด้วยชื่อช่องแบบเดิม');
});

test('⭐ ป้ายจำนวนเดือนตัวเดียวของทุกจอ — สัญญาจบตรงวันครบรอบบอกด้วย', () => {
  assert.equal(contractSpan('2026-01-01', '2026-12-31').monthsText, '12 เดือน');
  assert.equal(contractSpan('2025-09-25', '2026-09-25').monthsText, '12 เดือน · จบวันครบรอบ');
  assert.equal(contractSpan('2026-01-01', '2026-12-30').monthsText, null);
  const by = Object.fromEntries(historicalAsideRows(filledState({ contract: { ...CONTRACT, startDate: '2025-09-25', endDate: '2026-09-25' } }), {})
    .map((row) => [row.id, row.value]));
  assert.match(by.span, /12 เดือน · จบวันครบรอบ$/);
});
