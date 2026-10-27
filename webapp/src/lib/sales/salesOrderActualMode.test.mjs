// นับ Actual ทั้งใบ / รายงวด (mig 0412 · มติเจ้าของ 26/10/2026 · docs/so-installment-actual.md)
// ล็อกกติกากลางของไฟล์ salesOrderActualMode.js — ส่วนแบ่งต้องตรงกับ SQL ทุกสตางค์ · เดือนต้องเป็นเวลาไทย
// · ด่านยื่น/อนุมัติงวดต้องตรงกับ RPC · ใบทั้งใบต้องได้ค่าเดิมทุกตัว
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTUAL_MODES, ACTUAL_MODE_INSTALLMENT, ACTUAL_MODE_LABELS, ACTUAL_MODE_ORDER, ACTUAL_STATE_LABELS, ACTUAL_STATE_TONES,
  COUNT_REST_NO_ROWS, INSTALLMENT_ACTUAL_ACTIONS, INSTALLMENT_ACTUAL_CONFIRM_BLOCKED, INSTALLMENT_ACTUAL_PREVIOUS_UNCONFIRMED,
  INSTALLMENT_ACTUAL_REPORT_BLOCKED,
  INSTALLMENT_ACTUAL_AFTER_COUNT_REST, INSTALLMENT_ACTUAL_AUTO_NOTE, INSTALLMENT_ACTUAL_START_LABEL, INSTALLMENT_ACTUAL_START_LEFT_LABEL,
  installmentActualAutoCounted, installmentActualCountRestDone, installmentActualStartButtonLabel, installmentActualStartPending,
  INSTALLMENT_ACTUAL_SELF_APPROVAL_SHORT, INSTALLMENT_ACTUAL_UNFROZEN_SHORT, installmentActualApproveWait, installmentActualHold,
  installmentActualLockShort, installmentActualPreviousOpen, installmentActualReportWaitShort,
  INSTALLMENT_ACTUAL_REVOKED_LOCK, installmentActualLockReason, actualModeEligibility, actualModeOf, countRestBlocker, installmentActualActionError, installmentActualAwaitingReview,
  installmentActualInstant, installmentActualMonth, installmentActualPaymentGated, installmentActualProgress,
  installmentActualReadyForOwner, installmentActualReasonError, installmentActualShareAtApproval, installmentActualShares,
  installmentActualStartPreview, installmentActualStartRows, installmentActualState, installmentPreviousConfirmed,
  installmentRemainingByDue, isActualMode, isInstallmentActualOrder, nextSubmittableInstallment, salesOrderActualEvents,
  salesOrderCountedActual, salesOrderRemainingActual, salesOrderSubmittedActual, salesOrderSubmittedCount,
} from './salesOrderActualMode.js';
import { workflowErrorMessage } from './documentWorkflowErrors.js';
import { installmentActionError } from './salesOrderPayments.js';

const ALL_STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'revised', 'approval_revoked', 'cancelled'];

/* ใบรายงวดตัวอย่าง: 107,000 รวม VAT = 100,000 ก่อน VAT · แผน 50/30/20 */
const ORDER = Object.freeze({
  id: 'SO-1',
  status: 'approved',
  origin: 'pipeline',
  actualMode: 'installment',
  totalAmount: 107000,
  actualAmount: 100000,
  actualCountedAmount: 50000,
  actualSubmittedAmount: 30000,
  approvedAt: '2026-10-05T03:00:00Z',
  deal: { ownerId: 'U-AE' },
});
const row = (seq, extra = {}) => ({
  id: `I-${seq}`, seq, status: 'pending', actualStatus: null, amount: 0, ...extra,
});
const ROWS = Object.freeze([
  row(1, { amount: 53500, status: 'confirmed', actualStatus: 'approved', actualAmount: 50000, actualApprovedAt: '2026-10-05T03:00:00Z' }),
  row(2, { amount: 32100, actualStatus: 'submitted', actualSubmittedById: 'U-AE', dueDate: '2026-11-15' }),
  row(3, { amount: 21400, dueDate: '2026-12-15' }),
]);
const AE = { id: 'U-AE', role: 'ae' };
const OTHER_AE = { id: 'U-AE2', role: 'ae' };
const SUP = { id: 'U-SUP', role: 'ae_supervisor' };
const ADMIN = { id: 'U-ADM', role: 'admin' };
const FN = { id: 'U-FN', role: 'finance', department: 'finance' };

/* ── 1. ค่าคงที่ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('แบบการนับมีสองค่า ป้ายครบ · สถานะแสดงของงวดมีป้าย/โทนครบตามสัญญา', () => {
  assert.deepEqual(ACTUAL_MODES, ['order', 'installment']);
  assert.equal(ACTUAL_MODE_ORDER, 'order');
  assert.equal(ACTUAL_MODE_INSTALLMENT, 'installment');
  for (const mode of ACTUAL_MODES) assert.ok(ACTUAL_MODE_LABELS[mode], mode);
  assert.deepEqual(ACTUAL_STATE_LABELS, {
    counted: 'นับ Actual แล้ว',
    submitted: 'รอ AE Sup อนุมัติ',
    rejected: 'ตีกลับ — ยื่นใหม่ได้',
    ready: 'ยื่นขอนับได้',
    waiting: 'รองวดก่อนรับรองเงิน',
    auto: 'รอนับอัตโนมัติ', // มติข้อ 10
    unfrozen: 'รอ AE Sup ตรึงงวด', // review รอบห้า: ตัวหยุดยอดล้ม — ยื่นไม่ได้จนปุ่มกู้
  });
  assert.deepEqual(Object.keys(ACTUAL_STATE_TONES).sort(), Object.keys(ACTUAL_STATE_LABELS).sort());
  assert.deepEqual(INSTALLMENT_ACTUAL_ACTIONS, {
    actual_submit: 'submit', actual_withdraw: 'withdraw', actual_approve: 'approve', actual_reject: 'reject',
  });
  assert.equal(isActualMode('order'), true);
  assert.equal(isActualMode('installment'), true);
  assert.equal(isActualMode('INSTALLMENT'), false);
  assert.equal(isActualMode(undefined), false);
});

/* ── 2. แบบการนับของใบ ───────────────────────────────────────────────────────────────────────────────────── */
test('isInstallmentActualOrder: อ่าน actualMode ล้วน ไม่ดูสถานะใบ (ตรงกับ trigger ด่านรับรองเงิน) · ใบย้อนหลังไม่ใช่', () => {
  assert.equal(isInstallmentActualOrder(ORDER), true);
  for (const status of ALL_STATUSES) assert.equal(isInstallmentActualOrder({ ...ORDER, status }), true, status);
  assert.equal(isInstallmentActualOrder({ ...ORDER, actualMode: 'order' }), false);
  assert.equal(isInstallmentActualOrder({ ...ORDER, actualMode: undefined }), false, 'ไม่มีคอลัมน์ (ก่อนรัน 0412) = ทั้งใบ');
  assert.equal(isInstallmentActualOrder({ ...ORDER, origin: 'historical' }), false);
  assert.equal(isInstallmentActualOrder(null), false);
  assert.equal(actualModeOf(ORDER), 'installment');
  assert.equal(actualModeOf({}), 'order');
});

test('actualModeEligibility: pipeline · ยอด > 0 · อย่างน้อย 2 งวด', () => {
  const base = { status: 'pending_approval', origin: 'pipeline', totalAmount: 107000 };
  assert.deepEqual(actualModeEligibility(base, 3), { eligible: true, reason: null });
  assert.deepEqual(actualModeEligibility(base, 2), { eligible: true, reason: null });
  assert.deepEqual(actualModeEligibility(base, [{}, {}]), { eligible: true, reason: null }, 'ส่งอาร์เรย์งวดได้');
  const one = actualModeEligibility(base, 1);
  assert.equal(one.eligible, false);
  assert.match(one.reason, /งวดเดียว/);
  assert.equal(actualModeEligibility(base, [{}]).eligible, false);
  assert.equal(actualModeEligibility(base, 0).eligible, false);
  assert.equal(actualModeEligibility(base, undefined).eligible, false);
  const zero = actualModeEligibility({ ...base, totalAmount: 0 }, 3);
  assert.equal(zero.eligible, false);
  assert.match(zero.reason, /0 บาท/);
  assert.equal(actualModeEligibility({ ...base, totalAmount: null }, 3).eligible, false, 'ไม่รู้ยอด = เลือกรายงวดไม่ได้');
  assert.equal(actualModeEligibility({ ...base, totalAmount: '0.004' }, 3).eligible, false, 'ยอดปัดเป็น 0 สตางค์');
  const historical = actualModeEligibility({ ...base, origin: 'historical' }, 3);
  assert.equal(historical.eligible, false);
  assert.match(historical.reason, /ย้อนหลัง/);
  assert.equal(actualModeEligibility(null, 3).eligible, false);
});

/* ── 3. ยอดที่นับแล้วของแถวใบ (คู่กับ cache บนดีล) ───────────────────────────────────────────────────────────── */
test('salesOrderCountedActual: ทั้งใบ = actualAmount · รายงวด = actualCountedAmount · ไม่ใช่ approved/ใบย้อนหลัง = 0', () => {
  assert.equal(salesOrderCountedActual(ORDER), 50000);
  assert.equal(salesOrderCountedActual({ ...ORDER, actualMode: 'order' }), 100000);
  assert.equal(salesOrderCountedActual({ ...ORDER, actualMode: undefined }), 100000, 'ใบเดิมก่อน 0412 = ทั้งใบ');
  for (const status of ALL_STATUSES.filter((s) => s !== 'approved')) {
    assert.equal(salesOrderCountedActual({ ...ORDER, status }), 0, `${status} (รายงวด)`);
    assert.equal(salesOrderCountedActual({ ...ORDER, status, actualMode: 'order' }), 0, `${status} (ทั้งใบ)`);
  }
  assert.equal(salesOrderCountedActual({ ...ORDER, origin: 'historical', actualMode: 'order' }), 0);
  assert.equal(salesOrderCountedActual({ ...ORDER, actualCountedAmount: -5 }), 0);
  assert.equal(salesOrderCountedActual({ ...ORDER, actualCountedAmount: null }), 0);
  assert.equal(salesOrderCountedActual(null), 0);
});

