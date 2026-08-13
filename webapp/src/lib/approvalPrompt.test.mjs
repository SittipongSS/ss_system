import test from 'node:test';
import assert from 'node:assert/strict';

import { IRREVERSIBLE_NOTE, approvalPrompt, paymentConfirmPrompt } from './approvalPrompt.js';

test('โมดัลบอก "สิ่งที่จะเกิดขึ้น" เป็นบรรทัดละข้อ ไม่ใช่ถามลอย ๆ ว่าแน่ใจไหม', () => {
  const p = approvalPrompt({
    subject: 'ใบสั่งขาย SO-26080008-0',
    effects: ['ยอด Actual ฿30,000 เข้าดีลทันที', 'ส่งใบเข้าคิวบัญชีตรวจ'],
    confirmLabel: 'อนุมัติและนับ Actual',
  });
  assert.match(p.description, /ใบสั่งขาย SO-26080008-0/);
  assert.equal(p.confirmLabel, 'อนุมัติและนับ Actual');
  assert.equal(p.detail.split('\n').filter((l) => l.startsWith('· ')).length, 2);
  assert.match(p.detail, /ยอด Actual ฿30,000 เข้าดีลทันที/);
});

/* 🔴 โมดัลเปล่าที่เขียนแค่ "แน่ใจหรือไม่" แย่กว่าไม่มีโมดัล — คนกดผ่านโดยไม่อ่าน
   แล้วได้ความรู้สึกปลอดภัยปลอม ๆ · ต้องพังตอน dev ไม่ใช่ปล่อยขึ้น production */
test('ไม่บอกผลลัพธ์เลย = สร้างโมดัลไม่ได้', () => {
  assert.throws(() => approvalPrompt({ subject: 'x', effects: [] }), /อย่างน้อย 1 อย่าง/);
  assert.throws(() => approvalPrompt({ subject: 'x', effects: ['  ', ''] }), /อย่างน้อย 1 อย่าง/);
  assert.throws(() => approvalPrompt({ subject: 'x' }), /อย่างน้อย 1 อย่าง/);
});

test('ของที่ถอนคืนไม่ได้ต้องขึ้นคำเตือนเป็นบรรทัดแรก', () => {
  const p = approvalPrompt({ subject: 'x', effects: ['ก'], irreversible: true });
  assert.equal(p.detail.split('\n')[0], `⚠️ ${IRREVERSIBLE_NOTE}`);
  assert.ok(!approvalPrompt({ subject: 'x', effects: ['ก'] }).detail.includes(IRREVERSIBLE_NOTE));
});

/* บัญชีคอนเฟิร์มไม่มี action ถอนคืน และล็อกใบไม่ให้ยกเลิกอนุมัติ/ออก Rev.
   (ดู paymentLockReason) ⇒ สองเรื่องนี้ต้องอยู่ในโมดัลเสมอ */
test('คอนเฟิร์มการชำระเตือนทั้งเรื่องถอนไม่ได้และเรื่องใบถูกล็อก', () => {
  const p = paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00' });
  assert.match(p.detail, new RegExp(IRREVERSIBLE_NOTE));
  assert.match(p.detail, /ยกเลิกอนุมัติหรือออก Rev\. ใหม่ไม่ได้/);
  // ไม่ใช่การอนุมัติเอกสาร ประโยคจึงต้องไม่ใช่ "ยืนยันอนุมัติ ชำระเต็มจำนวน"
  assert.equal(p.description, 'ยืนยันการรับชำระ งวดที่ 2 · ฿16,050.00 หรือไม่');
  // ยอด Actual ไม่ขยับตามการคอนเฟิร์ม — มติผู้ใช้ ต้องไม่มีใครเข้าใจผิดตรงนี้
  assert.match(p.detail, /Actual ของฝ่ายขายไม่เปลี่ยน/);
});

test('งวดที่ไม่มีป้าย/ยอด ยังสร้างข้อความได้ ไม่หลุดเป็น "undefined" หรือ "การการ"', () => {
  const p = paymentConfirmPrompt({});
  assert.ok(!p.description.includes('undefined'));
  assert.equal(p.description, 'ยืนยันการรับชำระหรือไม่');
  assert.equal(approvalPrompt({ effects: ['ก'] }).description, 'ยืนยันอนุมัติหรือไม่');
});
