// หน้ารายการดีล + หน้ารายละเอียดดีล — รูของยอดรออนุมัติ/ส่วนต่าง (มติผู้ใช้ 2026-09-14)
//
// fix 2  ยอดรออนุมัติบนหัวกลุ่ม/KPI ต้องคัดด้วยงวดที่หน้าโชว์ (เดือนของมัน = เดือนปัจจุบันเวลาไทย)
// fix 1  คำใต้การ์ด "มูลค่าปิดจริง (Won)" ห้ามขึ้น "ต่าง ฿(FC ทั้งก้อน)" ตอนที่ SO ยังไม่อนุมัติ
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtMoney } from '../format.js';
import {
  WON_HINT_KINDS,
  pendingPeriodMatcher,
  sumDealDisplay,
  wonDealForecastHint,
} from './dealAmountDisplay.js';

// 2026-09-14 15:00 เวลาไทย
const NOW = new Date('2026-09-14T08:00:00Z');
// 2026-09-30 23:30 ไทย = 2026-09-30T16:30Z — เดือนไทยยังเป็น ก.ย. แม้ UTC ยังไม่ข้ามวัน
const LATE_SEPT_THAI = new Date('2026-09-30T16:30:00Z');
// 2026-10-01 00:30 ไทย = 2026-09-30T17:30Z — เดือนไทยข้ามเป็น ต.ค. แล้วแต่ UTC ยังเป็น ก.ย.
const EARLY_OCT_THAI = new Date('2026-09-30T17:30:00Z');

const PENDING_WON = {
  stage: 'won', projectValue: 108000, wonValue: 0, confirmedAt: '2026-08-20T03:00:00Z',
  metadata: { actualSource: 'sale_order', soPendingAmount: 108000, soPendingCount: 1 },
};
const ZERO_BAHT_PENDING_WON = {
  stage: 'won', projectValue: 5000, wonValue: 0,
  metadata: { actualSource: 'sale_order', soPendingAmount: 0, soPendingCount: 1 },
};
const APPROVED_WON = {
  stage: 'won', projectValue: 300000, wonValue: 200000,
  metadata: { actualSource: 'sale_order', wonMonth: '2026-08' },
};
const OPEN = { stage: 'quotation', projectValue: 50000, wonValue: 0, metadata: {} };

/* ── fix 2 · งวดของยอดรออนุมัติ ─────────────────────────────────────────────── */

test('pendingPeriodMatcher: เดือนเดียว = เดือนต้องตรงกัน', () => {
  const inPeriod = pendingPeriodMatcher({ month: '2026-09', allMonths: false });
  assert.equal(inPeriod('2026-09'), true);
  assert.equal(inPeriod('2026-08'), false);
  assert.equal(inPeriod('2026-10'), false);
  assert.equal(inPeriod(null), false, 'ไม่มีเดือน = ไม่มีใบรออนุมัติ');
});

test('pendingPeriodMatcher: ติ๊ก "ทุกเดือน" = ปีเดียวกับเดือนที่เลือก', () => {
  const inPeriod = pendingPeriodMatcher({ month: '2026-03', allMonths: true });
  assert.equal(inPeriod('2026-09'), true);
  assert.equal(inPeriod('2026-01'), true);
  assert.equal(inPeriod('2025-12'), false);
  assert.equal(inPeriod('2027-01'), false);
  assert.equal(inPeriod(null), false);
});

test('pendingPeriodMatcher: "รอเติมข้อมูล" / เดือนอ่านไม่ออก = ไม่กรอง (null)', () => {
  assert.equal(pendingPeriodMatcher({ month: '2026-09', reviewOnly: true }), null);
  assert.equal(pendingPeriodMatcher({ month: '2026-09', allMonths: true, reviewOnly: true }), null);
  assert.equal(pendingPeriodMatcher({ month: '' }), null);
  assert.equal(pendingPeriodMatcher({ month: null, allMonths: true }), null);
  assert.equal(pendingPeriodMatcher(), null);
});

test('sumDealDisplay ไม่ส่ง options = นับยอดรออนุมัติทุกใบตามเดิม (ห้ามถอยหลัง)', () => {
  assert.deepEqual(sumDealDisplay([PENDING_WON, APPROVED_WON, OPEN]), {
    value: 0 + 200000 + 50000,
    pendingApproval: 108000,
    pendingApprovalCount: 1,
  });
});

