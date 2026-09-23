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
  CONTRACT_PARTIAL_NOTE, HISTORICAL_MONEY_UNKNOWN, HISTORICAL_SAVE_BUTTON_LABEL,
  HISTORICAL_WIZARD_STEPS, HISTORICAL_WIZARD_STEP_ORDER,
  ZONE_SITE_AUTO_OPEN_MAX, contractMonths, contractSpan, emptyHistoricalInstallment,
  emptyHistoricalWizard, emptyHistoricalZone, emptySaveProgress, firstStepWithIssues,
  historicalAsideRows, historicalContractDateIssues, historicalContractDateWarnings,
  historicalContractFileCount, historicalCoverageWarning,
  historicalDownstreamReset, historicalDuplicateGate, historicalExitActions, historicalFieldAnchorId,
  historicalFootNote, historicalInstallmentSum, historicalMoneyView, historicalNextBlock,
  historicalReviewStaleNotice, historicalSaveExit,
  historicalSaveFailureState, historicalStepIssueNotice,
  historicalTeamField, historicalWizardRail, historicalZoneBrowser,
  historicalWizardBody, historicalWizardLocalIssues, issuesForStep, newHistoricalIntakeKey,
  nextSaveStage, saveProgressAfter, splitRemaining, stepOfField, wizardStateFromOrder,
  zoneAmountSuggestion, zoneAmountSuggestionNote,
} from './historicalIntakeForm.js';
import { CONTRACT_DATE_MESSAGES, splitHistoricalAmounts } from './historicalOrderPlan.js';
import { OPENING_INSTALLMENT_LABEL } from './historicalOrders.js';
import { coverageIsContinuous } from './paymentCoverage.js';

/* ชุดตัวเลขของม็อก (mockups/legacy-so-service-flow) — 196,452 + 65,484 = 261,936 ครอบ 1 ม.ค.–31 ธ.ค. 2026 */
const CONTRACT = { docKind: 'customer_po', ref: 'PO-SPW-2026-0118', startDate: '2026-01-01', endDate: '2026-12-31' };

