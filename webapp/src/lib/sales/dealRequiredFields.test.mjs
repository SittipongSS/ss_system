// ── ช่องบังคับของดีล — ด่านเดียวที่ทั้งจอสร้าง จอแก้ และ server ใช้ร่วมกัน ─────
//
// 🐞 ด่านนี้เคยล็อกดีลที่ปิด Won ไว้ทั้งกลุ่ม: จอล็อกตารางมูลค่ารายหมวดไม่ให้แก้
// (ยอดของดีล Won คือ Actual จากใบสั่งขาย) แต่ด่านกลับสั่งให้กรอกตารางนั้น
// ⇒ 57 จาก 167 ดีล Won บันทึกฟอร์มไม่ได้เลยสักครั้ง แม้แก้แค่หมายเหตุ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDealFormSave,
  missingDealDatesAfterWrite,
  missingDealFieldKeys,
  missingDealFieldsMessage,
} from './dealRequiredFields.js';

const full = (over = {}) => ({
  stage: 'quotation',
  valueItems: [{ categoryCode: '01-002', amount: 1000 }],
  expectedCloseDate: '2026-09-30',
  startDate: '2026-09-01',
  endDate: '2026-10-31',
  ...over,
});

test('ดีลที่กรอกครบไม่มีช่องขาด', () => {
  assert.deepEqual(missingDealFieldKeys(full()), []);
  assert.equal(missingDealFieldsMessage(full()), null);
});

test('ช่องที่ขาดถูกรายงานพร้อมกันทีเดียว ไม่ใช่ทีละช่อง', () => {
  const keys = missingDealFieldKeys(full({ valueItems: [], startDate: '', endDate: null }));
  assert.deepEqual(keys, ['valueItems', 'startDate', 'endDate']);
  const message = missingDealFieldsMessage(full({ valueItems: [], endDate: '' }), { title: 'ดีลทดสอบ' });
  assert.match(message, /อย่างน้อย 1 หมวดสินค้า/);
  assert.match(message, /วันที่สิ้นสุด/);
  assert.match(message, /ดีลทดสอบ/);
});

/* ⭐ มติผู้ใช้ 2026-09-08: "won จาก QT ก็ดึงหมวด ปริมาตร จำนวน ยอดมาอยู่แล้ว"
   ⇒ ดีลที่ปิดแล้วไม่ต้องมีตารางรายหมวด · ของจริง 52 จาก 57 ใบที่เคยติดด่านนี้
     มีใบเสนอราคาที่ลูกค้ารับแล้ว ซึ่งถือหมวด/ปริมาตร/จำนวนไว้ครบ */
test('ดีลที่ปิด Won แล้ว บันทึกได้แม้ไม่มีตารางมูลค่ารายหมวด', () => {
  const draft = full({ stage: 'won', valueItems: [] });
  assert.deepEqual(missingDealFieldKeys(draft, { alreadyWon: true }), []);
  assert.equal(missingDealFieldsMessage(draft, { alreadyWon: true }), null);
});

test('ข้อยกเว้นของดีล Won ไม่ลามไปช่องวัน — วันยังบังคับเหมือนเดิม', () => {
  const draft = full({ stage: 'won', valueItems: [], endDate: '' });
  assert.deepEqual(missingDealFieldKeys(draft, { alreadyWon: true }), ['endDate']);
});

test('ตอนสร้าง (ไม่ส่ง alreadyWon) ยังบังคับตารางรายหมวดเหมือนเดิม', () => {
  // ดีลเก่าที่สร้างเป็น Won ไม่มีใบให้ดึง ยอดปิดต้องมาจากตารางที่คนกรอก
  const draft = full({ stage: 'won', valueItems: [] });
  assert.deepEqual(missingDealFieldKeys(draft), ['valueItems']);
  assert.match(missingDealFieldsMessage(draft, { legacyWon: true }), /มูลค่าที่ปิด/);
});

test('ป้ายของดีลเก่าที่ปิดแล้วเรียกชื่อตามฟอร์ม ไม่ใช่ชื่อของดีลเปิด', () => {
  const draft = full({ valueItems: [], expectedCloseDate: '' });
  assert.match(missingDealFieldsMessage(draft, { legacyWon: true }), /มูลค่าที่ปิด/);
  assert.match(missingDealFieldsMessage(draft, { legacyWon: true }), /วันที่ปิด/);
  assert.match(missingDealFieldsMessage(draft), /มูลค่าคาดการณ์/);
  assert.match(missingDealFieldsMessage(draft), /วันที่คาดการณ์ปิด/);
});

/* ── ฝั่ง server: บังคับเฉพาะวัน และตรวจจากดีล "หลังบันทึก" ────────────────── */

test('server ตรวจวันจากผลลัพธ์หลังบันทึก ไม่ใช่จาก body ตรง ๆ', () => {
  const before = { startDate: '2026-09-01', endDate: null };
  assert.deepEqual(missingDealDatesAfterWrite(before, { endDate: '2026-10-31' }), []);
  assert.deepEqual(missingDealDatesAfterWrite(before, { title: 'แก้ชื่อเฉย ๆ' }), ['endDate']);
  assert.deepEqual(missingDealDatesAfterWrite(before, { endDate: '' }), ['endDate']);
});

test('เฉพาะการบันทึกจากฟอร์มเท่านั้นที่โดนบังคับวัน — ปุ่ม action ไม่โดน', () => {
  assert.equal(isDealFormSave({ title: 'ดีล', stage: 'won' }), true);
  assert.equal(isDealFormSave({ stage: 'won' }), false, 'เปลี่ยนขั้นอย่างเดียวต้องไม่ติดด่านวัน');
  assert.equal(isDealFormSave({ projectId: 'PJ-1' }), false);
});
