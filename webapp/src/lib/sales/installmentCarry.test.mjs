// ── ยกเงินค้างจากใบที่ยกเลิกเข้าใบใหม่ของดีลเดียวกัน (PR3 · mig 0378 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09 D4) ──
// ⭐ ตัวคำนวณ/ด่านของจอกับ route อยู่ไฟล์เดียว (installmentCarry.js) — RPC 0378 + แกน 0377 เป็นยามชั้นสุดท้าย
//    ⇒ เทสต์ตรึงกติกาที่ปุ่ม · โมดัล · API ใช้ร่วมกัน: ใครเห็นปุ่ม · ใบไหนเป็นต้นทางได้ · แผนหลังยก (หักงวดแรก ๆ ก่อน)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CARRY_BUTTON,
  CARRY_DONE_MESSAGE,
  CARRY_FORBIDDEN,
  CARRY_STALE_MESSAGE,
  INSTALLMENT_CARRY_SCHEMA_MISSING,
  applyCarryIn,
  canCarryInstallments,
  carriedAwayGroups,
  carriedFromOf,
  carryAuditSummary,
  carryBlocker,
  carryExpected,
  carryPromptFacts,
  carrySourceError,
  carrySourcesFrom,
  carryStale,
} from './installmentCarry.js';

const TARGET = Object.freeze({
  id: 'SOR-N', orderNumber: 'SO-26090002-0', origin: 'pipeline', status: 'approved', supersededById: null,
  dealId: 'DEAL-1', totalAmount: 100000, actualAmount: 93457.94, financeStatus: 'pending',
  approvedAt: '2026-08-31T18:30:00Z', orderDate: '2026-08-30', quotation: { quoteNumber: 'QT-26090002' },
});
const SOURCE = Object.freeze({
  id: 'SOR-C', orderNumber: 'SO-26080039-0', origin: 'pipeline', status: 'cancelled', dealId: 'DEAL-1',
  quotationId: 'QT-C', totalAmount: 80000,
});
const row = (over) => ({
  id: 'SOI-x', salesOrderId: TARGET.id, seq: 1, label: 'งวดที่ 1', percent: 0, amount: 0, status: 'pending',
  frozenAt: '2026-09-01T03:00:00Z', updatedAt: '2026-09-01T03:00:00.123456+00:00',
  evidence: [], paidOn: null, taxInvoiceNo: null, billingRequestId: null, kind: 'regular', movedFrom: [],
  dueDate: null, coversFrom: null, coversTo: null, note: null, ...over,
});
/* ใบใหม่ 100,000 แผน 30/70 ยังไม่มีเงิน */
const T1 = row({ id: 'T1', seq: 1, label: 'งวดที่ 1', percent: 30, amount: 30000, dueDate: '2026-10-01' });
const T2 = row({ id: 'T2', seq: 2, label: 'ก่อนส่งมอบ', percent: 70, amount: 70000, dueDate: '2026-11-01', note: 'ส่งของ' });
/* ใบที่ยกเลิก: มัดจำรับแล้ว 20,000 (มีใบกำกับ) + งวด 2 รอบัญชีตรวจ 10,000 */
const S1 = row({
  id: 'S1', salesOrderId: SOURCE.id, seq: 1, label: 'มัดจำ', percent: 25, amount: 20000, status: 'confirmed',
  paidOn: '2026-08-20', evidence: [{ fileName: 'slip.jpg' }], taxInvoiceNo: 'IV-7', confirmedAt: 'x', reportedAt: 'y',
  coversFrom: '2026-09-01', coversTo: '2026-12-31', updatedAt: '2026-09-02T03:00:00.5+00:00',
});
const S2 = row({
  id: 'S2', salesOrderId: SOURCE.id, seq: 2, label: 'งวดที่ 2', percent: 12.5, amount: 10000, status: 'reported',
  paidOn: '2026-08-25', evidence: [{ fileName: 'slip2.jpg' }], reportedAt: 'y',
});
const SUP = { id: 'u-sup', role: 'ae_supervisor' };
const FN = { id: 'u-fn', role: 'finance', department: 'FN' };
const AE = { id: 'u-ae', role: 'ae' };
const brief = (rows) => rows.map((r) => [r.id, r.seq, r.label, r.amount, r.percent]);

