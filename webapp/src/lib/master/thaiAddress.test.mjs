import test from 'node:test';
import assert from 'node:assert/strict';

import {
  branchLabel, composeThaiAddress, hasStructuredParts, normalizeBranchCode,
  normalizePostcode, parseThaiAddress,
  matchSubdistrict, isBranchCodeValid, isHeadOfficeBranch, composeEnglishAddress, branchValue,
} from './thaiAddress.js';
import { buildThaiAdminIndex, provincesWithDistricts, resolveAddressParts, subdistrictsOf } from './thaiAdmin.js';

// ── ตัวชุดข้อมูล ─────────────────────────────────────────────────────────

test('ทะเบียนมีครบ 77 จังหวัด และรหัสเป็นรหัสกรมการปกครองจริง', () => {
  const provinces = provincesWithDistricts();
  assert.equal(provinces.length, 77);
  const bangkok = provinces.find((p) => p.th === 'กรุงเทพมหานคร');
  assert.equal(bangkok.code, '10');
  assert.equal(bangkok.districts.length, 50);
  // ชื่อเก็บเป็น "ชื่อเปล่า" ไม่มีคำนำหน้า — ไม่งั้นประกอบข้อความได้ "เขตเขตบางนา"
  assert.ok(bangkok.districts.every((d) => !d.th.startsWith('เขต')));
});

test('ตำบลของอำเภอมาพร้อมรหัสไปรษณีย์ (ผู้ใช้เลือกตำบลแล้วไม่ต้องพิมพ์รหัสเอง)', () => {
  const subs = subdistrictsOf('1001'); // เขตพระนคร
  assert.ok(subs.length > 0);
  assert.ok(subs.every((s) => /^\d{5}$/.test(s.zip)));
  assert.ok(subs.every((s) => s.code.startsWith('1001')));
});

test('รหัสที่ client ส่งมาถูกตรวจกับทะเบียน แล้วคืนชื่อจากทะเบียนทับค่าที่ส่งมา', () => {
  const parts = resolveAddressParts({ subdistrictCode: '100101' });
  assert.equal(parts.province, 'กรุงเทพมหานคร');
  assert.equal(parts.provinceCode, '10');
  assert.equal(parts.districtCode, '1001');
  assert.equal(parts.zip, '10200');
  // รหัสมั่ว = ไม่มีในทะเบียน → null ให้ผู้เรียกตัดสินใจเอง
  assert.equal(resolveAddressParts({ provinceCode: '99' }), null);
});

test('อำเภอ/ตำบล ที่ไม่เข้าคู่กับรหัสที่ส่งมา ยึดตามสายของตำบลเสมอ', () => {
  // ส่งจังหวัดผิด (ชลบุรี) มาคู่กับตำบลในกรุงเทพฯ — ต้องได้กรุงเทพฯ ตามตำบล
  const parts = resolveAddressParts({ provinceCode: '20', districtCode: '2001', subdistrictCode: '100101' });
  assert.equal(parts.provinceCode, '10');
  assert.equal(parts.districtCode, '1001');
});

// ── ประกอบข้อความ ────────────────────────────────────────────────────────

test('ต่างจังหวัดใช้ ตำบล/อำเภอ/จังหวัด ตามลำดับ', () => {
  assert.equal(
    composeThaiAddress({
      line1: '99/1 หมู่ 5', subdistrict: 'บางแก้ว', district: 'บางพลี',
      province: 'สมุทรปราการ', provinceCode: '11', postcode: '10540',
    }),
    '99/1 หมู่ 5 ตำบลบางแก้ว อำเภอบางพลี จังหวัดสมุทรปราการ 10540',
  );
});

test('กรุงเทพฯ ใช้ แขวง/เขต และไม่มีคำว่า "จังหวัด"', () => {
  assert.equal(
    composeThaiAddress({
      line1: '1 อาคารสีลม', subdistrict: 'สีลม', district: 'บางรัก',
      province: 'กรุงเทพมหานคร', provinceCode: '10', postcode: '10500',
    }),
    '1 อาคารสีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500',
  );
});

