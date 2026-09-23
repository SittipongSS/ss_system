// ── ปรับแผนงวดหลังอนุมัติ (PR2 · mig 0377 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09 D1/D5) ──────────
// ⭐ ตัวคำนวณ/ด่านของจอกับ route อยู่ไฟล์เดียว (installmentReplan.js) — SQL 0377 เป็นยามชั้นสุดท้ายด้วยนิยามเดียวกัน
//    ⇒ เทสต์ตรึงกติกาที่ปุ่ม · จอ · API ใช้ร่วมกัน: แถวไหนล็อก · ใครเห็นปุ่ม · ยอด/สัดส่วน/เลขงวด/ป้ายของชุดใหม่
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPLANNED_BADGE,
  REPLAN_DONE_MESSAGE,
  buildReplanRows,
  installmentReplanBlocker,
  installmentReplanLock,
  installmentsReplanned,
  monthlyDueDates,
  replanAuditSummary,
  replanDiff,
  replanDraftFrom,
  replanEvenAmounts,
  replanExpected,
  replanPromptFacts,
  replanReasonError,
  REPLAN_STALE_MESSAGE,
  replanEvenPercents,
  replanRequestRows,
  replanStale,
  replanSwitchUnit,
} from './installmentReplan.js';

const ORDER = Object.freeze({
  id: 'SO1', orderNumber: 'SO-26090001-0', origin: 'pipeline', status: 'approved', supersededById: null,
  totalAmount: 234000, actualAmount: 218691.59, financeStatus: 'pending',
  approvedAt: '2026-08-31T18:30:00Z', orderDate: '2026-08-30',
  quotation: { quoteNumber: 'QT-26080011', paymentPlan: { type: 'installment', installments: [
    { label: 'มัดจำ', percent: 30 }, { label: '', percent: 40 }, { label: '', percent: 30 },
  ] } },
});
const row = (over) => ({
  id: 'SOI-x', salesOrderId: 'SO1', seq: 1, label: 'งวดที่ 1', percent: 0, amount: 0, status: 'pending',
  frozenAt: '2026-09-01T03:00:00Z', updatedAt: '2026-09-01T03:00:00.123456+00:00',
  evidence: [], paidOn: null, taxInvoiceNo: null, billingRequestId: null, kind: 'regular',
  dueDate: null, coversFrom: null, coversTo: null, note: null, ...over,
});
/* แผนของ QT 30/40/30 บนใบ 234,000 — งวด 1 รับเงินแล้ว */
const ROWS = Object.freeze([
  row({ id: 'SOI-1', seq: 1, label: 'มัดจำ', percent: 30, amount: 70200, status: 'confirmed', reportedAt: 'x', confirmedAt: 'y' }),
  row({ id: 'SOI-2', seq: 2, label: 'งวดที่ 2', percent: 40, amount: 93600 }),
  row({ id: 'SOI-3', seq: 3, label: 'งวดที่ 3', percent: 30, amount: 70200 }),
]);
const SUP = { id: 'u-sup', role: 'ae_supervisor' };
const cents = (v) => Math.round(Number(v) * 100);

// ── 1. แถวไหนล็อก (นิยามเดียวกับ public._so_installment_replan_locked ของ 0377) ─────────────────────────
test('installmentReplanLock: แถวที่มีเงินหรือมีเอกสารผูก = ล็อกพร้อมเหตุผลไทย', () => {
  assert.equal(installmentReplanLock(row({ status: 'confirmed' })), 'รับเงินแล้ว');
  assert.equal(installmentReplanLock(row({ status: 'reported' })), 'รอบัญชีตรวจ — ผู้แจ้งดึงกลับหรือบัญชีตีกลับก่อน');
  assert.equal(installmentReplanLock(row({ taxInvoiceNo: 'IV-0001' })), 'มีใบกำกับภาษี IV-0001');
  assert.equal(
    installmentReplanLock(row({ billingRequestId: 'RQ-1' }), { requestById: new Map([['RQ-1', { docNo: 'FN-2609003' }]]) }),
    'ผูกคำร้องขอวางบิล FN-2609003 — ถอดคำร้องก่อน (เมนูแถว)',
  );
  assert.equal(installmentReplanLock(row({ billingRequestId: 'RQ-1' })), 'ผูกคำร้องขอวางบิล — ถอดคำร้องก่อน (เมนูแถว)');
  assert.match(installmentReplanLock(row({ kind: 'opening' })), /^งวดยกมา/);
  assert.equal(installmentReplanLock(row({ evidence: [{ storagePath: 'a' }] })), 'มีหลักฐานการจ่ายค้างอยู่');
  assert.equal(installmentReplanLock(row({ paidOn: '2026-09-01' })), 'มีหลักฐานการจ่ายค้างอยู่');
  // ลำดับ: สถานะเงินมาก่อนเอกสาร
  assert.equal(installmentReplanLock(row({ status: 'confirmed', taxInvoiceNo: 'IV-9' })), 'รับเงินแล้ว');
});

