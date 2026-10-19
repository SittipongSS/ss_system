// ── ดีลจาก FC สหมิตร: วันเริ่ม = วันคาดได้ PO · วันสิ้นสุด = สิ้นเดือนส่งของ ─────────
//
// มติผู้ใช้ 2026-10-15 · 🐞 เดิมดีลจาก FC ไม่มีสองช่องนี้เลย ⇒ ฟอร์มแก้ดีลบันทึกไม่ได้
// และรายงานวางแผนผลิตต้องถอยไปอ่าน metadata.demandMonth
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deliveryBeforePo, fcDealDates, lastDayOfMonth } from './dealDates.js';
import { dealDeliveryMonth } from '../sales/dealPeriod.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('สิ้นเดือน — รวมกุมภาปีอธิกสุรทิน · รับวันที่เต็มได้ · อ่านไม่ออก = null', () => {
  assert.equal(lastDayOfMonth('2026-11'), '2026-11-30');
  assert.equal(lastDayOfMonth('2027-01'), '2027-01-31');
  assert.equal(lastDayOfMonth('2028-02'), '2028-02-29');
  assert.equal(lastDayOfMonth('2027-02-15'), '2027-02-28');
  assert.equal(lastDayOfMonth(''), null);
  assert.equal(lastDayOfMonth('2027-1'), null);
  assert.equal(lastDayOfMonth(null), null);
});

test('วันเริ่ม = สิ้นเดือนคาดได้ PO · วันสิ้นสุด = สิ้นเดือนส่งของ', () => {
  // รูปของจริง: PO พ.ย. 69 ส่งของ ม.ค. 70
  assert.deepEqual(fcDealDates({ poMonth: '2026-11', demandMonth: '2027-01' }), { startDate: '2026-11-30', endDate: '2027-01-31' });
  // เดือนเดียวกันได้ — วันเริ่ม = วันสิ้นสุด
  assert.deepEqual(fcDealDates({ poMonth: '2026-10', demandMonth: '2026-10' }), { startDate: '2026-10-31', endDate: '2026-10-31' });
  assert.deepEqual(fcDealDates({ poMonth: '2026-10', demandMonth: null }), { startDate: '2026-10-31', endDate: null });
});

test('วันสิ้นสุดอยู่เดือนเดียวกับ demandMonth — รายงานวางแผนผลิตไม่ย้ายยอดข้ามเดือน', () => {
  const { endDate } = fcDealDates({ poMonth: '2026-11', demandMonth: '2027-01' });
  const before = { metadata: { demandMonth: '2027-01' } };
  const after = { ...before, endDate };
  assert.equal(dealDeliveryMonth(after), dealDeliveryMonth(before));
});

test('เดือนส่งของมาก่อนเดือน PO = ห้ามสร้าง · เดือนเท่ากันหรือหลังกว่าได้', () => {
  assert.equal(deliveryBeforePo({ poMonth: '2026-12', demandMonth: '2026-11' }), true);
  assert.equal(deliveryBeforePo({ poMonth: '2026-11', demandMonth: '2026-11' }), false);
  assert.equal(deliveryBeforePo({ poMonth: '2026-11', demandMonth: '2027-01' }), false);
  // ข้ามปี — เทียบเป็นสตริง YYYY-MM ต้องถูก
  assert.equal(deliveryBeforePo({ poMonth: '2027-01', demandMonth: '2026-12' }), true);
  // ไม่รู้เดือนใดเดือนหนึ่ง = ไม่ใช่เหตุตีกลับ
  assert.equal(deliveryBeforePo({ poMonth: '2026-11', demandMonth: '' }), false);
});

test('ทั้งสองเส้นที่สร้างดีลจาก FC เขียนวันผ่านตัวกลางตัวเดียว', () => {
  const create = codeOnly(read('../../app/api/sahamit/forecast/rounds/[id]/create-sales-deal/route.js'));
  assert.match(create, /const \{ startDate, endDate \} = fcDealDates\(\{ poMonth: forecastMonth, demandMonth \}\)/);
  assert.match(create, /startDate,\s*endDate,/);
  // ด่านเดือนกลับด้านต้องมาก่อน insert และตีกลับทั้งคำขอ
  assert.ok(create.indexOf('deliveryBeforePo(') < create.indexOf(".from('sales_deals').insert("));
  assert.match(create, /if \(earlyLines\.length\) \{\s*const named/);

  const sync = codeOnly(read('../../app/api/sahamit/forecast/rounds/[id]/sync-sales-planning/route.js'));
  assert.match(sync, /\.\.\.fcDealDates\(\{ poMonth: bucket\.closeMonth, demandMonth: bucket\.demandMonth \}\)/);

  // สูตรสิ้นเดือนเคยก๊อปไว้สองไฟล์ — ต้องเหลือที่เดียว
  for (const [name, src] of [['create', create], ['sync', sync]]) {
    assert.doesNotMatch(src, /function lastDayOfMonth/, `${name}: ใช้ lastDayOfMonth จาก lib/sahamit/dealDates`);
  }
});

test('โมดัลบอกวันก่อนกด และกันเดือนกลับด้านตั้งแต่จอ', () => {
  const page = codeOnly(read('../../app/sahamit/forecast/page.js'));
  assert.match(page, /วันที่เริ่ม \{fmtDate\(lastDayOfMonth\(dealMonth\)\)\}/);
  assert.match(page, /deliveryBeforePo\(\{ poMonth: dealMonth, demandMonth: r\.month \}\)/);
  assert.match(page, /if \(earlyReason\) \{ notifyToast\.error\(earlyReason\); return; \}/);
  // selection ต้องคำนวณใหม่เมื่อเปลี่ยนเดือน PO
  assert.match(page, /\}, \[selectedLines, lineList, dealMonth\]\);/);
});