test('กรอกไม่ครบก็ยังประกอบเท่าที่มี — ไม่คืนคำนำหน้าลอย ๆ', () => {
  assert.equal(composeThaiAddress({ line1: '99/1', province: 'ชลบุรี', provinceCode: '20' }), '99/1 จังหวัดชลบุรี');
  assert.equal(composeThaiAddress({}), '');
  assert.equal(composeThaiAddress({ line1: '99/1' }), '99/1');
});

test('จังหวัดคือขั้นต่ำที่ทำให้แถวนับเป็น "มีโครงสร้าง"', () => {
  assert.equal(hasStructuredParts({ line1: '99/1' }), false);
  assert.equal(hasStructuredParts({ province: 'ชลบุรี' }), true);
});

// ── ค่าที่ผู้ใช้พิมพ์ ─────────────────────────────────────────────────────

test('เลขสาขาเติมศูนย์ให้ครบ 5 หลัก · ค่าว่างคืนค่าว่าง', () => {
  assert.equal(normalizeBranchCode('1'), '00001');
  assert.equal(normalizeBranchCode('สาขา 12'), '00012');
  assert.equal(normalizeBranchCode(''), '');
  assert.equal(branchLabel(''), 'สำนักงานใหญ่');
  assert.equal(branchLabel('00000'), 'สำนักงานใหญ่');
  assert.equal(branchLabel('12'), 'สาขาที่ 00012');
});

test('รหัสไปรษณีย์ต้องครบ 5 หลักเท่านั้น', () => {
  assert.equal(normalizePostcode('10540'), '10540');
  assert.equal(normalizePostcode('105'), '');
  assert.equal(normalizePostcode('10540-1'), '');
});

// ── แยกข้อความเดิม (best-effort สำหรับ backfill) ─────────────────────────

test('แยกที่อยู่ต่างจังหวัดที่เขียนเต็มยศได้ครบทุกระดับ', () => {
  const index = buildThaiAdminIndex();
  const { parts, matched } = parseThaiAddress(
    '99/1 หมู่ 5 ถนนบางนา-ตราด ตำบลบางแก้ว อำเภอบางพลี จังหวัดสมุทรปราการ 10540',
    index,
  );
  assert.equal(parts.province, 'สมุทรปราการ');
  assert.equal(parts.district, 'บางพลี');
  assert.equal(parts.subdistrict, 'บางแก้ว');
  assert.equal(parts.postcode, '10540');
  assert.equal(parts.line1, '99/1 หมู่ 5 ถนนบางนา-ตราด');
  assert.deepEqual(matched, { province: true, district: true, subdistrict: true, postcode: true });
});

test('แยกที่อยู่กรุงเทพฯ ที่เขียนแบบย่อ (แขวง/เขต/กทม.)', () => {
  const { parts } = parseThaiAddress('1 อาคารสีลม แขวงสีลม เขตบางรัก กทม. 10500', buildThaiAdminIndex());
  assert.equal(parts.provinceCode, '10');
  assert.equal(parts.district, 'บางรัก');
  assert.equal(parts.subdistrict, 'สีลม');
  assert.equal(parts.postcode, '10500');
});

test('บ้านเลขที่ที่มีตัวเลข 5 หลักติดกันไม่ถูกจับเป็นรหัสไปรษณีย์แทนของจริง', () => {
  const { parts } = parseThaiAddress('12345 ถนนสุขุมวิท จังหวัดชลบุรี 20000', buildThaiAdminIndex());
  assert.equal(parts.postcode, '20000');
  assert.ok(parts.line1.includes('12345'));
});

test('จับได้แค่บางระดับก็คืนเท่าที่ได้ พร้อมธงบอกว่าอะไรไม่แน่ใจ (ให้คนตรวจก่อนบันทึก)', () => {
  const { parts, matched } = parseThaiAddress('บ้านเลขที่ไม่ระบุ ตรงข้ามวัด', buildThaiAdminIndex());
  assert.equal(matched.province, false);
  assert.equal(parts.province, '');
});

test('ข้อความว่างไม่ทำให้ระเบิด — คืน parts เป็น null ให้ผู้เรียกข้ามแถวนั้น', () => {
  assert.equal(parseThaiAddress('', buildThaiAdminIndex()).parts, null);
  assert.equal(parseThaiAddress('1 สีลม', null).parts, null);
});

// ── regression จาก dry-run กับที่อยู่ลูกค้าจริง 116 รายการ (2026-08-06) ──────