test('สามกองของใบรายงวดรวมกันเท่า actualAmount พอดี (นับแล้ว + ยื่นแล้ว + รอนับรายงวด)', () => {
  assert.equal(salesOrderSubmittedActual(ORDER), 30000);
  assert.equal(salesOrderRemainingActual(ORDER), 20000);
  assert.equal(
    salesOrderCountedActual(ORDER) + salesOrderSubmittedActual(ORDER) + salesOrderRemainingActual(ORDER),
    ORDER.actualAmount,
  );
  // เศษสตางค์ไม่หลุด (ลบด้วยสตางค์จำนวนเต็ม ไม่ใช่ float)
  const odd = { ...ORDER, actualAmount: 934.58, actualCountedAmount: 311.52, actualSubmittedAmount: 311.52 };
  assert.equal(salesOrderRemainingActual(odd), 311.54);
  // ไม่ติดลบเมื่อ cache เกิน (ข้อมูลเพี้ยนระหว่างทาง)
  assert.equal(salesOrderRemainingActual({ ...ORDER, actualSubmittedAmount: 60000 }), 0);
  // ใบทั้งใบ / ไม่ใช่ approved / ใบย้อนหลัง = 0 ทั้งสองกอง
  for (const order of [
    { ...ORDER, actualMode: 'order' }, { ...ORDER, status: 'approval_revoked' }, { ...ORDER, status: 'cancelled' },
    { ...ORDER, origin: 'historical' }, null,
  ]) {
    assert.equal(salesOrderSubmittedActual(order), 0);
    assert.equal(salesOrderRemainingActual(order), 0);
    assert.equal(salesOrderSubmittedCount(order), 0);
  }
});

test('salesOrderSubmittedCount: งวดที่แนบมาก่อน · ค่าที่ API คิดให้ · ไม่มีทั้งสอง = มียอดยื่น 1 งวด', () => {
  assert.equal(salesOrderSubmittedCount({ ...ORDER, installments: ROWS }), 1);
  assert.equal(salesOrderSubmittedCount({ ...ORDER, installments: [] }), 0);
  assert.equal(salesOrderSubmittedCount({ ...ORDER, actualSubmittedCount: 2 }), 2);
  assert.equal(salesOrderSubmittedCount(ORDER), 1);
  assert.equal(salesOrderSubmittedCount({ ...ORDER, actualSubmittedAmount: 0 }), 0);
});

/* ── 4. ส่วนแบ่งก่อน VAT (คู่กับ SQL) ──────────────────────────────────────────────────────────────────────── */
test('installmentActualShares: งวดที่อนุมัติใช้ยอดที่ตรึง · ที่เหลือประมาณตามลำดับงวด งวดท้ายรับเศษ', () => {
  assert.deepEqual(installmentActualShares(ORDER, ROWS), [
    { id: 'I-1', seq: 1, amount: 50000, counted: true, actualStatus: 'approved' },
    { id: 'I-2', seq: 2, amount: 30000, counted: false, actualStatus: 'submitted' },
    { id: 'I-3', seq: 3, amount: 20000, counted: false, actualStatus: null },
  ]);
  // เรียงตามเลขงวดเสมอ ไม่ว่าแถวมาลำดับไหน
  assert.deepEqual(installmentActualShares(ORDER, [...ROWS].reverse()).map((s) => s.seq), [1, 2, 3]);
  assert.deepEqual(installmentActualShares(ORDER, []), []);
  assert.deepEqual(installmentActualShares(ORDER, null), []);
});

test('installmentActualShares: ปัดที่สตางค์ — งวดท้ายรับเศษ ผลรวมเท่ายอดก่อน VAT พอดี', () => {
  const order = { actualAmount: 934.58, totalAmount: 1000 };
  const shares = installmentActualShares(order, [row(1, { amount: 333.33 }), row(2, { amount: 333.33 }), row(3, { amount: 333.34 })]);
  assert.deepEqual(shares.map((s) => s.amount), [311.52, 311.52, 311.54]);
  assert.equal(Math.round(shares.reduce((sum, s) => sum + s.amount, 0) * 100), 93458);
});

test('installmentActualShares: ครึ่งสตางค์ปัดขึ้นแบบ round(numeric, 2) ของ Postgres — ไม่ใช่ Math.round ของ float', () => {
  // 1.15 × 1.00 / 2.00 = 0.575 พอดี — float ได้ 57.49999… สตางค์ (Math.round → 0.57) · ฐานได้ 0.58
  assert.equal(Math.round(((1.15 * 1.00) / 2.00) * 100) / 100, 0.57, 'ยืนยันว่า float ปัดผิดจริง');
  const shares = installmentActualShares({ actualAmount: 1.00, totalAmount: 2.00 }, [row(1, { amount: 1.15 }), row(2, { amount: 0.85 })]);
  assert.deepEqual(shares.map((s) => s.amount), [0.58, 0.42]);
  // ยอดใหญ่ (เกิน 2^53 เมื่อคูณเป็นสตางค์) ยังเป๊ะ
  const big = installmentActualShares(
    { actualAmount: 93457943.93, totalAmount: 100000000 },
    [row(1, { amount: 33333333.33 }), row(2, { amount: 66666666.67 })],
  );
  assert.deepEqual(big.map((s) => s.amount), [31152647.97, 62305295.96]);
});

test('installmentActualShares: ส่วนแบ่งไม่เกินคงเหลือ — งวดท้าย 0 บาทไม่ติดลบ', () => {
  // 1.50 × 2.01 / 3.00 = 1.005 → 1.01 ทั้งสองงวด = 2.02 เกิน 2.01 ⇒ งวดสองถูกตัดเหลือ 1.00 · งวดท้าย 0
  const shares = installmentActualShares({ actualAmount: 2.01, totalAmount: 3.00 },
    [row(1, { amount: 1.5 }), row(2, { amount: 1.5 }), row(3, { amount: 0 })]);
  assert.deepEqual(shares.map((s) => s.amount), [1.01, 1.00, 0]);
});

test('installmentActualShares: ยอดใบ 0 / งวดยอด 0 / ทุกงวดนับแล้ว', () => {
  assert.deepEqual(installmentActualShares({ actualAmount: 0, totalAmount: 0 }, [row(1), row(2)]).map((s) => s.amount), [0, 0]);
  const withZero = installmentActualShares({ actualAmount: 100, totalAmount: 107 },
    [row(1, { amount: 0 }), row(2, { amount: 107 })]);
  assert.deepEqual(withZero.map((s) => s.amount), [0, 100]);
  const allCounted = installmentActualShares({ actualAmount: 100, totalAmount: 107 }, [
    row(1, { amount: 53.5, actualStatus: 'approved', actualAmount: 50 }),
    row(2, { amount: 53.5, actualStatus: 'approved', actualAmount: 50 }),
  ]);
  assert.deepEqual(allCounted.map((s) => [s.amount, s.counted]), [[50, true], [50, true]]);
});

/* เครื่องสุ่มกำหนดผล — คุณสมบัติที่ต้องจริงทุกชุด (ไม่ใช่แค่ตัวอย่างที่เลือกมา) */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}
function randomPlan(rand) {
  const n = 2 + Math.floor(rand() * 11); // 2–12 งวด
  const totalCents = 1 + Math.floor(rand() * 5_000_000_00);
  const vatCents = Math.round(totalCents * 7 / 107);
  const weights = Array.from({ length: n }, () => (rand() < 0.1 ? 0 : 1 + Math.floor(rand() * 100)));
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  let left = totalCents;
  const rows = weights.map((w, i) => {
    const c = i === n - 1 ? left : Math.floor(totalCents * w / wsum);
    left -= c;
    return row(i + 1, { amount: c / 100 });
  });
  return { order: { actualAmount: (totalCents - vatCents) / 100, totalAmount: totalCents / 100 }, rows };
}

test('คุณสมบัติ: นับแล้ว + ประมาณที่เหลือ = actualAmount พอดี · ไม่มีงวดติดลบ · อนุมัติเรียงงวด = ยอดเท่าที่ประมาณไว้', () => {
  const rand = lcg(20261026);
  for (let round = 0; round < 300; round += 1) {
    const { order, rows } = randomPlan(rand);
    const estimates = installmentActualShares(order, rows);
    const target = Math.round(order.actualAmount * 100);
    assert.equal(estimates.reduce((sum, s) => sum + Math.round(s.amount * 100), 0), target, `รอบ ${round} ประมาณ`);
    assert.ok(estimates.every((s) => s.amount >= 0), `รอบ ${round} ติดลบ`);
    // อนุมัติทีละงวดตามลำดับ — ยอดที่ตรึงตอนอนุมัติ = ยอดประมาณก่อนกด และนับครบ Σ = actualAmount
    let working = rows.map((r) => ({ ...r }));
    for (const r of working.slice()) {
      const before = installmentActualShares(order, working).find((s) => s.seq === r.seq).amount;
      const share = installmentActualShareAtApproval(order, working, r.id);
      assert.equal(share, before, `รอบ ${round} งวด ${r.seq}`);
      working = working.map((w) => (w.id === r.id ? { ...w, actualStatus: 'approved', actualAmount: share } : w));
      const after = installmentActualShares(order, working);
      assert.equal(after.reduce((sum, s) => sum + Math.round(s.amount * 100), 0), target, `รอบ ${round} หลังอนุมัติงวด ${r.seq}`);
    }
  }
});

test('installmentActualShareAtApproval: งวดเดียวที่ยังไม่นับรับคงเหลือ · ไม่ใช่ "เลขงวดสูงสุด" ที่ยังไม่นับ', () => {
  const order = { actualAmount: 100, totalAmount: 107 };
  const rows = [row(1, { amount: 53.5 }), row(2, { amount: 53.5 }), row(3, { amount: 0 })];
  // งวด 3 (0 บาท) นับก่อนงวด 2 — ต้องได้ 0 ไม่ใช่กวาดเศษของงวด 2
  const counted1 = rows.map((r) => (r.seq === 1 ? { ...r, actualStatus: 'approved', actualAmount: 50 } : r));
  assert.equal(installmentActualShareAtApproval(order, counted1, 'I-3'), 0);
  assert.equal(installmentActualShareAtApproval(order, counted1, 'I-2'), 50);
  const onlyTwoLeft = counted1.map((r) => (r.seq === 3 ? { ...r, actualStatus: 'approved', actualAmount: 0 } : r));
  assert.equal(installmentActualShareAtApproval(order, onlyTwoLeft, 'I-2'), 50, 'งวดเดียวที่เหลือรับคงเหลือ');
  assert.equal(installmentActualShareAtApproval(order, onlyTwoLeft, onlyTwoLeft[1]), 50, 'ส่งแถวมาแทน id ได้');
  assert.equal(installmentActualShareAtApproval(order, onlyTwoLeft, 'I-1'), null, 'นับไปแล้ว');
  assert.equal(installmentActualShareAtApproval(order, onlyTwoLeft, 'I-9'), null, 'ไม่พบ');
  // ส่วนแบ่งปกติไม่เกินคงเหลือ
  const over = [row(1, { amount: 1.5 }), row(2, { amount: 1.5 }), row(3, { amount: 0 })];
  const after1 = over.map((r) => (r.seq === 1 ? { ...r, actualStatus: 'approved', actualAmount: 1.01 } : r));
  assert.equal(installmentActualShareAtApproval({ actualAmount: 2.01, totalAmount: 3 }, after1, 'I-2'), 1.00);
});

