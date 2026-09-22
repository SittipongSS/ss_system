import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coveredDaysOf,
  historyAppliesTo,
  parseReportPeriod,
  reportPeriodFilename,
  reportPeriodLabel,
  reportPeriodQuery,
  targetFactorOf,
} from './reportPeriod.js';

/* งวดของรายงานยอดขาย — มติผู้ใช้ 2026-09-22: "รายเดือน | ช่วงวัน" แบบหน้าลีด
   ล็อก: เดือนเดียวโหลดแกนตั้งแต่ ม.ค. (ทบยอดรีเซ็ตต้นปี) · ช่วงวันปันเป้าตามวันและไม่นับวันในอนาคต ·
   ยอดกรอกย้อนหลังรายเดือนใช้เฉพาะเดือนที่ช่วงคลุมครบ */

const TODAY = '2026-09-22';

test('เดือนเดียว: แกน ม.ค.–เดือนนั้น (ไว้คิดทบยอด) แต่โชว์เดือนเดียว', () => {
  const p = parseReportPeriod({ mode: 'month', month: '2026-09' }, { today: TODAY });
  assert.deepEqual(p.months, ['2026-09']);
  assert.equal(p.axis.length, 9);
  assert.equal(p.axis[0], '2026-01');
  assert.equal(p.lead, 8);
  assert.equal(p.from, '2026-09-01');
  assert.equal(p.to, '2026-09-30');
});

test('มกราคม: ไม่มีเดือนนำ', () => {
  const p = parseReportPeriod({ mode: 'month', month: '2026-01' }, { today: TODAY });
  assert.deepEqual(p.axis, ['2026-01']);
  assert.equal(p.lead, 0);
});

test('ทุกเดือน = ทั้งปีของปีนั้น', () => {
  const p = parseReportPeriod({ mode: 'year', year: '2025' }, { today: TODAY });
  assert.equal(p.months.length, 12);
  assert.equal(p.lead, 0);
  assert.equal(p.from, '2025-01-01');
  assert.equal(p.to, '2025-12-31');
});

test('ช่วงวัน: สลับหัวท้ายให้ · แกน = เดือนที่คร่อม · ข้ามปีได้', () => {
  const p = parseReportPeriod({ mode: 'range', from: '2026-01-10', to: '2025-12-20' }, { today: TODAY });
  assert.equal(p.from, '2025-12-20');
  assert.equal(p.to, '2026-01-10');
  assert.deepEqual(p.months, ['2025-12', '2026-01']);
});

test('ค่าผิดรูป = error ไม่ใช่เดาให้', () => {
  assert.ok(parseReportPeriod({ mode: 'month', month: '2026-13' }, { today: TODAY }).error);
  assert.ok(parseReportPeriod({ mode: 'range', from: '2026-09-01' }, { today: TODAY }).error);
  assert.ok(parseReportPeriod({ mode: 'week' }, { today: TODAY }).error);
  assert.ok(parseReportPeriod({ mode: 'range', from: '2020-01-01', to: '2026-01-01' }, { today: TODAY }).error);
  // ปีเพี้ยน/วันที่ไม่มีจริง ต้องตีกลับที่นี่ (เดิมหลุดไปให้ฐานโยน 500)
  assert.ok(parseReportPeriod({ mode: 'year', year: '0000' }, { today: TODAY }).error);
  assert.ok(parseReportPeriod({ mode: 'month', month: '0000-01' }, { today: TODAY }).error);
  assert.ok(parseReportPeriod({ mode: 'range', from: '2026-02-30', to: '2026-03-02' }, { today: TODAY }).error);
});

test('ปันเป้าตามวัน: ตัดที่วันนี้ · เดือนเต็ม = 1 · อนาคต = 0', () => {
  const p = parseReportPeriod({ mode: 'range', from: '2026-08-15', to: '2026-10-05' }, { today: TODAY });
  assert.equal(targetFactorOf(p, '2026-08'), 17 / 31);   // 15–31 ส.ค.
  assert.equal(targetFactorOf(p, '2026-09'), 22 / 30);   // 1–22 ก.ย. (หลังวันนี้ไม่นับ)
  assert.equal(targetFactorOf(p, '2026-10'), 0);
  assert.deepEqual(coveredDaysOf(p, '2026-09'), { days: 22, total: 30 });
  const whole = parseReportPeriod({ mode: 'range', from: '2026-07-01', to: '2026-07-31' }, { today: TODAY });
  assert.equal(targetFactorOf(whole, '2026-07'), 1);
});

test('โหมดรายเดือน/ทั้งปี: เป้าเต็มเดือนเสมอ', () => {
  const p = parseReportPeriod({ mode: 'month', month: '2026-09' }, { today: TODAY });
  assert.equal(targetFactorOf(p, '2026-09'), 1);
  assert.equal(historyAppliesTo(p, '2026-09'), true);
});

test('ยอดกรอกย้อนหลังใช้เฉพาะเดือนที่ช่วงคลุมครบ', () => {
  const p = parseReportPeriod({ mode: 'range', from: '2026-06-01', to: '2026-07-15' }, { today: TODAY });
  assert.equal(historyAppliesTo(p, '2026-06'), true);
  assert.equal(historyAppliesTo(p, '2026-07'), false);
});

test('query/ป้าย/ชื่อไฟล์มาจากงวดเดียวกัน', () => {
  const m = parseReportPeriod({ mode: 'month', month: '2026-09' }, { today: TODAY });
  const y = parseReportPeriod({ mode: 'year', year: '2026' }, { today: TODAY });
  const r = parseReportPeriod({ mode: 'range', from: '2026-09-09', to: '2026-09-22' }, { today: TODAY });
  assert.equal(reportPeriodQuery(m), 'mode=month&month=2026-09');
  assert.equal(reportPeriodQuery(y), 'mode=year&year=2026');
  assert.equal(reportPeriodQuery(r), 'mode=range&from=2026-09-09&to=2026-09-22');
  assert.equal(reportPeriodLabel(y), 'ทั้งปี 2026');
  assert.equal(reportPeriodLabel(r), '09/09/2026 – 22/09/2026');
  assert.equal(reportPeriodFilename(r), 'รายงานยอดขาย_2026-09-09_2026-09-22.xlsx');
  // querystring วนกลับมาเป็นงวดเดิมได้
  const back = parseReportPeriod(Object.fromEntries(new URLSearchParams(reportPeriodQuery(r))), { today: TODAY });
  assert.deepEqual(back, r);
});