test('ชื่อซอย/ถนนที่พ้องกับชื่ออำเภอ ต้องแพ้คำที่มีคำนำหน้ากำกับ', () => {
  // เดิมได้อำเภอ = "ลาดพร้าว" (ชื่อซอย!) เพราะแมตช์ชื่อเปล่าตัวไหนเจอก่อนได้ก่อน
  const { parts } = parseThaiAddress(
    '9 ซอย ลาดพร้าว 124 แขวง พลับพลา เขต วังทองหลาง กรุงเทพมหานคร 10310',
    buildThaiAdminIndex(),
  );
  assert.equal(parts.district, 'วังทองหลาง');
  assert.equal(parts.subdistrict, 'พลับพลา');
  assert.equal(parts.line1, '9 ซอย ลาดพร้าว 124');
});

test('ชื่อตำบลที่ยาวกว่าและคาบกับชื่ออำเภออื่น ต้องไม่ถูกแย่งไป', () => {
  // "แขวงถนนพญาไท เขตราชเทวี" เดิมได้อำเภอ = พญาไท (ผิดเขต)
  const { parts } = parseThaiAddress(
    '288/10 ถนนราชปรารภ แขวงถนนพญาไท เขตราชเทวี กรุงเทพมหานคร 10400',
    buildThaiAdminIndex(),
  );
  assert.equal(parts.district, 'ราชเทวี');
  assert.equal(parts.subdistrict, 'ถนนพญาไท');
});

test('ชื่อจังหวัดที่เป็นส่วนหนึ่งของชื่อตำบล ต้องไม่ตัดชื่อตำบลขาดครึ่ง', () => {
  // "ต.นครสวรรค์ตก" เดิมโดนตัดคำว่า "นครสวรรค์" ออกไปเหลือ "ตก" ลอย ๆ
  const { parts } = parseThaiAddress(
    'เลขที่ 203 ม.6 ต.นครสวรรค์ตก อ.เมืองนครสวรรค์ จ.นครสวรรค์ 60000',
    buildThaiAdminIndex(),
  );
  assert.equal(parts.province, 'นครสวรรค์');
  assert.equal(parts.district, 'เมืองนครสวรรค์');
  assert.equal(parts.subdistrict, 'นครสวรรค์ตก');
  assert.equal(parts.line1, 'เลขที่ 203 ม.6');
});

test('แขวงกรุงเทพฯ ที่แบ่งใหม่ปี 2560 ต้องมีในทะเบียน (ชุดข้อมูลเก่าตกไป 10 แขวง)', () => {
  const index = buildThaiAdminIndex();
  const bangkok = index.byProvinceCode.get('10');
  assert.equal(bangkok.districts.length, 50);
  assert.equal(bangkok.districts.reduce((n, d) => n + d.subdistricts.length, 0), 180);
  for (const [district, sub] of [['สะพานสูง', 'ทับช้าง'], ['วังทองหลาง', 'พลับพลา'], ['บางบอน', 'บางบอนเหนือ']]) {
    const row = bangkok.districts.find((d) => d.th === district);
    assert.ok(row.subdistricts.some((s) => s.th === sub), `${district} ต้องมีแขวง${sub}`);
  }
});

test('เฟสสองฝั่งฟอร์ม: หาตำบลจากเศษข้อความแล้วคืน line1 ที่ตัดชื่อตำบลออกให้ด้วย', () => {
  const subs = subdistrictsOf('1044'); // เขตสะพานสูง
  const { subdistrict, line1 } = matchSubdistrict('88/136 ซอยกรุงเทพกรีฑา 37 แขวงทับช้าง', subs);
  assert.equal(subdistrict.th, 'ทับช้าง');
  assert.equal(line1, '88/136 ซอยกรุงเทพกรีฑา 37');
});

test('"อ.เมือง" แบบย่อ = อำเภอเมืองของจังหวัดนั้น และเก็บชื่อเต็มจากทะเบียน', () => {
  const { parts } = parseThaiAddress('58/10 ม.1 ต.เกาะแก้ว อ.เมือง จ.ภูเก็ต', buildThaiAdminIndex());
  assert.equal(parts.province, 'ภูเก็ต');
  assert.equal(parts.district, 'เมืองภูเก็ต');   // ไม่ใช่ "เมือง" ที่ผู้ใช้ย่อมา
  assert.equal(parts.subdistrict, 'เกาะแก้ว');
  // ที่อยู่ไม่ได้เขียนรหัสไปรษณีย์ไว้ → เติมจากทะเบียนตำบลให้
  assert.equal(parts.postcode, '83000');
  assert.equal(parts.line1, '58/10 ม.1');
});