function filledState(extra = {}) {
  return {
    ...emptyHistoricalWizard(),
    customerId: 'CUS-1', ownerId: 'USR-AE', team: 'KA',
    contract: { ...CONTRACT },
    refs: { quote: '', express: '', invoice: 'IV-2601-0412' },
    amountsIncludeVat: false,
    vatRate: 7,
    notes: '',
    packageProductId: 'PRD-1',
    zones: [emptyHistoricalZone({ zoneId: 'ZN-1', siteId: 'ST-1', productId: 'PRD-1', packs: '6', rounds: '12', lineAmount: '86400' })],
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
  for (const forbidden of ['"key"', '"status"', '"frozenAt"', '"kind"', '"seq"']) {
    assert.ok(!json.includes(forbidden), `body ต้องไม่มี ${forbidden}`);
  }
  assert.deepEqual(Object.keys(body.zones[0]).sort(), ['lineAmount', 'packs', 'productId', 'rounds', 'zoneId']);
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
  metadata: { historicalIntake: { amountsIncludeVat: false, vatRate: 7 } },
  deal: { ownerId: 'USR-AE', team: 'KA' },
  serviceContract: {
    id: 'CTR-Habc', externalDocKind: 'customer_po', externalRef: 'PO-SPW-2026-0118',
    effectiveDate: '2026-01-01', expiryDate: '2026-12-31',
  },
  lines: [
    { id: 'SOL-2', sortOrder: 1, serviceZoneId: 'ZN-2', productId: 'PRD-1', qty: 4, serviceRounds: 12, lineTotal: 53831.78, metadata: { grossAmount: 57600 } },
    { id: 'SOL-1', sortOrder: 0, serviceZoneId: 'ZN-1', productId: 'PRD-1', qty: 6, serviceRounds: 12, lineTotal: 80747.66, metadata: { grossAmount: 86400 } },
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
  assert.equal(state.amountsIncludeVat, false);
  assert.deepEqual(state.zones.map((z) => z.zoneId), ['ZN-1', 'ZN-2'], 'เรียงตาม sortOrder ของบรรทัด');
  assert.equal(state.hasOpening, true);
  assert.equal(state.opening.coversTo, '2026-09-30');
  assert.equal(state.openingEvidence.length, 1);
  assert.deepEqual(state.installments.map((r) => r.label), ['งวด ต.ค.–ธ.ค. 2026']);
});

/* 🐞 ยอดของโซนบนฟอร์มคือ **ยอดที่ผู้คีย์พิมพ์** (metadata.grossAmount) ไม่ใช่ `lineTotal` ซึ่งเป็น
   ยอดก่อน VAT ที่ระบบคิดให้ — เติมกลับผิดช่องแปลว่ายอดหดลงทุกครั้งที่เปิดใบมาแก้ */
test('🪤 ยอดของโซนเติมกลับจาก metadata.grossAmount ไม่ใช่ lineTotal (ยอดก่อน VAT)', () => {
  const state = wizardStateFromOrder(ORDER);
  assert.equal(state.zones[0].lineAmount, '86400');
  assert.equal(state.zones[1].lineAmount, '57600');
});

test('⭐ โหลดมาแล้วประกอบ body กลับได้ค่าชุดเดิม (สร้าง = แก้ ฟอร์มเดียวกันจริง)', () => {
  const body = historicalWizardBody(wizardStateFromOrder(ORDER), { expectedUpdatedAt: ORDER.updatedAt });
  assert.deepEqual(body.contract, { docKind: 'customer_po', ref: 'PO-SPW-2026-0118', startDate: '2026-01-01', endDate: '2026-12-31' });
  assert.deepEqual(body.zones.map((z) => z.packs), ['6', '4']);
  assert.equal(body.opening.amount, '196452');
  assert.equal(body.opening.evidence.length, 1);
  assert.equal(body.installments[0].amount, '65484');
  assert.equal(body.vatRate, 7);
});

test('ใบร่างที่ยังไม่มีงวดเลย: hasOpening = null (ยังไม่ตัดสินใจ) ไม่ใช่ false', () => {
  const state = wizardStateFromOrder({ ...ORDER, status: 'draft', installments: [] });
  assert.equal(state.hasOpening, null);
  assert.equal(state.rejection, null);
});

// ── ช่อง → ขั้น ────────────────────────────────────────────────────────────────

test('ช่องของแผนและของฟอร์มถูกจัดเข้าขั้นที่ผู้คีย์เห็นช่องนั้นจริง', () => {
  assert.equal(stepOfField('customerId'), 'contract');
  assert.equal(stepOfField('contract.startDate'), 'contract');
  assert.equal(stepOfField('contract.file'), 'contract');
  assert.equal(stepOfField('refs.invoice'), 'contract');
  assert.equal(stepOfField('vatRate'), 'contract');
  assert.equal(stepOfField('zones'), 'zones');
  assert.equal(stepOfField('zones.2'), 'zones');
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

test('VAT: ไม่เลือกอัตรา = ติด · เลือก "ไม่มี VAT" (0%) ไม่ต้องตอบว่ารวม VAT หรือยัง', () => {
  const base = { role: 'ac', userId: 'USR-AC', contractFileCount: 1, evidenceFileCount: 1 };
  const none = historicalWizardLocalIssues(filledState({ vatRate: null, amountsIncludeVat: null }), base);
  assert.ok(none.some((i) => i.field === 'vatRate'));
  assert.deepEqual(historicalWizardLocalIssues(filledState({ vatRate: 0, amountsIncludeVat: false }), base), []);
});

/* 🐞 UAT 23/09: ช่องวันสองช่องถูกล้อมด้วย min/max ⇒ `DateInput` กลืนค่าที่พิมพ์แล้วเด้งกลับเงียบ ๆ
   ⇒ ฟอร์มรับค่าเข้ามาแล้วโชว์กฎแทน · ข้อความต้องเป็นก้อนเดียวกับที่แผนตีกลับ (ไม่งั้นมีกฎสองชุด) */
test('⭐ กฎของสองช่องวันสัญญาโชว์ที่ฟอร์มด้วยข้อความก้อนเดียวกับแผนฝั่ง server', () => {
  const at = (contract) => historicalContractDateIssues({ contract }, { todayIso: '2026-09-23' });
  assert.deepEqual(at({ startDate: '2026-09-24', endDate: '2026-12-31' }), [
    { field: 'contract.startDate', message: CONTRACT_DATE_MESSAGES.startAfterToday },
  ]);
  assert.deepEqual(at({ startDate: '2026-01-01', endDate: '2025-12-31' }), [
    { field: 'contract.endDate', message: CONTRACT_DATE_MESSAGES.endBeforeStart },
  ], 'ก่อนวันเริ่ม ชนะ "สิ้นสุดไปแล้ว" — ลำดับเดียวกับ else-if ของแผน');
  assert.deepEqual(at({ startDate: '2026-01-01', endDate: '2026-09-22' }), [
    { field: 'contract.endDate', message: CONTRACT_DATE_MESSAGES.endBeforeToday },
  ]);
  assert.deepEqual(at({ startDate: '2026-01-01', endDate: '2026-12-31' }), [], 'ช่วงปกติไม่มีอะไรขึ้น');
  assert.deepEqual(at({ startDate: '2026-09-23', endDate: '2026-09-23' }), [], 'วันนี้พอดี = ผ่าน');
  assert.deepEqual(at({ startDate: '', endDate: '' }), [], 'ยังไม่กรอก = ยังไม่ใช่ความผิด (แผนเป็นคนบังคับ)');
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

test('⭐ contractSpan แยก "ยังกรอกไม่ครบ" ออกจาก "กรอกครบแล้วแต่ไม่ลงตัวเป็นเดือน"', () => {
  assert.deepEqual(contractSpan('2026-01-01', '2026-12-31'), { months: 12, dated: true, partial: false, note: null });
  assert.deepEqual(contractSpan('2026-01-01', '2026-12-30'), {
    months: null, dated: true, partial: true, note: CONTRACT_PARTIAL_NOTE,
  });
  assert.deepEqual(contractSpan('2026-01-01', ''), { months: null, dated: false, partial: false, note: null });
  assert.deepEqual(contractSpan('2026-12-31', '2026-01-01'), { months: null, dated: false, partial: false, note: null });
});

test('ปุ่มลัดยอดโซน = ราคาแพ็คเกจ × แพ็ค × เดือน (ม็อก 1,200 × 6 × 12) · ข้อมูลไม่ครบ = null', () => {
  assert.equal(zoneAmountSuggestion({ unitPrice: 1200, packs: 6, months: 12 }), 86400);
  assert.equal(zoneAmountSuggestion({ unitPrice: 1200, packs: 0, months: 12 }), null);
  assert.equal(zoneAmountSuggestion({ unitPrice: 0, packs: 6, months: 12 }), null);
  assert.equal(zoneAmountSuggestion({ unitPrice: 1200, packs: 6, months: null }), null);
});

/* 🔴 "คิดยอดไม่ได้" ต้องมีเหตุผลให้โชว์เสมอ — ของเดิมปุ่มกดได้แล้วเงียบเมื่อยอดเป็น null */
test('⭐ ปุ่มลัดที่กดไม่ได้ต้องบอกเหตุ และเหตุมีเมื่อไรก็คือตอนที่คิดยอดไม่ได้เป๊ะ', () => {
  assert.equal(zoneAmountSuggestionNote({ unitPrice: 1200, packs: 6, months: 12 }), null);
  assert.match(zoneAmountSuggestionNote({ unitPrice: 1200, packs: 6, months: null }), /ขั้น ①/);
  assert.equal(
    zoneAmountSuggestionNote({ unitPrice: 1200, packs: 6, months: null, monthsPartial: true }),
    CONTRACT_PARTIAL_NOTE,
    'ช่วงไม่ลงตัวเป็นเดือน = คนละเหตุกับยังไม่กรอกวัน',
  );
  assert.match(zoneAmountSuggestionNote({ unitPrice: 1200, packs: 0, months: 12 }), /แพ็ค/);
  assert.match(zoneAmountSuggestionNote({ unitPrice: null, packs: 6, months: 12 }), /ราคาต่อหน่วย/);

  for (const unitPrice of [null, 0, 1200]) {
    for (const packs of [null, 0, 2.5, 6]) {
      for (const months of [null, 0, 12]) {
        const input = { unitPrice, packs, months };
        assert.equal(
          zoneAmountSuggestionNote(input) === null,
          zoneAmountSuggestion(input) !== null,
          `เหตุกับยอดต้องสลับกันเสมอ: ${JSON.stringify(input)}`,
        );
      }
    }
  }
});

// ── ช่องต้นน้ำเปลี่ยน = ล้างปลายน้ำให้ครบ และถามก่อน ────────────────────────────────

/* 🐞 UAT 23/09 (ข้อมูลหาย): สลับลูกค้าล้างแค่ `zones` + `packageProductId` แล้ว **ทิ้งงวดไว้**
   ทั้งที่ยอดของงวดคิดมาจากโซนที่เพิ่งลบ ⇒ ขั้น ③ ค้างยอดของบรรทัดที่ไม่มีอยู่แล้ว
   และผู้คีย์ไปโผล่ที่ "ยอดงวดรวมไม่เท่ายอดใบ" โดยไม่มีใครบอกว่าทำไม */
test('⭐ เปลี่ยนลูกค้า = ล้างโซน แพ็คเกจ **และงวดทั้งชุด** เป็นก้อนเดียว', () => {
  const reset = historicalDownstreamReset(filledState(), 'customer');
  assert.equal(reset.ask, true, 'มีของจะหาย = ต้องถามก่อน');
  assert.deepEqual(reset.patch.zones, []);
  assert.equal(reset.patch.packageProductId, '');
  assert.deepEqual(reset.patch.installments, [], 'งวดที่เหลือต้องหายไปด้วย');
  assert.equal(reset.patch.hasOpening, null, 'คำถามงวดยกมากลับไปเป็น "ยังไม่ตัดสินใจ" ไม่ใช่ false');
  assert.deepEqual(reset.patch.opening, emptyHistoricalWizard().opening);
  assert.ok(!('openingEvidence' in reset.patch), 'หลักฐานที่อยู่บนเซิร์ฟเวอร์แล้วห้ามล้างจากฟอร์ม (ไฟล์กำพร้า)');

  /* คำถามต้องพูดถึงของที่จะหายครบทุกกอง — ไม่งั้นโมดัลบอกครึ่งเดียวแล้วของหายเกินที่บอก */
  for (const piece of ['1 โซน', 'แพ็คเกจ', OPENING_INSTALLMENT_LABEL, '1 งวด']) {
    assert.ok(reset.description.includes(piece), `คำถามต้องบอกว่า "${piece}" จะหาย · ได้ "${reset.description}"`);
  }
  assert.deepEqual(reset.clears.length, 4);
});

test('⭐ ฟอร์มเปล่า = ไม่ต้องถาม แต่ยังล้างให้ครบเหมือนกัน (ผู้เรียกใช้ patch ก้อนเดียวเสมอ)', () => {
  const clean = historicalDownstreamReset(emptyHistoricalWizard(), 'customer');
  assert.equal(clean.ask, false);
  assert.deepEqual(clean.clears, []);
  assert.deepEqual(clean.patch.zones, []);
  assert.deepEqual(clean.patch.installments, []);
  const onlyZones = historicalDownstreamReset(filledState({ hasOpening: null, installments: [] }), 'customer');
  assert.equal(onlyZones.ask, true);
  assert.deepEqual(onlyZones.clears, ['โซนที่เลือกไว้ 1 โซน', 'แพ็คเกจที่ใช้กับทุกโซน']);
});

/* โหมด VAT เปลี่ยน = ยอดใบเปลี่ยน ⇒ งวดไม่ตรงยอดอีก · แต่ **โซนไม่หาย** (ยอดต่อโซนเป็นของที่ผู้คีย์พิมพ์เอง) */
test('⭐ เปลี่ยนโหมด VAT = ล้างเฉพาะงวด · โซนและยอดต่อโซนยังอยู่', () => {
  const reset = historicalDownstreamReset(filledState(), 'vat');
  assert.equal(reset.ask, true);
  assert.ok(!('zones' in reset.patch), 'โซนต้องไม่ถูกแตะ');
  assert.ok(!('packageProductId' in reset.patch));
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
});

// ── ทะเบียนไซต์/โซนของขั้น ② (ของจริง 26 ไซต์ 43 โซน) ────────────────────────────────

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

/* 🐞 ของเดิมใช้ `Promise.all` ก้อนเดียว ⇒ ไซต์เดียวพัง = ลิสต์ว่างทั้งจอ */
test('⭐ ไซต์ที่โหลดโซนไม่สำเร็จมีแถวของตัวเอง (กางไว้) · ไซต์ที่เหลือใช้งานได้ปกติ', () => {
  const broken = historicalZoneBrowser({
    ...BROWSE,
    zonesBySite: { ...BROWSE.zonesBySite, 'ST-2': [] },
    siteErrors: { 'ST-2': 'โหลดโซนของไซต์ ST-1044 ไม่สำเร็จ' },
  });
  assert.equal(broken.rows.length, 5, 'ไซต์ที่พังไม่ทำให้ใบอื่นหาย');
  const row = broken.rows.find((r) => r.site.id === 'ST-2');
  assert.equal(row.error, 'โหลดโซนของไซต์ ST-1044 ไม่สำเร็จ');
  assert.equal(row.defaultOpen, true, 'ต้องกางไว้ให้เห็นปุ่มลองอีกครั้ง');

  /* ค้นอยู่ก็ยังต้องโชว์ — ยังไม่รู้ว่าข้างในมีโซนที่ตรงคำค้นไหม การซ่อนคือการตอบแทนข้อมูลที่ไม่มี */
  const searching = historicalZoneBrowser({
    ...BROWSE,
    siteErrors: { 'ST-2': 'พัง' },
    query: 'พารากอน',
  });
  assert.deepEqual(searching.rows.map((r) => r.site.id), ['ST-1', 'ST-2']);
});

test('⭐ ไซต์เยอะ = พับไว้ · ที่มีเรื่องต้องทำกางเอง (26 ไซต์ของจริงต้องเลื่อนหาไหว)', () => {
  const many = Array.from({ length: 26 }, (_, i) => site(`ST-${i}`, `ST-30${i}`, `สาขา ${i}`));
  const zonesBySite = Object.fromEntries(many.map((s, i) => [s.id, [zone(`Z-${i}`, `Z-30${i}-01`, 'ล็อบบี้')]]));
  const big = historicalZoneBrowser({ sites: many, zonesBySite, pickedZoneIds: ['Z-7'] });
  assert.equal(big.rows.length, 26);
  assert.equal(big.rows.filter((r) => r.defaultOpen).length, 1, 'กางเฉพาะไซต์ที่เลือกโซนไว้แล้ว');
  assert.equal(big.rows.find((r) => r.site.id === 'ST-7').defaultOpen, true);
  assert.equal(big.rows.find((r) => r.site.id === 'ST-7').picked, 1);

  // ลูกค้าทั่วไป (ม็อกมี 2 ไซต์) ต้องยังกางหมดเหมือนเดิม
  const small = historicalZoneBrowser(BROWSE);
  assert.equal(small.rows.every((r) => r.defaultOpen), false, '5 ไซต์เกินเพดานกางอัตโนมัติแล้ว');
  const few = historicalZoneBrowser({ ...BROWSE, sites: BROWSE.sites.slice(0, ZONE_SITE_AUTO_OPEN_MAX) });
  assert.equal(few.rows.every((r) => r.defaultOpen), true);
  // ค้นอยู่ = กางทุกใบที่ตรง (คำตอบอยู่ในนั้น)
  assert.equal(historicalZoneBrowser({ ...BROWSE, query: 'ล็อบบี้' }).rows.every((r) => r.defaultOpen), true);
});

test('⭐ แบ่งงวดอัตโนมัติ: ผลรวมตรงยอดเป๊ะ และช่วงครอบต่อเนื่องเต็มช่วงที่เหลือ', () => {
  for (const count of [1, 3, 4, 12]) {
    const rows = splitRemaining({ startDate: '2026-10-01', endDate: '2026-12-31', count, amount: 65484 });
    if (!rows.length) continue;
    assert.equal(rows.length, count);
    const sum = rows.reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0);
    assert.equal(sum, 6548400, `ผลรวมของ ${count} งวดต้องเท่ายอดที่เหลือเป๊ะ`);
    assert.equal(rows[0].coversFrom, '2026-10-01');
    assert.equal(rows[rows.length - 1].coversTo, '2026-12-31');
    assert.ok(coverageIsContinuous(rows, { start: '2026-10-01', end: '2026-12-31' }), `ช่วงของ ${count} งวดต้องต่อเนื่อง`);
    assert.ok(rows.every((row) => row.dueDate === row.coversFrom), 'วันครบกำหนดตั้งต้นที่วันเริ่มครอบ');
  }
  assert.deepEqual(splitRemaining({ startDate: '2026-10-01', endDate: '2026-12-31', count: 0, amount: 1 }), []);
});

test('แบ่งงวดแล้วเศษสตางค์ลงงวดสุดท้าย (ยอดหาร 3 ไม่ลงตัว)', () => {
  const rows = splitRemaining({ startDate: '2026-10-01', endDate: '2026-12-31', count: 3, amount: 100 });
  assert.deepEqual(rows.map((row) => row.amount), ['33.33', '33.33', '33.34']);
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
  const actions = historicalExitActions(exit);
  assert.deepEqual(actions.map((a) => a.key), ['open']);
  assert.equal(actions[0].orderId, 'SOR-Habc');
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
  assert.deepEqual(historicalExitActions(exit).map((a) => a.key), [], 'ไม่มีปุ่มทางออก — มันไม่ใช่จอผิดพลาด');
  const next = historicalSaveFailureState(exit);
  assert.equal(next.step, 'review');
  assert.equal(next.exit, null);
  assert.equal(next.acknowledged, false);
  assert.equal(next.duplicates.length, 1);
});

test('400 พร้อม errors[] = กลับไปแก้ที่ขั้นแรกที่มีปัญหา · ไม่มี errors[] ก็ยังพกข้อความไปด้วย', () => {
  const withFields = historicalSaveExit(apiError(400, {
    error: 'ต้องเลือกอย่างน้อย 1 โซน', errors: [{ field: 'zones', message: 'ต้องเลือกอย่างน้อย 1 โซน' }],
  }));
  assert.equal(withFields.goToStep, 'zones');
  assert.equal(historicalExitActions(withFields)[0].carryMessage, null);
  const plain = historicalSaveExit(apiError(400, { error: 'ยอดงวดรวมไม่เท่ายอดใบ' }));
  assert.equal(plain.goToStep, 'contract');
  assert.equal(historicalExitActions(plain)[0].carryMessage, 'ยอดงวดรวมไม่เท่ายอดใบ');
});

test('🔴 รหัสอื่นของ 409/500 ห้ามเสนอ "บันทึกอีกครั้ง" — ก้อนเดิมได้รหัสเดิมวนไม่รู้จบ', () => {
  const exit = historicalSaveExit(apiError(409, { code: 'workflow_stale', error: 'เอกสารถูกเปลี่ยน' }));
  assert.equal(exit.canRetry, false);
  assert.equal(exit.canEdit, true);
  assert.deepEqual(historicalExitActions(exit).map((a) => a.key), ['edit']);
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
  const clean = historicalDuplicateGate({ duplicates: [], acknowledged: false, warnings: ['เตือน'] });
  assert.equal(clean.gated, false);
  assert.match(clean.footNote, /คำเตือน 1 ข้อ/);

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
  const state = { ...emptyHistoricalWizard(), amountsIncludeVat: false, vatRate: 7 };
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
  assert.equal(historicalFieldAnchorId('vatRate'), historicalFieldAnchorId('amountsIncludeVat'),
    'โหมด VAT กับอัตรา VAT อยู่บนแผ่นตัวเลือกใบเดียว — ชี้คนละ id = พาไปที่ช่องที่ไม่มีอยู่');
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

test('⭐ รางสรุปของจริงตามม็อก ("4 โซน · 17 แพ็ค" · "ยกมา 1 งวด · ต้องเก็บ 1 งวด")', () => {
  const state = filledState({
    zones: [
      emptyHistoricalZone({ zoneId: 'ZN-1', packs: '6' }),
      emptyHistoricalZone({ zoneId: 'ZN-2', packs: '5' }),
      emptyHistoricalZone({ zoneId: 'ZN-3', packs: '4' }),
      emptyHistoricalZone({ zoneId: 'ZN-4', packs: '2' }),
    ],
  });
  const rail = historicalWizardRail(state, { step: 'zones', customerLabel: 'บจก. สยามพิวรรธน์' });
  const by = Object.fromEntries(rail.map((item) => [item.key, item]));
  assert.equal(by.zones.summary, '4 โซน · 17 แพ็ค');
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
  assert.equal(by.tax, 'ไม่รวม VAT · 7%');
  assert.match(by.zones, /1 โซน · 6 แพ็ค/);
  /* 🔴 เปลี่ยนโดยเจตนา 23/09 (รีวิว R7): ยอดก่อน VAT / VAT **ไม่ต้องรอแผน** อีกแล้ว — ของที่
     คิดได้จากยอดโซน + โหมด VAT ที่อยู่บนฟอร์ม ระบบคิดให้ด้วย `splitHistoricalAmounts`
     ก้อนเดียวกับ server · ขีดค้างทั้งรอบคีย์คือสิ่งที่ทำให้ขั้น ③ ใช้งานไม่ได้ */
  assert.equal(by.subtotal, '฿86,400.00');
  assert.equal(by.vat, '฿6,048.00');
  /* ยังไม่เลือกโหมด VAT = ยังคิดไม่ได้จริง ⇒ ว่างตามเดิม (ไม่เดาเป็น 0) */
  const noVat = Object.fromEntries(historicalAsideRows(
    filledState({ hasOpening: false, installments: [], vatRate: null, amountsIncludeVat: null }), { plan: null },
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
  const gate = historicalDuplicateGate({ duplicates: [], acknowledged: false, warnings: [] });
  assert.equal(historicalFootNote({ step: 'review', gate }), gate.footNote);
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
test('⭐ R7: ยอดใบคิดได้ตั้งแต่ยังไม่มีแผน — ตัวเลขตรงกับ splitHistoricalAmounts ของ server', () => {
  const state = filledState({
    zones: [
      emptyHistoricalZone({ zoneId: 'ZN-1', productId: 'PRD-1', packs: '6', rounds: '12', lineAmount: '196452' }),
      emptyHistoricalZone({ zoneId: 'ZN-2', productId: 'PRD-1', packs: '2', rounds: '12', lineAmount: '65484' }),
    ],
    amountsIncludeVat: true,
    vatRate: 7,
  });
  const view = historicalMoneyView(state, null);
  const server = splitHistoricalAmounts([196452, 65484], { amountsIncludeVat: true, vatRate: 7 });
  assert.equal(view.ok, true);
  assert.equal(view.source, 'local');
  assert.equal(view.totalAmount, server.totalAmount, 'ต้องเป็นก้อนเดียวกับ server ไม่ใช่กฎชุดที่สอง');
  assert.equal(view.subtotal, server.subtotal);
  assert.equal(view.vatAmount, server.vatAmount);
  assert.equal(view.totalAmount, 261936, 'ชุดตัวเลขของม็อก');

  /* มีแผนแล้วเชื่อแผนเสมอ (แผนคืนมาเฉพาะตอนไม่มี error ⇒ เงินผ่านด่านครบแล้ว) */
  const fromPlan = historicalMoneyView(state, { header: { subtotal: 1, vatAmount: 2, totalAmount: 3 } });
  assert.deepEqual(
    [fromPlan.source, fromPlan.subtotal, fromPlan.vatAmount, fromPlan.totalAmount],
    ['plan', 1, 2, 3],
  );

  /* 🪤 แผนที่ยังมี error คืนบล็อกเงินเป็น 0 ทั้งก้อน — เชื่อมันคือพิมพ์ "฿0.00" ว่าเป็นยอดใบ
     (วันนี้เส้นพรีวิวไม่เคยคืนแผนแบบนั้น · ด่านนี้กันวันที่มันเปลี่ยน) */
  const errored = historicalMoneyView(state, {
    header: { subtotal: 0, vatAmount: 0, totalAmount: 0 },
    errors: [{ field: 'installments', message: 'ต้องมีงวดอย่างน้อย 1 งวด' }],
  });
  assert.equal(errored.source, 'local');
  assert.equal(errored.totalAmount, 261936, 'ต้องถอยไปคิดเองจากยอดโซน ไม่ใช่เชื่อ 0 ของแผนที่ยังไม่ผ่าน');
});

test('⭐ R7: คิดยอดไม่ได้ ต้องตอบ null + เหตุที่จริง — ห้ามตอบ 0 (0 อ่านเหมือนใบยอด ฿0)', () => {
  const noVat = historicalMoneyView(filledState({ vatRate: null, amountsIncludeVat: null }), null);
  assert.equal(noVat.ok, false);
  assert.equal(noVat.totalAmount, null, 'ห้ามเป็น 0 — ใบยอด 0 บาทเป็นสถานะจริงที่ซ่อนทั้งขั้น ③');
  assert.equal(noVat.reason, HISTORICAL_MONEY_UNKNOWN.vat);

  const noZones = historicalMoneyView(filledState({ zones: [] }), null);
  assert.equal(noZones.reason, HISTORICAL_MONEY_UNKNOWN.zones);

  const blankAmount = historicalMoneyView(filledState({
    zones: [emptyHistoricalZone({ zoneId: 'ZN-1', productId: 'PRD-1', packs: '6', lineAmount: '' })],
  }), null);
  assert.equal(blankAmount.ok, false);
  assert.equal(blankAmount.reason, HISTORICAL_MONEY_UNKNOWN.amounts);

  /* ใบยอด 0 บาทของจริง (โซนยอด 0) ยังต้องตอบได้ว่า "รู้แล้วว่าเป็น 0" */
  const zero = historicalMoneyView(filledState({
    zones: [emptyHistoricalZone({ zoneId: 'ZN-1', productId: 'PRD-1', packs: '1', lineAmount: '0' })],
  }), null);
  assert.equal(zero.ok, true);
  assert.equal(zero.totalAmount, 0);
});

test('⭐ R7: ผลรวมงวดกับส่วนต่าง คิดได้จากของบนฟอร์ม (ตัวช่วยเล็ง ไม่ใช่ด่าน)', () => {
  const state = filledState();   // งวดยกมา 196,452 + งวดที่เหลือ 65,484 = 261,936
  assert.deepEqual(historicalInstallmentSum(state, 261936), { sum: 261936, diff: 0 });
  assert.deepEqual(historicalInstallmentSum(state, 261937), { sum: 261936, diff: 1 });
  assert.deepEqual(historicalInstallmentSum(state, null), { sum: 261936, diff: null },
    'ไม่รู้ยอดใบ = ไม่บอกส่วนต่าง (ห้ามเดา)');
  assert.deepEqual(historicalInstallmentSum(filledState({ hasOpening: false }), 261936).sum, 65484,
    'ไม่มีงวดยกมา = ไม่นับยอดของมัน');
});

/* 🔴 **กระจกวันสัญญาที่ลืม `editing`** — แผนฝั่ง server ทำให้ "สัญญาสิ้นสุดไปแล้ว" เป็น **คำเตือน**
   เมื่อ `ctx.editing` (มติข้อ 9 กันเฉพาะใบที่คีย์ใหม่) · กระจกฝั่งจอที่ยังบล็อกอยู่ = ทางตันตัวเดิม
   ย้ายมาอยู่ฝั่งจอแทน: server ยอมรับ PATCH แล้ว แต่ "ถัดไป" ไม่เดินและปุ่มบันทึกเด้งกลับขั้น ① */
test('⭐ สัญญาที่สิ้นสุดไปแล้ว: ใบใหม่ = ด่าน · ใบที่มีอยู่แล้ว = คำเตือน (ตรงกับ ctx.editing ของแผน)', () => {
  const lapsed = { startDate: '2025-01-01', endDate: '2025-12-31' };
  const at = (options) => historicalContractDateIssues({ contract: lapsed }, { todayIso: '2026-09-23', ...options });
  assert.deepEqual(at({}), [
    { field: 'contract.endDate', message: CONTRACT_DATE_MESSAGES.endBeforeToday },
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
  const editing = filledState({ orderId: 'SO-1', status: 'rejected', contract: lapsed });
  const issues = historicalWizardLocalIssues(editing, base);
  assert.equal(issues.some((issue) => issue.field === 'contract.endDate'), false);
  assert.equal(historicalNextBlock(issues, 'contract').blocked, false, 'ปุ่ม "ถัดไป" ต้องเดินได้');
  assert.equal(historicalDuplicateGate({ localIssues: issues }).gated, false, 'ปุ่มบันทึกต้องไม่ติดด่าน');

  /* ใบใหม่ที่สัญญาสิ้นสุดไปแล้วยังต้องติดเหมือนเดิม (มติข้อ 9) */
  const fresh = historicalWizardLocalIssues(filledState({ contract: lapsed }), base);
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
