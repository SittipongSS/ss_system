import test from 'node:test';
import assert from 'node:assert/strict';
import {
  branchKeyOf,
  isCompleteTaxId,
  isThaiTaxEntity,
  splitTaxIdMatches,
  taxIdDuplicateError,
  taxIdFormatError,
  taxIdKey,
  taxIdMatchFilter,
  taxIdMatches,
  taxIdOtherBranchWarning,
  taxIdStore,
} from './customerTaxId.js';

const ROWS = [
  { id: 'CUS-1', arCode: 'AR-306', name: 'เคพี อาร์ท เซ็นเตอร์', taxId: '0105560000069', branchCode: '00000' },
  { id: 'CUS-2', arCode: 'AR-307', name: 'เคพี อาร์ท เซ็นเตอร์ (สาขา 2)', taxId: '0105560000069', branchCode: '00002' },
  { id: 'CUS-3', arCode: 'AR-901', name: 'ทิพย์สมัย', taxId: '0105560131775', branchCode: '00000' },
];

test('คีย์เทียบ: ถอดขีด · เติมศูนย์นำหน้าที่หายไป · เลขต่างชาติเก็บทั้งก้อน', () => {
  assert.equal(taxIdKey('0-1055-60000-06-9'), '0105560000069');
  assert.equal(taxIdKey('0105560000069'), '0105560000069');
  // ศูนย์นำหน้าหายตอนผ่าน Excel — ต้องเป็นบริษัทเดียวกับเลขเต็ม
  assert.equal(taxIdKey('105560000069'), '0105560000069');
  assert.equal(taxIdKey('pa0374073'), 'PA0374073');
  assert.equal(taxIdKey(null), '');
});

test('รูปที่เขียนลงฐาน: เลขไทยเหลือตัวเลขล้วน · เลขต่างชาติเก็บตามที่กรอก', () => {
  assert.equal(taxIdStore('0-1055-60000-06-9'), '0105560000069');
  assert.equal(taxIdStore('  '), null);
  assert.equal(taxIdStore(''), null);
  assert.equal(taxIdStore('PA0374073'), 'PA0374073');
});

test('กรอกครบแล้ว = เลขไทยครบ 13 หลัก · เลขต่างชาติยาวพอ', () => {
  assert.equal(isCompleteTaxId('0-1055-60000-06-9'), true);
  assert.equal(isCompleteTaxId('010556000'), false);
  assert.equal(isCompleteTaxId('PA0374073'), true);
  assert.equal(isCompleteTaxId('PA07'), false);
});

test('คีย์สาขา: ไม่ระบุ/สำนักงานใหญ่/คำพ้อง ยุบเป็น 00000 · ชื่อสาขาคงข้อความ', () => {
  assert.equal(branchKeyOf(''), '00000');
  assert.equal(branchKeyOf(null), '00000');
  assert.equal(branchKeyOf('00002'), '00002');
  assert.equal(branchKeyOf('2'), '00002');
  assert.equal(branchKeyOf('สาขาที่ 2'), '00002');
  // ถ้าไม่ยุบคำพวกนี้ บริษัทเดิมเปิดใบซ้ำที่สำนักงานใหญ่ได้ด้วยการพิมพ์เป็นคำแทนเลข
  assert.equal(branchKeyOf('สำนักงานใหญ่'), '00000');
  assert.equal(branchKeyOf('สนญ.'), '00000');
  assert.equal(branchKeyOf('Head Office'), '00000');
  // ชื่อสาขาที่เป็นข้อความจริง ๆ ห้ามตกเป็น 00000 (ใบกำกับภาษีจะเปลี่ยนสาขาเงียบ ๆ)
  assert.equal(branchKeyOf('แจ้งวัฒนะ'), 'แจ้งวัฒนะ');
});

test('เลขซ้ำ + สาขาเดียวกัน = ซ้ำจริง · คนละสาขา = แค่เตือน', () => {
  const hit = splitTaxIdMatches(ROWS, { taxId: '0-1055-60000-06-9', branchCode: '' });
  assert.deepEqual(hit.sameBranch.map((r) => r.id), ['CUS-1']);
  assert.deepEqual(hit.otherBranch.map((r) => r.id), ['CUS-2']);

  const branch2 = splitTaxIdMatches(ROWS, { taxId: '0105560000069', branchCode: '00002' });
  assert.deepEqual(branch2.sameBranch.map((r) => r.id), ['CUS-2']);
  assert.deepEqual(branch2.otherBranch.map((r) => r.id), ['CUS-1']);
});

test('สาขาที่เขียนคนละรูปคือสาขาเดียวกัน — ไม่งั้นเปิดใบซ้ำที่ สนญ. ได้', () => {
  const rows = [{ id: 'CUS-A', arCode: 'AR-896', name: 'เบสท์ แคร์', taxId: '0105560000069', branchCode: 'สำนักงานใหญ่' }];
  const hit = splitTaxIdMatches(rows, { taxId: '0105560000069', branchCode: '00000' });
  assert.deepEqual(hit.sameBranch.map((r) => r.arCode), ['AR-896']);
});