// ── 1. ใครกดได้ · ปุ่มโผล่เมื่อไร ──────────────────────────────────────────────────────────────────
test('canCarryInstallments: AE Sup · แอดมิน · ฝ่ายบัญชี (ฝ่าย FN) — ฝ่ายขายทั่วไปไม่ได้', () => {
  assert.equal(canCarryInstallments(SUP), true);
  assert.equal(canCarryInstallments({ id: 'a', role: 'admin' }), true);
  assert.equal(canCarryInstallments(FN), true);
  assert.equal(canCarryInstallments(AE), false);
  assert.equal(canCarryInstallments({ id: 'f', role: 'finance', department: 'SA' }), false, 'ถือ cap แต่ไม่ใช่ฝ่าย FN');
  assert.equal(canCarryInstallments(null), false);
  assert.equal(CARRY_BUTTON, 'ยกเงินจากใบที่ยกเลิก');
});

test('carryBlocker: ไม่มีสิทธิ์/ใบย้อนหลัง/ดีลไม่มีเงินค้าง/ใบยกเลิก-ถูกแทน = ซ่อน · ยังไม่อนุมัติ/บัญชีปิด/ยังไม่มีงวด = โชว์แล้วบอกเหตุ', () => {
  const sources = carrySourcesFrom([SOURCE], [S1, S2]);
  assert.deepEqual(carryBlocker(TARGET, [T1, T2], SUP, sources), { visible: true, blocker: null });
  assert.deepEqual(carryBlocker(TARGET, [T1, T2], FN, sources), { visible: true, blocker: null });
  assert.deepEqual(carryBlocker(TARGET, [T1, T2], AE, sources), { visible: false, blocker: CARRY_FORBIDDEN });
  assert.equal(carryBlocker(TARGET, [T1, T2], SUP, []).visible, false, 'ดีลไม่มีเงินค้าง = ไม่มีปุ่ม (ไม่ใช่เสียงรบกวนทุกใบ)');
  assert.equal(carryBlocker({ ...TARGET, origin: 'historical' }, [T1], SUP, sources).visible, false);
  for (const status of ['cancelled', 'revised']) {
    assert.equal(carryBlocker({ ...TARGET, status }, [T1], SUP, sources).visible, false, status);
  }
  for (const status of ['draft', 'pending_approval', 'approval_revoked', 'rejected']) {
    assert.deepEqual(carryBlocker({ ...TARGET, status }, [T1], SUP, sources),
      { visible: true, blocker: 'ใบนี้ยังไม่อนุมัติ — ยกเงินเข้าได้หลัง AE Sup อนุมัติใบ' }, status);
  }
  assert.deepEqual(carryBlocker({ ...TARGET, financeStatus: 'approved' }, [T1], SUP, sources),
    { visible: true, blocker: 'บัญชีปิดใบนี้แล้ว — ยกเงินเข้าไม่ได้' });
  assert.deepEqual(carryBlocker(TARGET, [], SUP, sources),
    { visible: true, blocker: 'ยังไม่มีงวดชำระ — กด ‘เริ่มติดตามการชำระ’ ก่อน' });
  assert.deepEqual(carryBlocker({ ...TARGET, totalAmount: 0 }, [T1], SUP, sources),
    { visible: true, blocker: 'ใบนี้ยอดรวม 0 บาท — รับเงินที่ยกมาไม่ได้' });
});

// ── 2. ใบไหนเป็นต้นทางได้ (D4: ดีลเดียวกัน · ใบ pipeline ที่ยกเลิก) ─────────────────────────────────────
test('carrySourcesFrom: ใบ pipeline ที่ยกเลิก ยอด > 0 ที่มีเงินค้าง (confirmed/reported ยังไม่คืน) — เรียงตามเลขงวด', () => {
  const refunded = row({ id: 'S3', salesOrderId: SOURCE.id, seq: 3, status: 'confirmed', amount: 5000, refundedAt: 'z' });
  const voided = row({ id: 'S4', salesOrderId: SOURCE.id, seq: 4, status: 'pending', amount: 5000 });
  const sources = carrySourcesFrom([SOURCE], [S2, voided, refunded, S1]);
  assert.equal(sources.length, 1);
  assert.deepEqual(sources[0].rows.map((r) => r.id), ['S1', 'S2']);
  assert.equal(sources[0].amount, 30000);
  assert.equal(sources[0].confirmedAmount, 20000);
  assert.equal(sources[0].reportedAmount, 10000);
  assert.equal(sources[0].count, 2);
  assert.equal(sources[0].orderNumber, 'SO-26080039-0');
  // ใบที่ไม่เข้าเกณฑ์ไม่เป็นต้นทาง
  assert.deepEqual(carrySourcesFrom([{ ...SOURCE, origin: 'historical' }], [S1]), []);
  assert.deepEqual(carrySourcesFrom([{ ...SOURCE, status: 'approved' }], [S1]), []);
  assert.deepEqual(carrySourcesFrom([{ ...SOURCE, totalAmount: 0 }], [S1]), []);
  assert.deepEqual(carrySourcesFrom([SOURCE], [voided, refunded]), [], 'ไม่มีเงินค้าง = ไม่ใช่ต้นทาง');
  assert.deepEqual(carrySourcesFrom(null, null), []);
});