test('เลขสาขาที่เป็น "ชื่อ" สาขา ต้องไม่ถูกกลืนเป็นสำนักงานใหญ่', () => {
  // เคสจริงในฐานข้อมูล: customers.branchCode = 'แจ้งวัฒนะ' — ถ้าตัดอักษรไทยทิ้ง
  // ใบกำกับภาษีจะเปลี่ยนจาก "สาขาแจ้งวัฒนะ" เป็น "สำนักงานใหญ่" เงียบ ๆ
  assert.equal(normalizeBranchCode('แจ้งวัฒนะ'), 'แจ้งวัฒนะ');
  assert.equal(branchLabel('แจ้งวัฒนะ'), 'สาขา แจ้งวัฒนะ');
  assert.equal(isBranchCodeValid('แจ้งวัฒนะ'), false);
  // ตัวเลขยังทำงานเหมือนเดิมทุกอย่าง
  assert.equal(normalizeBranchCode('สาขาที่ 12'), '00012');
  assert.equal(isBranchCodeValid('12'), true);
  assert.equal(isBranchCodeValid(''), false);
});

test('ข้อความสาขาที่แปลว่า "สำนักงานใหญ่" ต้องไม่กลายเป็น "สาขา สำนักงานใหญ่"', () => {
  // เคสจริง: customers.branchCode = 'สำนักงานใหญ่' (คนกรอกเป็นคำ ไม่ใช่ '00000')
  assert.equal(branchLabel('สำนักงานใหญ่'), 'สำนักงานใหญ่');
  assert.equal(branchLabel('สนญ.'), 'สำนักงานใหญ่');
  assert.equal(branchLabel('Head Office'), 'สำนักงานใหญ่');
  assert.equal(isHeadOfficeBranch('00000'), true);
  assert.equal(isHeadOfficeBranch(''), true);
  assert.equal(isHeadOfficeBranch('00001'), false);
  assert.equal(isHeadOfficeBranch('แจ้งวัฒนะ'), false);
});

// ── หางซ้ำ ───────────────────────────────────────────────────────────────
// เคสจริง 14 แถวในทะเบียนลูกค้า / 11 ใบเสนอราคา: คนวางที่อยู่ทั้งก้อนลงช่อง line1
// (ตอนเพิ่มแถวใหม่ ช่องนั้นคือช่องที่อยู่ช่องเดียวที่เห็น) แล้วเลือกจังหวัด/อำเภอ/ตำบล
// ⇒ ประกอบออกมาได้ตำบล/อำเภอ/จังหวัด/ไปรษณีย์ สองรอบบนใบกำกับภาษี
test('line1 ที่มีหางอยู่แล้ว ต้องไม่ถูกต่อหางซ้ำ', () => {
  const bkk = {
    line1: '55 ซอยทุ่งมังกร 1 ถนนทุ่งมังกร แขวงฉิมพลี เขตตลิ่งชัน กรุงเทพมหานคร 10170',
    subdistrict: 'ฉิมพลี', district: 'ตลิ่งชัน', province: 'กรุงเทพมหานคร', provinceCode: '10', postcode: '10170',
  };
  assert.equal(composeThaiAddress(bkk), bkk.line1);

  // คำนำหน้าย่อคนละแบบกับที่เราประกอบ ('จ.นครนายก' ↔ 'จังหวัดนครนายก')
  const upcountry = {
    line1: '219/8 หมู่ที่ 17 ตำบลพรหมณี อำเภอเมืองนครนายก จ.นครนายก 26000',
    subdistrict: 'พรหมณี', district: 'เมืองนครนายก', province: 'นครนายก', provinceCode: '26', postcode: '26000',
  };
  assert.equal(composeThaiAddress(upcountry), upcountry.line1);

  // ชื่อพ้องของกรุงเทพฯ + ไม่ได้เขียนรหัสไปรษณีย์ไว้
  const abbrev = {
    line1: '99 หมู่ 5 ถนนบางนา-ตราด แขวงฉิมพลี เขตตลิ่งชัน กทม.',
    subdistrict: 'ฉิมพลี', district: 'ตลิ่งชัน', province: 'กรุงเทพมหานคร', provinceCode: '10', postcode: '10170',
  };
  assert.equal(composeThaiAddress(abbrev), abbrev.line1);
});

