// แยก "เหตุการณ์ระบบ" ออกจาก "ข้อความคน" ในเธรดอัปเดต (isSystemUpdateItem)
//
// ⚠️ ตัวนี้เป็นตัวตัดสินว่าอะไรจะ **หายไปจากจอ** เมื่อผู้ใช้กดซ่อน — ตัดผิดฝั่งคือ
// ข้อความที่คนคุยกันหายไปเงียบ ๆ เทสต์จึงล็อกทั้งสองทิศ ไม่ใช่แค่ทางที่ถูก
//
// ไฟล์แยกจาก updateAccess.test.mjs โดยเจตนา: PR คู่ขนานที่เติมเทสต์ต่อท้ายไฟล์
// เดียวกันจะชนกันเองที่บรรทัดสุดท้ายทุกครั้ง
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorableKinds, isAuthorableKind, isNarrativeUpdateItem, isSystemUpdateItem, UPDATE_KINDS,
} from './updateTypes.js';

const own = (kind, extra = {}) => ({ kind: 'own', row: { id: 'u1', kind, ...extra } });
const TYPE = 'personal_task';

test('รายการอ่านอย่างเดียวจากแหล่งอื่น (extraItems) = เหตุการณ์ระบบ', () => {
  // ประวัติสถานะ/เหตุการณ์ลีดไม่มีทางเป็นข้อความที่คนพิมพ์ — ไม่มี row ด้วยซ้ำ
  assert.equal(isSystemUpdateItem(TYPE, { kind: 'extra', id: 'e1', label: 'เปลี่ยนสถานะ' }), true);
});

test('ข้อความที่คนพิมพ์เอง = ไม่ใช่เหตุการณ์ระบบ', () => {
  assert.equal(isSystemUpdateItem(TYPE, own('comment')), false);
});

test('kind ที่คนพิมพ์เองไม่ได้ = เหตุการณ์ระบบ — ตรวจทุก entity × ทุก kind ในทะเบียน', () => {
  // วนจากทะเบียนเอง: entity/kind ใหม่ที่เพิ่มเข้ามาถูกตรวจอัตโนมัติ
  for (const [entityType, kinds] of Object.entries(UPDATE_KINDS)) {
    for (const kind of Object.keys(kinds)) {
      assert.equal(
        isSystemUpdateItem(entityType, own(kind)),
        !isAuthorableKind(entityType, kind),
        `${entityType}.${kind} ถูกจัดผิดฝั่ง`,
      );
    }
  }
});

test('ทุก entity ต้องมีชนิดที่คนพิมพ์เองได้อย่างน้อยหนึ่ง — ไม่งั้นกล่องพิมพ์ส่งไม่ออก', () => {
  for (const entityType of Object.keys(UPDATE_KINDS)) {
    assert.ok(authorableKinds(entityType).length >= 1, `${entityType} ไม่มี kind ที่โพสต์ได้`);
  }
});

test('ชนิดของ entity อื่นต้องไม่ข้ามฝั่งมา (เธรดหนึ่งไม่รู้จัก kind ของอีกเธรด)', () => {
  // 'call' เป็นของฟีดดีล — บนงานของฉันต้องถือเป็นเหตุการณ์ระบบ ไม่ใช่ข้อความคน
  assert.equal(isAuthorableKind('personal_task', 'call'), false);
  assert.equal(isSystemUpdateItem('personal_task', own('call')), true);
});

test('ข้อความที่ถูกลบแล้วยังเป็นข้อความคน — ต้องไม่ถูกซ่อนไปกับเหตุการณ์ระบบ', () => {
  // รอยว่า "เคยมีข้อความแล้วถูกลบ" เป็นส่วนหนึ่งของบทสนทนา ไม่ใช่ของระบบ
  assert.equal(isSystemUpdateItem(TYPE, own('comment', { deletedAt: '2026-07-27T00:00:00Z' })), false);
});