/* ── 5. นับตอนคลิกอนุมัติใบ (RPC start) ────────────────────────────────────────────────────────────────────── */
test('installmentActualStartRows: งวดเลขน้อยสุด + งวด 0 บาท + งวดที่รับรองเงินแล้ว ที่ยังไม่นับ · ใบน้อยกว่า 2 งวด = ทุกงวด', () => {
  const rows = [
    row(1, { amount: 50 }), row(2, { amount: 0 }), row(3, { amount: 20, status: 'confirmed' }),
    row(4, { amount: 30, status: 'reported' }), row(5, { amount: 7 }),
  ];
  assert.deepEqual(installmentActualStartRows(rows).map((r) => r.seq), [1, 2, 3]);
  // รันซ้ำได้ — งวดที่นับแล้วข้าม (งวด 1 นับแล้ว ไม่ได้เลื่อนไปนับงวด 2 แทน)
  const again = rows.map((r) => (r.seq <= 3 ? { ...r, actualStatus: 'approved', actualAmount: 1 } : r));
  assert.deepEqual(installmentActualStartRows(again).map((r) => r.seq), []);
  assert.deepEqual(installmentActualStartRows([row(1, { amount: 10 })]).map((r) => r.seq), [1]);
  assert.deepEqual(installmentActualStartRows([]), []);
  // ลำดับแถวที่ส่งมาไม่มีผล
  assert.deepEqual(installmentActualStartRows([...rows].reverse()).map((r) => r.seq), [1, 2, 3]);
});

/* มติเจ้าของข้อ 10 (26/10 "นับให้เอง ไม่ต้องยื่น") — ใบที่เคยกด "นับที่เหลือทั้งหมด" (มีงวด via count_rest) = นับทั้งก้อนถาวร
   ⭐ ตรงกับ SQL: v_rest ของ start (ทุกงวดที่ยังไม่นับ via count_rest) · constraint trigger §5f (ข้อความ actualNote เดียวกัน — ยามที่ migration test)
   ⭐ ฮาร์เนส PGlite 0412 ข้อ 19c · 21 · 22 · 23 พิสูจน์ของจริง */
test('มติข้อ 10: ใบที่กดนับที่เหลือทั้งหมดแล้ว — start/ปุ่มกู้ครอบทุกงวดที่ค้าง (รวมแถวที่ยกมา) · ป้าย "นับงวดที่ค้าง" · สถานะ auto · ยื่นไม่ได้ (JS) · เหตุบอกปุ่มกู้', () => {
  const carried = { movedFrom: [{ reason: 'carry', salesOrderId: 'SO-X' }] };
  const restRows = [
    row(1, { amount: 32100, actualStatus: 'approved', actualAmount: 30000, actualApprovedVia: 'so_approval' }),
    row(2, { amount: 32100, actualStatus: 'approved', actualAmount: 30000, actualApprovedVia: 'count_rest', actualNote: 'ลูกค้าขอปิดยอดทั้งก้อน' }),
    row(3, { amount: 21400, actualStatus: 'approved', actualAmount: 40000, actualApprovedVia: 'count_rest', actualNote: 'ลูกค้าขอปิดยอดทั้งก้อน' }),
    row(4, { amount: 21400, ...carried }),
    row(5, { amount: 0.01, actualStatus: 'rejected' }),
  ];
  assert.equal(installmentActualCountRestDone(restRows), true);
  assert.equal(installmentActualCountRestDone(ROWS), false, 'ใบที่ยังเดินรายงวด');
  assert.equal(installmentActualCountRestDone([row(1, { actualStatus: 'submitted', actualApprovedVia: 'count_rest' })]), false, 'ต้องนับแล้วจริง');
  assert.deepEqual(installmentActualStartRows(restRows).map((r) => r.seq), [4, 5], 'ทุกงวดที่ยังไม่นับ (ไม่ใช่แค่งวด 1/0 บาท/รับรองแล้ว)');
  assert.deepEqual(installmentActualStartPending(restRows).map((r) => r.seq), [4, 5], 'แถวที่ยกมาก็ค้าง — ไม่มีการยื่นบนใบนี้แล้ว');
  assert.equal(installmentActualStartButtonLabel(restRows), INSTALLMENT_ACTUAL_START_LEFT_LABEL);
  // ใบที่ยังเดินรายงวด: แถวที่ยกมาไม่ใช่งานค้างของขั้นนับ (คงเดิม)
  const plain = [row(1, { amount: 10, ...carried }), row(2, { amount: 10 })];
  assert.deepEqual(installmentActualStartPending(plain).map((r) => r.seq), []);
  assert.equal(installmentActualStartButtonLabel([row(1, { amount: 10 }), row(2, { amount: 10 })]), INSTALLMENT_ACTUAL_START_LABEL);
  // preview = ส่วนแบ่งตามกติกาเดิม (นับครบแล้ว = 0)
  const preview = installmentActualStartPreview(ORDER, restRows);
  assert.deepEqual(preview.rows.map((r) => [r.seq, r.amount]), [[4, 0], [5, 0]]);
  // สถานะแสดง: ยังไม่นับ = auto (ไม่ใช่ ready/rejected) ⇒ ไม่มีงวดที่ยื่นได้ · เลนเจ้าของดีลว่าง
  assert.deepEqual(restRows.map((r) => installmentActualState(r, ORDER, restRows)), ['counted', 'counted', 'counted', 'auto', 'auto']);
  assert.equal(nextSubmittableInstallment(ORDER, restRows), null);
  assert.equal(installmentActualReadyForOwner(ORDER, restRows, { userId: 'U-AE', thisMonth: '2026-10' }), false);
  // ยื่นไม่ได้ (ด่าน JS อย่างเดียว — ฐานนับให้เองอยู่ดี) · เหตุของบัญชี/ฝ่ายขายชี้ปุ่ม "นับงวดที่ค้าง" ไม่ใช่ "รอฝ่ายขายยื่น"
  assert.equal(installmentActualActionError(restRows[3], 'actual_submit', AE, { order: ORDER, rows: restRows }), INSTALLMENT_ACTUAL_AFTER_COUNT_REST);
  assert.match(INSTALLMENT_ACTUAL_AFTER_COUNT_REST, /ไม่ต้องยื่น/);
  assert.match(INSTALLMENT_ACTUAL_AFTER_COUNT_REST, /‘นับงวดที่ค้าง’/);
  assert.doesNotMatch(INSTALLMENT_ACTUAL_AFTER_COUNT_REST, /อีกครั้ง/, 'ไม่ใช่คำของรอบสาม (กดนับที่เหลือทั้งหมดซ้ำ)');
  assert.match(installmentActualLockReason(restRows[3], ORDER, { countRestDone: true }), /บัญชีจึงรับรองเงินได้$/);
  assert.doesNotMatch(installmentActualLockReason(restRows[3], ORDER, { countRestDone: true }), /รอฝ่ายขายยื่น/);
  // แถวที่ฐานนับให้เอง (ข้อความคงที่) ≠ แถวที่ AE Sup กดนับที่เหลือทั้งหมดเอง
  const auto = row(6, { actualStatus: 'approved', actualAmount: 0, actualApprovedVia: 'count_rest', actualNote: INSTALLMENT_ACTUAL_AUTO_NOTE });
  assert.equal(installmentActualAutoCounted(auto), true);
  assert.equal(installmentActualAutoCounted(restRows[1]), false);
  assert.equal(installmentActualAutoCounted({ ...auto, actualApprovedVia: 'review' }), false);
  assert.ok(INSTALLMENT_ACTUAL_AUTO_NOTE.length >= 10 && INSTALLMENT_ACTUAL_AUTO_NOTE.length <= 500, 'CHECK รูปทรงของ count_rest (เหตุผล 10–500)');
});

test('installmentActualStartPreview: ยอดที่เข้า Actual ทันทีตอนอนุมัติใบ (งวดท้ายที่รับรองแล้วรับเศษเมื่อเหลืองวดเดียว)', () => {
  const order = { actualAmount: 934.58, totalAmount: 1000 };
  const rows = [row(1, { amount: 333.33 }), row(2, { amount: 333.33 }), row(3, { amount: 333.34 })];
  assert.deepEqual(installmentActualStartPreview(order, rows), { rows: [{ id: 'I-1', seq: 1, amount: 311.52 }], amount: 311.52 });
  // Rev. จากใบทั้งใบที่รับรองเงินครบทุกงวด = นับทุกงวด Σ = actualAmount พอดี
  const paid = rows.map((r) => ({ ...r, status: 'confirmed' }));
  const all = installmentActualStartPreview(order, paid);
  assert.deepEqual(all.rows.map((r) => r.amount), [311.52, 311.52, 311.54]);
  assert.equal(all.amount, 934.58);
});

/* ── 6. เดือนของ Actual (เวลาไทย) ──────────────────────────────────────────────────────────────────────────── */
test('installmentActualMonth: GREATEST(อนุมัติงวด, อนุมัติใบ) ตามเวลาไทย — ข้ามเดือน/ข้ามปีตอนเที่ยงคืนไทย', () => {
  const order = { approvedAt: '2026-10-05T03:00:00Z' };
  assert.equal(installmentActualMonth({ actualApprovedAt: '2026-11-20T03:00:00Z' }, order), '2026-11');
  // 31 ต.ค. 17:30Z = 1 พ.ย. 00:30 เวลาไทย
  assert.equal(installmentActualMonth({ actualApprovedAt: '2026-10-31T17:30:00Z' }, order), '2026-11');
  assert.equal(installmentActualMonth({ actualApprovedAt: '2026-10-31T16:59:59Z' }, order), '2026-10');
  // 31 ธ.ค. 17:00Z = 1 ม.ค. ปีหน้าเวลาไทย
  assert.equal(installmentActualMonth({ actualApprovedAt: '2026-12-31T17:00:00Z' }, order), '2027-01');
  // ไม่มีเวลาอนุมัติงวด = เดือนอนุมัติใบ (GREATEST ข้าม NULL) · ไม่มีทั้งสอง = null
  assert.equal(installmentActualMonth({}, order), '2026-10');
  assert.equal(installmentActualMonth({ actualApprovedAt: 'not-a-date' }, order), '2026-10');
  assert.equal(installmentActualMonth({}, {}), null);
  assert.equal(installmentActualMonth(null, null), null);
});

