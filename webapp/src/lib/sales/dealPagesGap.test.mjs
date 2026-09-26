// หน้ารายการดีล + หน้ารายละเอียดดีล — รูของยอดรออนุมัติ/ส่วนต่าง (มติผู้ใช้ 2026-09-14)
//
// fix 2  ยอดรออนุมัติบนหัวกลุ่ม/KPI ต้องคัดด้วยงวดที่หน้าโชว์ (เดือนของมัน = เดือนปัจจุบันเวลาไทย)
// fix 1  คำใต้การ์ด "มูลค่าปิดจริง (Won)" ห้ามขึ้น "ต่าง ฿(FC ทั้งก้อน)" ตอนที่ SO ยังไม่อนุมัติ
// 09-15  ดีลเก่าที่สร้างเป็น Won ได้คำเฉพาะ ไม่ใช่ "ยังไม่มีใบสั่งขายที่ยื่น" (ยื่น SO ไม่ได้เลย)
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtMoney } from '../format.js';
import {
  HISTORICAL_DEAL_HINT_TEXT,
  LEGACY_WON_HINT_TEXT,
  WON_HINT_KINDS,
  pendingPeriodMatcher,
  sumDealDisplay,
  wonDealForecastHint,
} from './dealAmountDisplay.js';
import { isWonAwaitingSo, pendingApprovalAmountOf, pendingApprovalCountOf, wonAmountOf } from './dashboardMetrics.js';

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

test('ใบอนุมัติยอด 0 บาท = ส่วนลด 100% (มติผู้ใช้ 2026-09-16 บ่าย) · Actual ของดีล > 0 ก็นับว่ามี แม้แถว SO ไม่มากับหน้า', () => {
  /* ดีลจบแล้ว (ไม่อยู่ในกองรอยื่น SO) แต่ห้ามขึ้นแค่ "ต่าง ฿(FC เต็ม)" ซึ่งอ่านเหมือนพลาดเป้าทั้งใบ
     หลัง mig 0361 + backfill ยอดดีลจะเท่ากับใบเอง ⇒ ส่วนต่างกลายเป็น 0 เอง */
  const zeroApproved = wonDealForecastHint({ forecast: 5000, actual: 0, actualCount: 1 });
  assert.equal(zeroApproved.kind, WON_HINT_KINDS.ACTUAL);
  assert.equal(zeroApproved.gap, 5000);
  assert.equal(zeroApproved.text, `คาดการณ์ ${fmtMoney(5000)} · ใบสั่งขายที่อนุมัติเป็น 0 บาท (ส่วนลด 100%)`);
  // FC 0 + ใบ 0 บาท = ตรงกันจริง ไม่ใช่รอยื่น
  assert.equal(wonDealForecastHint({ forecast: 0, actual: 0, actualCount: 1 }).text, 'ตรงกับคาดการณ์');
  /* 🪤 เคสนี้เคยชื่อ "ดีลย้ายระบบ (legacy ไม่มีแถว SO)" — #1716 ถอด Actual แบบ legacy ไปแล้ว (Actual มาจาก
     SO อนุมัติเท่านั้น · lib/sales/legacyDealSwitch) ดีลเก่าจึงไม่มี Actual โดยไม่มีแถว SO อีก และดีลเก่าที่
     สร้างเป็น Won ได้คำของตัวเอง (เทสต์ท้ายไฟล์) · เหลือความหมายเดียว: ยอด Actual ของดีล (cache ที่ผ่านด่าน
     actualSource) ชนะจำนวนแถวที่หน้าได้มา */
  const cachedActual = wonDealForecastHint({ forecast: 70000, actual: 70000, actualCount: 0 });
  assert.equal(cachedActual.kind, WON_HINT_KINDS.ACTUAL);
  assert.equal(cachedActual.text, 'ตรงกับคาดการณ์');
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

  /* ใบที่ยื่นแล้วยอด 0 บาท = ยังไม่มีเงินอยู่ที่ไหนเลย (ปรับ 2026-09-16) — พูดตรงกับกอง "Won รอยื่น SO"
     ที่นับดีลแบบนี้ ไม่ใช่ "ต่างเมื่ออนุมัติครบ ฿(FC เต็ม)" ซึ่งอ่านเหมือนมีใบยอดเต็มรออนุมัติอยู่ */
  const zeroPending = wonDealForecastHint({ forecast: 5000, actual: 0, actualCount: 0, pendingApproval: 0, pendingApprovalCount: 1 });
  assert.equal(zeroPending.kind, WON_HINT_KINDS.AWAITING_SO);
  assert.equal(zeroPending.gap, null);
  assert.equal(zeroPending.text, `คาดการณ์ ${fmtMoney(5000)} · ใบสั่งขายที่ยื่นยังเป็น 0 บาท`);
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
  // คำจริงตามเอกสาร — แต่กอง Won รอยื่น SO ไม่นับดีลมูลค่า 0 (มติ 2026-09-16 · เทสต์ท้ายไฟล์)
  assert.equal(wonDealForecastHint({ forecast: null }).text, `คาดการณ์ ${fmtMoney(0)} · ยังไม่มีใบสั่งขายที่ยื่น`);
});