test('sumDealDisplay({ inPeriod }): เดือนปัจจุบันอยู่ในงวด = นับ · เดือนที่ปิดไปแล้ว = ไม่นับ', () => {
  const deals = [PENDING_WON, ZERO_BAHT_PENDING_WON, APPROVED_WON, OPEN];
  const sept = sumDealDisplay(deals, { inPeriod: pendingPeriodMatcher({ month: '2026-09' }), now: NOW });
  assert.deepEqual(sept, { value: 250000, pendingApproval: 108000, pendingApprovalCount: 2 },
    'ใบ 0 บาทนับจากจำนวนใบ');

  const aug = sumDealDisplay(deals, { inPeriod: pendingPeriodMatcher({ month: '2026-08' }), now: NOW });
  assert.deepEqual(aug, { value: 250000, pendingApproval: 0, pendingApprovalCount: 0 },
    'value ไม่ถูกกรอง — กรองเฉพาะกองรออนุมัติ');

  const year = sumDealDisplay(deals, { inPeriod: pendingPeriodMatcher({ month: '2026-01', allMonths: true }), now: NOW });
  assert.equal(year.pendingApproval, 108000);
  const lastYear = sumDealDisplay(deals, { inPeriod: pendingPeriodMatcher({ month: '2025-12', allMonths: true }), now: NOW });
  assert.equal(lastYear.pendingApproval, 0);

  const review = sumDealDisplay(deals, { inPeriod: pendingPeriodMatcher({ month: '2026-08', reviewOnly: true }), now: NOW });
  assert.equal(review.pendingApproval, 108000, '"รอเติมข้อมูล" ไม่มีงวด = นับทุกใบ');
});

test('sumDealDisplay: เดือนปัจจุบันเป็นเดือนไทย ไม่ใช่ UTC', () => {
  const sept = pendingPeriodMatcher({ month: '2026-09' });
  const oct = pendingPeriodMatcher({ month: '2026-10' });
  assert.equal(sumDealDisplay([PENDING_WON], { inPeriod: sept, now: LATE_SEPT_THAI }).pendingApproval, 108000);
  assert.equal(sumDealDisplay([PENDING_WON], { inPeriod: sept, now: EARLY_OCT_THAI }).pendingApproval, 0);
  assert.equal(sumDealDisplay([PENDING_WON], { inPeriod: oct, now: EARLY_OCT_THAI }).pendingApproval, 108000);
});

test('sumDealDisplay: ยังไม่รู้เวลา (now: null) + มีงวด = ยังไม่นับรออนุมัติ ไม่เดาเดือน', () => {
  const inPeriod = pendingPeriodMatcher({ month: '2026-09' });
  assert.deepEqual(sumDealDisplay([PENDING_WON, OPEN], { inPeriod, now: null }), {
    value: 50000, pendingApproval: 0, pendingApprovalCount: 0,
  });
  // ไม่มีงวด (รอเติมข้อมูล) ไม่ต้องใช้นาฬิกา — นับได้เลย
  assert.equal(sumDealDisplay([PENDING_WON], { inPeriod: null, now: null }).pendingApproval, 108000);
});

test('sumDealDisplay: ดีลเปิดที่มี cache รออนุมัติยังไม่ถูกนับ แม้อยู่ในงวด', () => {
  const inPeriod = pendingPeriodMatcher({ month: '2026-09' });
  const open = { stage: 'qualified', projectValue: 20000, metadata: { soPendingAmount: 999, soPendingCount: 1 } };
  assert.deepEqual(sumDealDisplay([open], { inPeriod, now: NOW }), { value: 20000, pendingApproval: 0, pendingApprovalCount: 0 });
});

/* ── fix 1 · คำใต้การ์ด "มูลค่าปิดจริง (Won)" ──────────────────────────────── */

test('มี SO อนุมัติ ไม่มีใบรออนุมัติ: "ต่าง ฿(V−A)" ตามเดิม', () => {
  const hint = wonDealForecastHint({ forecast: 300000, actual: 200000, actualCount: 1, pendingApproval: 0, pendingApprovalCount: 0 });
  assert.equal(hint.kind, WON_HINT_KINDS.ACTUAL);
  assert.equal(hint.gap, 100000);
  assert.equal(hint.text, `คาดการณ์ ${fmtMoney(300000)} · ต่าง ${fmtMoney(100000)}`);
});

test('มี SO อนุมัติ ยอดเท่าคาดการณ์: "ตรงกับคาดการณ์" (รวมเศษทศนิยม)', () => {
  const exact = wonDealForecastHint({ forecast: 300000, actual: 300000, actualCount: 2 });
  assert.equal(exact.kind, WON_HINT_KINDS.ACTUAL);
  assert.equal(exact.gap, 0);
  assert.equal(exact.text, 'ตรงกับคาดการณ์');
  // 0.3 − 0.1 − 0.2 = −2.7e-17 ในทศนิยมลอยตัว → ต้องปัดเป็นศูนย์
  const float = wonDealForecastHint({ forecast: 0.3, actual: 0.1, pendingApproval: 0.2 });
  assert.equal(float.gap, 0);
  assert.equal(float.text, 'ตรงกับคาดการณ์เมื่ออนุมัติครบ');
});