test('installmentReplanLock: pending/rejected ที่ไม่มีอะไรผูก = เปิด (rejected คงสถานะให้ SA แจ้งใหม่)', () => {
  assert.equal(installmentReplanLock(row({})), null);
  assert.equal(installmentReplanLock(row({ status: 'rejected', rejectedReason: 'สลิปไม่ชัดเจน อ่านไม่ออก', evidence: [{ storagePath: 'a' }], paidOn: '2026-09-01' })), null);
  assert.equal(installmentReplanLock(row({ taxInvoiceNo: '   ' })), null, 'เลขใบกำกับว่าง (ช่องว่าง) ไม่ใช่ใบกำกับ');
  assert.equal(installmentReplanLock(row({ billingRequestId: '' })), null);
});

// ── 2. ใครเห็นปุ่ม / ปุ่มบอกเหตุ ─────────────────────────────────────────────────────────────────
test('installmentReplanBlocker: ซ่อนปุ่ม — ไม่ใช่ AE Sup/admin · ใบย้อนหลัง · ใบที่ไม่ใช่ approved · ใบยอด 0', () => {
  for (const role of ['ae', 'senior_ae', 'sa', 'ac', 'fn', 'finance', undefined]) {
    assert.equal(installmentReplanBlocker(ORDER, ROWS, { id: 'u', role }).visible, false, `role ${role}`);
  }
  assert.equal(installmentReplanBlocker({ ...ORDER, origin: 'historical' }, ROWS, SUP).visible, false);
  for (const status of ['draft', 'pending_approval', 'rejected', 'approval_revoked', 'revised', 'cancelled']) {
    assert.equal(installmentReplanBlocker({ ...ORDER, status }, ROWS, SUP).visible, false, status);
  }
  assert.equal(installmentReplanBlocker({ ...ORDER, supersededById: 'SO2' }, ROWS, SUP).visible, false);
  assert.equal(installmentReplanBlocker({ ...ORDER, totalAmount: 0 }, [], SUP).visible, false);
  // ซ่อนแล้วยังต้องมีเหตุให้ API ตอบ
  assert.match(installmentReplanBlocker(ORDER, ROWS, { role: 'ae' }).blocker, /AE Sup/);
});

test('installmentReplanBlocker: AE Sup และ admin เห็นปุ่มและกดได้บนใบ pipeline ที่อนุมัติแล้ว', () => {
  assert.deepEqual(installmentReplanBlocker(ORDER, ROWS, SUP), { visible: true, blocker: null });
  assert.deepEqual(installmentReplanBlocker(ORDER, ROWS, { id: 'a', role: 'admin' }), { visible: true, blocker: null });
});

test('installmentReplanBlocker: โชว์ปุ่มแต่บอกเหตุ — บัญชีปิดใบ · ยังไม่มีงวด · ล็อกหมด', () => {
  assert.deepEqual(installmentReplanBlocker({ ...ORDER, financeStatus: 'approved' }, ROWS, SUP),
    { visible: true, blocker: 'บัญชีปิดใบนี้แล้ว — ปรับแผนงวดไม่ได้' });
  assert.deepEqual(installmentReplanBlocker(ORDER, [], SUP),
    { visible: true, blocker: 'ยังไม่มีงวดชำระ — กด ‘เริ่มติดตามการชำระ’ ก่อน' });
  const allLocked = ROWS.map((r) => ({ ...r, status: 'confirmed' }));
  assert.deepEqual(installmentReplanBlocker(ORDER, allLocked, SUP),
    { visible: true, blocker: 'ทุกงวดรับเงินหรือมีเอกสารผูกแล้ว — ไม่มีงวดที่ปรับได้' });
});