test('line1 ปกติยังต้องได้หางต่อท้ายเหมือนเดิม — รวมถึงชื่อถนนที่พ้องกับชื่ออำเภอ', () => {
  assert.equal(
    composeThaiAddress({
      line1: '53 ซอยเจริญใจ (เอกมัย 12) ถนนสุขุมวิท 63',
      subdistrict: 'คลองตันเหนือ', district: 'วัฒนา', province: 'กรุงเทพมหานคร', provinceCode: '10', postcode: '10110',
    }),
    '53 ซอยเจริญใจ (เอกมัย 12) ถนนสุขุมวิท 63 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',
  );
  // ⚠️ ด่านกันหางซ้ำต้องไม่กินเคสนี้: line1 มีคำว่า "สาทร" (ชื่อถนน) ซึ่งพ้องกับชื่อเขต
  // แต่ไม่ได้มีครบทั้งชุดเรียงติดกันที่ท้ายข้อความ ⇒ ยังต้องต่อหางให้
  assert.equal(
    composeThaiAddress({
      line1: '1 อาคารเอ็มไพร์ ชั้น 53 ถนนสาทรใต้',
      subdistrict: 'ยานนาวา', district: 'สาทร', province: 'กรุงเทพมหานคร', provinceCode: '10', postcode: '10120',
    }),
    '1 อาคารเอ็มไพร์ ชั้น 53 ถนนสาทรใต้ แขวงยานนาวา เขตสาทร กรุงเทพมหานคร 10120',
  );
});

test('ฝั่งอังกฤษกันหางซ้ำด้วยกติกาเดียวกัน (รับคำต่อท้าย Sub-district/District)', () => {
  const dup = {
    line1En: '89/402 Soi Phahon Yothin 54/1, Sai Mai Sub-district, Sai Mai District, Bangkok 10220',
    subdistrictEn: 'Sai Mai', districtEn: 'Sai Mai', provinceEn: 'Bangkok', postcode: '10220',
  };
  assert.equal(composeEnglishAddress(dup), dup.line1En);
  assert.equal(
    composeEnglishAddress({
      line1En: '53 Soi Charoenjai', subdistrictEn: 'Khlong Tan Nuea', districtEn: 'Watthana',
      provinceEn: 'Bangkok', postcode: '10110',
    }),
    '53 Soi Charoenjai, Khlong Tan Nuea, Watthana, Bangkok 10110',
  );
});

test('branchValue = เลขล้วนสำหรับช่องที่มีป้ายอยู่แล้ว · branchLabel = คำ+คำนำหน้าสำหรับชิปลอย', () => {
  assert.equal(branchValue('00001'), '00001');
  assert.equal(branchLabel('00001'), 'สาขาที่ 00001');
  /* ⭐ มติผู้ใช้ 2026-08-27: ช่องที่มีป้าย "สาขา" กำกับ ให้พิมพ์ **เลขล้วน** รวมถึง
     สำนักงานใหญ่ที่เป็น '00000' — ช่องนี้คือช่องเลขสาขาตามแบบกรมสรรพากร และการมี
     สองรูป (คำ กับ เลข) ในช่องเดียวกันทำให้เทียบใบกันไม่ได้ */
  assert.equal(branchValue('00000'), '00000');
  assert.equal(branchValue(''), '00000');
  assert.equal(branchValue('สำนักงานใหญ่'), '00000');
  assert.equal(branchValue('สนญ.'), '00000');
  // ชิปลอยที่ไม่มีป้ายยังอ่านเป็นคำ — ไม่มีอะไรบอกว่าเลขนั้นคืออะไร
  assert.equal(branchLabel('00000'), 'สำนักงานใหญ่');
  // ชื่อสาขาที่คนกรอกเป็นข้อความ พิมพ์ตามเดิมทั้งคู่ ไม่เติมคำนำหน้าเลข
  assert.equal(branchValue('แจ้งวัฒนะ'), 'แจ้งวัฒนะ');
});
