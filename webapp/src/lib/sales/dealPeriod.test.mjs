import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dealCloseMonth, dealInReportPeriod } from './dealPeriod.js';
import { parseReportPeriod } from './reportPeriod.js';

/* ดีลในงวด = เดือนคาดปิด (มติผู้ใช้ 2026-09-22) — รายการดีลกับไฟล์ FC ใช้ตัวตัดสินเดียวกัน */
const TODAY = '2026-09-22';
const p = (input) => parseReportPeriod(input, { today: TODAY });

test('รายเดือน/ทุกเดือน: เดือน FC (คาดปิด) อยู่ในงวด', () => {
  const deal = { forecastMonth: '2026-09', expectedCloseDate: '2026-09-15', endDate: '2026-11-30' };
  assert.equal(dealInReportPeriod(deal, p({ mode: 'month', month: '2026-09' })), true);
  // เดือนส่งของ (endDate) ไม่ใช่ตัวตัดสิน
  assert.equal(dealInReportPeriod(deal, p({ mode: 'month', month: '2026-11' })), false);
  assert.equal(dealInReportPeriod(deal, p({ mode: 'year', year: '2026' })), true);
  assert.equal(dealInReportPeriod(deal, p({ mode: 'year', year: '2027' })), false);
});

test('ช่วงวัน: วันคาดปิดอยู่ในช่วง (รวมขอบ)', () => {
  const deal = { forecastMonth: '2026-09', expectedCloseDate: '2026-09-15' };
  assert.equal(dealInReportPeriod(deal, p({ mode: 'range', from: '2026-09-15', to: '2026-09-20' })), true);
  assert.equal(dealInReportPeriod(deal, p({ mode: 'range', from: '2026-09-01', to: '2026-09-14' })), false);
});

test('ไม่มีวัน/เดือนคาดปิด = ไม่อยู่ในงวดไหน · ไม่จำกัดงวด = ทุกดีล', () => {
  assert.equal(dealInReportPeriod({}, p({ mode: 'year', year: '2026' })), false);
  assert.equal(dealInReportPeriod({}, null), true);
  assert.equal(dealCloseMonth({ expectedCloseDate: '2026-08-31' }), '2026-08');
});

test('API รายการดีลกรองด้วยกติกาเดียวกัน (forecastMonth · expectedCloseDate สำหรับช่วงวัน)', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/sales-planning/deals/route.js'), 'utf8');
  assert.match(route, /parseReportPeriodParams\(/);
  assert.match(route, /\.gte\('expectedCloseDate', period\.from\)\.lte\('expectedCloseDate', period\.to\)/);
  assert.match(route, /\.in\('forecastMonth', period\.months\)/);
  const fc = readFileSync(join(process.cwd(), 'src/app/api/sales-planning/forecast-report/route.js'), 'utf8');
  assert.match(fc, /dealInReportPeriod\(deal, period\)/);
});
