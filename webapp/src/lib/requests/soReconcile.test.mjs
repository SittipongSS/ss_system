// กระทบยอดกับใบสั่งขาย (P3d) — logic ล้วน
//
// ⭐ **เตือน ไม่บล็อก** — ส่งเกิน SO เกิดได้จริง (แถมให้ลูกค้าเลือก) และส่งขาดก็เกิดได้
// บล็อกเมื่อไร คนจะเลี่ยงด้วยการไม่บันทึกจำนวน ซึ่งแย่กว่าตัวเลขที่ไม่ตรงมาก
import test from 'node:test';
import assert from 'node:assert/strict';
import { soReconcile, soReconcileText } from './soReconcile.js';

const line = (qty) => ({ qty });
// ⚠️ ฝั่งคำร้องนับ **แถว** ไม่ใช่รวม `confirmedQty` (13/11/2026) — ใส่เลขขยะไว้ให้เห็นว่าไม่ถูกอ่าน
const confirmed = (n) => Array.from({ length: n }, () => ({ outcome: 'confirmed', confirmedQty: 1000 }));

test('ยังไม่มีอะไรให้เทียบ = คืน null ไม่ใช่ "ตรงกัน"', () => {
  // ⚠️ null ≠ ตรงกัน — แถบเขียวว่า "ครบแล้ว" ตอนยังไม่มีใครคอนเฟิร์มคือคำโกหก
  assert.equal(soReconcile({}), null);
  assert.equal(soReconcile({ lines: [], items: [] }), null);
  assert.equal(soReconcileText(null), null);
});

test('มี SO แต่ยังไม่มีใครคอนเฟิร์ม = "ยังไม่เริ่ม" ไม่ใช่ "ขาด"', () => {
  // ขาด = ตัดสินใจแล้วแต่ได้ไม่ครบ · ยังไม่เริ่ม = ยังไม่ถึงเวลาตัดสิน
  const s = soReconcile({ lines: [line(100)], items: [{ outcome: null }] });
  assert.equal(s.state, 'pending');
  assert.match(soReconcileText(s), /ยังไม่มีรายการที่ลูกค้าคอนเฟิร์ม/);
});

test('นับเฉพาะแถวที่ลูกค้าคอนเฟิร์ม — ของที่ส่งไปให้ลองไม่ใช่ของที่ขาย', () => {
  const s = soReconcile({
    lines: [line(6), line(4)],
    items: [
      ...confirmed(7),
      { outcome: 'rejected', confirmedQty: 999 },  // ไม่เอา = ไม่นับ
      { outcome: 'revise' },                        // ขอแก้ = ไม่นับ
      { outcome: null },                            // ยังไม่ตอบ = ไม่นับ
    ],
  });
  assert.equal(s.ordered, 10);
  assert.equal(s.confirmed, 7);
  assert.equal(s.state, 'short');
  assert.match(soReconcileText(s), /ขาด 3/);
});

test('ส่งเกินก็บอกตรง ๆ — เกิดได้จริงเวลาแถมให้ลูกค้าเลือก', () => {
  const s = soReconcile({ lines: [line(3)], items: [...confirmed(2), ...confirmed(2)] });
  assert.equal(s.state, 'over');
  assert.match(soReconcileText(s), /เกิน 1/);
});

test('ตรงกันพอดี', () => {
  const s = soReconcile({ lines: [line(3)], items: confirmed(3) });
  assert.equal(s.state, 'match');
  assert.equal(s.diff, 0);
  assert.match(soReconcileText(s), /ตรงกัน/);
});

test('คำร้องที่ไม่ผูก SO แต่มีคนคอนเฟิร์ม — ยังต้องเทียบให้เห็น', () => {
  // ⚠️ ไม่ใช่ null: มีของที่คอนเฟิร์มแล้วแต่ไม่มีใบสั่งขายรองรับ คือสิ่งที่ควรเห็น
  const s = soReconcile({ lines: [], items: confirmed(2) });
  assert.equal(s.state, 'over');
  assert.equal(s.ordered, 0);
});

test('🐞 RQ-SB-26100375 — กลิ่นสามแถวที่กรอก 1000 ต้องนับเป็น 3 ไม่ใช่ 3000', () => {
  // SO ขาย 6 กลิ่น · ลูกค้าคอนเฟิร์ม 3 แถว (ตอนช่องจำนวนยังอยู่ กรอก 1000 ทุกแถว)
  // ⇒ เดิมได้ "3000 จาก 6 — เกิน" แล้วปิดใบได้ ทั้งที่อีก 3 กลิ่นยังไม่มีใครเลือก
  const s = soReconcile({ lines: [line(6)], items: confirmed(3) });
  assert.equal(s.confirmed, 3);
  assert.equal(s.state, 'short');
});