// ── 3. ชุดใหม่ทั้งใบ ────────────────────────────────────────────────────────────────────────────
test('buildReplanRows: ใบ 234,000 รับแล้ว 1 งวด แบ่งที่เหลือ 3 งวด — Σ ตรงถึงสตางค์ · สัดส่วนแถวเปิดสุดท้ายรับเศษ', () => {
  const draft = [
    { id: 'SOI-2', label: 'งวดที่ 2', amount: 54600 },
    { id: 'SOI-3', label: 'งวดที่ 3', amount: 54600 },
    { id: null, label: '', amount: 54600 },
  ];
  const out = buildReplanRows(ORDER, ROWS, draft, { unit: 'amount' });
  assert.equal(out.error, null);
  assert.deepEqual(out.rows.map((r) => [r.id, r.seq, r.label, r.amount, r.percent]), [
    ['SOI-1', 1, 'มัดจำ', 70200, 30],
    ['SOI-2', 2, 'งวดที่ 2', 54600, 23.33],
    ['SOI-3', 3, 'งวดที่ 3', 54600, 23.33],
    [null, 4, 'งวดที่ 4', 54600, 23.34],
  ]);
  assert.equal(out.rows.reduce((s, r) => s + cents(r.amount), 0), cents(234000));
  assert.equal(Math.round(out.rows.reduce((s, r) => s + r.percent, 0) * 100) / 100, 100);
  assert.deepEqual(out.totals, { total: 234000, locked: 70200, sum: 234000, remaining: 0, percentSum: 100 });
});

test('buildReplanRows: โหมด % — ยอดคิดจากสัดส่วนของยอดใบ แถวเปิดสุดท้ายรับเศษยอด (กติกาเดียวกับ paymentPlan)', () => {
  const order = { ...ORDER, totalAmount: 100000.01 };
  const rows = [row({ id: 'A', seq: 1, percent: 100, amount: 100000.01 })];
  const out = buildReplanRows(order, rows, [
    { id: 'A', label: 'งวดที่ 1', percent: 33.33 }, { id: null, percent: 33.33 }, { id: null, percent: 33.34 },
  ], { unit: 'percent' });
  assert.equal(out.error, null);
  assert.deepEqual(out.rows.map((r) => r.amount), [33330, 33330, 33340.01]);
  assert.equal(out.rows.reduce((s, r) => s + cents(r.amount), 0), cents(100000.01));
  assert.match(buildReplanRows(order, rows, [{ id: 'A', percent: 50 }, { id: null, percent: 40 }], { unit: 'percent' }).error,
    /สัดส่วนรวมต้องเท่ากับ 100% \(ตอนนี้ 90\.00%\)/);
});

test('buildReplanRows: ยอดต่างไป 0.01 · เกิน 12 งวด · ยอด 0 หรือติดลบ = error (ไม่ปัดให้เงียบ ๆ)', () => {
  const short = buildReplanRows(ORDER, ROWS, [
    { id: 'SOI-2', amount: 93600 }, { id: 'SOI-3', amount: 70199.99 },
  ]);
  assert.match(short.error, /ยอดรวมทุกงวด ฿233,999\.99 ไม่เท่ายอดใบ ฿234,000\.00 \(รวม VAT\) — ขาด ฿0\.01/);
  assert.match(buildReplanRows(ORDER, ROWS, [{ id: 'SOI-2', amount: 93600 }, { id: 'SOI-3', amount: 70200.01 }]).error, /เกิน ฿0\.01/);

  const many = Array.from({ length: 12 }, () => ({ id: null, amount: 1 }));
  assert.match(buildReplanRows(ORDER, ROWS, many).error, /ไม่เกิน 12 งวด/);

  assert.match(buildReplanRows(ORDER, ROWS, [{ id: 'SOI-2', amount: 163800 }, { id: 'SOI-3', amount: 0 }]).error,
    /ยอดงวดที่ 3 ต้องมากกว่า 0/);
  assert.match(buildReplanRows(ORDER, ROWS, [{ id: 'SOI-2', amount: 163900 }, { id: 'SOI-3', amount: -100 }]).error,
    /ยอดงวดที่ 3 ต้องมากกว่า 0/);
  assert.match(buildReplanRows(ORDER, ROWS, [{ id: 'SOI-2', amount: 93600.005 }, { id: 'SOI-3', amount: 70199.995 }]).error,
    /ทศนิยมเกิน 2 ตำแหน่ง/);
});

