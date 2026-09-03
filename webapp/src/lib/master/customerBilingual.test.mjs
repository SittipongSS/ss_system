// ── ชื่อ/ที่อยู่ลูกค้าสองภาษา (mig 0283 · มติผู้ใช้ 2026-08-22) ──────────
//
// กติกาที่เทสต์ชุดนี้ตรึงไว้:
//   1. ชื่อและที่อยู่ **ต้องมีอย่างน้อยหนึ่งภาษา** ไม่บังคับว่าภาษาไหน
//   2. แสดงผล = ภาษาหลักของบริบทก่อน ไม่มีค่อยตกไปอีกภาษา (**ไม่แปลให้เอง**)
//   3. ชื่ออังกฤษของ ตำบล/อำเภอ/จังหวัด มาจากทะเบียนกรมการปกครอง — คนกรอก
//      พิมพ์แค่ท่อนแรก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  addressText,
  addressTextEn,
  addressTextIn,
  legacyAddressMirror,
  normalizeAddresses,
  pickDocumentAddresses,
} from './addresses.js';
import {
  CUSTOMER_NAME_SELECT, customerNameBranchWarning, customerNameError, customerNameIn,
  customerNameSearchText, customerSnapshotName, hasCustomerName,
} from './customerName.js';
import { composeEnglishAddress } from './thaiAddress.js';

// ที่อยู่ที่เลือกจากทะเบียนครบทุกชั้น — ชื่ออังกฤษติดมากับตัวเลือกตอนผู้ใช้เลือก
const STRUCTURED = {
  id: 'ADR-hq',
  label: 'สำนักงานใหญ่',
  line1: '99/9 หมู่ 5 ถนนบางนา-ตราด กม. 23',
  line1En: '99/9 Moo 5, Bangna-Trad Rd. km. 23',
  subdistrict: 'บางโฉลง', subdistrictEn: 'Bang Chalong', subdistrictCode: '110403',
  district: 'บางพลี', districtEn: 'Bang Phli', districtCode: '1104',
  province: 'สมุทรปราการ', provinceEn: 'Samut Prakan', provinceCode: '11',
  postcode: '10540',
  useFor: 'both',
};

test('ชื่อ: ภาษาหลักก่อน ไม่มีค่อยตกไปอีกภาษา — ไม่แปลให้เอง', () => {
  const both = { name: 'บริษัท เอบีซี จำกัด', nameEn: 'ABC Co., Ltd.' };
  assert.equal(customerNameIn(both), 'บริษัท เอบีซี จำกัด');
  assert.equal(customerNameIn(both, 'en'), 'ABC Co., Ltd.');

  // มีภาษาเดียว = ได้ภาษานั้นทั้งสองบริบท
  assert.equal(customerNameIn({ nameEn: 'ABC Co., Ltd.' }), 'ABC Co., Ltd.');
  assert.equal(customerNameIn({ name: 'บริษัท เอบีซี จำกัด' }, 'en'), 'บริษัท เอบีซี จำกัด');
});

/* ── ฝั่งเขียนสำเนา (2026-09-03) ────────────────────────────────────────
   🐞 ลูกค้าที่มีแต่ชื่ออังกฤษถูกประทับ `customerName = null` ลงดีล/โครงการ/สินค้า
   ตั้งแต่วันสร้าง เพราะจุดเขียนอ่านคอลัมน์ `name` ดิบ ⇒ จอปลายทางมีแต่ null ให้วาด
   วัดจริงตอนพบ: AR-630 มีดีล/โครงการ/สินค้าอย่างละใบที่ค้าง null */
test('สำเนาชื่อ: ไทยก่อน ไม่มีค่อยตกไปอังกฤษ — ไม่มีสักภาษาได้ null', () => {
  assert.equal(customerSnapshotName({ name: 'บริษัท เอบีซี จำกัด', nameEn: 'ABC Co., Ltd.' }), 'บริษัท เอบีซี จำกัด');
  assert.equal(customerSnapshotName({ nameEn: 'ABC Co., Ltd.' }), 'ABC Co., Ltd.');
  assert.equal(customerSnapshotName({ name: '  ', nameEn: 'ABC Co., Ltd.' }), 'ABC Co., Ltd.');
  // ⚠️ ต้องเป็น null ไม่ใช่ '' — คอลัมน์สำเนาเป็น nullable และจอวาดขีดจากค่าว่าง
  assert.equal(customerSnapshotName({ name: '  ', nameEn: '' }), null);
  assert.equal(customerSnapshotName(null), null);
});

test('ชุดค้นหา: มีทั้งสองภาษาเสมอ แม้ป้ายจะโชว์ภาษาเดียว', () => {
  // คนพิมพ์หาลูกค้าต่างชาติด้วยชื่ออังกฤษ ต่อให้แถวโชว์ชื่อไทย (กติกา search haystack)
  assert.equal(customerNameSearchText({ name: 'บริษัท เอบีซี จำกัด', nameEn: 'ABC Co., Ltd.' }), 'บริษัท เอบีซี จำกัด ABC Co., Ltd.');
  assert.equal(customerNameSearchText({ nameEn: 'ABC Co., Ltd.' }), 'ABC Co., Ltd.');
  assert.equal(customerNameSearchText({}), '');
});