test('Rev.: งวดที่อนุมัติก่อน Rev. อนุมัติ ย้ายมาเดือนที่ Rev. อนุมัติ · งวดที่อนุมัติหลัง Rev. คงเดือนของตัวเอง (มติข้อ 7)', () => {
  const rev = { approvedAt: '2026-11-02T02:00:00Z' };
  assert.equal(installmentActualInstant({ actualApprovedAt: '2026-09-10T03:00:00Z' }, rev), rev.approvedAt);
  assert.equal(installmentActualMonth({ actualApprovedAt: '2026-09-10T03:00:00Z' }, rev), '2026-11');
  assert.equal(installmentActualMonth({ actualApprovedAt: '2026-12-01T03:00:00Z' }, rev), '2026-12');
});

/* ── 7. เหตุการณ์ Actual ของใบ ─────────────────────────────────────────────────────────────────────────────── */
test('salesOrderActualEvents: ใบทั้งใบ = เหตุการณ์เดียวที่อนุมัติใบ (เดือนไทย) ยอดเต็ม', () => {
  const whole = { ...ORDER, actualMode: 'order', approvedAt: '2026-08-31T18:00:00Z' };
  assert.deepEqual(salesOrderActualEvents(whole, ROWS), [
    { month: '2026-09', amount: 100000, at: '2026-08-31T18:00:00Z', installmentId: null, seq: null },
  ]);
  // ไม่มี approvedAt = เดือนของ orderDate (COALESCE ของ sync)
  assert.deepEqual(salesOrderActualEvents({ ...whole, approvedAt: null, orderDate: '2026-07-31' }), [
    { month: '2026-07', amount: 100000, at: null, installmentId: null, seq: null },
  ]);
  // ใบ 0 บาทที่อนุมัติแล้วยังเป็นเหตุการณ์ (ส่วนลด 100% — ใบจบที่อนุมัติ)
  assert.equal(salesOrderActualEvents({ ...whole, actualAmount: 0 })[0].amount, 0);
});

test('salesOrderActualEvents: ใบรายงวด = งวดละเหตุการณ์เฉพาะงวดที่อนุมัติ · Σ = actualCountedAmount', () => {
  const rows = [
    row(1, { actualStatus: 'approved', actualAmount: 50000, actualApprovedAt: '2026-10-05T03:00:00Z' }),
    row(2, { actualStatus: 'approved', actualAmount: 30000, actualApprovedAt: '2026-12-31T17:10:00Z' }),
    row(3, { actualStatus: 'submitted' }),
    row(4, { actualStatus: 'rejected' }),
  ];
  const events = salesOrderActualEvents({ ...ORDER, actualCountedAmount: 80000 }, rows);
  assert.deepEqual(events, [
    { month: '2026-10', amount: 50000, at: '2026-10-05T03:00:00Z', installmentId: 'I-1', seq: 1 },
    { month: '2027-01', amount: 30000, at: '2026-12-31T17:10:00Z', installmentId: 'I-2', seq: 2 },
  ]);
  assert.equal(events.reduce((sum, e) => sum + e.amount, 0), 80000);
  // Rev.: งวดที่นับก่อน Rev. อนุมัติ ลงเดือนของ Rev.
  const revEvents = salesOrderActualEvents({ ...ORDER, approvedAt: '2026-11-03T01:00:00Z' }, rows.slice(0, 1));
  assert.deepEqual(revEvents.map((e) => [e.month, e.at]), [['2026-11', '2026-11-03T01:00:00Z']]);
  // ไม่มีงวด (อาร์เรย์ว่าง) = ไม่มีเหตุการณ์ · ไม่ส่งงวด = ถอยเป็นก้อนเดียวที่เดือนอนุมัติใบ (ยอดรวมยังถูก)
  assert.deepEqual(salesOrderActualEvents(ORDER, []), []);
  assert.deepEqual(salesOrderActualEvents(ORDER), [
    { month: '2026-10', amount: 50000, at: ORDER.approvedAt, installmentId: null, seq: null },
  ]);
});

test('salesOrderActualEvents: ใบที่ย้อนอนุมัติ/ยกเลิก/ร่าง/ออก Rev. แล้ว และใบย้อนหลัง = ไม่มีเหตุการณ์', () => {
  for (const status of ALL_STATUSES.filter((s) => s !== 'approved')) {
    assert.deepEqual(salesOrderActualEvents({ ...ORDER, status }, ROWS), [], `${status} รายงวด`);
    assert.deepEqual(salesOrderActualEvents({ ...ORDER, status, actualMode: 'order' }, ROWS), [], `${status} ทั้งใบ`);
  }
  assert.deepEqual(salesOrderActualEvents({ ...ORDER, origin: 'historical', actualMode: 'order' }), []);
  assert.deepEqual(salesOrderActualEvents(null), []);
});

/* ── 8. กอง "รอนับรายงวด" ตามเดือนครบกำหนด ────────────────────────────────────────────────────────────────── */
test('installmentRemainingByDue: งวดที่ยังไม่ยื่น/ถูกตีกลับ ตามเดือนครบกำหนด · ไม่มีวัน = none · ไม่นับงวดที่ยื่นแล้ว/นับแล้ว', () => {
  const rows = [
    ...ROWS,
    row(4, { amount: 10700, actualStatus: 'rejected', actualRejectedReason: 'ยังไม่ส่งของงวดนี้เลย', dueDate: '2026-12-01' }),
    row(5, { amount: 0 }),
  ];
  const order = { ...ORDER, totalAmount: 117700, actualAmount: 110000 };
  assert.deepEqual(installmentRemainingByDue(order, rows), { '2026-12': 30000, none: 0 });
  assert.deepEqual(installmentRemainingByDue(ORDER, ROWS), { '2026-12': 20000 });
  assert.deepEqual(installmentRemainingByDue({ ...ORDER, actualMode: 'order' }, ROWS), {});
  assert.deepEqual(installmentRemainingByDue({ ...ORDER, status: 'approval_revoked' }, ROWS), {});
  /* ใบรายงวดที่อนุมัติแล้วแต่ยังไม่มีงวด (ตัวหยุดยอดล้ม · review 26/10) = ยอดทั้งใบลง none — คู่กับ _deal_so_actual_extras ของ 0412
     และ salesOrderRemainingActual (ไม่งั้นยอดใบหายจากทุกกองของดีล ขณะที่ตาราง SO นับเป็นรอนับรายงวด) */
  assert.deepEqual(installmentRemainingByDue(ORDER, []), { none: ORDER.actualAmount });
  assert.deepEqual(installmentRemainingByDue({ ...ORDER, actualAmount: 0 }, []), {}, 'ยอด 0 = ไม่มีกอง');
  assert.deepEqual(installmentRemainingByDue({ ...ORDER, actualMode: 'order' }, []), {}, 'ใบทั้งใบ = ไม่มีกอง');
});

/* ── 9. สถานะแสดงของงวด ───────────────────────────────────────────────────────────────────────────────────── */
test('installmentActualState: นับแล้ว · รออนุมัติ · ตีกลับ · ยื่นได้ · รองวดก่อนรับรองเงิน', () => {
  const rows = [
    row(1, { status: 'confirmed', actualStatus: 'approved' }),
    row(2, { status: 'reported', actualStatus: 'approved' }),
    row(3, { actualStatus: 'submitted' }),
    row(4, { actualStatus: 'rejected' }),
    row(5),
  ];
  assert.deepEqual(rows.map((r) => installmentActualState(r, ORDER, rows)),
    ['counted', 'counted', 'submitted', 'rejected', 'waiting']);
  const paid = [row(1, { status: 'confirmed', actualStatus: 'approved' }), row(2), row(3)];
  assert.deepEqual(paid.map((r) => installmentActualState(r, ORDER, paid)), ['counted', 'ready', 'waiting']);
  // ใบทั้งใบ · ใบที่ไม่ได้อนุมัติอยู่ · ใบที่ถูกแทน = null
  assert.equal(installmentActualState(paid[1], { ...ORDER, actualMode: 'order' }, paid), null);
  assert.equal(installmentActualState(paid[1], { ...ORDER, status: 'approval_revoked' }, paid), null);
  assert.equal(installmentActualState(paid[1], { ...ORDER, supersededById: 'SO-2' }, paid), null);
  assert.equal(installmentActualState(null, ORDER, paid), null);
});

/* 🐞 review รอบห้า 27/10: ตัวหยุดยอดล้มตอนอนุมัติ (งวด frozenAt ว่าง) — งวด 1 เคยขึ้น "ยื่นขอนับได้" ข้างปุ่มยื่นที่ดับด้วย
   INSTALLMENT_ACTUAL_UNFROZEN (ป้ายกับปุ่มขัดกัน · ชวนยื่นงวดที่ปุ่มกู้จะนับเอง) */