test('carrySourceError (route): ต้นทางต้องเป็นใบ pipeline ที่ยกเลิกของดีลเดียวกัน', () => {
  assert.equal(carrySourceError(TARGET, SOURCE), null);
  assert.match(carrySourceError(TARGET, null), /ไม่พบใบที่ยกเลิก/);
  assert.match(carrySourceError(TARGET, { ...SOURCE, id: TARGET.id }), /ใบเดิม/);
  assert.match(carrySourceError(TARGET, { ...SOURCE, status: 'approved' }), /เฉพาะจากใบสั่งขายที่ยกเลิกแล้ว/);
  assert.match(carrySourceError(TARGET, { ...SOURCE, origin: 'historical' }), /เฉพาะจากใบสั่งขายที่ยกเลิกแล้ว/);
  assert.equal(carrySourceError(TARGET, { ...SOURCE, dealId: 'DEAL-2' }), 'ยกเงินได้เฉพาะใบของดีลเดียวกัน');
  assert.equal(carrySourceError(TARGET, { ...SOURCE, dealId: null }), 'ยกเงินได้เฉพาะใบของดีลเดียวกัน');
});

// ── 3. แผนหลังยก: หักงวดเปิดแรก ๆ ก่อน · แถวที่ยกมาก่อน · เลขงวดเติมที่ว่าง · Σ = ยอดใบ ─────────────────────────
test('applyCarryIn: ยกมัดจำ 20,000 เข้าใบ 30/70 — หักงวดเปิดแรก (30,000 → 10,000) · แถวที่ยกเป็นงวด 1 · Σ% = 100', () => {
  const built = applyCarryIn(TARGET, [T1, T2], [S1]);
  assert.equal(built.error, null);
  assert.deepEqual(brief(built.rows), [
    ['S1', 1, 'มัดจำ', 20000, 20],
    ['T1', 2, 'งวดที่ 2', 10000, 10],
    ['T2', 3, 'ก่อนส่งมอบ', 70000, 70],
  ]);
  // แถวที่ยก: ยอด/วัน/ช่วงครอบ/หมายเหตุเท่าในฐาน (แกน 0377 เทียบทีละช่อง) · แถวเปิดคงวัน/หมายเหตุเดิม
  assert.deepEqual(built.rows[0], {
    id: 'S1', seq: 1, label: 'มัดจำ', percent: 20, amount: 20000, dueDate: null,
    coversFrom: '2026-09-01', coversTo: '2026-12-31', note: null,
    // กำหนดวางบิล (mig 0389) — พกไปให้แถวครบรูป · RPC 0377/0378 ไม่อ่านสองคีย์นี้ (แถวเดิมคงวันวางบิลเอง)
    billingDate: null, billingEvent: null,
  });
  assert.equal(built.rows[1].dueDate, '2026-10-01');
  assert.equal(built.rows[2].note, 'ส่งของ');
  assert.deepEqual(built.totals, { total: 100000, carried: 20000, locked: 0, sum: 100000, percentSum: 100 });
  // ผลลัพธ์เป็นแถวงวดล้วน — ไม่มีอะไรแตะตัวใบ/ยอด Actual
  for (const r of built.rows) {
    assert.deepEqual(Object.keys(r).sort(), ['amount', 'billingDate', 'billingEvent', 'coversFrom', 'coversTo', 'dueDate', 'id',
      'label', 'note', 'percent', 'seq']);
  }
  // view: บอกว่าแถวไหนยกมา · แถวไหนถูกหัก/ลบ
  const view = new Map(built.view.map((v) => [v.id, v]));
  assert.equal(view.get('S1').carried, true);
  assert.equal(view.get('T1').beforeAmount, 30000);
  assert.equal(view.get('T1').beforeSeq, 1);
  assert.deepEqual(built.removed, []);
});

