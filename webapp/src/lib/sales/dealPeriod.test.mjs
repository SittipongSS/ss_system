import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  dealAxisMonth, dealAxisPlacement, dealCloseMonth, dealDeliveryMonth, dealDeliveryState, dealDeliveryUnknown,
  dealInReportPeriod, dealMissingDelivery,
} from './dealPeriod.js';
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

test('แกนเดือนรับของ: endDate อยู่ในงวด · สหมิตรใช้เดือนที่ลูกค้าขอ · ไม่มีวันรับของ = กองของงวดที่ปิด', () => {
  const deal = { forecastMonth: '2026-09', expectedCloseDate: '2026-09-15', endDate: '2026-11-30' };
  assert.equal(dealInReportPeriod(deal, p({ mode: 'month', month: '2026-11' }), 'delivery'), true);
  assert.equal(dealInReportPeriod(deal, p({ mode: 'month', month: '2026-09' }), 'delivery'), false);
  assert.equal(dealInReportPeriod(deal, p({ mode: 'range', from: '2026-11-25', to: '2026-11-30' }), 'delivery'), true);
  assert.equal(dealAxisMonth(deal, 'delivery'), '2026-11');
  assert.equal(dealAxisMonth(deal, 'close'), '2026-09');
  const sahamit = { forecastMonth: '2026-08', metadata: { demandMonth: '2026-10' } };
  assert.equal(dealDeliveryMonth(sahamit), '2026-10');
  assert.equal(dealInReportPeriod(sahamit, p({ mode: 'month', month: '2026-10' }), 'delivery'), true);
  const unknown = { forecastMonth: '2026-09', expectedCloseDate: '2026-09-15' };
  assert.equal(dealDeliveryUnknown(unknown), true);
  assert.equal(dealAxisMonth(unknown, 'delivery'), null);
  // ไม่เดาเดือนส่ง: อยู่ในงวดของเดือนที่ปิด (ไปกองยังไม่ระบุ) ไม่ใช่ทุกงวด
  assert.equal(dealInReportPeriod(unknown, p({ mode: 'month', month: '2026-09' }), 'delivery'), true);
  assert.equal(dealInReportPeriod(unknown, p({ mode: 'month', month: '2026-10' }), 'delivery'), false);
});

