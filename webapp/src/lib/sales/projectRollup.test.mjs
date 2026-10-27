// Tests นิยามตัวเลข rollup ระดับโครงการ (เฟส B) — ล็อกสูตรตามมติผู้ใช้:
// FC Total / Actual / FC คงเหลือ / มูลค่ารวม (=Actual+FC คงเหลือ) + แยกตามประเภทดีล.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { rollupDeals, wonAmt } from './projectRollup';
import { DEAL_TYPES } from '../salesPlanning';

const deal = (over = {}) => ({ stage: 'qualified', dealType: 'NPD', projectValue: 0, wonValue: null, metadata: {}, ...over });

test('โครงการวงจรเต็ม: SCENT won + NPD won + RE-ORDER เปิด — ตัวเลขตรงนิยาม', () => {
  const r = rollupDeals([
    deal({ dealType: 'SCENT', stage: 'won', projectValue: 50000, wonValue: 50000, metadata: { actualSource: 'sale_order' } }),
    deal({ dealType: 'NPD', stage: 'won', projectValue: 300000, wonValue: 280000, metadata: { actualSource: 'sale_order' } }), // ปิดต่ำกว่า FC
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

test('byType แยกทุกประเภทครบ (ประเภทที่ไม่มีดีล = ศูนย์) + fallback metadata เก่า', () => {
  const r = rollupDeals([
    // ดีลเก่าก่อน backfill: ไม่มีคอลัมน์ dealType อ่านจาก metadata
    { stage: 'won', projectValue: 10, wonValue: 10, metadata: { projectType: 'RE-ORDER', actualSource: 'sale_order' } },
  ]);
  // ผูกกับ DEAL_TYPES ไม่ใช่เลขตายตัว — เพิ่มประเภทที่ 5 แล้วเทสต์นี้ต้องไม่แดงโดยไม่มีเหตุ
  // (เลข 3 เดิมแดงตอนเพิ่ม 'OTHER' ทั้งที่พฤติกรรมถูก — mig 0247)
  assert.equal(r.byType.length, DEAL_TYPES.length);
  assert.equal(r.byType.find((b) => b.type === 'OTHER').actual, 0);
  const re = r.byType.find((b) => b.type === 'RE-ORDER');
  const scent = r.byType.find((b) => b.type === 'SCENT');
  assert.equal(re.actual, 10);
  assert.equal(scent.actual, 0);
});

test('wonAmt: นับเฉพาะ cache ที่มาจาก Sale Order และยังรองรับ stage in_project เก่า', () => {
  assert.equal(wonAmt({ wonValue: 77, metadata: {} }), 0);
  assert.equal(wonAmt({ wonValue: 77, metadata: { actualSource: 'sale_order' } }), 77);
  const r = rollupDeals([deal({ stage: 'in_project', projectValue: 50, wonValue: 45, metadata: { actualSource: 'sale_order' } })]);
  assert.equal(r.actual, 45);
  assert.equal(r.wonCount, 1);
});

test('ว่าง/ไม่มีดีล → ศูนย์ทุกตัว', () => {
  const r = rollupDeals([]);
  assert.equal(r.fcTotal, 0);
  assert.equal(r.totalValue, 0);
  assert.equal(r.nextForecastMonth, null);
});

/* ── ใบสั่งขาย "Actual รายงวด" (mig 0412 · มติเจ้าของ 26/10/2026) ─────────────────────────────────────
   นับไปบางงวด — "มูลค่าโครงการ" ต้องไม่หด และ variance ต้องไม่ติดลบเท่างวดที่ยังไม่ถึงคิว
   ⇒ totalValue / variance คิดจาก "ยอดปิดเต็ม" (Actual + งวดยื่นแล้ว + รอนับรายงวด) · actual ยังเป็น Actual ล้วน */
test('rollupDeals: ใบรายงวดที่นับบางงวด — totalValue/variance ใช้ยอดปิดเต็ม · actual = Actual ล้วน', async () => {
  const { rollupDeals } = await import('./projectRollup.js');
  const instDeal = {
    stage: 'won', dealType: 'NPD', projectValue: 300000, wonValue: 100000,
    metadata: {
      actualSource: 'sale_order', wonMonth: '2026-08', actualByMonth: { '2026-08': 100000 },
      soInstPendingAmount: 100000, soInstPendingCount: 1, soInstRemainingByDue: { '2026-12': 100000 },
    },
  };
  const open = { stage: 'quotation', dealType: 'NPD', projectValue: 50000, forecastMonth: '2026-11' };
  const r = rollupDeals([instDeal, open]);
  assert.equal(r.actual, 100000, 'Actual = งวดที่นับแล้วเท่านั้น');
  assert.equal(r.closedValue, 300000);
  assert.equal(r.instRemaining, 100000);
  assert.equal(r.pendingApproval, 100000, 'งวดที่ยื่นแล้วอยู่ในรออนุมัติ');
  assert.equal(r.totalValue, 350000, 'ยอดปิดเต็ม 300,000 + FC คงเหลือ 50,000');
  assert.equal(r.variance, 0, 'ปิดตามแผน — ไม่ติดลบ 200,000 จากงวดที่ยังไม่ถึงคิว');
  assert.equal(r.byType.find((b) => b.type === 'NPD').closedValue, 300000);
});

test('rollupDeals: ใบทั้งใบล้วน — totalValue/variance เท่าสูตรเดิม (actual + fcRemaining · actual − FC ของดีล Won)', async () => {
  const { rollupDeals } = await import('./projectRollup.js');
  const deals = [
    { stage: 'won', dealType: 'NPD', projectValue: 120000, wonValue: 100000.29, metadata: { actualSource: 'sale_order', wonMonth: '2026-08' } },
    { stage: 'won', dealType: 'SCENT', projectValue: 50000, wonValue: 0, metadata: { actualSource: 'sale_order', soPendingAmount: 45000, soPendingCount: 1 } },
    { stage: 'quotation', dealType: 'NPD', projectValue: 70000, forecastMonth: '2026-11' },
    { stage: 'lost', dealType: 'NPD', projectValue: 9999 },
  ];
  const r = rollupDeals(deals);
  assert.equal(r.closedValue, r.actual);
  assert.equal(r.totalValue, r.actual + r.fcRemaining);
  assert.equal(r.variance, r.actual - (r.fcTotal - r.fcRemaining));
  assert.equal(r.instRemaining, 0);
});