test('applyCarryIn: ยกครบสองงวด 30,000 — งวดเปิดแรกถูกหักจนหมด (ลบ) · ป้าย "งวดที่ N" ของแถวที่ยกเดินตามเลขใหม่', () => {
  const built = applyCarryIn(TARGET, [T1, T2], [S2, S1]);
  assert.equal(built.error, null);
  assert.deepEqual(brief(built.rows), [
    ['S1', 1, 'มัดจำ', 20000, 20],
    ['S2', 2, 'งวดที่ 2', 10000, 10],
    ['T2', 3, 'ก่อนส่งมอบ', 70000, 70],
  ]);
  assert.deepEqual(built.removed.map((r) => r.id), ['T1']);
});

test('applyCarryIn: ใบใหม่มีงวดล็อกอยู่แล้ว — เลขงวดของแถวล็อกคงเดิม · แถวที่ยกเติมเลขว่าง · สัดส่วนงวดล็อกไม่ถูกแตะ', () => {
  const L1 = row({ id: 'L1', seq: 1, label: 'มัดจำ', percent: 30, amount: 30000, status: 'confirmed' });
  const O2 = row({ id: 'O2', seq: 2, label: 'งวดที่ 2', percent: 70, amount: 70000 });
  const built = applyCarryIn(TARGET, [L1, O2], [S1]);
  assert.equal(built.error, null);
  assert.deepEqual(brief(built.rows), [
    ['L1', 1, 'มัดจำ', 30000, 30],
    ['S1', 2, 'มัดจำ', 20000, 20],
    ['O2', 3, 'งวดที่ 3', 50000, 50],
  ]);
  /* 🪤 แถวล็อกต้องออกมา "เท่าในฐานทุกช่อง" — แกน 0377 เทียบป้ายแบบดิบ (IS NOT DISTINCT FROM) ⇒ ตัดช่องว่างท้ายป้าย
     ของแถวล็อกเมื่อไร RPC ตอบ locked_changed ทั้งที่ไม่มีใครแก้อะไร (CHECK 0245 ยอมป้ายที่มีช่องว่างท้าย) */
  const spaced = applyCarryIn(TARGET, [{ ...L1, label: 'มัดจำ ' }, O2], [S1]);
  assert.equal(spaced.rows.find((r) => r.id === 'L1').label, 'มัดจำ ');
  // ยกพอดีที่เหลือ — ไม่มีงวดเปิดเหลือ ⇒ แถวที่ยกสุดท้ายรับเศษสัดส่วน
  const exact = applyCarryIn({ ...TARGET, totalAmount: 90000 }, [
    row({ id: 'L1', seq: 1, label: 'มัดจำ', percent: 66.67, amount: 60000, status: 'confirmed' }),
    row({ id: 'O2', seq: 2, label: 'งวดที่ 2', percent: 33.33, amount: 30000 }),
  ], [S1, S2]);
  assert.equal(exact.error, null);
  assert.deepEqual(brief(exact.rows), [
    ['L1', 1, 'มัดจำ', 60000, 66.67],
    ['S1', 2, 'มัดจำ', 20000, 22.22],
    ['S2', 3, 'งวดที่ 3', 10000, 11.11],
  ]);
  assert.equal(exact.totals.percentSum, 100);
});

test('applyCarryIn: สัดส่วนปัดสองตำแหน่ง — แถวเปิดสุดท้ายรับเศษให้ Σ = 100 พอดี', () => {
  const total = 90000;
  const built = applyCarryIn({ ...TARGET, totalAmount: total }, [
    row({ id: 'A', seq: 1, label: 'งวดที่ 1', percent: 50, amount: 45000 }),
    row({ id: 'B', seq: 2, label: 'งวดที่ 2', percent: 50, amount: 45000 }),
  ], [row({ ...S1, amount: 30000 })]);
  assert.equal(built.error, null);
  assert.deepEqual(brief(built.rows), [
    ['S1', 1, 'มัดจำ', 30000, 33.33],
    ['A', 2, 'งวดที่ 2', 15000, 16.67],
    ['B', 3, 'งวดที่ 3', 45000, 50],
  ]);
});