test('ขาดวันรับของ = ไม่มีวันรับของ และไม่ใช่ Lost — แถบเตือนกับตัวกรองนับชุดเดียวกัน', () => {
  assert.equal(dealMissingDelivery({ stage: 'quotation', forecastMonth: '2026-09' }), true);
  assert.equal(dealMissingDelivery({ stage: 'won', forecastMonth: '2026-09' }), true);
  assert.equal(dealMissingDelivery({ stage: 'lost', forecastMonth: '2026-09' }), false);
  assert.equal(dealMissingDelivery({ stage: 'quotation', endDate: '2026-11-30' }), false);
  // ตัวกรอง: ระบุแล้ว = มีเดือนรับของจริง · ดีลแพ้ไม่มีวันรับของไม่อยู่ทั้งสองกลุ่ม (รีวิว #1787)
  assert.equal(dealDeliveryState({ stage: 'quotation', forecastMonth: '2026-09' }), 'missing');
  assert.equal(dealDeliveryState({ stage: 'lost', forecastMonth: '2026-09' }), null);
  assert.equal(dealDeliveryState({ stage: 'lost', endDate: '2026-11-30' }), 'known');
  const page = readFileSync(join(process.cwd(), 'src/app/sales-planning/deals/page.js'), 'utf8');
  assert.doesNotMatch(page, /dealDeliveryUnknown/, 'หน้าดีลต้องใช้ dealMissingDelivery ทั้งแถบเตือนและตัวกรอง');
  assert.match(page, /deliveryFilter\.includes\(dealDeliveryState\(deal\)\)/);
  assert.match(page, /inScopeDeal\(d\) && dealMissingDelivery\(d\)/);
  // ล้างตัวกรองทั้งหมดต้องล้างวันรับของด้วย · ปุ่มบนแถบเตือนล้างตัวกรอง/คำค้นอื่นก่อน (จำนวนบนแถบจะได้ตรงกับตาราง)
  assert.match(page, /onClear=\{\(\) => \{[^}]*setDeliveryFilter\(\[\]\)/);
  const show = page.slice(page.indexOf('const showMissingDelivery'), page.indexOf('const showMissingDelivery') + 400);
  for (const setter of ['setStageFilter([])', 'setTypeFilter([])', 'setDueFilter([])', 'setReviewFilter([])', 'setQuery("")', 'setDeliveryFilter(["missing"])']) {
    assert.ok(show.includes(setter), `showMissingDelivery ต้องเรียก ${setter}`);
  }
  assert.match(page, /onClick=\{showMissingDelivery\}/);
});

test('อ่านรูปเดือน/วันแบบเดียว: demandMonth มีวันพ่วงได้ · รูปผิด = ไม่รู้ (ไม่ใช่เดาจาก 7 ตัวแรก)', () => {
  assert.equal(dealDeliveryMonth({ metadata: { demandMonth: '2026-10-15' } }), '2026-10');
  assert.equal(dealDeliveryMonth({ metadata: { demandMonth: '2026-13' } }), null);
  assert.equal(dealDeliveryMonth({ metadata: { demandMonth: 'ต.ค. 69' } }), null);
  assert.equal(dealDeliveryMonth({ endDate: 'garbage', metadata: { demandMonth: '2026-10' } }), '2026-10');
  assert.deepEqual(dealAxisPlacement({ endDate: '2026-11-30' }, 'delivery'), { month: '2026-11', basis: 'endDate' });
  assert.deepEqual(dealAxisPlacement({ metadata: { demandMonth: '2026-10-15' } }, 'delivery'), { month: '2026-10', basis: 'demandMonth' });
  assert.deepEqual(dealAxisPlacement({ expectedCloseDate: '2026-09-15' }, 'delivery'), { month: null, basis: 'expectedCloseDate' });
});

/* ⭐ สวีป: ดีลที่ผ่านตัวคัดของงวด+แกน ต้องลงช่องเดือนที่อยู่ในงวดเสมอ (หรือกอง) — ไม่งั้นยอดหายจากกริดเงียบ ๆ
   🐞 รีวิว #1787: แกนปิดช่วงวันคัดด้วย expectedCloseDate แต่ลงช่องด้วย forecastMonth (สหมิตรสองช่องนี้ต่างกันได้) */
test('สวีป: ดีลในงวดลงช่องในงวดเสมอ ทั้งสองแกน ทุกโหมด', () => {
  const values = {
    forecastMonth: [undefined, '2026-08', '2026-09', '2026-10'],
    expectedCloseDate: [undefined, '2026-08-31', '2026-09-10', '2026-09-30', '2026-10-31'],
    endDate: [undefined, '2026-09-01', '2026-10-15', '2026-12-31', 'bad'],
    demandMonth: [undefined, '2026-10', '2026-10-15', '2026-13'],
  };
  const periods = [
    p({ mode: 'month', month: '2026-09' }), p({ mode: 'month', month: '2026-10' }), p({ mode: 'year', year: '2026' }),
    p({ mode: 'range', from: '2026-09-05', to: '2026-10-20' }), p({ mode: 'range', from: '2026-10-01', to: '2026-10-31' }),
  ];
  let checked = 0;
  for (const forecastMonth of values.forecastMonth) for (const expectedCloseDate of values.expectedCloseDate)
    for (const endDate of values.endDate) for (const demandMonth of values.demandMonth) {
      const deal = { stage: 'quotation', forecastMonth, expectedCloseDate, endDate, metadata: demandMonth ? { demandMonth } : {} };
      for (const period of periods) for (const axis of ['close', 'delivery']) {
        if (!dealInReportPeriod(deal, period, axis)) continue;
        const { month } = dealAxisPlacement(deal, axis, period);
        checked += 1;
        if (month !== null) assert.ok(period.months.includes(month), `${JSON.stringify(deal)} ${axis} ${period.from}..${period.to} → ${month}`);
        if (axis === 'delivery') assert.equal(month === null, dealDeliveryUnknown(deal));
        if (axis === 'close') assert.notEqual(month, null, 'แกนปิด: ดีลในงวดต้องมีเดือนปิดเสมอ');
      }
    }
  assert.ok(checked > 500, `สวีปต้องครอบเคสพอ (${checked})`);
});

test('API รายการดีลกับไฟล์ FC คัดด้วยตัวตัดสินเดียวกันทั้งสองแกน · ไฟล์ลงช่องด้วยฟิลด์เดียวกับตัวคัด', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/sales-planning/deals/route.js'), 'utf8');
  assert.match(route, /parseReportPeriodParams\(/);
  // query แกนปิด = ชุดที่ใหญ่กว่า (ตัดให้เล็กลงเท่านั้น) — ช่วงวันใช้วันคาดปิด · รายเดือนเผื่อดีลที่ไม่มีเดือน FC
  assert.match(route, /\.gte\('expectedCloseDate', period\.from\)\.lte\('expectedCloseDate', period\.to\)/);
  assert.match(route, /forecastMonth\.in\.\(\$\{period\.months\.join\(','\)\}\),and\(expectedCloseDate\.gte\.\$\{period\.from\},expectedCloseDate\.lte\.\$\{period\.to\}\)/);
  // คัดจริงหลังอ่านด้วยตัวตัดสินกลาง ทั้งสองแกน (ไม่ใช่เฉพาะแกนรับของ)
  assert.match(route, /scoped\.filter\(\(d\) => dealInReportPeriod\(d, period, axis\)\)/);
  const fc = readFileSync(join(process.cwd(), 'src/app/api/sales-planning/forecast-report/route.js'), 'utf8');
  assert.match(fc, /dealInReportPeriod\(deal, period, axis\)/);
  assert.match(fc, /dealAxisPlacement\(deal, axis, period\)/);
  assert.doesNotMatch(fc, /forecastMonthOfDeal\(/, 'ไฟล์ FC ห้ามลงช่องด้วยตัวอ่านเดือนอีกชุด');
});

test('query แกนปิดรายเดือนเป็นชุดที่ใหญ่กว่าตัวตัดสินเสมอ (ไม่ทิ้งดีลที่ตัวตัดสินนับ)', () => {
  // จำลองเงื่อนไข .or() ของ route: forecastMonth ในงวด หรือ วันคาดปิดใน [from, to]
  const superset = (deal, period) => (period.months.includes(deal.forecastMonth))
    || (Boolean(deal.expectedCloseDate) && deal.expectedCloseDate >= period.from && deal.expectedCloseDate <= period.to);
  const deals = [
    { forecastMonth: '2026-09' }, { expectedCloseDate: '2026-09-30' }, { forecastMonth: '2026-08', expectedCloseDate: '2026-09-02' },
    { forecastMonth: '', expectedCloseDate: '2026-09-15' }, { forecastMonth: '2026-10', expectedCloseDate: '2026-09-15' },
  ];
  for (const period of [p({ mode: 'month', month: '2026-09' }), p({ mode: 'year', year: '2026' })]) {
    for (const deal of deals) {
      if (dealInReportPeriod(deal, period, 'close')) assert.ok(superset(deal, period), JSON.stringify(deal));
    }
  }
});
