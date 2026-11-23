// หน้าลูกค้าศูนย์รวม × ใบ "ไม่นับ Actual" (mig 0439 · มติเจ้าของ 20/11/2026 ข้อ 3: แถวโชว์ Actual 0 + ป้าย + เหตุผล)
//
// 🐞 ตรวจ 23/11: แท็บการขาย "ตามดีล" คอลัมน์ Actual ของดีลที่ใบอนุมัติแบบไม่นับ ขึ้น ฿0.00 + สถานะ "อนุมัติแล้ว" เฉย ๆ
//    ไม่มีป้าย/เหตุผล — อ่านเหมือนตัวเลขหาย · ตารางใบสั่งขายก็ไม่บอก · และตัวโหลดไม่ได้ดึง "actualNoneReason" มาเลย
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDealRows, dealActualNone, dealRowText, matchesQuery, orderActualNoneText, orderText } from './customerHub.js';
import { HUB_ORDER_COLS } from './customerHubData.js';

const TODAY = '2026-11-23';
const REASON = 'ใบตัวอย่างฟรีให้ลูกค้าทดลอง ไม่นับยอดขาย';
const NONE_SO = {
  id: 'S1', dealId: 'D1', orderNumber: 'SO-26110471-0', status: 'approved', origin: 'pipeline', createdAt: '2026-11-10',
  actualMode: 'none', actualAmount: 270000, actualNoneReason: REASON,
};
const deals = [{ id: 'D1', code: 'DL-261100779', title: 'Amenity', createdAt: '2026-11-01' }];

test('ตัวโหลดดึง "actualNoneReason" ของใบสั่งขาย (ไม่ดึง = ป้ายไม่มีเหตุผลเงียบ ๆ)', () => {
  assert.ok(HUB_ORDER_COLS.split(',').map((c) => c.trim()).includes('actualNoneReason'));
});

test('ใบไม่นับ: ป้าย "ไม่นับ Actual · เหตุผล" · ใบแบบอื่น/ยังไม่อนุมัติ = ไม่มีป้าย', () => {
  assert.equal(orderActualNoneText(NONE_SO), `ไม่นับ Actual · ${REASON}`);
  assert.equal(orderActualNoneText({ ...NONE_SO, actualNoneReason: '  ' }), 'ไม่นับ Actual');
  assert.equal(orderActualNoneText({ ...NONE_SO, actualMode: 'order', actualNoneReason: null }), '');
  // ย้อนอนุมัติแล้ว: แบบ+เหตุผลยังค้างบนใบ (guard ของ 0439) แต่ใบไม่ได้อยู่ในสถานะอนุมัติ — ไม่ใช่ "ไม่นับ" แล้ว
  assert.equal(orderActualNoneText({ ...NONE_SO, status: 'approval_revoked' }), '');
  // ใบย้อนหลัง/ค่าสรรพสามิตไม่นับโดยที่มา ไม่ใช่ตัวเลือกนี้
  assert.equal(orderActualNoneText({ ...NONE_SO, origin: 'historical' }), '');
});

test('แถวดีลที่มีแต่ใบไม่นับ: Actual 0 + ป้ายพร้อมเหตุผล', () => {
  const [row] = buildDealRows({ deals, orders: [NONE_SO] }, TODAY);
  assert.equal(row.actual, 0);
  assert.deepEqual(row.actualNone, { count: 1, text: `ไม่นับ Actual · ${REASON}`, short: 'ไม่นับ Actual', reasons: [REASON] });
});

test('แถวดีลที่ใบนับ Actual ตามปกติ = ไม่มีป้าย · ใบไม่นับที่ถูกแทนแล้วไม่นับ', () => {
  const counted = { id: 'S2', dealId: 'D1', status: 'approved', origin: 'pipeline', createdAt: '2026-11-12', actualMode: 'order', actualAmount: 1000 };
  const [plain] = buildDealRows({ deals, orders: [counted] }, TODAY);
  assert.equal(plain.actualNone, null);
  assert.equal(plain.actual, 1000);
  const [revised] = buildDealRows({ deals, orders: [{ ...NONE_SO, status: 'revised', supersededById: 'S2' }, counted] }, TODAY);
  assert.equal(revised.actualNone, null);
});

test('ใบไม่นับหลายใบในดีลเดียว: "ไม่นับ Actual n ใบ" · เหตุผลทุกใบเก็บไว้ให้ title', () => {
  const second = { ...NONE_SO, id: 'S3', orderNumber: 'SO-26110480-0', actualNoneReason: 'ของแถมงานเปิดตัวสาขา ไม่คิดเงิน' };
  assert.deepEqual(dealActualNone([NONE_SO, second]), {
    count: 2, text: 'ไม่นับ Actual 2 ใบ', short: 'ไม่นับ Actual 2 ใบ', reasons: [REASON, 'ของแถมงานเปิดตัวสาขา ไม่คิดเงิน'],
  });
  assert.equal(dealActualNone([]), null);
});

test('ค้น: ป้ายและเหตุผลที่ตาเห็นบนแถวค้นเจอ — ทั้งแถวดีลและตารางใบสั่งขาย', () => {
  const [row] = buildDealRows({ deals, orders: [NONE_SO] }, TODAY);
  assert.ok(matchesQuery(dealRowText(row), 'ไม่นับ actual'));
  assert.ok(matchesQuery(dealRowText(row), 'ตัวอย่างฟรี'));
  assert.ok(matchesQuery(orderText(NONE_SO, 'DL-261100779'), 'ไม่นับ ตัวอย่างฟรี'));
  assert.ok(!matchesQuery(orderText({ ...NONE_SO, actualMode: 'order', actualNoneReason: null }), 'ไม่นับ'));
});