test('applyCarryIn: ด่าน — ยกเกินยอดใบ · ไม่ได้เลือก · งวดที่ยกไม่ใช่เงินค้าง · ใบไม่มีงวด · Σ งวดเดิมไม่เท่ายอดใบ · เกิน 12 งวด', () => {
  const L1 = row({ id: 'L1', seq: 1, label: 'มัดจำ', percent: 90, amount: 90000, status: 'confirmed' });
  const O2 = row({ id: 'O2', seq: 2, label: 'งวดที่ 2', percent: 10, amount: 10000 });
  assert.match(applyCarryIn(TARGET, [L1, O2], [S1]).error,
    /^ยอดที่ยกมา ฿20,000\.00 รวมกับงวดที่มีเงินอยู่แล้ว ฿90,000\.00 เกินยอดใบ ฿100,000\.00 — /);
  assert.match(applyCarryIn(TARGET, [T1, T2], []).error, /ยังไม่ได้เลือกงวดที่จะยกมา/);
  assert.match(applyCarryIn(TARGET, [T1, T2], [{ ...S1, status: 'pending' }]).error,
    /งวดที่ 1 ของใบเดิมยกไม่ได้ — ยกได้เฉพาะงวดที่รับเงินแล้วหรือรอบัญชีตรวจ และยังไม่คืนเงิน/);
  assert.match(applyCarryIn(TARGET, [T1, T2], [{ ...S1, refundedAt: 'x' }]).error, /ยังไม่คืนเงิน/);
  assert.match(applyCarryIn(TARGET, [], [S1]).error, /ยังไม่มีงวดชำระ/);
  assert.match(applyCarryIn(TARGET, [T1, { ...T2, amount: 69999.99 }], [S1]).error,
    /งวดชำระของใบนี้รวม ฿99,999\.99 ไม่เท่ายอดใบ ฿100,000\.00 — ให้แอดมินตรวจงวดก่อน/);
  const many = Array.from({ length: 11 }, (_, i) => row({ id: `M${i}`, seq: i + 1, label: `งวดที่ ${i + 1}`, amount: 9090.9, percent: 9.09 }));
  many[10] = { ...many[10], amount: 9091, percent: 9.1 };
  // ยกงวดเล็ก ๆ สองงวด = หักงวดแรกไม่หมด ⇒ 11 + 2 = 13 งวด
  const tiny = [row({ ...S2, id: 'S8', seq: 8, amount: 1 }), row({ ...S2, id: 'S9', seq: 9, amount: 1 })];
  assert.match(applyCarryIn(TARGET, many, tiny).error || '', /ไม่เกิน 12 งวด \(หลังยก 13 งวด\)/);
  assert.match(applyCarryIn({ ...TARGET, totalAmount: 0 }, [T1], [S1]).error, /ยอดรวม 0 บาท/);
});

// ── 4. ข้อมูลเก่า (อีกหน้าต่างแจ้งชำระ/รับรองระหว่างโมดัลเปิด) ───────────────────────────────────────────────
test('carryExpected / carryStale: ครบทุกแถวของใบใหม่ + แถวที่ยก และ updatedAt ตรงทุกแถว', () => {
  const expected = carryExpected([T1, T2], [S1]);
  assert.deepEqual(expected, [
    { id: 'T1', updatedAt: T1.updatedAt }, { id: 'T2', updatedAt: T2.updatedAt }, { id: 'S1', updatedAt: S1.updatedAt },
  ]);
  assert.equal(carryStale([T1, T2], [S1], expected), false);
  assert.equal(carryStale([T1, { ...T2, updatedAt: '2026-09-05T00:00:00Z' }], [S1], expected), true);
  assert.equal(carryStale([T1, T2], [S1, S2], expected), true, 'แถวที่ยกเพิ่มโดยไม่อยู่ใน expected');
  assert.equal(carryStale([T1, T2], [S1], null), true);
  assert.match(CARRY_STALE_MESSAGE, /โหลดใหม่/);
});