test('CUSTOMER_NAME_SELECT หยิบทั้งสองภาษา (quote ตามคอนเวนชันคอลัมน์ camelCase)', () => {
  assert.match(CUSTOMER_NAME_SELECT, /"nameEn"/);
  assert.match(CUSTOMER_NAME_SELECT, /\bname\b/);
});

test('ชื่อ: ด่านตรวจผ่านเมื่อมีอย่างน้อยหนึ่งภาษา', () => {
  assert.equal(customerNameError({ name: 'บริษัท เอบีซี จำกัด' }), null);
  assert.equal(customerNameError({ nameEn: 'ABC Co., Ltd.' }), null);
  assert.equal(hasCustomerName({ name: '   ', nameEn: '' }), false);
  assert.match(customerNameError({ name: '  ', nameEn: '  ' }), /อย่างน้อยหนึ่งภาษา/);
  assert.match(customerNameError({}), /อย่างน้อยหนึ่งภาษา/);
});

test('ที่อยู่อังกฤษ: พิมพ์แค่ท่อนแรก หางประกอบจากทะเบียน', () => {
  assert.equal(
    addressTextEn(STRUCTURED),
    '99/9 Moo 5, Bangna-Trad Rd. km. 23, Bang Chalong, Bang Phli, Samut Prakan 10540',
  );
  // ไทยยังประกอบเหมือนเดิมทุกตัวอักษร — ของใหม่ต้องไม่ไปแตะของเดิม
  assert.equal(
    addressText(STRUCTURED),
    '99/9 หมู่ 5 ถนนบางนา-ตราด กม. 23 ตำบลบางโฉลง อำเภอบางพลี จังหวัดสมุทรปราการ 10540',
  );
});

test('ที่อยู่อังกฤษ: ยังไม่พิมพ์ท่อนแรก = ได้แต่หาง (ไม่ใช่ค่าว่าง)', () => {
  const noLine1 = { ...STRUCTURED, line1En: '' };
  assert.equal(addressTextEn(noLine1), 'Bang Chalong, Bang Phli, Samut Prakan 10540');
  assert.equal(composeEnglishAddress({ provinceEn: 'Samut Prakan' }), 'Samut Prakan');
  assert.equal(composeEnglishAddress({}), '');
});

test('ที่อยู่อังกฤษ: โหมดพิมพ์เองใช้ข้อความที่พิมพ์ ไม่ประกอบทับ', () => {
  const typed = { ...STRUCTURED, addressOverride: true, addressEn: '1-3 Cavendish Sq, London W1G 0LB' };
  assert.equal(addressTextEn(typed), '1-3 Cavendish Sq, London W1G 0LB');
});

test('ที่อยู่: แถวที่มีแต่ภาษาอังกฤษต้องอยู่รอด ไม่ถูกตัดทิ้ง', () => {
  const rows = normalizeAddresses([
    { label: 'HQ', addressEn: '1-3 Cavendish Sq, London W1G 0LB', useFor: 'both' },
    { label: 'ป้ายชื่อล้วน', address: '  ', addressEn: '  ' }, // ไม่มีทั้งสองภาษา = ไม่ใช่ที่อยู่
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].address, '');
  assert.equal(rows[0].addressEn, '1-3 Cavendish Sq, London W1G 0LB');
});

test('ที่อยู่: แถวที่ยังไม่มีอังกฤษมีรูปร่างเท่าเดิมเป๊ะ (ไม่มีคีย์ addressEn งอก)', () => {
  const [row] = normalizeAddresses([{ id: 'ADR-1', label: 'สำนักงานใหญ่', address: '1 สีลม', useFor: 'both' }]);
  // `branchCode` เขียนเสมอตั้งแต่ 2026-08-27 (ไม่กรอก = 00000) — ข้อยกเว้นเดียว
  // ที่ตั้งใจให้รูปแถวขยับ ดูเหตุผลที่ OPTIONAL_ROW_FIELDS ใน addresses.js
  assert.deepEqual(Object.keys(row).sort(), ['address', 'branchCode', 'id', 'label', 'useFor']);
  assert.equal(row.addressEn, undefined, 'ยังต้องไม่งอกคีย์ addressEn');
});

test('ที่อยู่: ภาษาหลักก่อน ไม่มีค่อยตกไปอีกภาษา', () => {
  const enOnly = { addressEn: '1-3 Cavendish Sq, London W1G 0LB', useFor: 'both' };
  assert.equal(addressTextIn(enOnly, 'th'), '1-3 Cavendish Sq, London W1G 0LB');
  assert.equal(addressTextIn(STRUCTURED, 'en'), addressTextEn(STRUCTURED));
  assert.equal(addressTextIn(STRUCTURED, 'th'), addressText(STRUCTURED));
});

