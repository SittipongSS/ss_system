// ── ใช้จริง เทียบ มาตรฐาน (รายโซน) ───────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyUsageOfZone, toMl, usageBadge, usageSummary, usageVsStandard } from './consumption.js';

const assets = [
  { id: 'A1', zoneId: 'Z1' },
  { id: 'A2', zoneId: 'Z1' },
  { id: 'B1', zoneId: 'Z2' },
];
const visits = [
  { id: 'V1', actualDate: '2026-06-10' },
  { id: 'V2', actualDate: '2026-07-08' },
  { id: 'V3', actualDate: '2026-08-05' },
  { id: 'V4', scheduledDate: '2026-09-01', actualDate: null },  // ยังไม่ได้ไป
];

test('หน่วยที่แปลง ml ไม่ได้ ต้องคืน null ไม่ใช่เดาว่าเป็น ml', () => {
  assert.equal(toMl(300, 'ml'), 300);
  assert.equal(toMl(1.5, 'ลิตร'), 1500);
  assert.equal(toMl(2, 'กิโลกรัม'), null, 'ความหนาแน่นแต่ละสูตรไม่เท่ากัน ห้ามคูณ 1.0');
  assert.equal(toMl(1, 'ขวด'), null, 'ขนาดขวดไม่คงที่');
  assert.equal(toMl(300, ''), null);
  assert.equal(toMl(0, 'ml'), null);
});

test('⭐ นับเฉพาะของที่ผูกกับเครื่องในโซนนี้ — ของกลางของไซต์ไม่เข้าโซนไหน', () => {
  const items = [
    { visitId: 'V2', assetId: 'A1', qty: 300, unit: 'ml' },
    { visitId: 'V2', assetId: 'B1', qty: 500, unit: 'ml' },   // โซนอื่น
    { visitId: 'V2', assetId: null, qty: 1, unit: 'ขวด' },    // ของกลาง (น้ำยาเช็ดเครื่อง)
  ];
  const m = monthlyUsageOfZone({ zoneId: 'Z1', items, assets, visits });
  assert.equal(m.get('2026-07').ml, 300);
  assert.equal(m.size, 1);
});

test('⭐ ยอดลงเดือนที่ **เข้าจริง** ไม่ใช่เดือนที่นัด', () => {
  const items = [{ visitId: 'V1', assetId: 'A1', qty: 250, unit: 'ml' }];
  const m = monthlyUsageOfZone({ zoneId: 'Z1', items, assets, visits });
  assert.ok(m.has('2026-06'));
});

test('นัดที่ยังไม่ได้ไปถึง ไม่มียอด', () => {
  const items = [{ visitId: 'V4', assetId: 'A1', qty: 300, unit: 'ml' }];
  assert.equal(monthlyUsageOfZone({ zoneId: 'Z1', items, assets, visits }).size, 0);
});

test('⭐ แถวที่แปลงหน่วยไม่ได้ ต้องถูกนับแยก ไม่ใช่กลืนหายไปในยอดรวม', () => {
  const items = [
    { visitId: 'V3', assetId: 'A1', qty: 300, unit: 'ml' },
    { visitId: 'V3', assetId: 'A2', qty: 2, unit: 'กิโลกรัม' },
  ];
  const row = monthlyUsageOfZone({ zoneId: 'Z1', items, assets, visits }).get('2026-08');
  assert.equal(row.ml, 300);
  assert.equal(row.unconverted, 1);
});

const items = [
  { visitId: 'V2', assetId: 'A1', qty: 300, unit: 'ml' },
  { visitId: 'V2', assetId: 'A2', qty: 300, unit: 'ml' },
  { visitId: 'V3', assetId: 'A1', qty: 700, unit: 'ml' },
];

test('⭐ เดือนที่ไม่ได้เข้าเลยต้องมีแถว — ช่องว่างคือคำตอบ ไม่ใช่ข้อมูลขาด', () => {
  const rows = usageVsStandard({
    zoneId: 'Z1', items, assets, visits, standardMlPerMonth: 600,
    months: 3, todayMonth: '2026-08',
  });
  assert.deepEqual(rows.map((r) => r.month), ['2026-06', '2026-07', '2026-08']);
  assert.equal(rows[0].usedMl, null, 'มิ.ย. ไม่มี item ⇒ ไม่ได้เข้า');
  assert.equal(rows[1].usedMl, 600);
  assert.equal(rows[2].usedMl, 700);
});

test('ส่วนต่างและอัตราส่วนคิดเฉพาะเดือนที่มีมาตรฐานและมีการเข้า', () => {
  const rows = usageVsStandard({
    zoneId: 'Z1', items, assets, visits, standardMlPerMonth: 600,
    months: 3, todayMonth: '2026-08',
  });
  assert.equal(rows[1].diffMl, 0);
  assert.equal(rows[2].diffMl, 100);
  assert.equal(rows[0].ratio, null);
  assert.equal(rows[2].ratio > 1, true);
});

test('ไม่มีมาตรฐาน = ไม่มีตัวเทียบ แต่ยอดใช้จริงยังต้องขึ้น', () => {
  const rows = usageVsStandard({ zoneId: 'Z1', items, assets, visits, months: 2, todayMonth: '2026-08' });
  assert.equal(rows[1].standardMl, null);
  assert.equal(rows[1].ratio, null);
  assert.equal(rows[1].usedMl, 700);
});

test('⭐ ค่าเฉลี่ยไม่หารด้วยเดือนที่ช่างไม่ได้ไป — ไม่งั้นอ่านเป็น "ลูกค้าใช้น้อยลง"', () => {
  const rows = usageVsStandard({
    zoneId: 'Z1', items, assets, visits, standardMlPerMonth: 600,
    months: 3, todayMonth: '2026-08',
  });
  const s = usageSummary(rows);
  assert.equal(s.months, 2, 'นับเฉพาะ ก.ค. กับ ส.ค.');
  assert.equal(s.missedMonths, 1);
  assert.ok(Math.abs(s.avgRatio - ((600 / 600 + 700 / 600) / 2)) < 1e-9);
});

test('ป้ายสรุปบอกทิศทาง ไม่ตัดสินว่าใครผิด', () => {
  assert.equal(usageBadge({ avgRatio: 1.02 }).text, 'ใกล้เคียงมาตรฐาน');
  assert.equal(usageBadge({ avgRatio: 1.4 }).text, 'เฉลี่ยเกิน 40%');
  assert.equal(usageBadge({ avgRatio: 0.7 }).text, 'เฉลี่ยต่ำกว่า 30%');
  assert.equal(usageBadge({ avgRatio: null }), null);
  assert.equal(usageBadge(null), null);
});