// ── 5. ผลลัพธ์ก่อนกด (paymentCarryPrompt) · audit · ป้ายบนแผง ───────────────────────────────────────────────
test('carryPromptFacts: งวดที่ยก (สถานะ · ยอด) · แผนที่เหลือก่อน→หลัง · ใบกำกับที่ย้ายมา · Actual ไม่เปลี่ยน · เงินค้างที่เหลือ', () => {
  const built = applyCarryIn(TARGET, [T1, T2], [S1, S2]);
  const facts = carryPromptFacts(TARGET, SOURCE, [T1, T2], [S1, S2], built, { sourceRows: [S1, S2] });
  assert.equal(facts.orderNumber, 'SO-26090002-0');
  assert.equal(facts.sourceNumber, 'SO-26080039-0');
  assert.equal(facts.count, 2);
  assert.equal(facts.amountLabel, '฿30,000.00');
  assert.equal(facts.reportedCount, 1);
  assert.equal(facts.reportedAmountLabel, '฿10,000.00');
  assert.deepEqual(facts.invoiceNos, ['IV-7']);
  assert.deepEqual(facts.carriedLines, [
    'ยกมาเป็นงวดที่ 1: มัดจำ ฿20,000.00 · รับเงินแล้ว',
    'ยกมาเป็นงวดที่ 2: งวดที่ 2 ฿10,000.00 · รอบัญชีตรวจ',
  ]);
  assert.deepEqual(facts.changes, [
    'ลบ งวดที่ 1 ฿30,000.00 (ยังไม่มีการชำระ)',
    'งวดที่ 2 → งวดที่ 3: ยอดคงเดิม ฿70,000.00',
  ]);
  assert.equal(facts.totalLabel, '฿100,000.00');
  assert.equal(facts.actualAmountLabel, '฿93,457.94');
  assert.equal(facts.actualMonthLabel, 'ก.ย. 2026', 'เดือนของ approvedAt เวลาไทย (31/08 18:30Z = 1 ก.ย.)');
  assert.equal(facts.quotationNumber, 'QT-26090002');
  assert.equal(facts.remainingCount, 0);
  assert.equal(facts.complete, false);
  // ยกบางงวด = ใบเดิมยังเหลือเงินค้าง
  const partial = carryPromptFacts(TARGET, SOURCE, [T1, T2], [S1], applyCarryIn(TARGET, [T1, T2], [S1]), { sourceRows: [S1, S2] });
  assert.equal(partial.remainingCount, 1);
  assert.equal(partial.remainingAmountLabel, '฿10,000.00');
  /* 🐞 แผงส่งต้นทางจาก carrySourcesFrom (ไม่ใช่แถวใบดิบ) — ต้องพกสถานะใบมาด้วย ไม่งั้น "เหลือเงินค้าง" เป็น 0 เสมอ
     (โมดัลยืนยันจะบอกผิดว่าใบเดิมไม่เหลือเงินค้างทั้งที่ยกไปแค่บางงวด) */
  const [fromPanel] = carrySourcesFrom([SOURCE], [S1, S2]);
  assert.equal(fromPanel.status, 'cancelled');
  const viaPanel = carryPromptFacts(TARGET, fromPanel, [T1, T2], [S1], applyCarryIn(TARGET, [T1, T2], [S1]),
    { sourceRows: fromPanel.rows });
  assert.equal(viaPanel.remainingCount, 1);
});

test('carryAuditSummary: บอกต้นทาง → ปลายทาง จำนวนงวด ยอด และเหตุผล', () => {
  assert.equal(carryAuditSummary({
    fromNumber: 'SO-26080039-0', toNumber: 'SO-26090002-0', reason: 'ลูกค้าออกใบใหม่แทนใบที่ยกเลิก',
    carried: { count: 2, amount: 30000, confirmedCount: 1, reportedCount: 1 },
  }), 'ยกเงินจากใบที่ยกเลิก SO-26080039-0 → SO-26090002-0: 2 งวด ฿30,000.00 (รับแล้ว 1 · รอบัญชีตรวจ 1) · ลูกค้าออกใบใหม่แทนใบที่ยกเลิก');
  assert.match(CARRY_DONE_MESSAGE, /บัญชีไม่ต้องรับรองซ้ำ/);
  assert.match(INSTALLMENT_CARRY_SCHEMA_MISSING, /0378/);
});

test('carriedFromOf: งวดที่ยกมาบอกเลขใบเดิม (รายการ carry ล่าสุดของ movedFrom) · ย้ายเพราะ Rev. ไม่ใช่การยก', () => {
  assert.equal(carriedFromOf(row({})), null);
  assert.equal(carriedFromOf(row({ movedFrom: [{ salesOrderId: 'A', orderNumber: 'SO-A', reason: 'revision' }] })), null);
  assert.deepEqual(carriedFromOf(row({ movedFrom: [
    { salesOrderId: 'A', orderNumber: 'SO-A', reason: 'carry' },
    { salesOrderId: 'B', orderNumber: 'SO-B', reason: 'revision' },
  ] })), { salesOrderId: 'A', orderNumber: 'SO-A' });
  assert.equal(carriedFromOf(row({ movedFrom: 'garbage' })), null);
});