test('กระจกช่องเดี่ยว/เอกสาร: ที่อยู่อังกฤษล้วนต้องไม่กลายเป็น null', () => {
  const list = normalizeAddresses([
    { id: 'ADR-uk', label: 'HQ', addressEn: '1-3 Cavendish Sq, London W1G 0LB', useFor: 'both' },
  ]);
  // ไม่งั้น POST/PATCH โดนด่าน "ต้องมีที่อยู่อย่างน้อย 1 รายการ" ตีกลับทั้งที่กรอกแล้ว
  assert.equal(legacyAddressMirror(list).address, '1-3 Cavendish Sq, London W1G 0LB');

  const picked = pickDocumentAddresses({ addresses: list }, {});
  assert.equal(picked.snapshot.billingAddress, '1-3 Cavendish Sq, London W1G 0LB');
  assert.equal(picked.snapshot.shippingAddress, '1-3 Cavendish Sq, London W1G 0LB');
});

test('snapshot ของเอกสารไม่มีคีย์ใหม่งอก (ยาม save_quotation_content)', () => {
  // ⚠️ เพิ่มคีย์ที่นี่เมื่อไร ต้องขยาย whitelist ของ RPC ในคอมมิตเดียวกัน —
  // saveQuotationContentColumns.test.mjs อ่านชุดคีย์นี้ไปเทียบกับ migration ล่าสุด
  assert.deepEqual(
    Object.keys(pickDocumentAddresses(null, {}).snapshot).sort(),
    ['billingAddress', 'billingAddressId', 'branchCode', 'shippingAddress', 'shippingAddressId'],
  );
});

/* ── คำเตือน "สำนักงานใหญ่/สาขา" ในชื่อกิจการ ──────────────────────────────
   ที่มา 2026-08-27: พอคืนแถว "สาขา" กลับมาบนใบเสนอราคา ใบของลูกค้าที่พิมพ์คำนี้ติดไว้
   ในชื่อกลายเป็นขัดกันเองบนกระดาษแผ่นเดียว (ชื่อบอกสำนักงานใหญ่ · ช่องสาขาบอกสาขา 1)
   ของจริงในทะเบียนตอนพบ: 15 ราย จาก 191 */
test('ชื่อที่มีคำว่า สำนักงานใหญ่/สาขา ต้องถูกเตือน — แต่ไม่บล็อกการบันทึก', () => {
  const cases = [
    'บริษัท ซารางแฮร์ ดูล จำกัด (สำนักงานใหญ่)',
    'บริษัท กี๊ก แกลเลอรี่ จำกัด สำนักงานใหญ่',
    'บริษัท แบงค็อก เวนิว จำกัด สาขา 00001',
    'บริษัท เอนริช โกลด์ จำกัด ( สำนักงานใหญ่ )',
  ];
  for (const name of cases) {
    assert.ok(customerNameBranchWarning({ name }), `ต้องเตือน: ${name}`);
    // ⚠️ เตือนอย่างเดียว — แถวเดิมต้องยังบันทึกได้โดยไม่ต้องแก้ชื่อก่อน
    assert.equal(customerNameError({ name }), null, `ห้ามบล็อก: ${name}`);
  }
});

test('ชื่อปกติไม่ถูกเตือน', () => {
  for (const c of [{ name: 'บริษัท หอมมหาศาล จำกัด' }, { name: 'บริษัท ซารางแฮร์ ดูล จำกัด' },
    { name: 'บริษัท ปกติ จำกัด', nameEn: 'Normal Co., Ltd.' }, { nameEn: 'ABC International Co., Ltd.' }]) {
    assert.equal(customerNameBranchWarning(c), null, JSON.stringify(c));
  }
});

test('ช่องอังกฤษก็ตรวจด้วย และบอกได้ว่าโดนช่องไหน', () => {
  assert.match(customerNameBranchWarning({ nameEn: 'ABC Co., Ltd. (Head Office)' }), /ชื่อภาษาอังกฤษ/);
  assert.match(customerNameBranchWarning({ name: 'บริษัท ก (สำนักงานใหญ่)' }), /ชื่อภาษาไทย/);
  const both = customerNameBranchWarning({ name: 'บริษัท ก (สำนักงานใหญ่)', nameEn: 'K Co. Branch 1' });
  assert.match(both, /ชื่อภาษาไทย และ ชื่อภาษาอังกฤษ/);
  // 'Branding' ไม่ใช่ 'Branch' — ขอบคำต้องคุมไว้
  assert.equal(customerNameBranchWarning({ nameEn: 'Branding House Co., Ltd.' }), null);
});

test('หน้าฟอร์มลูกค้าต้องวาดคำเตือนจริง ไม่ใช่มีแต่ตัว helper', () => {
  const src = readFileSync(new URL('../../components/database/CustomerForm.js', import.meta.url), 'utf8');
  assert.match(src, /customerNameBranchWarning\(form\)/);
  assert.match(src, /\{nameBranchWarning &&/);
});