/* ── ดีลเก่าจากระบบเดิมที่สร้างเป็น Won (มติผู้ใช้ 2026-09-15) ─────────────────────────────
   รูปจริงบน prod: metadata.legacy = true · ไม่มี acceptedQuotationId / wonSource · ไม่มีใบเสนอราคาและ SO */
const LEGACY_WON_AT_CREATE = {
  stage: 'won', projectValue: 0, wonValue: 0, confirmedAt: '2026-06-10T00:00:00Z',
  metadata: { legacy: true, actualSource: 'sale_order', wonMonth: null },
};
const NO_SO = { actual: 0, actualCount: 0, pendingApproval: 0, pendingApprovalCount: 0 };

test('ดีลเก่าที่สร้างเป็น Won: คำเฉพาะดีลเก่าแทน "ยังไม่มีใบสั่งขายที่ยื่น" — ดีลพิมพ์ 0 ได้บรรทัดเดียวที่อ่านรู้เรื่อง', () => {
  // ดีลพิมพ์ 0 ตอนสร้าง (20 ใบบน prod · ไม่มีบันทึกยอดปิด ⇒ หน้าดีลไม่มีบรรทัดบันทึก)
  const typedZero = wonDealForecastHint({ deal: LEGACY_WON_AT_CREATE, forecast: 0, ...NO_SO });
  assert.equal(typedZero.kind, WON_HINT_KINDS.LEGACY_NO_SO);
  assert.equal(typedZero.gap, null);
  assert.equal(typedZero.text, 'ดีลเก่าจากระบบเดิม · ไม่มีใบสั่งขายในระบบนี้');
  assert.equal(typedZero.text, LEGACY_WON_HINT_TEXT);
  assert.doesNotMatch(typedZero.text, /ยังไม่มีใบสั่งขายที่ยื่น|คาดการณ์|ต่าง|0\.00/);
  // บล็อก B (ยอด FC ยังอยู่ รอเจ้าของยืนยัน) — คำเดียวกัน · ยอดปิดในระบบเดิม/FC เป็นหน้าที่ของบรรทัดบันทึก
  const blockB = {
    ...LEGACY_WON_AT_CREATE,
    projectValue: 600000,
    metadata: { ...LEGACY_WON_AT_CREATE.metadata, legacyClosedValue: 600000, legacyClosedDate: '2026-07-15' },
  };
  const hintB = wonDealForecastHint({ deal: blockB, forecast: blockB.projectValue, ...NO_SO });
  assert.equal(hintB.kind, WON_HINT_KINDS.LEGACY_NO_SO);
  assert.equal(hintB.text, LEGACY_WON_HINT_TEXT);
  assert.equal(hintB.gap, null);
});