test('โหมดแก้ไม่นับตัวเอง — ไม่งั้นทุกใบซ้ำกับตัวเอง', () => {
  const hit = splitTaxIdMatches(ROWS, { taxId: '0105560000069', branchCode: '00000', excludeId: 'CUS-1' });
  assert.deepEqual(hit.sameBranch.map((r) => r.id), []);
  assert.deepEqual(hit.otherBranch.map((r) => r.id), ['CUS-2']);
});

test('แถวที่เก็บเลขคนละรูปต้องถูกจับว่าซ้ำ (รูเดิมของ .eq สตริงดิบ)', () => {
  const dirty = [
    { id: 'CUS-9', arCode: 'AR-903', name: 'อาเตโพเล่', taxId: '0-1055-65024-54-3', branchCode: '00000' },
    { id: 'CUS-8', arCode: 'AR-906', name: 'แอนตี้ฮีโร่', taxId: '105566074315', branchCode: '00000' },
  ];
  const hitA = splitTaxIdMatches(dirty, { taxId: '0105565024543', branchCode: '00000' });
  assert.deepEqual(hitA.sameBranch.map((r) => r.arCode), ['AR-903']);
  const hitB = splitTaxIdMatches(dirty, { taxId: '0105566074315', branchCode: '00000' });
  assert.deepEqual(hitB.sameBranch.map((r) => r.arCode), ['AR-906']);
  // by-tax-id คืนทุกสาขา ฟอร์มเป็นคนแยกเอง
  assert.equal(taxIdMatches(dirty, { taxId: '0105566074315' }).length, 1);
});

test('ไม่มีเลข = ไม่เทียบอะไรเลย', () => {
  assert.deepEqual(splitTaxIdMatches(ROWS, { taxId: '', branchCode: '00000' }).sameBranch, []);
  assert.deepEqual(taxIdMatches(ROWS, { taxId: '' }), []);
  assert.equal(taxIdDuplicateError([], { branchCode: '00000' }), null);
  assert.equal(taxIdOtherBranchWarning([]), null);
});

test('ข้อความซ้ำต้องบอกสาขาที่ชน + ใบที่ชน', () => {
  const message = taxIdDuplicateError([ROWS[1], ROWS[0]], { branchCode: '00002' });
  assert.match(message, /สาขา 00002/);
  assert.match(message, /AR-307/);
  assert.match(message, /อีก 1 ราย/);
});

test('คำเตือนคนละสาขาต้องขึ้นเลขสาขาทุกใบ รวมสำนักงานใหญ่', () => {
  const warning = taxIdOtherBranchWarning([ROWS[0], ROWS[1]]);
  assert.match(warning, /AR-306 .*\(สาขา 00000\)/);
  assert.match(warning, /AR-307 .*\(สาขา 00002\)/);
  assert.match(warning, /บันทึกต่อได้/);
});

test('ด่านรูปแบบ: ลูกค้าไทยต้อง 13 หลักล้วน · ต่างชาติผ่านหมด · ว่างผ่าน', () => {
  assert.equal(taxIdFormatError('0105560000069', { thaiEntity: true }), null);
  assert.equal(taxIdFormatError('', { thaiEntity: true }), null);
  assert.match(taxIdFormatError('010556', { thaiEntity: true }), /6 หลัก/);
  assert.match(taxIdFormatError('PA0374073', { thaiEntity: true }), /ตัวเลขล้วน/);
  assert.equal(taxIdFormatError('PA0374073', { thaiEntity: false }), null);
  assert.equal(taxIdFormatError('415023377', { thaiEntity: false }), null);
});

test('ลูกค้าไทย = ที่อยู่ออกบิลหลักมีจังหวัดจากทะเบียนไทย', () => {
  assert.equal(isThaiTaxEntity([{ id: 'a', useFor: 'both', provinceCode: '10', province: 'กรุงเทพมหานคร' }]), true);
  assert.equal(isThaiTaxEntity([{ id: 'a', useFor: 'both', address: '12 Kimball Ave, NY' }]), false);
  // ยังไม่กรอกที่อยู่ = ถือว่าไทย (ค่าตั้งต้นของระบบ)
  assert.equal(isThaiTaxEntity([]), true);
  assert.equal(isThaiTaxEntity(null), true);
});

test('ตัวกรองดึงแถวต้องคลุมทั้งรูปที่มีขีดและรูปที่ศูนย์นำหน้าหาย', () => {
  const filter = taxIdMatchFilter('0105566074315');
  assert.match(filter, /taxId\.eq\.0105566074315/);
  assert.match(filter, /taxId\.eq\.105566074315/);
  assert.match(filter, /taxId\.like\.\*0\*1\*0\*5\*5\*6\*6\*0\*7\*4\*3\*1\*5\*/);
  // เลขต่างชาติไม่มีรูปแปลง — เทียบตรงอย่างเดียว
  assert.equal(taxIdMatchFilter('PA0374073'), 'taxId.eq.PA0374073');
  assert.equal(taxIdMatchFilter(''), null);
});