test('installmentActualState: ใบที่มีงวดยังไม่ตรึง = "รอ AE Sup ตรึงงวด" (ไม่ใช่ยื่นขอนับได้) · ตรงกับด่านยื่นและ nextSubmittableInstallment', () => {
  const owner = { id: 'u-owner', role: 'ae' };
  const order = { ...ORDER, deal: { ownerId: 'u-owner' } };
  const unfrozen = [row(1, { frozenAt: null }), row(2, { frozenAt: null })];
  assert.deepEqual(unfrozen.map((r) => installmentActualState(r, order, unfrozen)), ['unfrozen', 'waiting']);
  assert.equal(ACTUAL_STATE_LABELS[installmentActualState(unfrozen[0], order, unfrozen)], 'รอ AE Sup ตรึงงวด');
  assert.equal(nextSubmittableInstallment(order, unfrozen), null, 'เลนเจ้าของดีลไม่ชวนยื่น');
  assert.ok(installmentActualActionError(unfrozen[0], 'actual_submit', owner, { order, rows: unfrozen }), 'ปุ่มยื่นดับ');
  // ตีกลับไว้แล้ว + ใบมีงวดไม่ตรึง = ป้ายเดียวกัน (ยื่นใหม่ไม่ได้จนปุ่มกู้) · ตรึงครบ = 'ready'/'rejected' ตามเดิม
  const rejected = [row(1, { frozenAt: '2026-10-26T03:00:00Z', actualStatus: 'rejected' }), row(2, { frozenAt: null })];
  assert.equal(installmentActualState(rejected[0], order, rejected), 'unfrozen');
  const frozen = unfrozen.map((r) => ({ ...r, frozenAt: '2026-10-26T03:00:00Z' }));
  assert.deepEqual(frozen.map((r) => installmentActualState(r, order, frozen)), ['ready', 'waiting']);
  // แถวที่ไม่พกคอลัมน์ frozenAt = ถือว่าตรึงแล้ว (ไม่เดาว่าติด)
  const noColumn = [row(1), row(2)];
  assert.equal(installmentActualState(noColumn[0], order, noColumn), 'ready');
});

test('installmentPreviousConfirmed: ทุกงวดเลขน้อยกว่าต้อง confirmed (งวดคืนเงินแล้วยัง confirmed ในฐาน)', () => {
  const rows = [row(1, { status: 'confirmed', refundedAt: '2026-10-01T00:00:00Z' }), row(2, { status: 'reported' }), row(3)];
  assert.equal(installmentPreviousConfirmed(rows[0], rows), true, 'งวดแรกไม่มีงวดก่อนหน้า');
  assert.equal(installmentPreviousConfirmed(rows[1], rows), true);
  assert.equal(installmentPreviousConfirmed(rows[2], rows), false, 'งวด 2 แค่แจ้ง ยังไม่รับรอง');
  assert.equal(installmentPreviousConfirmed(rows[2], null), true, 'ไม่ส่งงวด = ไม่มีอะไรกั้น');
});

test('nextSubmittableInstallment: งวดเลขน้อยสุดที่ยื่นได้ (รวมงวดที่ถูกตีกลับ) · ไม่มีเมื่อรองวดก่อน', () => {
  const rows = [row(1, { status: 'confirmed', actualStatus: 'approved' }), row(2, { actualStatus: 'rejected' }), row(3)];
  assert.equal(nextSubmittableInstallment(ORDER, rows)?.seq, 2);
  const ready = [row(1, { status: 'confirmed', actualStatus: 'approved' }), row(2), row(3)];
  assert.equal(nextSubmittableInstallment(ORDER, ready)?.seq, 2);
  const waiting = [row(1, { status: 'reported', actualStatus: 'approved' }), row(2), row(3)];
  assert.equal(nextSubmittableInstallment(ORDER, waiting), null);
  // งวดถูกตีกลับแต่บัญชีถอนคำรับรองงวดก่อน — ยื่นใหม่ไม่ได้ (RPC ตีกลับด้วย previous_unconfirmed)
  const unconfirmed = [row(1, { status: 'reported', actualStatus: 'approved' }), row(2, { actualStatus: 'rejected' })];
  assert.equal(nextSubmittableInstallment(ORDER, unconfirmed), null);
  assert.equal(nextSubmittableInstallment({ ...ORDER, actualMode: 'order' }, ready), null);
});

test('installmentActualProgress: x/y งวดของรางขั้น "นับ Actual" · ใบทั้งใบ = null', () => {
  assert.deepEqual(installmentActualProgress(ORDER, ROWS), { counted: 1, total: 3, countedAmount: 50000, complete: false });
  const done = ROWS.map((r) => ({ ...r, actualStatus: 'approved', actualAmount: 10 }));
  assert.equal(installmentActualProgress(ORDER, done).complete, true);
  assert.deepEqual(installmentActualProgress(ORDER, []), { counted: 0, total: 0, countedAmount: 0, complete: false });
  assert.equal(installmentActualProgress({ ...ORDER, actualMode: 'order' }, ROWS), null);
});

/* ── 10. เลนรอฉันลงมือ ─────────────────────────────────────────────────────────────────────────────────────── */
test('เลนผู้อนุมัติ: งวดที่คนอื่นยื่น · ของตัวเองไม่นับ ยกเว้น admin · ไม่ใช่ผู้อนุมัติ/ใบทั้งใบ = ไม่นับ', () => {
  assert.equal(installmentActualAwaitingReview(ORDER, ROWS, { userId: 'U-SUP', role: 'ae_supervisor' }), true);
  /* 🐞 review 26/10: บัญชีถอนคำรับรองงวด 1 หลังงวด 2 ยื่นแล้ว — อนุมัติไม่ได้ (previous_unconfirmed) ⇒ ไม่ใช่งานในคิว/ป้ายของผู้อนุมัติ */
  const unconfirmed = ROWS.map((r) => (r.seq === 1 ? { ...r, status: 'reported' } : r));
  assert.equal(installmentActualAwaitingReview(ORDER, unconfirmed, { userId: 'U-SUP', role: 'ae_supervisor' }), false);
  const selfSubmitted = ROWS.map((r) => (r.seq === 2 ? { ...r, actualSubmittedById: 'U-SUP' } : r));
  assert.equal(installmentActualAwaitingReview(ORDER, selfSubmitted, { userId: 'U-SUP', role: 'ae_supervisor' }), false);
  assert.equal(installmentActualAwaitingReview(ORDER, selfSubmitted, { userId: 'U-SUP', role: 'admin' }), true);
  assert.equal(installmentActualAwaitingReview(ORDER, ROWS, { userId: 'U-AE', role: 'ae' }), false);
  assert.equal(installmentActualAwaitingReview(ORDER, ROWS, { userId: 'U-X', role: 'ae', reviewer: true }), true,
    'ผู้เรียกส่ง reviewer มาเองได้ (ทะเบียน/ป้ายคิดจากตัวเดียวกัน)');
  assert.equal(installmentActualAwaitingReview(ORDER, ROWS, { userId: '', role: 'ae_supervisor' }), false, 'ไม่รู้ตัวตน = ไม่เดา');
  assert.equal(installmentActualAwaitingReview({ ...ORDER, actualMode: 'order' }, ROWS, { userId: 'U-SUP', role: 'ae_supervisor' }), false);
  assert.equal(installmentActualAwaitingReview({ ...ORDER, status: 'cancelled' }, ROWS, { userId: 'U-SUP', role: 'ae_supervisor' }), false);
  assert.equal(installmentActualAwaitingReview(ORDER, [], { userId: 'U-SUP', role: 'ae_supervisor' }), false);
});

test('เลนเจ้าของดีลปัจจุบัน: มีงวดยื่นได้ · คนอื่น/ไม่มีดีล/รองวดก่อน = ไม่นับ', () => {
  const ready = [row(1, { status: 'confirmed', actualStatus: 'approved' }), row(2)];
  assert.equal(installmentActualReadyForOwner(ORDER, ready, { userId: 'U-AE' }), true);
  assert.equal(installmentActualReadyForOwner(ORDER, ready, { userId: 'U-AE2' }), false);
  assert.equal(installmentActualReadyForOwner({ ...ORDER, deal: null }, ready, { userId: 'U-AE' }), false);
  assert.equal(installmentActualReadyForOwner(ORDER, ready, { userId: '' }), false);
  assert.equal(installmentActualReadyForOwner(ORDER, ROWS, { userId: 'U-AE' }), false, 'งวด 2 ยื่นอยู่ · งวด 3 รองวด 2');
});

test('เลนเจ้าของดีล: งวดที่ยังไม่ถึงเดือนครบกำหนดไม่ค้างในป้าย · ตีกลับ/เลยกำหนด/ไม่มีวันครบกำหนด = นับ (เดือนไทย)', () => {
  const confirmed1 = row(1, { status: 'confirmed', actualStatus: 'approved' });
  const lane = (r2, thisMonth) => installmentActualReadyForOwner(ORDER, [confirmed1, r2], { userId: 'U-AE', thisMonth });
  // ใบบริการ 12 งวด: งวด 2 ครบกำหนดเดือนหน้า — ยื่นได้ (ปุ่ม) แต่ยังไม่ใช่งานของเดือนนี้
  assert.equal(lane(row(2, { dueDate: '2026-11-15' }), '2026-10'), false);
  assert.equal(lane(row(2, { dueDate: '2026-11-15' }), '2026-11'), true, 'ถึงเดือนครบกำหนด');
  assert.equal(lane(row(2, { dueDate: '2026-09-15' }), '2026-10'), true, 'เลยกำหนด');
  assert.equal(lane(row(2, { dueDate: null }), '2026-10'), true, 'ไม่มีวันครบกำหนด');
  assert.equal(lane(row(2, { dueDate: '2026-12-15', actualStatus: 'rejected' }), '2026-10'), true, 'ตีกลับ = รอแก้เสมอ');
  // ค่าตั้งต้นเดือน = เดือนไทยปัจจุบัน — งวดไกล ๆ ไม่นับ
  assert.equal(installmentActualReadyForOwner(ORDER, [confirmed1, row(2, { dueDate: '2999-01-01' })], { userId: 'U-AE' }), false);
  // ปุ่มยื่นไม่ดูวันครบกำหนด (RPC ไม่กัน) — ยังเป็นงวดถัดไปที่ยื่นได้
  assert.equal(nextSubmittableInstallment(ORDER, [confirmed1, row(2, { dueDate: '2999-01-01' })])?.seq, 2);
});

/* ── 11. ด่านยื่น/ดึงกลับ/อนุมัติ/ตีกลับ — กติกาเดียวกับ RPC ──────────────────────────────────────────────────── */
const READY_ROWS = [row(1, { status: 'confirmed', actualStatus: 'approved' }), row(2), row(3)];
const SUBMITTED_ROWS = [row(1, { status: 'confirmed', actualStatus: 'approved' }),
  row(2, { actualStatus: 'submitted', actualSubmittedById: 'U-AE' }), row(3)];
const gate = (r, action, user, extra = {}) => installmentActualActionError(r, action, user, { order: ORDER, rows: READY_ROWS, ...extra });
const E = (code) => workflowErrorMessage(code);