test('buildReplanRows: แถวล็อกคงเลขงวดเดิม · แถวเปิดเติมเลขที่ว่างน้อยสุดตามลำดับในตัวแก้ · ป้าย "งวดที่ N" เดินตามเลข', () => {
  const rows = [
    row({ id: 'O1', seq: 1, label: 'มัดจำ', percent: 30, amount: 70200 }),
    row({ id: 'L2', seq: 2, label: 'งวดที่ 2', percent: 40, amount: 93600, status: 'reported', reportedAt: 'x' }),
    row({ id: 'O3', seq: 3, label: 'งวดที่ 3', percent: 30, amount: 70200 }),
  ];
  const out = buildReplanRows(ORDER, rows, [
    { id: 'O3', label: 'งวดที่ 3', amount: 50000 },
    { id: null, label: '  ', amount: 40400 },
    { id: 'O1', label: 'มัดจำ', amount: 50000 },
  ]);
  assert.equal(out.error, null);
  assert.deepEqual(out.rows.map((r) => [r.id, r.seq, r.label]), [
    ['O3', 1, 'งวดที่ 1'],
    ['L2', 2, 'งวดที่ 2'],
    [null, 3, 'งวดที่ 3'],
    ['O1', 4, 'มัดจำ'],
  ]);
  // แถวล็อกออกมาเหมือนในฐานทุกช่องที่ SQL เทียบ
  const locked = out.rows.find((r) => r.id === 'L2');
  assert.deepEqual(locked, { id: 'L2', seq: 2, label: 'งวดที่ 2', percent: 40, amount: 93600, dueDate: null, coversFrom: null, coversTo: null, note: null });
  // มุมมองของจอบอกเหตุของแถวล็อก และชี้กลับไปแถวร่าง
  assert.equal(out.view.find((r) => r.id === 'L2').lock, 'รอบัญชีตรวจ — ผู้แจ้งดึงกลับหรือบัญชีตีกลับก่อน');
  assert.deepEqual(out.view.map((r) => r.draftIndex), [0, null, 1, 2]);
});

test('buildReplanRows: แก้แถวล็อก/ส่ง id ที่ไม่ใช่งวดของใบ = error · ลบแถวเปิดได้', () => {
  assert.match(buildReplanRows(ORDER, ROWS, [{ id: 'SOI-1', amount: 70200 }, { id: 'SOI-2', amount: 93600 }, { id: 'SOI-3', amount: 70200 }]).error,
    /งวดที่ 1 ล็อกอยู่ \(รับเงินแล้ว\)/);
  assert.match(buildReplanRows(ORDER, ROWS, [{ id: 'SOI-99', amount: 163800 }]).error, /ไม่ใช่งวดของใบนี้/);
  const merged = buildReplanRows(ORDER, ROWS, [{ id: 'SOI-2', label: 'ส่วนที่เหลือ', amount: 163800 }]);
  assert.equal(merged.error, null);
  assert.deepEqual(merged.rows.map((r) => [r.id, r.seq, r.label, r.amount]), [['SOI-1', 1, 'มัดจำ', 70200], ['SOI-2', 2, 'ส่วนที่เหลือ', 163800]]);
});

test('buildReplanRows: ใบบริการบังคับวันครบกำหนดทุกงวดที่ปรับ · ช่วงครอบซ้อน/เว้นเป็นแค่คำเตือน', () => {
  const draft = [{ id: 'SOI-2', amount: 93600, dueDate: '2026-10-31' }, { id: 'SOI-3', amount: 70200 }];
  assert.match(buildReplanRows(ORDER, ROWS, draft, { serviceRounds: true }).error, /ใบบริการต้องมีวันครบกำหนดทุกงวดที่ปรับ \(งวดที่ 3\)/);
  assert.equal(buildReplanRows(ORDER, ROWS, draft, { serviceRounds: false }).error, null);
  const ok = buildReplanRows(ORDER, ROWS, [
    { id: 'SOI-2', amount: 93600, dueDate: '2026-10-31', coversFrom: '2026-01-01', coversTo: '2026-06-30' },
    { id: 'SOI-3', amount: 70200, dueDate: '2026-11-30', coversFrom: '2026-06-01', coversTo: '2026-12-31' },
  ], { serviceRounds: true });
  assert.equal(ok.error, null);
  assert.ok(ok.warnings.some((w) => /ซ้อน/.test(w)), 'ช่วงครอบซ้อน = คำเตือน ไม่บล็อก');
  assert.match(buildReplanRows(ORDER, ROWS, [
    { id: 'SOI-2', amount: 93600, coversFrom: '2026-07-01', coversTo: '2026-06-30' }, { id: 'SOI-3', amount: 70200 },
  ]).error, /วันเริ่มช่วงครอบต้องไม่เกินวันสิ้นสุด/);
});

