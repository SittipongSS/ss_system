// แยก "เหตุการณ์ระบบ" ออกจาก "ข้อความคน" ในเธรดอัปเดต (isSystemUpdateItem)
//
// ⚠️ ตัวนี้เป็นตัวตัดสินว่าอะไรจะ **หายไปจากจอ** เมื่อผู้ใช้กดซ่อน — ตัดผิดฝั่งคือ
// ข้อความที่คนคุยกันหายไปเงียบ ๆ เทสต์จึงล็อกทั้งสองทิศ ไม่ใช่แค่ทางที่ถูก
//
// ไฟล์แยกจาก updateAccess.test.mjs โดยเจตนา: PR คู่ขนานที่เติมเทสต์ต่อท้ายไฟล์
// เดียวกันจะชนกันเองที่บรรทัดสุดท้ายทุกครั้ง
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTHORABLE_KIND, isSystemUpdateItem, UPDATE_KINDS } from './updateTypes.js';

const own = (kind, extra = {}) => ({ kind: 'own', row: { id: 'u1', kind, ...extra } });

test('รายการอ่านอย่างเดียวจากแหล่งอื่น (extraItems) = เหตุการณ์ระบบ', () => {
  // ประวัติสถานะ/เหตุการณ์ลีดไม่มีทางเป็นข้อความที่คนพิมพ์ — ไม่มี row ด้วยซ้ำ
  assert.equal(isSystemUpdateItem({ kind: 'extra', id: 'e1', label: 'เปลี่ยนสถานะ' }), true);
});

test('ข้อความที่คนพิมพ์เอง = ไม่ใช่เหตุการณ์ระบบ', () => {
  assert.equal(isSystemUpdateItem(own(AUTHORABLE_KIND)), false);
});

test('kind ที่คนพิมพ์เองไม่ได้ = เหตุการณ์ระบบ ทุกตัวในทะเบียน', () => {
  // วนจากทะเบียนเอง: entity/kind ใหม่ที่เพิ่มเข้ามาถูกตรวจอัตโนมัติ
  for (const [entityType, kinds] of Object.entries(UPDATE_KINDS)) {
    for (const kind of Object.keys(kinds)) {
      assert.equal(
        isSystemUpdateItem(own(kind)),
        kind !== AUTHORABLE_KIND,
        `${entityType}.${kind} ถูกจัดผิดฝั่ง`,
      );
    }
  }
});

test('ข้อความที่ถูกลบแล้วยังเป็นข้อความคน — ต้องไม่ถูกซ่อนไปกับเหตุการณ์ระบบ', () => {
  // รอยว่า "เคยมีข้อความแล้วถูกลบ" เป็นส่วนหนึ่งของบทสนทนา ไม่ใช่ของระบบ
  assert.equal(isSystemUpdateItem(own(AUTHORABLE_KIND, { deletedAt: '2026-07-27T00:00:00Z' })), false);
});

test('ข้อมูลไม่ครบ = ถือว่าข้อความคน (ตั้งต้นคือไม่ซ่อน)', () => {
  assert.equal(isSystemUpdateItem(null), false);
  assert.equal(isSystemUpdateItem(undefined), false);
  assert.equal(isSystemUpdateItem({ kind: 'own', row: { id: 'u1' } }), false); // ไม่มี kind
  assert.equal(isSystemUpdateItem({ kind: 'own' }), false);                    // ไม่มี row
});
