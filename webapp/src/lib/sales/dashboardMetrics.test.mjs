import test from 'node:test';
import assert from 'node:assert/strict';
import {
  forecastAccuracyRollup, isWonDeal, isOpenDeal, wonAmountOf, wonMonthOf, dealMatchesOwner,
  isKpiDeal, isWonAwaitingSo, wonAwaitingSoAmountOf, wonAwaitingSoCountOf,
  INSTALLMENT_REMAINING_LABEL, actualByMonthOf, actualInMonths, dealClosedValueOf, installmentPendingAmountOf,
  installmentPendingCountOf, installmentRemainingAmountOf, installmentRemainingByMonthOf, pendingApprovalAmountOf,
  pendingApprovalCountOf, pendingApprovalMonthOf,
} from './dashboardMetrics.js';

test('won/open classification matches the dashboard aggregator rules', () => {
  assert.equal(isWonDeal({ stage: 'won' }), true);
  assert.equal(isWonDeal({ stage: 'in_project' }), true); // ดีลเก่าแปลงเป็นโครงการ = Won
  assert.equal(isWonDeal({ stage: 'quotation' }), false);
  assert.equal(isOpenDeal({ stage: 'quotation' }), true);
  assert.equal(isOpenDeal({ stage: 'in_project' }), false);
  assert.equal(isOpenDeal({ stage: 'lost' }), false);
});

test('won month prefers explicit wonMonth then confirmedAt then PO date then forecast', () => {
  assert.equal(wonMonthOf({ metadata: { wonMonth: '2026-06' }, confirmedAt: '2026-07-02T00:00:00Z' }), '2026-06');
  assert.equal(wonMonthOf({ confirmedAt: '2026-07-02T00:00:00Z', forecastMonth: '2026-05' }), '2026-07');
  assert.equal(wonMonthOf({ metadata: { poReceivedDate: '2026-04-10' }, forecastMonth: '2026-05' }), '2026-04');
  assert.equal(wonMonthOf({ forecastMonth: '2026-05' }), '2026-05');
});

test('won amount counts only SO-verified actuals', () => {
  assert.equal(wonAmountOf({ wonValue: 500, metadata: { actualSource: 'sale_order' } }), 500);
  assert.equal(wonAmountOf({ wonValue: 500, metadata: {} }), 0);
});

test('FC Total keeps Open, Won and Lost forecasts while remaining keeps Open only', () => {
  const result = forecastAccuracyRollup(
    [{ projectValue: 40 }],
    [{ projectValue: 100, wonValue: 80, metadata: { actualSource: 'sale_order' } }],
    [{ projectValue: 25 }],
  );
  assert.equal(result.fullForecast, 165);
  assert.equal(result.remainingForecast, 40);
  assert.equal(result.wonForecastValue, 100);
  assert.equal(result.lostForecast, 25);
  assert.equal(result.wonValue, 80);
  assert.equal(result.forecastVariance, -45);
});

test('owner matching: id ก่อน (ครอบดีลก่อน/หลังเปลี่ยนชื่อ) แล้วถอย name+team สำหรับ legacy', () => {
  const deal = { ownerId: 'old-id', ownerName: ' สมชาย  ใจดี ', team: 'KA' };
  assert.equal(dealMatchesOwner(deal, { ownerName: 'สมชาย ใจดี', team: 'KA' }), true);
  assert.equal(dealMatchesOwner(deal, { ownerName: 'สมชาย ใจดี', team: 'ODM' }), false);
  assert.equal(dealMatchesOwner(deal, { ownerId: 'old-id' }), true);
  assert.equal(dealMatchesOwner(deal, {}), true); // ไม่ระบุ = แถวสรุปรวม

  // แถว byOwner ตอนนี้ใช้ชื่อ "ปัจจุบัน" จากบัญชี — ดีลเก่าชื่อ snapshot เดิม
  // ต้องยังถูกจับด้วย id แม้ชื่อ/ทีมบน filter เปลี่ยนไปแล้ว
  assert.equal(dealMatchesOwner(deal, { ownerId: 'old-id', ownerName: 'สมชาย นามใหม่', team: 'ODM' }), true);
  // id ไม่ตรง → ตัดสินด้วยชื่อ+ทีมตามเดิม (คนละคน ห้าม match)
  assert.equal(dealMatchesOwner(deal, { ownerId: 'other-id', ownerName: 'สมหญิง อื่น', team: 'KA' }), false);
});

/* 🔒 ทั้งสองฝั่งมี id แล้วไม่ตรง = คนละคน จบ — ห้ามให้ "ชื่อพ้อง" ดึงดีลข้ามคน
   (เคสจริงที่ต้องกัน: สองบัญชีชื่อซ้ำในทีมเดียวกัน หรือคนใหม่ที่ตั้งชื่อไปชนชื่อ
   เก่าที่ยังค้างอยู่ในแถวของคนที่เปลี่ยนชื่อไปแล้ว) */