test('buildReplanRows: ผลลัพธ์เป็นรูปของ RPC ล้วน — ไม่มีคีย์ยอดใบ/Actual/วันอนุมัติ และไม่ส่ง frozenAt', () => {
  const out = buildReplanRows(ORDER, ROWS, [{ id: 'SOI-2', amount: 93600 }, { id: 'SOI-3', amount: 70200, note: '  ' }]);
  for (const r of out.rows) {
    assert.deepEqual(Object.keys(r), ['id', 'seq', 'label', 'percent', 'amount', 'dueDate', 'coversFrom', 'coversTo', 'note']);
    for (const key of ['totalAmount', 'actualAmount', 'approvedAt', 'frozenAt', 'status']) assert.ok(!(key in r), key);
  }
  assert.equal(out.rows[2].note, null, 'หมายเหตุว่าง = null');
});

test('buildReplanRows: แผนที่ไม่เปลี่ยนอะไร = บอกว่ายังไม่มีอะไรให้บันทึก', () => {
  const out = buildReplanRows(ORDER, ROWS, replanDraftFrom(ROWS));
  assert.match(out.error, /แผนยังไม่เปลี่ยน/);
});

test('replanDraftFrom / replanExpected / replanEvenAmounts / monthlyDueDates', () => {
  assert.deepEqual(replanDraftFrom(ROWS).map((d) => d.id), ['SOI-2', 'SOI-3'], 'ร่างมีเฉพาะแถวเปิด');
  assert.deepEqual(replanDraftFrom(ROWS)[0], { id: 'SOI-2', label: 'งวดที่ 2', amount: 93600, percent: 40, dueDate: '', coversFrom: '', coversTo: '', note: '' });
  assert.deepEqual(replanExpected(ROWS), ROWS.map((r) => ({ id: r.id, updatedAt: r.updatedAt })));
  assert.deepEqual(replanEvenAmounts(100000, 3), [33333.33, 33333.33, 33333.34]);
  assert.deepEqual(replanEvenAmounts(163800, 3), [54600, 54600, 54600]);
  assert.deepEqual(monthlyDueDates('2026-01-31', 4), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(monthlyDueDates('2027-11-15', 3), ['2027-11-15', '2027-12-15', '2028-01-15']);
  assert.deepEqual(monthlyDueDates('', 3), []);
});

// ── 4. ก่อน/หลัง · ผลลัพธ์ · audit ──────────────────────────────────────────────────────────────
test('replanDiff: แก้ยอด · ย้ายเลข · เพิ่ม · ลบ (แถวที่ไม่เปลี่ยนไม่ขึ้น)', () => {
  const after = buildReplanRows(ORDER, ROWS, [
    { id: 'SOI-3', amount: 93600, dueDate: '2026-10-31' }, { id: null, amount: 70200 },
  ]).rows;
  const diff = replanDiff(ROWS, after);
  assert.deepEqual(diff.map((d) => [d.kind, d.before?.id ?? null, d.after?.seq ?? null]), [
    ['removed', 'SOI-2', null],
    ['changed', 'SOI-3', 2],
    ['added', null, 3],
  ]);
  assert.deepEqual(replanPromptFacts(ORDER, ROWS, after).changes, [
    'ลบ งวดที่ 2 ฿93,600.00 (ยังไม่มีการชำระ)',
    'งวดที่ 3 → งวดที่ 2: ฿70,200.00 (30.00%) → ฿93,600.00 (40.00%) · ครบกำหนด 31/10/2026',
    'เพิ่ม งวดที่ 3 ฿70,200.00',
  ]);
});

test('replanPromptFacts: บรรทัดรายงวด · งวดล็อก · Actual ของเดือนอนุมัติเวลาไทย · QT ของฉบับพิมพ์', () => {
  const after = buildReplanRows(ORDER, ROWS, [
    { id: 'SOI-2', amount: 50000, dueDate: '2026-10-31' }, { id: 'SOI-3', amount: 50000 }, { id: null, amount: 63800 },
  ]).rows;
  const facts = replanPromptFacts(ORDER, ROWS, after);
  assert.equal(facts.orderNumber, 'SO-26090001-0');
  assert.equal(facts.beforeCount, 3);
  assert.equal(facts.afterCount, 4);
  assert.deepEqual(facts.changes, [
    'งวดที่ 2: ฿93,600.00 (40.00%) → ฿50,000.00 (21.37%) · ครบกำหนด 31/10/2026',
    'งวดที่ 3: ฿70,200.00 (30.00%) → ฿50,000.00 (21.37%)',
    'เพิ่ม งวดที่ 4 ฿63,800.00',
  ]);
  assert.equal(facts.lockedCount, 1);
  assert.equal(facts.lockedAmountLabel, '฿70,200.00');
  assert.equal(facts.totalLabel, '฿234,000.00');
  assert.equal(facts.actualAmountLabel, '฿218,691.59');
  // 2026-08-31T18:30Z = 01:30 ของ 1 ก.ย. เวลาไทย ⇒ Actual อยู่เดือน ก.ย.
  assert.equal(facts.actualMonthLabel, 'ก.ย. 2026');
  assert.equal(facts.quotationNumber, 'QT-26080011');
  assert.equal(facts.complete, false);
  assert.equal(facts.contractNumber, null);
  assert.equal(replanPromptFacts({ ...ORDER, serviceContractId: 'CT1', serviceContract: { contractNo: 'CT-2609001' } }, ROWS, after).contractNumber, 'CT-2609001');
});

test('replanPromptFacts: ลบงวด = บอกยอดและว่ายังไม่มีการชำระ · ทุกงวดรับเงินครบ = complete', () => {
  const rows = [
    row({ id: 'C1', seq: 1, percent: 60, amount: 140400, status: 'confirmed', reportedAt: 'x', confirmedAt: 'y' }),
    row({ id: 'C2', seq: 2, percent: 40, amount: 93600, status: 'confirmed', reportedAt: 'x', confirmedAt: 'y' }),
    row({ id: 'Z3', seq: 3, label: 'แถม', percent: 0, amount: 0 }),
  ];
  const out = buildReplanRows(ORDER, rows, []);
  assert.equal(out.error, null);
  const facts = replanPromptFacts(ORDER, rows, out.rows);
  assert.deepEqual(facts.changes, ['ลบ งวดที่ 3 ฿0.00 (ยังไม่มีการชำระ)']);
  assert.equal(facts.complete, true);
});

test('replanReasonError · replanAuditSummary · ข้อความคงที่', () => {
  assert.match(replanReasonError('สั้นไป'), /อย่างน้อย 10 ตัวอักษร/);
  assert.match(replanReasonError('ก'.repeat(501)), /ไม่เกิน 500 ตัวอักษร/);
  assert.equal(replanReasonError('ลูกค้าขอแบ่งจ่ายสามงวด'), null);
  assert.equal(
    replanAuditSummary({ orderNumber: 'SO-26090001-0', beforeCount: 3, afterCount: 4, reason: 'ลูกค้าขอแบ่งจ่ายสามงวด' }),
    'ปรับแผนงวด SO-26090001-0: 3→4 งวด (Actual ไม่เปลี่ยน): ลูกค้าขอแบ่งจ่ายสามงวด',
  );
  assert.equal(REPLAN_DONE_MESSAGE, 'ปรับแผนงวดแล้ว — ยอด Actual ไม่เปลี่ยน');
  assert.equal(REPLANNED_BADGE, 'ปรับแผนหลังอนุมัติ');
});

// ── 5. ป้าย "ปรับแผนหลังอนุมัติ" (D5) — เทียบงวดจริงกับแผนของ QT ไม่เก็บข้อมูลเพิ่ม ───────────────────
test('installmentsReplanned: ตรงแผน QT = ไม่ขึ้นป้าย · จำนวน/ยอด/ป้ายต่าง = ขึ้นป้าย', () => {
  const plan = ORDER.quotation.paymentPlan;
  const asPlanned = [
    row({ seq: 1, label: 'มัดจำ', amount: 70200 }), row({ seq: 2, label: 'งวดที่ 2', amount: 93600 }), row({ seq: 3, label: 'งวดที่ 3', amount: 70200 }),
  ];
  assert.equal(installmentsReplanned(asPlanned, plan, 234000), false);
  assert.equal(installmentsReplanned([], plan, 234000), false);
  assert.equal(installmentsReplanned(asPlanned.slice(0, 2), plan, 234000), true);
  assert.equal(installmentsReplanned(asPlanned.map((r, i) => (i === 2 ? { ...r, amount: 70200.5 } : r)), plan, 234000), true);
  assert.equal(installmentsReplanned(asPlanned.map((r, i) => (i === 1 ? { ...r, label: 'หลังส่งมอบ' } : r)), plan, 234000), true);
});

// ── 6. ทางเดินของคำขอ: จอ → API → RPC ────────────────────────────────────────────────────────────
test('replanRequestRows: จอส่งแถวเปิดเป็นบาท — route สร้างชุดเดียวกันซ้ำได้ (ทั้งโหมดบาทและ %)', () => {
  const pct = buildReplanRows({ ...ORDER, totalAmount: 100000.01 }, [row({ id: 'A', seq: 1, percent: 100, amount: 100000.01 })], [
    { id: 'A', label: 'งวดที่ 1', percent: 33.33 }, { id: null, percent: 33.33 }, { id: null, label: 'ปิดงาน', percent: 33.34, dueDate: '2026-12-31' },
  ], { unit: 'percent' });
  const body = replanRequestRows(pct);
  assert.deepEqual(body.map((r) => Object.keys(r)), body.map(() => ['id', 'label', 'amount', 'dueDate', 'coversFrom', 'coversTo', 'note']));
  assert.deepEqual(body.map((r) => r.amount), [33330, 33330, 33340.01]);
  const again = buildReplanRows({ ...ORDER, totalAmount: 100000.01 }, [row({ id: 'A', seq: 1, percent: 100, amount: 100000.01 })], body, { unit: 'amount' });
  assert.equal(again.error, null);
  assert.deepEqual(again.rows, pct.rows, 'ชุดที่ route สร้างซ้ำต้องตรงกับที่จอพรีวิว');
  // แถวล็อกไม่อยู่ในคำขอ
  const locked = buildReplanRows(ORDER, ROWS, [{ id: 'SOI-2', amount: 100000 }, { id: 'SOI-3', amount: 63800 }]);
  assert.deepEqual(replanRequestRows(locked).map((r) => r.id), ['SOI-2', 'SOI-3']);
});

test('replanStale: แถวเพิ่ม/หาย/ถูกแก้จากอีกหน้าต่าง = เก่า · รูปเวลาต่างแต่เวลาเดียวกัน = ไม่เก่า', () => {
  const expected = replanExpected(ROWS);
  assert.equal(replanStale(ROWS, expected), false);
  assert.equal(replanStale(ROWS, expected.map((e) => ({ ...e, updatedAt: '2026-09-01T03:00:00.123456Z' }))), false);
  assert.equal(replanStale(ROWS, expected.slice(1)), true);
  assert.equal(replanStale([...ROWS, row({ id: 'SOI-4', seq: 4 })], expected), true);
  assert.equal(replanStale(ROWS.map((r, i) => (i === 2 ? { ...r, updatedAt: '2026-09-02T00:00:00Z' } : r)), expected), true);
  assert.equal(replanStale(ROWS, null), true);
  assert.match(REPLAN_STALE_MESSAGE, /โหลด/);
});

test('replanSwitchUnit · replanEvenPercents: สลับบาท↔% คงยอดที่เห็น · เกลี่ย % ที่เหลือเท่ากัน', () => {
  const draft = [{ id: 'SOI-2', amount: 54600 }, { id: 'SOI-3', amount: 54600 }, { id: null, amount: 54600 }];
  const out = buildReplanRows(ORDER, ROWS, draft);
  const switched = replanSwitchUnit(draft, out.view);
  assert.deepEqual(switched.map((d) => [d.amount, d.percent]), [[54600, 23.33], [54600, 23.33], [54600, 23.34]]);
  assert.equal(buildReplanRows(ORDER, ROWS, switched, { unit: 'percent' }).error, null);
  assert.deepEqual(replanEvenPercents(70, 3), [23.33, 23.33, 23.34]);
  assert.deepEqual(replanEvenPercents(100, 4), [25, 25, 25, 25]);
  assert.deepEqual(replanEvenPercents(70, 0), []);
});