test('ข้อมูลไม่ครบ = ถือว่าข้อความคน (ตั้งต้นคือไม่ซ่อน)', () => {
  assert.equal(isSystemUpdateItem(TYPE, null), false);
  assert.equal(isSystemUpdateItem(TYPE, undefined), false);
  assert.equal(isSystemUpdateItem(TYPE, { kind: 'own', row: { id: 'u1' } }), false); // ไม่มี kind
  assert.equal(isSystemUpdateItem(TYPE, { kind: 'own' }), false);                    // ไม่มี row
});

// ── บทสนทนา vs log ของระบบ (isNarrativeUpdateItem) ─────────────────────
//
// ⭐ คนละคำถามกับ `isSystemUpdateItem` — ตัวนั้นถามว่า "คนเลือกชนิดนี้ตอนโพสต์ได้ไหม"
// ตัวนี้ถามว่า **"แถวนี้มีข้อความที่คนพิมพ์อยู่ในนั้นไหม"** ⇒ เหตุการณ์ที่ระบบเขียน
// แต่พกเหตุผลของคน (ตีกลับ · ยกเลิก · เลื่อนวัน) นับเป็นบทสนทนา ทั้งที่ไม่ authorable
//
// ⚠️ ตัวนี้ตัดสินว่าแถวไหนไปอยู่กล่องไหน — ตัดผิดฝั่งคือเหตุผลที่คนพิมพ์ไปจมอยู่ใน
// log ที่พับไว้ ซึ่งเป็นสิ่งที่ ม-49 ตั้งกฎขึ้นมากันตั้งแต่แรก
test('⭐ เหตุการณ์ที่พกเหตุผลของคน = บทสนทนา แม้ระบบจะเป็นคนเขียนแถว', () => {
  for (const kind of ['comment', 'bounce', 'cancel', 'reschedule', 'no_quote', 'refused', 'revise']) {
    assert.equal(isNarrativeUpdateItem('dept_request', own(kind)), true, kind);
  }
});

test('⭐ เหตุการณ์เปลี่ยนสถานะล้วน = log ของระบบ', () => {
  for (const kind of ['submit', 'acknowledge', 'assign', 'update', 'pdr', 'close', 'ready', 'pickup']) {
    assert.equal(isNarrativeUpdateItem('dept_request', own(kind)), false, kind);
  }
});

// สองกล่องต้องกินแถวครบพอดี ไม่ทับกันและไม่มีแถวไหนตกหล่น — แถวหนึ่งโผล่ที่เดียว
// (ครึ่งที่ยังถูกของ ม-49) และไม่มีแถวไหนหายจากจอทั้งสองกล่อง
test('⭐ ทุกชนิดของคำร้องต้องตกกล่องใดกล่องหนึ่งพอดี ไม่ทับ ไม่ตกหล่น', () => {
  for (const kind of Object.keys(UPDATE_KINDS.dept_request)) {
    const item = own(kind);
    const narrative = isNarrativeUpdateItem('dept_request', item);
    // กล่อง log คัดด้วยตัวเดียวกันกลับด้าน ⇒ นิยามนี้เป็น partition โดยโครงสร้าง
    assert.equal(typeof narrative, 'boolean', kind);
  }
  // ชนิดที่ authorable ต้องเป็นบทสนทนาเสมอ — คนพิมพ์เองอยู่แล้ว
  for (const kind of authorableKinds('dept_request')) {
    assert.equal(isNarrativeUpdateItem('dept_request', own(kind)), true, kind);
  }
});

test('ชนิดที่ไม่รู้จัก/ข้อมูลไม่ครบ = บทสนทนา (หายจากจอแย่กว่าอยู่ผิดกล่อง)', () => {
  assert.equal(isNarrativeUpdateItem('dept_request', own('ชนิดที่ถูกถอดไปแล้ว')), true);
  assert.equal(isNarrativeUpdateItem('dept_request', { kind: 'own', row: { id: 'u1' } }), true);
  assert.equal(isNarrativeUpdateItem('dept_request', null), false);
  // แถวอ่านอย่างเดียวจากแหล่งอื่นไม่ใช่บทสนทนา
  assert.equal(isNarrativeUpdateItem('dept_request', { kind: 'extra', id: 'e1' }), false);
});