test('owner matching: id ครบทั้งสองฝั่งแต่ไม่ตรง = ไม่ match แม้ชื่อ+ทีมจะเหมือนกันเป๊ะ', () => {
  const deal = { ownerId: 'ของจริง', ownerName: 'สมชาย ใจดี', team: 'KA' };
  assert.equal(dealMatchesOwner(deal, { ownerId: 'คนละคน', ownerName: 'สมชาย ใจดี', team: 'KA' }), false);
});

// แถวเก่าที่ไม่มี ownerId เลย ยังต้องจับด้วยชื่อ+ทีมได้ (ยอดย้อนหลัง)
test('owner matching: แถวที่ไม่มี ownerId ยังถอยไปใช้ชื่อ+ทีมได้ตามเดิม', () => {
  const legacy = { ownerId: null, ownerName: 'สมชาย ใจดี', team: 'KA' };
  assert.equal(dealMatchesOwner(legacy, { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA' }), true);
  assert.equal(dealMatchesOwner(legacy, { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'ODM' }), false);
});

/* ⭐ มติผู้ใช้ 2026-09-14 "ทีมตามดีล" — แถวคนบนแดชบอร์ดแยกตามทีมที่ประทับบนดีล (คนเดียวมีได้หลายแถว)
   ลิ้นชักของแถวคนส่ง `teamScoped: true` ⇒ ดีลต้องอยู่ทีมเดียวกับแถวก่อน · ธงเลือกเปิด ผู้เรียกเดิมไม่กระทบ */
test('owner matching teamScoped: id ตรงแต่ดีลคนละทีม = ไม่ match · ทีมว่าง null/\'\' เป็นทีมเดียวกัน', () => {
  const ka = { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA' };
  assert.equal(dealMatchesOwner(ka, { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA', teamScoped: true }), true);
  assert.equal(dealMatchesOwner(ka, { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'ODM', teamScoped: true }), false);
  assert.equal(dealMatchesOwner(ka, { ownerId: 'u1', team: null, teamScoped: true }), false, 'แถวไร้ทีมไม่ได้ดีล KA');
  // ไม่ส่งธง = กติกาเดิม (id ตรงไม่ดูทีม)
  assert.equal(dealMatchesOwner(ka, { ownerId: 'u1', team: 'ODM' }), true);
  assert.equal(dealMatchesOwner(ka, { ownerId: 'u1', team: 'ODM', teamScoped: false }), true);

  // ดีลไร้ทีมของคน KA — ลงแถว (u1, ไม่ระบุทีม) เท่านั้น
  const teamless = { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: null };
  assert.equal(dealMatchesOwner(teamless, { ownerId: 'u1', team: null, teamScoped: true }), true);
  assert.equal(dealMatchesOwner(teamless, { ownerId: 'u1', team: '', teamScoped: true }), true);
  assert.equal(dealMatchesOwner(teamless, { ownerId: 'u1', team: 'KA', teamScoped: true }), false);
  assert.equal(dealMatchesOwner({ ...teamless, team: '' }, { ownerId: 'u1', team: null, teamScoped: true }), true);
  assert.equal(dealMatchesOwner({ ...teamless, team: undefined }, { ownerId: 'u1', teamScoped: true }), true);

  // ทีมตรงแล้ว กติกาตัวตนเดิมยังตัดสินต่อ: id คนละคน = จบ · แถว legacy ไม่มี id ถอยไปชื่อ
  assert.equal(dealMatchesOwner(ka, { ownerId: 'u2', ownerName: 'สมชาย ใจดี', team: 'KA', teamScoped: true }), false);
  const legacy = { ownerId: null, ownerName: 'สมชาย ใจดี', team: 'KA' };
  assert.equal(dealMatchesOwner(legacy, { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'KA', teamScoped: true }), true);
  assert.equal(dealMatchesOwner(legacy, { ownerId: 'u1', ownerName: 'สมชาย ใจดี', team: 'ODM', teamScoped: true }), false);
});

test('ดีลของใบสั่งขายย้อนหลัง (mig 0360): ไม่ใช่ KPI · ไม่อยู่กอง Won รอยื่น SO แม้เป็น Won ที่ไม่มีใบอนุมัติ', () => {
  const container = { stage: 'won', origin: 'historical', projectValue: 9000, wonValue: 5000, metadata: {} };
  assert.equal(isKpiDeal(container), false);
  assert.equal(isWonAwaitingSo(container), false);
  assert.equal(wonAwaitingSoCountOf(container), 0);
  assert.equal(wonAwaitingSoAmountOf(container), 0);
  assert.equal(isWonAwaitingSo({ ...container, metadata: { wonMonth: '2026-09' } }), false);
  // ดีล pipeline หน้าตาเดียวกันยังเข้ากองตามเดิม
  const pipeline = { ...container, origin: 'pipeline' };
  assert.equal(isKpiDeal(pipeline), true);
  assert.equal(isWonAwaitingSo(pipeline), true);
  assert.equal(wonAwaitingSoAmountOf(pipeline), 9000);
});

/* ── นับ Actual รายงวด (mig 0412 · มติเจ้าของ 26/10) — ตัวอ่าน cache ของดีล ────────────────────────────────────────── */
/* รูปที่ trigger ของ 0412 เขียน: ใบรายงวด 100,000 ก่อน VAT · งวด 1 นับ ต.ค. · งวด 2 นับ ธ.ค. · งวด 3 ยื่นอยู่ · งวด 4 ยังไม่ยื่น */
const INSTALLMENT_DEAL = Object.freeze({
  stage: 'won',
  projectValue: 100000,
  wonValue: 60000,
  metadata: {
    actualSource: 'sale_order',
    wonMonth: '2026-10',
    wonValueExVat: 60000,
    actualByMonth: { '2026-10': 40000, '2026-12': 20000 },
    soInstPendingAmount: 25000,
    soInstPendingCount: 1,
    soInstRemainingByDue: { '2027-01': 10000, none: 3000, '2026-09': 2000 },
  },
});

test('actualByMonthOf: อ่านแผนที่เดือนของ trigger · ไม่มีคีย์ = {wonMonth: wonValue} (ไม่ backfill) · ไม่ใช่ Actual จาก SO = {}', () => {
  assert.deepEqual(actualByMonthOf(INSTALLMENT_DEAL), { '2026-10': 40000, '2026-12': 20000 });
  // ดีลที่ trigger ยังไม่เคยเขียนคีย์ใหม่ (ใบทั้งใบก่อนรัน 0412) — ยอดเดิมทั้งก้อนลงเดือนเดิม
  const legacy = { stage: 'won', wonValue: 500, metadata: { actualSource: 'sale_order', wonMonth: '2026-08' } };
  assert.deepEqual(actualByMonthOf(legacy), { '2026-08': 500 });
  assert.deepEqual(actualByMonthOf({ ...legacy, wonValue: 0 }), {}, 'ยอด 0 ไม่มีเดือน');
  assert.deepEqual(actualByMonthOf({ ...legacy, metadata: {} }), {}, 'ไม่ใช่ Actual จาก SO');
  assert.deepEqual(actualByMonthOf({ wonValue: 500, metadata: { actualSource: 'sale_order', actualByMonth: {} } }), {},
    'แผนที่ว่าง = ไม่มีใบอนุมัติ — ไม่ถอยไปเดา');
  // ค่าเพี้ยนถูกกรอง · ติดลบ = 0 · คีย์ที่ยาวกว่าเดือนรวมเข้าเดือนเดียวกัน
  assert.deepEqual(actualByMonthOf({ metadata: {
    actualSource: 'sale_order', actualByMonth: { '2026-10': '100.10', bogus: 5, '2026-11': 'x', '2026-12': -3, '2026-10-15': 0.2 },
  } }), { '2026-10': 100.3, '2026-12': 0 });
  assert.deepEqual(actualByMonthOf(null), {});
});

test('actualInMonths: รวมเฉพาะเดือนที่ขอ (อาร์เรย์หรือ Set) · ข้ามปี', () => {
  assert.equal(actualInMonths(INSTALLMENT_DEAL, ['2026-10']), 40000);
  assert.equal(actualInMonths(INSTALLMENT_DEAL, new Set(['2026-12', '2027-01'])), 20000);
  assert.equal(actualInMonths(INSTALLMENT_DEAL, ['2026-10', '2026-11', '2026-12']), 60000);
  assert.equal(actualInMonths(INSTALLMENT_DEAL, ['2026-11']), 0);
  assert.equal(actualInMonths(INSTALLMENT_DEAL, []), 0);
  assert.equal(actualInMonths(INSTALLMENT_DEAL, undefined), 0);
  // Σ ทุกเดือน = wonAmountOf เสมอ (cache สองตัวมาจาก sync ชุดเดียว)
  assert.equal(actualInMonths(INSTALLMENT_DEAL, Object.keys(actualByMonthOf(INSTALLMENT_DEAL))), wonAmountOf(INSTALLMENT_DEAL));
  // ทศนิยมไม่เพี้ยน
  assert.equal(actualInMonths({ metadata: { actualSource: 'sale_order', actualByMonth: { '2026-10': 0.1, '2026-11': 0.2 } } },
    ['2026-10', '2026-11']), 0.3);
});

test('รออนุมัติรวมงวดที่ยื่นแล้ว (มติข้อ 5) · ตัวแยกของงวดมีให้แตกบรรทัด · ดีล Won เท่านั้น', () => {
  assert.equal(installmentPendingAmountOf(INSTALLMENT_DEAL), 25000);
  assert.equal(installmentPendingCountOf(INSTALLMENT_DEAL), 1);
  assert.equal(pendingApprovalAmountOf(INSTALLMENT_DEAL), 25000);
  assert.equal(pendingApprovalCountOf(INSTALLMENT_DEAL), 1);
  const both = { ...INSTALLMENT_DEAL, metadata: { ...INSTALLMENT_DEAL.metadata, soPendingAmount: 993000.1, soPendingCount: 2 } };
  assert.equal(pendingApprovalAmountOf(both), 1018000.1);
  assert.equal(pendingApprovalCountOf(both), 3);
  // เดือนของยอดรออนุมัติ = เดือนปัจจุบันเสมอ แม้มีแต่งวดที่ยื่น
  assert.equal(pendingApprovalMonthOf(INSTALLMENT_DEAL, new Date('2026-10-31T17:30:00Z')), '2026-11');
  const open = { ...INSTALLMENT_DEAL, stage: 'quotation' };
  assert.equal(installmentPendingAmountOf(open), 0);
  assert.equal(installmentPendingCountOf(open), 0);
  assert.equal(pendingApprovalAmountOf(open), 0);
  assert.equal(installmentPendingAmountOf({ stage: 'won', metadata: { soInstPendingAmount: -1, soInstPendingCount: '2.7' } }), 0);
  assert.equal(installmentPendingCountOf({ stage: 'won', metadata: { soInstPendingCount: '2.7' } }), 2);
});

test('installmentRemainingByMonthOf: ลงเดือนครบกำหนด · ไม่มีวัน/เลยกำหนด พับเข้าเดือนปัจจุบัน · ข้ามปี', () => {
  assert.deepEqual(installmentRemainingByMonthOf(INSTALLMENT_DEAL, '2026-10'), { '2027-01': 10000, '2026-10': 5000 });
  // ขึ้นปีใหม่แล้ว — งวดครบกำหนด ม.ค. อยู่เดือนปัจจุบันพอดี ไม่พับซ้ำ
  assert.deepEqual(installmentRemainingByMonthOf(INSTALLMENT_DEAL, '2027-01'), { '2027-01': 15000 });
  assert.deepEqual(installmentRemainingByMonthOf(INSTALLMENT_DEAL, '2027-02'), { '2027-02': 15000 });
  // ไม่ส่งเดือน = เดือนปัจจุบันตามนาฬิกาไทย · ผลรวมไม่ขึ้นกับเดือน
  const now = installmentRemainingByMonthOf(INSTALLMENT_DEAL);
  assert.equal(Object.values(now).reduce((a, b) => a + b, 0), 15000);
  assert.equal(installmentRemainingAmountOf(INSTALLMENT_DEAL), 15000);
  assert.deepEqual(installmentRemainingByMonthOf({ ...INSTALLMENT_DEAL, stage: 'lost' }, '2026-10'), {});
  assert.equal(installmentRemainingAmountOf({ ...INSTALLMENT_DEAL, stage: 'lost' }), 0);
  assert.deepEqual(installmentRemainingByMonthOf({ stage: 'won', metadata: {} }, '2026-10'), {});
  assert.deepEqual(installmentRemainingByMonthOf({ stage: 'won', metadata: { soInstRemainingByDue: { none: 0, '2026-12': 'x', '2027-03': -5 } } }, '2026-10'), {});
  assert.equal(INSTALLMENT_REMAINING_LABEL, 'รอนับรายงวด');
});

test('dealClosedValueOf: ยอดปิดเต็ม = Actual + ยื่นแล้ว + รอนับรายงวด · ใบทั้งใบ = Actual เท่าเดิม', () => {
  assert.equal(dealClosedValueOf(INSTALLMENT_DEAL), 100000);
  const whole = { stage: 'won', wonValue: 107.5, metadata: { actualSource: 'sale_order', wonMonth: '2026-08' } };
  assert.equal(dealClosedValueOf(whole), 107.5);
  assert.equal(dealClosedValueOf({ stage: 'won', metadata: {} }), 0);
});

test('ดีลใบรายงวดไม่ตกกลับไปกอง Won รอยื่น SO (มีใบอนุมัติ = wonMonth) และ FC Total ยังอ่าน wonValue ทั้งก้อน', () => {
  assert.equal(isWonAwaitingSo(INSTALLMENT_DEAL), false);
  assert.equal(wonMonthOf(INSTALLMENT_DEAL), '2026-10', 'wonMonth = เดือนที่อนุมัติใบ (ความหมายเดิม)');
  assert.equal(forecastAccuracyRollup([], [INSTALLMENT_DEAL], []).wonValue, 60000);
});
