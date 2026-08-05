// RD ส่งของ = สร้างแถวเอง (P3b) — ด่านล้วน ทดสอบได้โดยไม่แตะ DB
//
// ⚠️ ด่านที่นี่คือสิ่งเดียวที่กันไม่ให้ผู้ใช้เจอ error ดิบของ Postgres ตอนกดส่ง —
// รหัสกลิ่นซ้ำจะชน scents_code_uk ซึ่งเป็นข้อความอังกฤษที่อ่านไม่รู้เรื่อง
// และมาตอนที่สายเกินจะแก้ทีละช่องแล้ว
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DELIVERY_ROWS, deliveryItemRow, normalizeDeliveryRows } from './delivery.js';
import { rowStage } from './rowStage.js';

const ok = { name: 'Forest night A', code: 'SC-2601', sentAt: '2026-08-05' };

test('ส่งของต้องมีอย่างน้อยหนึ่งรายการ และไม่เกินเพดาน', () => {
  assert.match(normalizeDeliveryRows([]).error, /อย่างน้อย 1 รายการ/);
  const many = Array.from({ length: MAX_DELIVERY_ROWS + 1 }, (_, i) => ({
    ...ok, name: `A${i}`, code: `SC-${i}`,
  }));
  assert.match(normalizeDeliveryRows(many).error, /สูงสุด/);
});

test('ชื่อกับรหัสบังคับทั้งคู่ — รหัสว่าง = กลิ่นร่างที่ไม่มีใครกลับมาใส่ให้', () => {
  assert.match(normalizeDeliveryRows([{ code: 'SC-1' }]).error, /ชื่อกลิ่น/);
  assert.match(normalizeDeliveryRows([{ name: 'A' }]).error, /รหัสกลิ่น/);
  assert.equal(normalizeDeliveryRows([ok]).error, null);
});

test('⭐ รหัสซ้ำถูกจับที่นี่ ทั้งซ้ำในชุดเดียวกันและซ้ำกับทะเบียน', () => {
  const dup = normalizeDeliveryRows([ok, { ...ok, name: 'อีกตัว' }]);
  assert.match(dup.error, /ซ้ำกับรายการก่อนหน้า/);
  assert.match(dup.error, /SC-2601/, 'ต้องบอกรหัสที่ชน ไม่ใช่แค่บอกว่าซ้ำ');

  const taken = normalizeDeliveryRows([ok], { existingCodes: ['sc-2601'] });
  assert.match(taken.error, /ถูกใช้ไปแล้วในทะเบียน/, 'เทียบไม่สนตัวพิมพ์เหมือน index');
});

test('ชื่อซ้ำในชุดเดียวก็ไม่ได้ — ตัวตนของกลิ่นคือชื่อ+ลูกค้า จะได้ตัวเดียวแล้วอีกตัวหาย', () => {
  assert.match(
    normalizeDeliveryRows([ok, { ...ok, code: 'SC-2602' }]).error,
    /ชื่อกลิ่นซ้ำ/,
  );
});

test('วันที่ส่งเว้นว่างได้ = วันนี้ · ใส่มาแล้วต้องเป็น ISO', () => {
  assert.equal(normalizeDeliveryRows([{ name: 'A', code: 'SC-1' }], { today: '2026-08-05' })
    .rows[0].sentAt, '2026-08-05');
  assert.match(normalizeDeliveryRows([{ ...ok, sentAt: '05/08/2026' }]).error, /วันที่ส่ง/);
});

test('⭐ แถวที่เกิดต้องอยู่ขั้น "ส่งแล้ว รอไปรับ" ไม่ใช่ "รอรับเรื่อง"', () => {
  // RD สร้างแถวตอนส่ง ⇒ รับเรื่องกับส่งของจบพร้อมกัน · ถ้า ackAt ว่าง RD จะเห็น
  // ปุ่ม "รับเรื่อง" บนแถวที่ตัวเองเพิ่งส่งไปเอง
  const row = deliveryItemRow(ok, {
    requestId: 'DR-1', sortOrder: 1, scentId: 'SCT-9',
    ackAt: '2026-08-01', user: { id: 'u-rd', name: 'สมชาย' },
  });
  assert.equal(rowStage(row), 'ready');
  assert.equal(row.ackAt, '2026-08-01', 'ยกวันรับเรื่องของใบมาเป็นค่าตั้งต้น');
  assert.equal(row.readyAt, '2026-08-05');
  assert.equal(row.lineKind, 'scent_dev');
  assert.equal(row.label, 'Forest night A', 'snapshot ป้ายชื่อ ณ ตอนส่ง');
  assert.equal(row.producedScentId, 'SCT-9');
  // ⚠️ ห้ามใส่ scentId ด้วย — 0204 นิยามว่ามันคือ "กลิ่นที่อ้างถึง" ของ product_dev
  // ส่วนสายพัฒนากลิ่น กลิ่นคือผลลัพธ์ · ใส่สองช่อง = แหล่งความจริงสองที่
  assert.equal('scentId' in row, false);
});

test('ใบที่ยังไม่เคยรับเรื่อง — ถอยไปใช้วันที่ส่งเป็นวันรับเรื่อง', () => {
  const row = deliveryItemRow(ok, { requestId: 'DR-1', sortOrder: 1, scentId: 'SCT-9', ackAt: null });
  assert.equal(row.ackAt, '2026-08-05');
  assert.equal(rowStage(row), 'ready');
});
