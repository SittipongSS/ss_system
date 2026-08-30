// ── เกณฑ์ "ใบไหนมีรอบบริการ" (มติ 2026-08-30) — logic ล้วน ────────────────
//
// กติกาที่ชุดนี้ล็อก: ต้องครบสองข้อ (สาย SERVICE + มีบรรทัดหมวด 02-001) ·
// ตัดสินระดับใบไม่ใช่รายบรรทัด · สายที่ยังไม่ระบุ (null) ไม่ใช่ "ไม่ใช่บริการ" แต่ก็ยังไม่เข้าเส้น ·
// อ่านหมวดจาก fgCode ที่ตรึงบนบรรทัด ไม่ใช่จากทะเบียนสินค้าสด
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICE_ROUND_CATEGORY,
  hasServicePackageLine,
  lineIsServicePackage,
  orderBusinessLineOf,
  orderHasServiceRounds,
} from './serviceOrders.js';

const svcLine = (over = {}) => ({ id: 'L1', fgCode: 'FG-0233-02-001-10001', qty: 6, ...over });
const otherLine = (over = {}) => ({ id: 'L9', fgCode: 'FG-0233-01-002-10001', qty: 1, ...over });
const serviceDeal = { id: 'DL1', line: 'SERVICE' };
const productDeal = { id: 'DL2', line: 'PRODUCT' };

test('หมวดที่ทำให้ใบเข้าเส้นบริการคือ 02-001 ค่าเดียว', () => {
  assert.equal(SERVICE_ROUND_CATEGORY, '02-001');
});

test('อ่านหมวดจาก fgCode ได้ทั้งรหัสออโต้และรหัสกรอกมือ', () => {
  assert.equal(lineIsServicePackage({ fgCode: 'FG-0233-02-001-10001' }), true); // ออโต้
  assert.equal(lineIsServicePackage({ fgCode: 'FG-233-02-001-1234' }), true); // กรอกมือ
  assert.equal(lineIsServicePackage({ fgCode: 'FG-0233-02-002-10001' }), false); // หมวดอื่นใน 02
  assert.equal(lineIsServicePackage({ fgCode: 'FG-0233-01-001-10001' }), false); // กลุ่มหลักอื่น
  assert.equal(lineIsServicePackage({ fgCode: null }), false);
  assert.equal(lineIsServicePackage(null), false);
});

test('⭐ ใบมีบรรทัด 02-001 อย่างน้อยหนึ่งบรรทัด = ทั้งใบเข้าเกณฑ์ (ไม่ตัดสินรายบรรทัด)', () => {
  const lines = [otherLine({ id: 'A' }), svcLine({ id: 'B' }), otherLine({ id: 'C' })];
  assert.equal(hasServicePackageLine(lines), true);
  assert.equal(orderHasServiceRounds({ dealId: 'DL1', deal: serviceDeal }, lines), true);
});

test('สาย SERVICE แต่ไม่มีบรรทัด 02-001 เลย = ไม่มีรอบบริการ', () => {
  const lines = [otherLine(), otherLine({ id: 'C' })];
  assert.equal(orderHasServiceRounds({ dealId: 'DL1', deal: serviceDeal }, lines), false);
});

test('มีบรรทัด 02-001 แต่ดีลเป็นสายสินค้า = ไม่เข้าเส้นบริการ', () => {
  assert.equal(orderHasServiceRounds({ dealId: 'DL2', deal: productDeal }, [svcLine()]), false);
});

test('⭐ สายที่ยังไม่ระบุ (null) ยังไม่เข้าเส้น — และห้ามถูกอ่านว่าเป็นสายสินค้า', () => {
  const order = { dealId: 'DL3', deal: { id: 'DL3', line: null } };
  assert.equal(orderHasServiceRounds(order, [svcLine()]), false);
  assert.equal(orderBusinessLineOf(order), null);
});

test('โครงการมาก่อนดีลเสมอ — โครงการเป็นเจ้าของค่าสายจริง', () => {
  const order = { projectId: 'PJ1', project: { id: 'PJ1', line: 'SERVICE' }, dealId: 'DL2', deal: productDeal };
  assert.equal(orderBusinessLineOf(order), 'SERVICE');
  assert.equal(orderHasServiceRounds(order, [svcLine()]), true);
});

test('โครงการที่ยังไม่ระบุสาย ตกไปถามดีลต่อ ไม่ใช่ตอบ null ทันที', () => {
  const order = { projectId: 'PJ2', project: { id: 'PJ2', line: null }, dealId: 'DL1', deal: serviceDeal };
  assert.equal(orderBusinessLineOf(order), 'SERVICE');
});

test('เรียกจากคิวงานที่มี Map ของหลายใบก็ได้ผลเดียวกัน', () => {
  const ctx = {
    projectsById: new Map([['PJ1', { id: 'PJ1', line: 'SERVICE' }]]),
    dealsById: new Map([['DL2', productDeal]]),
  };
  assert.equal(orderHasServiceRounds({ projectId: 'PJ1', dealId: 'DL2' }, [svcLine()], ctx), true);
});

test('ไม่ส่ง lines มา ใช้ order.lines ที่ติดมากับใบ', () => {
  const order = { dealId: 'DL1', deal: serviceDeal, lines: [svcLine()] };
  assert.equal(orderHasServiceRounds(order), true);
});

test('ใบเปล่า/ไม่มีบรรทัด = ไม่เข้าเกณฑ์ ไม่ throw', () => {
  assert.equal(orderHasServiceRounds({ dealId: 'DL1', deal: serviceDeal }, []), false);
  assert.equal(orderHasServiceRounds(null, null), false);
});