test('ด่านร่วม: ใบต้องเป็นรายงวด + อนุมัติแล้ว + ไม่ถูกแทน + pipeline · คำสั่งไม่รู้จัก/ไม่พบงวด', () => {
  assert.equal(gate(READY_ROWS[1], 'actual_submit', AE, { order: { ...ORDER, actualMode: 'order' } }), E('installment_actual_order_not_installment'));
  for (const status of ALL_STATUSES.filter((s) => s !== 'approved')) {
    assert.equal(gate(READY_ROWS[1], 'actual_submit', AE, { order: { ...ORDER, status } }), E('installment_actual_order_not_approved'), status);
  }
  // ใบที่กลับเป็นร่าง (ฐานคืน actualMode เป็น order แล้ว) ต้องได้ "ยังไม่อนุมัติ" ไม่ใช่ "นับทั้งใบ"
  assert.equal(gate(READY_ROWS[1], 'actual_submit', AE, { order: { ...ORDER, status: 'draft', actualMode: 'order' } }), E('installment_actual_order_not_approved'));
  assert.equal(gate(READY_ROWS[1], 'actual_submit', AE, { order: { ...ORDER, supersededById: 'SO-2' } }), E('installment_actual_order_not_approved'));
  // ลำดับเดียวกับ RPC: ใบที่ไม่ใช่ pipeline ตกข้อ "ยังไม่อนุมัติ" ก่อนข้อแบบการนับ · ไม่ส่งใบ = ไม่เดาว่าผ่าน
  assert.equal(gate(READY_ROWS[1], 'actual_submit', AE, { order: { ...ORDER, origin: 'historical' } }), E('installment_actual_order_not_approved'));
  assert.equal(gate(READY_ROWS[1], 'actual_submit', AE, { order: null }), E('installment_actual_order_not_approved'));
  assert.equal(gate(null, 'actual_submit', AE), E('installment_actual_not_found'));
  assert.equal(gate(READY_ROWS[1], 'actual_nope', ADMIN), 'คำสั่งไม่ถูกต้อง');
  // ชื่อคำสั่งของ RPC ตรง ๆ ก็ได้
  assert.equal(gate(READY_ROWS[1], 'submit', AE), null);
});

test('ยื่นขอนับ: เจ้าของดีลปัจจุบันหรือผู้อนุมัติ · ยังไม่ยื่น/ถูกตีกลับ · งวดก่อนหน้ารับรองเงินครบ', () => {
  assert.equal(gate(READY_ROWS[1], 'actual_submit', AE), null);
  assert.equal(gate(READY_ROWS[1], 'actual_submit', SUP), null, 'ผู้อนุมัติยื่นแทนได้');
  assert.equal(gate(READY_ROWS[1], 'actual_submit', ADMIN), null);
  assert.equal(gate(READY_ROWS[1], 'actual_submit', OTHER_AE), E('installment_actual_forbidden'));
  assert.equal(gate(READY_ROWS[1], 'actual_submit', FN), E('installment_actual_forbidden'));
  assert.equal(gate(READY_ROWS[1], 'actual_submit', OTHER_AE, { dealOwnerId: 'U-AE2' }), null, 'dealOwnerId ที่ส่งมาชนะ deal บนใบ');
  assert.equal(gate(READY_ROWS[2], 'actual_submit', AE), E('installment_actual_previous_unconfirmed'));
  assert.equal(gate({ ...READY_ROWS[1], actualStatus: 'rejected' }, 'actual_submit', AE), null, 'ตีกลับแล้วยื่นใหม่ได้');
  assert.equal(gate({ ...READY_ROWS[1], actualStatus: 'submitted' }, 'actual_submit', AE), E('installment_actual_bad_state'));
  assert.equal(gate(READY_ROWS[0], 'actual_submit', AE), E('installment_actual_bad_state'), 'นับแล้วยื่นซ้ำไม่ได้');
  // งวดแรกยื่นได้เสมอ (ไม่มีงวดก่อนหน้า) — เช่นใบที่ start ล้มแล้วยังไม่ได้นับงวด 1
  assert.equal(gate(row(1), 'actual_submit', AE, { rows: [row(1), row(2)] }), null);
});

test('ดึงกลับ: ผู้ยื่นเองหรือ admin · เฉพาะงวดที่ยื่นอยู่', () => {
  const opts = { rows: SUBMITTED_ROWS };
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_withdraw', AE, opts), null);
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_withdraw', ADMIN, opts), null);
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_withdraw', SUP, opts), E('installment_actual_forbidden'), 'ผู้อนุมัติใช้ตีกลับ ไม่ใช่ดึงกลับ');
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_withdraw', OTHER_AE, opts), E('installment_actual_forbidden'));
  assert.equal(gate({ ...SUBMITTED_ROWS[1], actualStatus: 'approved' }, 'actual_withdraw', AE, opts), E('installment_actual_bad_state'));
  assert.equal(gate({ ...SUBMITTED_ROWS[1], actualStatus: null }, 'actual_withdraw', ADMIN, opts), E('installment_actual_bad_state'));
  // ลำดับเดียวกับ RPC: สถานะก่อนสิทธิ์
  assert.equal(gate({ ...SUBMITTED_ROWS[1], actualStatus: null }, 'actual_withdraw', OTHER_AE, opts), E('installment_actual_bad_state'));
});

test('อนุมัติงวด: ผู้อนุมัติ · ยื่นอยู่ · ไม่ใช่ผู้ยื่น (admin ได้) · งวดก่อนหน้ารับรองเงินครบ', () => {
  const opts = { rows: SUBMITTED_ROWS };
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_approve', SUP, opts), null);
  for (const role of ['commercial_manager', 'commercial_director', 'admin']) {
    assert.equal(gate(SUBMITTED_ROWS[1], 'actual_approve', { id: 'U-M', role }, opts), null, role);
  }
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_approve', AE, opts), E('installment_actual_forbidden'));
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_approve', { id: 'U-ACS', role: 'ac_supervisor' }, opts), E('installment_actual_forbidden'));
  const bySup = { ...SUBMITTED_ROWS[1], actualSubmittedById: 'U-SUP' };
  assert.equal(gate(bySup, 'actual_approve', SUP, opts), E('installment_actual_self_approval'));
  assert.equal(gate({ ...bySup, actualSubmittedById: 'U-ADM' }, 'actual_approve', ADMIN, opts), null, 'admin อนุมัติของตัวเองได้');
  assert.equal(gate({ ...SUBMITTED_ROWS[1], actualStatus: 'rejected' }, 'actual_approve', SUP, opts), E('installment_actual_bad_state'));
  const unpaidBefore = [row(1, { status: 'reported', actualStatus: 'approved' }), SUBMITTED_ROWS[1]];
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_approve', SUP, { rows: unpaidBefore }), E('installment_actual_previous_unconfirmed'));
});

test('ตีกลับงวด: ผู้อนุมัติ · ยื่นอยู่ · เหตุผล 10–500 ตัวอักษร (ตัดช่องว่างหัวท้าย)', () => {
  const opts = { rows: SUBMITTED_ROWS };
  const ok = 'ยังไม่ได้ส่งของงวดนี้';
  assert.ok(ok.length >= 10);
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_reject', SUP, { ...opts, reason: ok }), null);
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_reject', SUP, { ...opts, reason: '   สั้นไป   ' }), E('installment_actual_reason_required'));
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_reject', SUP, { ...opts, reason: 'ก'.repeat(501) }), E('installment_actual_reason_required'));
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_reject', SUP, { ...opts, reason: 'ก'.repeat(500) }), null);
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_reject', SUP, opts), E('installment_actual_reason_required'));
  assert.equal(gate(SUBMITTED_ROWS[1], 'actual_reject', AE, { ...opts, reason: ok }), E('installment_actual_forbidden'));
  // ผู้ยื่นที่เป็นผู้อนุมัติตีกลับของตัวเองได้ (RPC ไม่กันข้อนี้ — กันแค่การอนุมัติ)
  assert.equal(gate({ ...SUBMITTED_ROWS[1], actualSubmittedById: 'U-SUP' }, 'actual_reject', SUP, { ...opts, reason: ok }), null);
  assert.equal(gate(READY_ROWS[1], 'actual_reject', SUP, { reason: ok }), E('installment_actual_bad_state'));
  assert.equal(installmentActualReasonError(ok), null);
  assert.equal(installmentActualReasonError(''), E('installment_actual_reason_required'));
});

test('ข้อความของด่านคือข้อความของรหัสฐาน — ปุ่มกับ API พูดคำเดียวกัน', () => {
  assert.equal(E('installment_actual_forbidden'), 'ไม่มีสิทธิ์ทำรายการนี้กับงวด');
  assert.equal(INSTALLMENT_ACTUAL_CONFIRM_BLOCKED, 'งวดนี้ยังไม่ได้อนุมัตินับ Actual — รอ AE Sup อนุมัตินับงวดนี้ก่อน บัญชีจึงรับรองเงินได้');
});

/* ── 12. นับที่เหลือทั้งหมด · ด่านเงิน ─────────────────────────────────────────────────────────────────────── */
test('countRestBlocker: ผู้อนุมัติเท่านั้น (ไม่มีสิทธิ์ = ซ่อน) · ใบรายงวดที่อนุมัติอยู่ · นับครบแล้ว = โชว์แล้วบอกเหตุ', () => {
  assert.deepEqual(countRestBlocker(ORDER, ROWS, SUP), { visible: true, blocker: null });
  assert.equal(countRestBlocker(ORDER, ROWS, AE).visible, false);
  assert.deepEqual(countRestBlocker({ ...ORDER, actualMode: 'order' }, ROWS, SUP),
    { visible: false, blocker: E('installment_actual_order_not_installment') });
  assert.deepEqual(countRestBlocker({ ...ORDER, status: 'approval_revoked' }, ROWS, SUP),
    { visible: false, blocker: E('installment_actual_order_not_approved') });
  assert.equal(countRestBlocker({ ...ORDER, supersededById: 'SO-2' }, ROWS, SUP).visible, false);
  assert.equal(countRestBlocker(null, ROWS, SUP).visible, false);
  const done = ROWS.map((r) => ({ ...r, actualStatus: 'approved', actualAmount: 1 }));
  /* นับครบแล้ว = ข่าวดี — ทักโทนแจ้ง ไม่ใช่ toast แดง (UAT 27/10 ข้อ 11 · GatedAction blockerKind) */
  assert.deepEqual(countRestBlocker(ORDER, done, ADMIN), { visible: true, blocker: 'นับ Actual ครบทุกงวดแล้ว', kind: 'info' });
  /* 🐞 review รอบสอง 26/10: ใบรายงวดที่ยังไม่มีงวดเลย (ตัวหยุดยอดล้มหลังอนุมัติ · Actual 0) เคยบอก "นับครบทุกงวดแล้ว" */
  const empty = countRestBlocker({ ...ORDER, actualCountedAmount: 0, actualSubmittedAmount: 0 }, [], SUP);
  assert.deepEqual(empty, { visible: true, blocker: COUNT_REST_NO_ROWS });
  assert.doesNotMatch(empty.blocker, /ครบ/);
  assert.match(empty.blocker, /เริ่มติดตามการชำระ/);
  assert.match(empty.blocker, /นับงวด 1/);
  assert.deepEqual(countRestBlocker(ORDER, null, SUP), { visible: true, blocker: COUNT_REST_NO_ROWS }, 'ไม่ส่งงวด = ไม่มีงวด');
});