test('คำดีลเก่าตัดสินด้วยตัวบ่งชี้กลาง — ดีลสวิตช์ที่ปิดผ่านใบเสนอราคา / พังครึ่งทาง / ดีลปกติ ยังเป็น Won รอยื่น SO', () => {
  const viaQuote = { ...LEGACY_WON_AT_CREATE, metadata: { ...LEGACY_WON_AT_CREATE.metadata, acceptedQuotationId: 'QT-1', wonSource: 'quotation' } };
  const halfReverted = { ...LEGACY_WON_AT_CREATE, metadata: { ...LEGACY_WON_AT_CREATE.metadata, wonSource: 'quotation' } };
  const normal = { ...LEGACY_WON_AT_CREATE, metadata: { actualSource: 'sale_order', wonMonth: null, acceptedQuotationId: 'QT-2', wonSource: 'quotation' } };
  for (const deal of [viaQuote, halfReverted, normal, undefined]) {
    const hint = wonDealForecastHint({ deal, forecast: 120000, ...NO_SO });
    assert.equal(hint.kind, WON_HINT_KINDS.AWAITING_SO, JSON.stringify(deal?.metadata));
    assert.equal(hint.text, `คาดการณ์ ${fmtMoney(120000)} · ยังไม่มีใบสั่งขายที่ยื่น`);
  }
  // ตัวเลขจริงชนะธงเสมอ — มีแถวอนุมัติ/รออนุมัติ = กรณีปกติ
  assert.equal(wonDealForecastHint({ deal: LEGACY_WON_AT_CREATE, forecast: 5000, actual: 0, actualCount: 1 }).kind, WON_HINT_KINDS.ACTUAL);
  assert.equal(wonDealForecastHint({ deal: LEGACY_WON_AT_CREATE, forecast: 5000, pendingApprovalCount: 1 }).kind, WON_HINT_KINDS.WHEN_APPROVED);
});

test('ดีลของใบสั่งขายย้อนหลัง (mig 0360): คำของตัวเองเสมอ · ดีลเก่าที่สร้างเป็น Won ยังได้คำเดิม', () => {
  const container = { stage: 'won', origin: 'historical', projectValue: 0, metadata: { actualSource: 'sale_order' } };
  for (const input of [NO_SO, { actual: 1000, actualCount: 1 }, { pendingApproval: 500, pendingApprovalCount: 1 }]) {
    const hint = wonDealForecastHint({ deal: container, forecast: 0, ...input });
    assert.equal(hint.kind, WON_HINT_KINDS.HISTORICAL);
    assert.equal(hint.text, HISTORICAL_DEAL_HINT_TEXT);
    assert.equal(hint.gap, null);
  }
  assert.doesNotMatch(HISTORICAL_DEAL_HINT_TEXT, /ดีลเก่า/, 'ข้อ 19: คำว่า "ดีลเก่า" เป็นของสวิตช์ในฟอร์มดีล');
  assert.equal(wonDealForecastHint({ deal: LEGACY_WON_AT_CREATE, forecast: 120000, ...NO_SO }).kind, WON_HINT_KINDS.LEGACY_NO_SO);
});

/* ── คำใต้การ์ด ↔ กอง "Won รอยื่น SO" ของแท็บผลงานขาย (ตรวจรอบ 2026-09-16) ─────────────────
   หน้าดีลคิดจากแถว SO ที่โหลดมา · แดชบอร์ดคิดจาก cache ของดีล — ดีลที่มีมูลค่าต้องได้เรื่องเดียวกันทั้งสองทาง
   ⚠️ มูลค่าดีล ≤ 0 ไม่อยู่ในกอง แต่คำ "ยังไม่มีใบสั่งขายที่ยื่น" ยังจริงตามเอกสาร ⇒ ห้ามใช้ kind นับกอง */
