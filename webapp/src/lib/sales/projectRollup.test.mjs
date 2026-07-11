// Tests นิยามตัวเลข rollup ระดับโครงการ (เฟส B) — ล็อกสูตรตามมติผู้ใช้:
// FC Total / Actual / FC คงเหลือ / มูลค่ารวม (=Actual+FC คงเหลือ) + แยกตามประเภทดีล.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { rollupDeals, wonAmt } from './projectRollup';

const deal = (over = {}) => ({ stage: 'qualified', dealType: 'NPD', projectValue: 0, wonValue: null, ...over });

test('โครงการวงจรเต็ม: SCENT won + NPD won + RE-ORDER เปิด — ตัวเลขตรงนิยาม', () => {
  const r = rollupDeals([
    deal({ dealType: 'SCENT', stage: 'won', projectValue: 50000, wonValue: 50000 }),
    deal({ dealType: 'NPD', stage: 'won', projectValue: 300000, wonValue: 280000 }), // ปิดต่ำกว่า FC
    deal({ dealType: 'RE-ORDER', stage: 'qualified', projectValue: 120000, forecastMonth: '2026-09' }),
    deal({ dealType: 'RE-ORDER', stage: 'quotation', projectValue: 80000, forecastMonth: '2026-08' }),
  ]);
  assert.equal(r.fcTotal, 50000 + 300000 + 120000 + 80000);   // won FC + open FC
  assert.equal(r.actual, 50000 + 280000);                      // ยอดเก็บจริง
  assert.equal(r.fcRemaining, 120000 + 80000);                 // ดีลเปิด
  assert.equal(r.totalValue, r.actual + r.fcRemaining);        // มูลค่าโครงการ
  assert.equal(r.variance, -20000);                            // NPD ปิดต่ำกว่าแผน 20k
  assert.equal(r.wonCount, 2);
  assert.equal(r.openCount, 2);
  assert.equal(r.nextForecastMonth, '2026-08');                // เดือน FC ที่ใกล้สุดของดีลเปิด
});

test('lost ไม่เข้า FC Total/คงเหลือ แต่ถูกนับจำนวน', () => {
  const r = rollupDeals([
    deal({ stage: 'lost', projectValue: 999999 }),
    deal({ stage: 'qualified', projectValue: 100 }),
  ]);
  assert.equal(r.fcTotal, 100);
  assert.equal(r.fcRemaining, 100);
  assert.equal(r.lostCount, 1);
  assert.equal(r.dealCount, 2);
});

test('byType แยก 3 ประเภทครบ (ประเภทที่ไม่มีดีล = ศูนย์) + fallback metadata เก่า', () => {
  const r = rollupDeals([
    // ดีลเก่าก่อน backfill: ไม่มีคอลัมน์ dealType อ่านจาก metadata
    { stage: 'won', projectValue: 10, wonValue: 10, metadata: { projectType: 'RE-ORDER' } },
  ]);
  assert.equal(r.byType.length, 3);
  const re = r.byType.find((b) => b.type === 'RE-ORDER');
  const scent = r.byType.find((b) => b.type === 'SCENT');
  assert.equal(re.actual, 10);
  assert.equal(scent.actual, 0);
});

test('wonAmt: ดีลเก่าไม่มี wonValue ใช้ projectValue (ก่อน mig 0081) + stage in_project เก่านับเป็น won', () => {
  assert.equal(wonAmt({ wonValue: null, projectValue: 77 }), 77);
  const r = rollupDeals([deal({ stage: 'in_project', projectValue: 50, wonValue: 45 })]);
  assert.equal(r.actual, 45);
  assert.equal(r.wonCount, 1);
});

test('ว่าง/ไม่มีดีล → ศูนย์ทุกตัว', () => {
  const r = rollupDeals([]);
  assert.equal(r.fcTotal, 0);
  assert.equal(r.totalValue, 0);
  assert.equal(r.nextForecastMonth, null);
});