test('installmentActualPaymentGated: ใบรายงวด + งวดยังไม่อนุมัติ (ตรงกับ trigger) · ใบยกเลิกไม่ติด', () => {
  assert.equal(installmentActualPaymentGated(ROWS[1], { order: ORDER }), true);
  assert.equal(installmentActualPaymentGated(ROWS[0], { order: ORDER }), false);
  assert.equal(installmentActualPaymentGated(ROWS[1], { order: { ...ORDER, status: 'approval_revoked' } }), true, 'ย้อนอนุมัติ = ยังกัน (งวดย้ายไป Rev.)');
  /* 🐞 review 26/10: ใบยกเลิก — ไม่มีใครอนุมัตินับงวดของใบนั้นได้ ⇒ ถ้ายังกัน งวดที่จ่ายมาแล้วรับรอง/คืนเงินไม่ได้ (ทางตัน 23/09 D4) */
  assert.equal(installmentActualPaymentGated(ROWS[1], { order: { ...ORDER, status: 'cancelled' } }), false, 'ใบยกเลิก = ไม่ติดด่าน');
  assert.equal(installmentActualPaymentGated(ROWS[1], { order: { ...ORDER, actualMode: 'order' } }), false);
  assert.equal(installmentActualPaymentGated(ROWS[1], { actualMode: 'installment' }), true, 'ส่งแค่ actualMode ได้');
  assert.equal(installmentActualPaymentGated(ROWS[1], {}), false, 'ไม่บอกแบบ = ทั้งใบ');
  assert.equal(installmentActualPaymentGated(null, { order: ORDER }), false);
});

/* 🐞 review 26/10: เหตุของปุ่มบัญชีที่ดับต้องบอกคนที่ต้องทำต่อ — ยังไม่ยื่นเคยชี้ "รอ AE Sup" ทั้งที่ AE Sup ไม่มีอะไรในคิว */
test('installmentActualLockReason: ยื่นแล้ว = รอ AE Sup (คำของ trigger) · ยังไม่ยื่น/ตีกลับ = รอฝ่ายขายยื่น', () => {
  assert.equal(installmentActualLockReason({ actualStatus: 'submitted' }), INSTALLMENT_ACTUAL_CONFIRM_BLOCKED);
  assert.match(installmentActualLockReason({ actualStatus: null }), /^งวดนี้ยังไม่ได้ยื่นขอนับ Actual — รอฝ่ายขายยื่นขอนับงวดนี้/);
  assert.match(installmentActualLockReason({}), /รอฝ่ายขายยื่นขอนับงวดนี้/);
  assert.match(installmentActualLockReason({ actualStatus: 'rejected' }), /^AE Sup ตีกลับคำขอนับงวดนี้ — รอฝ่ายขายยื่นขอนับใหม่/);
  for (const status of [null, 'rejected', 'submitted']) {
    assert.match(installmentActualLockReason({ actualStatus: status }), /บัญชีจึงรับรองเงินได้$/);
  }
});

/* 🐞 review รอบสอง 26/10: ใบรายงวดที่ย้อนอนุมัติ — ด่านยังติด แต่ยื่น/อนุมัติงวดบนใบนี้ไม่ได้แล้ว (RPC ต้องใบ approved)
   เหตุเดิมบอก "รอฝ่ายขายยื่น แล้ว AE Sup อนุมัติ" = ทางที่ไม่มีจริง · ทางเดียวคือออก Rev. */
test('installmentActualLockReason: ใบที่ย้อนอนุมัติ = บอกทางออก Rev. ไม่ใช่รอยื่น/รออนุมัติ (ทั้งส่งใบ และแถวทะเบียนที่พก orderStatus)', () => {
  const revoked = { ...ORDER, status: 'approval_revoked' };
  for (const status of [null, 'rejected', 'submitted']) {
    const reason = installmentActualLockReason({ actualStatus: status }, revoked);
    assert.equal(reason, INSTALLMENT_ACTUAL_REVOKED_LOCK);
    assert.doesNotMatch(reason, /รอฝ่ายขายยื่น|รอ AE Sup อนุมัติ/);
    assert.match(reason, /Rev\./);
    assert.equal(installmentActualLockReason({ actualStatus: status, orderStatus: 'approval_revoked' }), INSTALLMENT_ACTUAL_REVOKED_LOCK);
  }
  // ด่านของ RPC ยืนยันว่ายื่น/อนุมัติบนใบนี้ไม่ได้จริง (คำที่จอเคยสั่งให้รอ)
  assert.equal(installmentActualActionError(ROWS[2], 'actual_submit', AE, { order: revoked, rows: ROWS }), E('installment_actual_order_not_approved'));
  assert.equal(installmentActualActionError(ROWS[1], 'actual_approve', SUP, { order: revoked, rows: ROWS }), E('installment_actual_order_not_approved'));
  // ใบที่อนุมัติอยู่ = คำเดิม
  assert.match(installmentActualLockReason({ actualStatus: null }, ORDER), /รอฝ่ายขายยื่นขอนับงวดนี้/);
  assert.equal(installmentActualLockReason({ actualStatus: 'submitted', orderStatus: 'approved' }), INSTALLMENT_ACTUAL_CONFIRM_BLOCKED);
});

test('ข้อความ previous_unconfirmed ใช้ได้ทั้งคนยื่นและผู้อนุมัติ (ปุ่มอนุมัติที่ดับในแผงโชว์คำนี้)', () => {
  assert.equal(INSTALLMENT_ACTUAL_PREVIOUS_UNCONFIRMED, E('installment_actual_previous_unconfirmed'));
  assert.match(INSTALLMENT_ACTUAL_PREVIOUS_UNCONFIRMED, /ยื่นหรืออนุมัติงวดนี้ได้หลังบัญชีรับรองงวดก่อน/);
  const unpaid = ROWS.map((r) => (r.seq === 1 ? { ...r, status: 'reported' } : r));
  assert.equal(installmentActualActionError(unpaid[1], 'actual_approve', SUP, { order: ORDER, rows: unpaid }), INSTALLMENT_ACTUAL_PREVIOUS_UNCONFIRMED);
});

/* ── UAT FN 27/10 ข้อ 3 + 6: งวดก่อนหน้ายังไม่รับรอง — บัญชีกับ AE Sup ต้องไม่ชี้กันไปมา · คำสั้นของช่องสถานะ ─────────────────────── */
test('installmentActualPreviousOpen: งวดก่อนหน้าตัวแรกที่ยังไม่รับรองเงิน + สถานะเงิน + นับแล้วไหม (ด่านเดียวกับ installmentPreviousConfirmed)', () => {
  const rows = [
    row(1, { status: 'reported', actualStatus: 'approved', actualAmount: 50000 }),
    row(2, { status: 'pending', actualStatus: 'submitted' }),
    row(3, { status: 'reported' }),
  ];
  assert.deepEqual(installmentActualPreviousOpen(rows[1], rows), { seq: 1, status: 'reported', counted: true, actualStatus: 'approved' });
  assert.deepEqual(installmentActualPreviousOpen(rows[2], rows), { seq: 1, status: 'reported', counted: true, actualStatus: 'approved' }, 'เลขน้อยสุดก่อน');
  assert.equal(installmentActualPreviousOpen(rows[0], rows), null);
  for (const r of rows) assert.equal(installmentActualPreviousOpen(r, rows) === null, installmentPreviousConfirmed(r, rows));
  assert.deepEqual(installmentActualPreviousOpen(ROWS[2], ROWS), { seq: 2, status: 'pending', counted: false, actualStatus: 'submitted' });
});