test('ดีลมูลค่า > 0: คำชนิด awaiting_so ⇔ isWonAwaitingSo ทุกรูปของ SO · ดีลเก่าที่สร้างเป็น Won ไม่อยู่ทั้งสองทาง', () => {
  const base = { stage: 'won', projectValue: 150000, wonValue: 0, confirmedAt: '2026-09-02T03:00:00Z' };
  const cases = [
    // [ชื่อ, ดีล (cache ที่แดชบอร์ดอ่าน), จำนวนแถวอนุมัติที่หน้าดีลโหลดได้]
    ['ไม่มี SO / มีแค่ร่าง', { ...base, metadata: { actualSource: 'sale_order', wonMonth: null } }, 0],
    ['ใบอนุมัติ 0 บาท (ส่วนลด 100% = จบ)', { ...base, metadata: { actualSource: 'sale_order', wonMonth: '2026-08', wonValueExVat: 0 } }, 1],
    ['อนุมัติมียอด', { ...base, wonValue: 90000, metadata: { actualSource: 'sale_order', wonMonth: '2026-09', wonValueExVat: 90000 } }, 1],
    ['รออนุมัติ', { ...base, metadata: { actualSource: 'sale_order', soPendingAmount: 150000, soPendingCount: 1 } }, 0],
    ['ใบรออนุมัติ 0 บาท', { ...base, metadata: { actualSource: 'sale_order', soPendingAmount: 0, soPendingCount: 1 } }, 0], // ยังรอยื่น
    ['ใบอนุมัติ 0 บาท + ใบรออนุมัติ', { ...base, metadata: { actualSource: 'sale_order', wonMonth: '2026-08', soPendingAmount: 60000, soPendingCount: 1 } }, 1],
    ['ดีลเก่าที่สร้างเป็น Won', { ...base, metadata: { legacy: true, actualSource: 'sale_order', wonMonth: null } }, 0],
    ['ดีลของใบสั่งขายย้อนหลัง', { ...base, origin: 'historical', metadata: { actualSource: 'sale_order' } }, 1],
  ];
  let awaitingCases = 0;
  for (const [name, deal, actualCount] of cases) {
    const hint = wonDealForecastHint({
      deal,
      forecast: deal.projectValue,
      actual: wonAmountOf(deal),
      actualCount,
      pendingApproval: pendingApprovalAmountOf(deal),
      pendingApprovalCount: pendingApprovalCountOf(deal),
    });
    assert.equal(hint.kind === WON_HINT_KINDS.AWAITING_SO, isWonAwaitingSo(deal), name);
    if (isWonAwaitingSo(deal)) awaitingCases += 1;
  }
  assert.equal(awaitingCases, 2, 'ไม่มี SO + ใบยื่น 0 บาท — กันเทสต์ผ่านเพราะทุกเคสเป็น false');
});

test('pendingPeriodMatcher: ช่วงวัน = นับเฉพาะช่วงที่คลุมวันนี้ (ตัวคุมงวดกลาง 2026-09-22)', () => {
  const covers = pendingPeriodMatcher({ period: { mode: 'range', from: '2026-09-09', to: '2026-09-22', months: ['2026-09'], today: '2026-09-22' } });
  assert.equal(covers('2026-09'), true);
  assert.equal(covers(null), false);
  // ชิป "สัปดาห์ก่อน" ของวันอังคาร 22 ก.ย. = อา. 13 – ส. 19 ก.ย. (มติเจ้าของ 26/09 สัปดาห์เริ่มวันอาทิตย์)
  const lastWeek = pendingPeriodMatcher({ period: { mode: 'range', from: '2026-09-13', to: '2026-09-19', months: ['2026-09'], today: '2026-09-22' } });
  assert.equal(lastWeek('2026-09'), false);
  // "รอเติมข้อมูล" ยังไม่กรองแม้ส่งช่วงมา
  assert.equal(pendingPeriodMatcher({ reviewOnly: true, period: { mode: 'range' } }), null);
});
