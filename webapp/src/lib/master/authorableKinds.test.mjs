// ชุดชนิดที่ "คนเลือกเองได้" ต่อ entity + กำหนดวัน (meta.dueDate)
//
// ⚠️ นี่คือด่านกันปลอมไทม์ไลน์ ก่อนหน้านี้เป็นค่าคงที่ตัวเดียว ('comment') ทั้งระบบ
// ซึ่งง่ายและปลอดภัย · พอเปิดให้ประกาศเป็นชุดต่อ entity (ฟีดดีลแยก โทร/ประชุม/
// อีเมล มาแต่ mig 0063) ความเสี่ยงคือ **client ส่ง kind ของเหตุการณ์ระบบมาแล้ว
// หลุด** — เทสต์ชุดนี้ล็อกว่าชนิดที่ไม่ได้ติดธง authorable ต้องไม่ผ่านเด็ดขาด
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorableKinds, defaultAuthorableKind, isAuthorableKind, kindAcceptsDueDate,
  updateKindMeta, UPDATE_KINDS,
} from './updateTypes.js';

test('ชนิดที่ไม่ติดธง authorable ต้องไม่ผ่านด่าน — ทุก entity ในทะเบียน', () => {
  for (const [entityType, kinds] of Object.entries(UPDATE_KINDS)) {
    for (const [kind, meta] of Object.entries(kinds)) {
      assert.equal(
        isAuthorableKind(entityType, kind), !!meta.authorable,
        `${entityType}.${kind}: ธง authorable กับด่านไม่ตรงกัน`,
      );
    }
  }
});

test('ชนิดที่ไม่มีอยู่จริง / ค่าขยะ ต้องไม่ผ่านด่าน', () => {
  for (const bad of ['status', 'returned', 'ไม่มีชนิดนี้', '', null, undefined, 0]) {
    assert.equal(isAuthorableKind('personal_task', bad), false, `${bad} ไม่ควรผ่าน`);
  }
  // entityType ที่ไม่รู้จักต้องปิดตาย ไม่ใช่ปล่อยผ่านทุก kind
  assert.equal(isAuthorableKind('ไม่มี entity นี้', 'comment'), false);
  assert.deepEqual(authorableKinds('ไม่มี entity นี้'), []);
});

test('ชนิดตั้งต้น = ตัวแรกที่ประกาศ และต้องเป็นชนิดที่โพสต์ได้จริงเสมอ', () => {
  for (const entityType of Object.keys(UPDATE_KINDS)) {
    const fallback = defaultAuthorableKind(entityType);
    assert.ok(isAuthorableKind(entityType, fallback), `${entityType}: ค่าตั้งต้นโพสต์ไม่ได้`);
  }
  // entity ที่ไม่รู้จักถอยไปที่ 'comment' ไม่ใช่ undefined (กันหน้าพังตอนพิมพ์)
  assert.equal(defaultAuthorableKind('ไม่มี entity นี้'), 'comment');
});

test('กำหนดวันเปิดเฉพาะชนิดที่ประกาศธง due', () => {
  for (const [entityType, kinds] of Object.entries(UPDATE_KINDS)) {
    for (const [kind, meta] of Object.entries(kinds)) {
      assert.equal(kindAcceptsDueDate(entityType, kind), !!meta.due, `${entityType}.${kind}`);
    }
  }
  assert.equal(kindAcceptsDueDate('ไม่มี entity นี้', 'comment'), false);
});

test('ป้ายของชนิดที่ไม่รู้จักต้องถอยไปที่ชนิดตั้งต้นของ entity นั้น ไม่ใช่ค่ากลาง', () => {
  // ฟีดที่ไม่มี kind ชื่อ 'comment' (เช่นฟีดดีลที่จะเพิ่มทีหลัง) ต้องไม่ตกไปได้ป้าย
  // ว่าง ๆ — ยืนยันว่ากลไก fallback ยึดชนิดตั้งต้นของ entity
  const first = defaultAuthorableKind('personal_task');
  assert.deepEqual(
    updateKindMeta('personal_task', 'ไม่มีชนิดนี้'),
    UPDATE_KINDS.personal_task[first],
  );
  // entity ที่ไม่รู้จักเลยยังต้องได้ป้ายกลาง ไม่ throw
  assert.equal(updateKindMeta('ไม่มี entity นี้', 'x').label, 'อัปเดต');
});

test('ทุกชนิดต้องมีป้ายกับสี — ป้ายหายคือจอโล่ง', () => {
  for (const [entityType, kinds] of Object.entries(UPDATE_KINDS)) {
    for (const [kind, meta] of Object.entries(kinds)) {
      assert.ok(meta.label, `${entityType}.${kind} ไม่มี label`);
      assert.ok(meta.color, `${entityType}.${kind} ไม่มี color`);
    }
  }
});