test('ใบอนุมัติยอด 0 บาท / ดีลย้ายระบบ (legacy ไม่มีแถว SO) = มี SO อนุมัติ', () => {
  const zeroApproved = wonDealForecastHint({ forecast: 5000, actual: 0, actualCount: 1 });
  assert.equal(zeroApproved.kind, WON_HINT_KINDS.ACTUAL);
  assert.equal(zeroApproved.text, `คาดการณ์ ${fmtMoney(5000)} · ต่าง ${fmtMoney(5000)}`);
  const legacy = wonDealForecastHint({ forecast: 70000, actual: 70000, actualCount: 0 });
  assert.equal(legacy.kind, WON_HINT_KINDS.ACTUAL);
  assert.equal(legacy.text, 'ตรงกับคาดการณ์');
});

test('มีใบรออนุมัติ: "ต่างเมื่ออนุมัติครบ ฿(V−A−P)" — ไม่ใช่ FC ทั้งก้อน', () => {
  const pendingOnly = wonDealForecastHint({ forecast: 108000, actual: 0, actualCount: 0, pendingApproval: 100000, pendingApprovalCount: 1 });
  assert.equal(pendingOnly.kind, WON_HINT_KINDS.WHEN_APPROVED);
  assert.equal(pendingOnly.gap, 8000);
  assert.equal(pendingOnly.text, `คาดการณ์ ${fmtMoney(108000)} · ต่างเมื่ออนุมัติครบ ${fmtMoney(8000)}`);
  assert.doesNotMatch(pendingOnly.text, new RegExp(`ต่าง(?:เมื่ออนุมัติครบ)? ${fmtMoney(108000).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

  const mixed = wonDealForecastHint({ forecast: 300000, actual: 200000, actualCount: 1, pendingApproval: 100000, pendingApprovalCount: 2 });
  assert.equal(mixed.kind, WON_HINT_KINDS.WHEN_APPROVED);
  assert.equal(mixed.gap, 0);
  assert.equal(mixed.text, 'ตรงกับคาดการณ์เมื่ออนุมัติครบ');

  // ใบรออนุมัติ 0 บาทยังนับว่า "มีใบรออนุมัติ" (จำนวนใบ)
  const zeroPending = wonDealForecastHint({ forecast: 5000, actual: 0, actualCount: 0, pendingApproval: 0, pendingApprovalCount: 1 });
  assert.equal(zeroPending.kind, WON_HINT_KINDS.WHEN_APPROVED);
  assert.equal(zeroPending.text, `คาดการณ์ ${fmtMoney(5000)} · ต่างเมื่ออนุมัติครบ ${fmtMoney(5000)}`);
});

test('ส่วนต่างติดลบ (ปิดเกินคาดการณ์) โชว์ตามจริงทั้งสองกรณี', () => {
  const overActual = wonDealForecastHint({ forecast: 100000, actual: 125000.5, actualCount: 1 });
  assert.equal(overActual.kind, WON_HINT_KINDS.ACTUAL);
  assert.equal(overActual.gap, -25000.5);
  assert.equal(overActual.text, `คาดการณ์ ${fmtMoney(100000)} · ต่าง ${fmtMoney(-25000.5)}`);

  const overWhenApproved = wonDealForecastHint({ forecast: 100000, actual: 60000, actualCount: 1, pendingApproval: 50000, pendingApprovalCount: 1 });
  assert.equal(overWhenApproved.kind, WON_HINT_KINDS.WHEN_APPROVED);
  assert.equal(overWhenApproved.gap, -10000);
  assert.equal(overWhenApproved.text, `คาดการณ์ ${fmtMoney(100000)} · ต่างเมื่ออนุมัติครบ ${fmtMoney(-10000)}`);
});

test('ไม่มี SO อนุมัติและไม่มีใบรออนุมัติ (Won รอยื่น SO): ไม่มีตัวเลขต่าง', () => {
  const awaiting = wonDealForecastHint({ forecast: 120000, actual: 0, actualCount: 0, pendingApproval: 0, pendingApprovalCount: 0 });
  assert.equal(awaiting.kind, WON_HINT_KINDS.AWAITING_SO);
  assert.equal(awaiting.gap, null);
  assert.equal(awaiting.text, `คาดการณ์ ${fmtMoney(120000)} · ยังไม่มีใบสั่งขายที่ยื่น`);
  assert.doesNotMatch(awaiting.text, /ต่าง/);
  // ข้อมูลไม่ครบต้องไม่พัง
  assert.equal(wonDealForecastHint().kind, WON_HINT_KINDS.AWAITING_SO);
  assert.equal(wonDealForecastHint({ forecast: null }).text, `คาดการณ์ ${fmtMoney(0)} · ยังไม่มีใบสั่งขายที่ยื่น`);
});