test('installmentActualHold: งวดที่ยื่นแล้วแต่งวดก่อนหน้าถูกถอนคำรับรอง = งานของบัญชี (prev_confirm) — ตรงกับด่านอนุมัติของ AE Sup', () => {
  const rows = [
    row(1, { status: 'reported', actualStatus: 'approved', actualAmount: 50000 }),
    row(2, { status: 'reported', actualStatus: 'submitted', actualSubmittedById: 'U-AE' }),
  ];
  // ด่านของ RPC: AE Sup อนุมัติงวด 2 ไม่ได้
  assert.equal(installmentActualActionError(rows[1], 'actual_approve', SUP, { order: ORDER, rows }), INSTALLMENT_ACTUAL_PREVIOUS_UNCONFIRMED);
  // ⇒ บัญชีต้องไม่ได้ "รอ AE Sup อนุมัติ" — ก้าวถัดไปคือบัญชีรับรองงวด 1 เอง
  assert.deepEqual(installmentActualHold(rows[1], ORDER, { rows }), { kind: 'prev_confirm', seq: 1, submitted: true });
  const reason = installmentActualLockReason(rows[1], ORDER, { rows });
  assert.equal(reason, 'งวด 1 ยังไม่ได้รับรองเงิน — บัญชีรับรองเงินงวด 1 ก่อน AE Sup จึงอนุมัติงวดนี้ได้ บัญชีจึงรับรองเงินงวดนี้ได้');
  assert.notEqual(reason, INSTALLMENT_ACTUAL_CONFIRM_BLOCKED);
  assert.equal(installmentActualLockShort(rows[1], ORDER, { rows }), 'รอบัญชีรับรองงวด 1 ก่อน');
  // ฝั่ง AE Sup: บอกงวดและคนที่ต้องทำ (บัญชี) ไม่ใช่คำกลาง
  const wait = installmentActualApproveWait(rows[1], rows);
  assert.equal(wait.text, 'งวด 1 ยังไม่ได้รับรองเงิน — บัญชีรับรองเงินงวด 1 ก่อน จึงอนุมัติงวดนี้ได้');
  assert.equal(wait.short, 'รอบัญชีรับรองงวด 1 ก่อน');
  // งวดก่อนหน้ายังไม่แจ้งชำระ/ถูกตีกลับ = ฝ่ายขายแจ้งสลิปก่อน · แจ้งแล้วแต่ยังไม่นับ = ต้องนับก่อน
  const unpaid = [{ ...rows[0], status: 'rejected' }, rows[1]];
  assert.equal(installmentActualHold(unpaid[1], ORDER, { rows: unpaid }).kind, 'prev_payment');
  assert.match(installmentActualLockReason(unpaid[1], ORDER, { rows: unpaid }), /— ฝ่ายขายแจ้งสลิปงวด 1 และบัญชีรับรองก่อน AE Sup จึงอนุมัติงวดนี้ได้/);
  assert.match(installmentActualApproveWait(unpaid[1], unpaid).text, /ฝ่ายขายแจ้งสลิปงวด 1 และบัญชีรับรองก่อน จึงอนุมัติงวดนี้ได้$/);
  const uncounted = [{ ...rows[0], actualStatus: null }, rows[1]];
  assert.equal(installmentActualHold(uncounted[1], ORDER, { rows: uncounted }).kind, 'prev_count');
  // ยังไม่ยื่น + งวดก่อนหน้ายังไม่รับรอง = ยื่นได้หลังจากนั้น (คนยื่นคือฝ่ายขาย)
  const notYet = [rows[0], { ...rows[1], actualStatus: null }];
  assert.match(installmentActualLockReason(notYet[1], ORDER, { rows: notYet }), /บัญชีรับรองเงินงวด 1 ก่อน ฝ่ายขายจึงยื่นขอนับงวดนี้ได้ แล้ว AE Sup อนุมัติ บัญชีจึงรับรองเงินงวดนี้ได้$/);
  // งวดก่อนหน้ารับรองครบ = คำเดิม (ยื่นแล้ว = ข้อความของ trigger · ยังไม่ยื่น = รอฝ่ายขายยื่น)
  const fine = [{ ...rows[0], status: 'confirmed' }, rows[1]];
  assert.equal(installmentActualLockReason(fine[1], ORDER, { rows: fine }), INSTALLMENT_ACTUAL_CONFIRM_BLOCKED);
  assert.equal(installmentActualLockShort(fine[1], ORDER, { rows: fine }), 'รอ AE Sup อนุมัตินับงวดนี้');
  // แถวทะเบียน: ค่าที่ประทับมา (actualPreviousOpen) ใช้แทน rows
  assert.equal(installmentActualLockReason({ ...rows[1], actualPreviousOpen: { seq: 1, status: 'reported', counted: true, actualStatus: 'approved' } }), reason);
  // ใบย้อนอนุมัติ / นับที่เหลือทั้งหมดแล้ว ชนะเรื่องงวดก่อนหน้า
  assert.equal(installmentActualHold(rows[1], { status: 'approval_revoked' }, { rows }).kind, 'revoked');
  assert.equal(installmentActualHold(notYet[1], ORDER, { rows: notYet, countRestDone: true }).kind, 'count_rest');
});

/* 🐞 review รอบหก 27/10: งวดก่อนหน้า **ยังไม่นับ** + ยังไม่แจ้งชำระ/บัญชีตีกลับ — แจ้งสลิปงวดนั้นติดด่าน REPORT_BLOCKED ⇒ ก้าวแรกต้องเป็น
   "ยื่นขอนับงวดนั้น" (ยื่นแล้ว = AE Sup อนุมัติ) ไม่ใช่ "ฝ่ายขายแจ้งสลิปงวด k" ที่กดไม่ได้ (สภาพจริง: งวด 3 จ่ายก่อนอนุมัติใบ → อนุมัติย้ายเป็น
   'reported' ยังไม่นับ ขณะที่งวด 2 pending/rejected ยังไม่นับ) */
test('installmentActualHold: งวดก่อนหน้ายังไม่นับและยังไม่แจ้งชำระ = prev_submit (ยื่นขอนับงวดนั้นก่อน) — ไม่ชี้ไปทางแจ้งสลิปที่ติดด่าน', () => {
  for (const prevStatus of ['pending', 'rejected']) {
    const rows = [
      row(1, { amount: 53500, status: 'confirmed', actualStatus: 'approved', actualAmount: 50000 }),
      row(2, { amount: 32100, status: prevStatus }),
      row(3, { amount: 21400, status: 'reported', paidOn: '2026-10-01' }),
    ];
    // ก้าวที่คำเดิมชี้ (แจ้งสลิปงวด 2) ติดด่านจริง — ทางที่เปิดคือยื่นขอนับ
    assert.equal(installmentActionError(rows[1], 'report', AE, { order: ORDER, rows, paidOn: '2026-10-20' }), INSTALLMENT_ACTUAL_REPORT_BLOCKED);
    assert.equal(installmentActualActionError(rows[1], 'actual_submit', AE, { order: ORDER, rows }), null);
    const hold = installmentActualHold(rows[2], ORDER, { rows });
    assert.deepEqual(hold, { kind: 'prev_submit', seq: 2, submitted: false, prevSubmitted: false }, prevStatus);
    const reason = installmentActualLockReason(rows[2], ORDER, { rows });
    assert.equal(reason, 'งวด 2 ยังไม่ได้รับรองเงิน — ฝ่ายขายยื่นขอนับงวด 2 → AE Sup อนุมัติ → ฝ่ายขายแจ้งสลิป และบัญชีรับรองก่อน'
      + ' ฝ่ายขายจึงยื่นขอนับงวดนี้ได้ แล้ว AE Sup อนุมัติ บัญชีจึงรับรองเงินงวดนี้ได้');
    assert.doesNotMatch(reason, /— ฝ่ายขายแจ้งสลิปงวด 2/, 'ก้าวแรกไม่ใช่การแจ้งสลิปที่ติดด่าน');
    assert.equal(installmentActualLockShort(rows[2], ORDER, { rows }), 'รองวด 2 ยื่นขอนับก่อน');
    // แถวทะเบียน: ค่าที่ประทับ (actualPreviousOpen) ให้ผลเดียวกัน
    assert.equal(installmentActualLockReason({ ...rows[2], actualPreviousOpen: installmentActualPreviousOpen(rows[2], rows) }), reason);
    // งวด 2 ยื่นแล้ว = งานของ AE Sup (อนุมัติงวด 2) ก่อน
    const sent = rows.map((r) => (r.seq === 2 ? { ...r, actualStatus: 'submitted', actualSubmittedById: 'U-AE' } : r));
    assert.deepEqual(installmentActualHold(sent[2], ORDER, { rows: sent }), { kind: 'prev_submit', seq: 2, submitted: false, prevSubmitted: true });
    assert.match(installmentActualLockReason(sent[2], ORDER, { rows: sent }), /^งวด 2 ยังไม่ได้รับรองเงิน — AE Sup อนุมัตินับงวด 2 แล้วฝ่ายขายแจ้งสลิปและบัญชีรับรองก่อน /);
    assert.equal(installmentActualLockShort(sent[2], ORDER, { rows: sent }), 'รอ AE Sup อนุมัติงวด 2 ก่อน');
    // ฝั่ง AE Sup (งวด 3 ยื่นค้าง): บอกก้าวเดียวกัน
    assert.match(installmentActualApproveWait({ ...rows[2], actualStatus: 'submitted' }, rows).text,
      /— ฝ่ายขายยื่นขอนับงวด 2 → AE Sup อนุมัติ → ฝ่ายขายแจ้งสลิป และบัญชีรับรองก่อน จึงอนุมัติงวดนี้ได้$/);
  }
  // งวดก่อนหน้า **นับแล้ว** แต่ยังไม่ชำระ = ฝ่ายขายแจ้งสลิปได้จริง ⇒ คำเดิม (prev_payment)
  const counted = [
    row(1, { amount: 53500, status: 'pending', actualStatus: 'approved', actualAmount: 50000 }),
    row(2, { amount: 32100, status: 'reported' }),
  ];
  assert.equal(installmentActionError(counted[0], 'report', AE, { order: ORDER, rows: counted, paidOn: '2026-10-20' }), null);
  assert.equal(installmentActualHold(counted[1], ORDER, { rows: counted }).kind, 'prev_payment');
  assert.match(installmentActualLockReason(counted[1], ORDER, { rows: counted }), /— ฝ่ายขายแจ้งสลิปงวด 1 และบัญชีรับรองก่อน/);
});

test('คำสั้นของช่องสถานะ (UAT FN 27/10 ข้อ 6): ทุกเหตุมีคำสั้นที่บอกคนที่ต้องทำต่อ · ไม่เกินช่อง', () => {
  const shorts = [
    installmentActualLockShort({ actualStatus: null }), installmentActualLockShort({ actualStatus: 'rejected' }),
    installmentActualLockShort({ actualStatus: 'submitted' }), installmentActualLockShort({ actualStatus: null, orderStatus: 'approval_revoked' }),
    installmentActualLockShort({ actualStatus: null }, ORDER, { countRestDone: true }),
    installmentActualReportWaitShort({ actualStatus: null }), installmentActualReportWaitShort({ actualStatus: 'submitted' }),
    installmentActualReportWaitShort({ actualStatus: null }, { countRestDone: true }),
    INSTALLMENT_ACTUAL_UNFROZEN_SHORT, INSTALLMENT_ACTUAL_SELF_APPROVAL_SHORT,
  ];
  assert.deepEqual(shorts, [
    'รอฝ่ายขายยื่นขอนับงวดนี้', 'รอฝ่ายขายยื่นขอนับใหม่', 'รอ AE Sup อนุมัตินับงวดนี้', 'รอเจ้าของดีลออก Rev.',
    'รอ AE Sup กด “นับงวดที่ค้าง”', 'รอเจ้าของดีลยื่นขอนับงวดนี้', 'รอ AE Sup อนุมัตินับงวดนี้', 'รอ AE Sup กด “นับงวดที่ค้าง”',
    'รอ AE Sup ตรึงงวด', 'ให้ผู้อนุมัติคนอื่นกด',
  ]);
  for (const text of shorts) assert.ok(text.length <= 30, `${text} สั้นพอสำหรับช่องสถานะ`);
});
