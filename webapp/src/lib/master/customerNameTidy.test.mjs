import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { tidyCustomerNameFields, tidyCustomerNameText } from './customerName.js';

/* 🐞 2026-11-09: แก้ชื่อลูกค้า AR-1056 เป็น "บริษัท␣␣กข168 จำกัด␣" แล้วบันทึกลงทะเบียน
   ตามนั้นเป๊ะ — POST/PATCH ไม่ล้างอะไรเลย (ทะเบียน prod มี 16 รายแบบนี้) ⇒ ค้นด้วย
   เว้นวรรคเดียวไม่เจอ และสำเนาใน FG/กลิ่น/คำร้องได้รูปเพี้ยนตามไป */

test('ชื่อ AR-1056 ที่พบจริง — ช่องว่างซ้ำกลางคำ + ช่องว่างท้าย', () => {
  assert.equal(tidyCustomerNameText('บริษัท  กข168 จำกัด '), 'บริษัท กข168 จำกัด');
});

test('แท็บ/ช่องว่างหัว · NBSP · อักขระซ่อน (ZWSP) ที่ติดมาจากการก๊อปวาง', () => {
  assert.equal(tidyCustomerNameText('\tบริษัท โรงแรม ดิ เอมเมอรัลด์ จำกัด'), 'บริษัท โรงแรม ดิ เอมเมอรัลด์ จำกัด');
  assert.equal(tidyCustomerNameText(' บริษัท บี บี เอช ฮอสปิทอล จำกัด'), 'บริษัท บี บี เอช ฮอสปิทอล จำกัด');
  assert.equal(tidyCustomerNameText('คุณนิชานันท์​ ตระกูลพูนทรัพย์'), 'คุณนิชานันท์ ตระกูลพูนทรัพย์');
  assert.equal(tidyCustomerNameText('ACME Co., Ltd.'), 'ACME Co., Ltd.');
});

test('สระอำแยกร่างกับสระเอสองตัว — หน้าตาเหมือนกันแต่ค้น/เทียบไม่เจอ', () => {
  assert.equal(tidyCustomerNameText('บริษัท ดานิส เวลเนส จํากัด'), 'บริษัท ดานิส เวลเนส จำกัด');
  assert.equal(tidyCustomerNameText('บริษัท ฮัก ออร์เเกนิค จำกัด'), 'บริษัท ฮัก ออร์แกนิค จำกัด');
});

test('ระยะรอบวงเล็บ — แต่ไม่ถอดคำ "(สำนักงานใหญ่)" ที่คนตั้งใจพิมพ์ (มติ 27/08)', () => {
  assert.equal(tidyCustomerNameText('บริษัท เอกมหากิจ  จำกัด (สำนักงานใหญ่ )'), 'บริษัท เอกมหากิจ จำกัด (สำนักงานใหญ่)');
  assert.equal(tidyCustomerNameText('บริษัท ตัวอย่าง จำกัด(มหาชน)'), 'บริษัท ตัวอย่าง จำกัด (มหาชน)');
});

test('ชื่อที่สะอาดแล้วต้องได้ค่าเดิมทุกตัวอักษร — ไม่งั้นบันทึกซ้ำจะนับเป็นการแก้ แล้วดีดไปรออนุมัติ', () => {
  for (const clean of ['บริษัท กข168 จำกัด', 'นาย สิทธิกร วิบูลย์จักร์', 'FREJONA CO., LTD.', 'คุณ บี', '']) {
    assert.equal(tidyCustomerNameText(clean), clean);
    assert.equal(tidyCustomerNameText(tidyCustomerNameText(clean)), clean);
  }
});

test('tidyCustomerNameFields แตะเฉพาะช่องชื่อที่เป็นสตริง — ค่าว่างคงเป็นค่าว่าง null/undefined ไม่ถูกเติมคีย์', () => {
  assert.deepEqual(
    tidyCustomerNameFields({ name: ' บริษัท  ก จำกัด ', nameEn: null, taxId: ' 0105 ', phone: '  ' }),
    { name: 'บริษัท ก จำกัด' },
  );
  // '' ต้องไม่กลายเป็น null — แถวที่เก็บ '' ไว้จะนับเป็น "เปลี่ยน" แล้วหลุดอนุมัติ
  assert.deepEqual(tidyCustomerNameFields({ name: '' }), { name: '' });
  // PATCH ที่ไม่ได้ส่งชื่อมา ต้องไม่ได้คีย์ชื่อเพิ่มเข้าไปใน updates
  assert.deepEqual(tidyCustomerNameFields({ isActive: false }), {});
  assert.deepEqual(
    tidyCustomerNameFields({ nameTitle: 'นาย ', namePerson: ' สมชาย  ใจดี', name: 'นาย สมชาย  ใจดี' }),
    { nameTitle: 'นาย', namePerson: 'สมชาย ใจดี', name: 'นาย สมชาย ใจดี' },
  );
});

test('route สร้าง/แก้ลูกค้าต้องล้างชื่อก่อนบันทึก — ทั้งสองทาง', () => {
  const post = readFileSync(new URL('../../app/api/customers/route.js', import.meta.url), 'utf8');
  assert.match(post, /Object\.assign\(newCustomer, tidyCustomerNameFields\(newCustomer\)\)/);
  const patch = readFileSync(new URL('../../app/api/customers/[id]/route.js', import.meta.url), 'utf8');
  // ต้องอยู่ **ก่อน** changedFieldsAgainst — ตัวเทียบต้องเห็นชื่อที่ล้างแล้ว
  const tidyAt = patch.indexOf('Object.assign(updates, tidyCustomerNameFields(updates))');
  const diffAt = patch.indexOf('changedFieldsAgainst(customer, updates');
  assert.ok(tidyAt > 0, 'PATCH ต้องเรียก tidyCustomerNameFields');
  assert.ok(diffAt > tidyAt, 'ล้างชื่อต้องมาก่อนเทียบ changedFields');
});
