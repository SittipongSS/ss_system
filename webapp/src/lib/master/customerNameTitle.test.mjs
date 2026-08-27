// เทสต์คำนำหน้าชื่อลูกค้าบุคคล (mig 0296)
// จุดที่ต้องคุมไว้: กระจก `name` ต้องประกอบจากสองช่องย่อยเสมอ และแถวยุคเก่า/
// นิติบุคคลที่ไม่มีสองช่องนี้ต้องไม่ถูกล้างชื่อเป็นค่าว่างตอนบันทึก
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMER_NAME_TITLES, composeCustomerName, customerNamePatch, splitCustomerName,
} from './customerName.js';

test('ตัวเลือกคำนำหน้ามีสามตัวตามบัตรประชาชน — ไม่มี "คุณ"', () => {
  assert.deepEqual(CUSTOMER_NAME_TITLES, ['นาย', 'นาง', 'นางสาว']);
  assert.ok(!CUSTOMER_NAME_TITLES.includes('คุณ'));
});

test('ประกอบชื่อ: คำนำหน้า + ชื่อ คั่นด้วยช่องว่างเดียว', () => {
  assert.equal(composeCustomerName({ nameTitle: 'นาย', namePerson: 'ก ข' }), 'นาย ก ข');
  assert.equal(composeCustomerName({ nameTitle: '', namePerson: 'ก ข' }), 'ก ข');
});

test('ไม่มี namePerson = ถอยไปใช้ `name` เดิม (นิติบุคคล/แถวยุคเก่าต้องไม่ถูกล้าง)', () => {
  assert.equal(composeCustomerName({ name: 'บริษัท ก จำกัด' }), 'บริษัท ก จำกัด');
  assert.equal(composeCustomerName({ nameTitle: 'นาย', name: 'บริษัท ก จำกัด' }), 'บริษัท ก จำกัด');
});

test('แยกชื่อ: จับคำนำหน้าที่ใช้จริงในทะเบียน', () => {
  assert.deepEqual(splitCustomerName('นาย พชร ประเสริฐจุติมณี'), { nameTitle: 'นาย', namePerson: 'พชร ประเสริฐจุติมณี' });
  assert.deepEqual(splitCustomerName('นางสาวอุณาสินี โซ่เจริญธรรม'), { nameTitle: 'นางสาว', namePerson: 'อุณาสินี โซ่เจริญธรรม' });
  assert.deepEqual(splitCustomerName('คุณนิดา พรหมเทพอุดม'), { nameTitle: 'คุณ', namePerson: 'นิดา พรหมเทพอุดม' });
});

test('น.ส. เก็บเป็นรูปเต็ม "นางสาว" รูปเดียวทั้งระบบ', () => {
  assert.deepEqual(splitCustomerName('น.ส.กุลสตรี พลเสน'), { nameTitle: 'นางสาว', namePerson: 'กุลสตรี พลเสน' });
  assert.deepEqual(splitCustomerName('น.ส. ชนิษฐา ปรีเปรม'), { nameTitle: 'นางสาว', namePerson: 'ชนิษฐา ปรีเปรม' });
});

test('ชื่อนิติบุคคลไม่มีคำนำหน้าให้จับ — ชื่อเต็มไปอยู่ที่ namePerson', () => {
  assert.deepEqual(splitCustomerName('บริษัท ทดสอบ จำกัด'), { nameTitle: '', namePerson: 'บริษัท ทดสอบ จำกัด' });
});

test('แยกแล้วประกอบกลับได้ชื่อเดิม — ต่างได้แค่ช่องว่างหลังคำนำหน้า (ด่านที่ backfill ใช้)', () => {
  const bare = (value) => value.replace(/\s+/g, '');
  for (const full of ['นาย พชร ประเสริฐจุติมณี', 'นางสาวอุณาสินี โซ่เจริญธรรม', 'บริษัท ทดสอบ จำกัด']) {
    assert.equal(bare(composeCustomerName(splitCustomerName(full))), bare(full));
  }
  // ชื่อที่เว้นวรรคถูกอยู่แล้วต้องไม่ขยับแม้แต่ตัวเดียว
  assert.equal(composeCustomerName(splitCustomerName('นาย พชร ประเสริฐจุติมณี')), 'นาย พชร ประเสริฐจุติมณี');
  // 🪤 'น.ส.' ถูกทำให้เป็นรูปเต็ม ⇒ **ตัวคำ** เปลี่ยน ไม่ใช่แค่ช่องว่าง
  // backfill ต้องข้ามแถวพวกนี้ ไม่ใช่เขียนทับชื่อบนเอกสารเงียบ ๆ
  assert.notEqual(bare(composeCustomerName(splitCustomerName('น.ส.กุลสตรี พลเสน'))), bare('น.ส.กุลสตรี พลเสน'));
});

test('customerNamePatch: ไม่ส่งช่องย่อยมา = ไม่แตะอะไรเลย', () => {
  assert.deepEqual(customerNamePatch({ name: 'บริษัท ก จำกัด' }), {});
});

test('customerNamePatch: ส่งช่องย่อยมา = เขียนกระจก name ให้', () => {
  assert.deepEqual(customerNamePatch({ customerType: 'individual', nameTitle: 'นางสาว', namePerson: 'กุลสตรี พลเสน' }), {
    nameTitle: 'นางสาว', namePerson: 'กุลสตรี พลเสน', name: 'นางสาว กุลสตรี พลเสน',
  });
});

test('customerNamePatch: ช่องย่อยว่างทั้งคู่ = null ไม่ใช่ "" (กติกา "ยังไม่กรอก" รูปเดียว)', () => {
  assert.deepEqual(customerNamePatch({ customerType: 'individual', nameTitle: '', namePerson: '' }), {
    nameTitle: null, namePerson: null, name: null,
  });
});

test('customerNamePatch: นิติบุคคล = ล้างสองช่องย่อย ไม่แตะ name', () => {
  // 🪤 คนสลับประเภทจากบุคคล→นิติบุคคลแล้วบันทึก — ค่าเก่าต้องไม่ค้าง
  assert.deepEqual(
    customerNamePatch({ customerType: 'company', nameTitle: 'นาย', namePerson: 'ก ข', name: 'บริษัท ก จำกัด' }),
    { nameTitle: null, namePerson: null },
  );
});

test('customerNamePatch: ลูกค้าบุคคลถึงจะประกอบ name ให้', () => {
  assert.deepEqual(
    customerNamePatch({ customerType: 'individual', nameTitle: 'นาย', namePerson: 'ก ข' }),
    { nameTitle: 'นาย', namePerson: 'ก ข', name: 'นาย ก ข' },
  );
});