test('carriedAwayGroups: ลิงก์ "ยกไป {SO}" บนใบที่ยกเลิก — จับกลุ่มตามใบที่ถืองวดอยู่ตอนนี้ (เฉพาะการยก)', () => {
  assert.deepEqual(carriedAwayGroups([
    { id: '1', reason: 'carry', salesOrderId: 'N', orderNumber: 'SO-N', amount: 20000 },
    { id: '2', reason: 'carry', salesOrderId: 'N', orderNumber: 'SO-N', amount: 10000 },
    { id: '3', reason: 'revision', salesOrderId: 'R', orderNumber: 'SO-R', amount: 5 },
  ]), [{ salesOrderId: 'N', orderNumber: 'SO-N', count: 2, amount: 30000 }]);
  assert.deepEqual(carriedAwayGroups(null), []);
});

// ── 6. review MONEY-1: เงินก้อนเดียวนับสองครั้ง (บทเรียน SO-26080039-0 / -043-0 ผ่านทางที่จอแนะนำ) ─────────────────
/* 🐞 ใบใหม่ของดีลเดียวกันถูกตั้งงวดแรกด้วยมัดจำก้อนเดิมอยู่แล้ว (freeze ยืมสลิปจากเอกสารยืนยันคำสั่งซื้อ · เงินงวดแรกที่
     กรอกตอนสร้างใบ) แล้วโมดัลอนุมัติบอกให้กด "ยกเงินจากใบที่ยกเลิก" ⇒ ยกมัดจำเดิมเข้ามาอีกแถว = เก็บ 64,200 จากมัดจำ 32,100
     ด่านยกเกินยอดใบจับไม่ได้ (32,100 + 32,100 ≤ 107,000) ⇒ ต้องเทียบแถวที่ยกกับงวดที่มีเงินของใบใหม่ตรง ๆ
   ⭐ ซ้ำ = งวดของใบนี้ที่แจ้ง/รับรองแล้ว (ยังไม่คืนเงิน) ที่ **วันจ่าย + ยอดตรงกัน** หรือ **สลิปไฟล์เดียวกัน** (storagePath)
     ⇒ ยกไม่ได้ · บอกทาง: บัญชีตีกลับ/ถอนคำรับรองงวดที่ซ้ำบนใบนี้ก่อน (RPC 0378 ตรวจเกณฑ์เดียวกัน — installment_carry_duplicate)
   ⭐ ชื่อไฟล์ตรงกันอย่างเดียว = เตือน (ไม่บล็อก) — ชื่อสลิปจากมือถือซ้ำกันได้ ("image.jpg") บล็อกแล้วเงินคนละก้อนเป็นทางตัน */
const DEP = row({
  id: 'D1', seq: 1, label: 'มัดจำ', percent: 20, amount: 20000, status: 'reported', paidOn: '2026-08-20',
  reportedAt: 'y', evidence: [{ fileName: 'deposit.jpg', storagePath: 'sales-orders/SOR-N/payments/deposit.jpg' }],
  note: 'หลักฐานจากเอกสารยืนยันคำสั่งซื้อ (สลิปโอนเงิน) — ระบบยกมาให้ รอบัญชีตรวจ',
});
const REST = row({ id: 'D2', seq: 2, label: 'งวดที่ 2', percent: 80, amount: 80000 });

test('🔴 applyCarryIn: ใบใหม่มีงวดแจ้ง/รับรองแล้วที่วันจ่าย+ยอดตรงกับงวดที่ยก = ยกไม่ได้ (ยกเกินยอดใบจับไม่ได้)', () => {
  for (const status of ['reported', 'confirmed']) {
    const built = applyCarryIn(TARGET, [{ ...DEP, status }, REST], [S1]);
    assert.ok(built.error, `${status}: ต้องบล็อก`);
    assert.match(built.error, /งวดที่ 1 ของใบนี้ \((รอบัญชีตรวจ|รับเงินแล้ว)\) เป็นเงินก้อนเดียวกับงวดที่ 1 ของใบที่ยกเลิก/);
    assert.match(built.error, /วันจ่าย .* ยอด ฿20,000\.00 ตรงกัน/);
    assert.match(built.error, /ให้บัญชีตีกลับ\/ถอนคำรับรองงวดที่ซ้ำบนใบนี้ก่อน แล้วจึงยก/);
    assert.doesNotMatch(built.error, /เกินยอดใบ/, 'ยอดไม่เกิน — ด่านนี้คือด่านใหม่ ไม่ใช่ด่านยกเกิน');
  }
});

test('🔴 applyCarryIn: สลิปไฟล์เดียวกัน (storagePath) = ยกไม่ได้ แม้วันจ่าย/ยอดต่างกัน', () => {
  const shared = { fileName: 'slip.jpg', storagePath: 'quotations/QT-C/order-confirmation/slip.jpg' };
  const built = applyCarryIn(TARGET, [
    { ...DEP, paidOn: '2026-08-22', amount: 25000, percent: 25, evidence: [{ ...shared, fileName: 'อีกชื่อ.jpg' }] },
    { ...REST, amount: 75000, percent: 75 },
  ], [{ ...S1, evidence: [shared] }]);
  assert.ok(built.error);
  assert.match(built.error, /สลิปไฟล์เดียวกัน/);
});

test('applyCarryIn: บัญชีตีกลับงวดที่ซ้ำแล้ว = ยกได้ และงวดนั้นเป็นงวดเปิดที่ถูกหักก่อน · คืนเงินแล้ว/รอชำระไม่นับว่าซ้ำ', () => {
  const rejected = applyCarryIn(TARGET, [{ ...DEP, status: 'rejected', rejectedReason: 'ซ้ำกับ SO เดิม' }, REST], [S1]);
  assert.equal(rejected.error, null);
  assert.deepEqual(rejected.removed.map((r) => r.id), ['D1'], 'งวดที่ตีกลับถูกหักจนหมด — เงินที่ยกมาครอบแทน');
  const pending = applyCarryIn(TARGET, [{ ...DEP, status: 'pending', paidOn: null, evidence: [] }, REST], [S1]);
  assert.equal(pending.error, null);
  // เงินคนละก้อนจริง (วันจ่ายต่าง · ไฟล์ต่าง) ยกได้ตามปกติ
  const other = applyCarryIn(TARGET, [{ ...DEP, paidOn: '2026-09-01' }, REST], [S1]);
  assert.equal(other.error, null);
});

test('applyCarryIn: ชื่อไฟล์สลิปตรงกันอย่างเดียว = คำเตือน (ไม่บล็อก — ชื่อไฟล์จากมือถือซ้ำกันได้)', () => {
  const built = applyCarryIn(TARGET, [{ ...DEP, paidOn: '2026-09-01', evidence: [{ fileName: 'SLIP.JPG', storagePath: 'x/other.jpg' }] }, REST], [S1]);
  assert.equal(built.error, null);
  assert.equal(built.warnings.length, 1);
  assert.match(built.warnings[0], /งวดที่ 1 ของใบนี้แนบสลิปชื่อเดียวกับงวดที่ 1 ของใบที่ยกเลิก \(slip\.jpg\) — ตรวจว่าไม่ใช่เงินก้อนเดียวกันก่อนยก/);
  assert.deepEqual(applyCarryIn(TARGET, [T1, T2], [S1]).warnings, []);
  // คำเตือนต้องถึงโมดัลยืนยันด้วย (ไม่ใช่เห็นแต่ในตาราง)
  const facts = carryPromptFacts(TARGET, SOURCE, [DEP, REST], [S1], built, { sourceRows: [S1] });
  assert.deepEqual(facts.warnings, built.warnings);
});

// ── 7. review UI-5: ยกเกินยอดใบ — ข้อความต้องชี้ทางที่มีอยู่จริง (คืนเงินได้ทั้งงวดเท่านั้น · ไม่มีคืนบางส่วน) ──────────
test('applyCarryIn: ยกเกินยอดใบบอกทางที่ทำได้จริง — เลือกยกน้อยลง หรือบัญชีบันทึกคืนเงินทั้งงวด (ไม่มีคืนบางส่วน)', () => {
  const L1 = row({ id: 'L1', seq: 1, label: 'มัดจำ', percent: 90, amount: 90000, status: 'confirmed', paidOn: '2026-07-01' });
  const O2 = row({ id: 'O2', seq: 2, label: 'งวดที่ 2', percent: 10, amount: 10000 });
  const error = applyCarryIn(TARGET, [L1, O2], [S1]).error;
  assert.doesNotMatch(error, /ส่วนที่เกิน/, 'คืนบางส่วนไม่มีในระบบ (refund = ทั้งแถว)');
  assert.match(error, /ถ้ายกหลายงวดให้เลือกยกน้อยลง/);
  assert.match(error, /คืนบางส่วนไม่ได้/);
  assert.match(error, /บัญชีบันทึกคืนเงินทั้งงวดที่ใบที่ยกเลิก แล้วเก็บเงินของใบนี้ตามงวดปกติ/);
});
