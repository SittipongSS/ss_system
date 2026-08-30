import test from 'node:test';
import assert from 'node:assert/strict';
import {
  branchKeyOf,
  isCompleteTaxId,
  isThaiTaxEntity,
  taxIdDuplicateError,
  taxIdFormatError,
  taxIdKey,
  taxIdMatchFilter,
  taxIdMatches,
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

test('ไม่ระบุสาขา = สำนักงานใหญ่ 00000', () => {
  assert.equal(branchKeyOf(''), '00000');
  assert.equal(branchKeyOf(null), '00000');
  assert.equal(branchKeyOf('00002'), '00002');
});

test('เลขซ้ำ = ซ้ำทันที ไม่ว่าสาขาไหน (มติผู้ใช้ 2026-08-30)', () => {
  const hit = taxIdMatches(ROWS, { taxId: '0-1055-60000-06-9' });
  assert.deepEqual(hit.map((r) => r.id), ['CUS-1', 'CUS-2']);
});

test('โหมดแก้ไม่นับตัวเอง — ไม่งั้นทุกใบซ้ำกับตัวเอง', () => {
  const hit = taxIdMatches(ROWS, { taxId: '0105560000069', excludeId: 'CUS-1' });
  assert.deepEqual(hit.map((r) => r.id), ['CUS-2']);
});

test('แถวที่เก็บเลขคนละรูปต้องถูกจับว่าซ้ำ (รูเดิมของ .eq สตริงดิบ)', () => {
  const dirty = [
    { id: 'CUS-9', arCode: 'AR-903', name: 'อาเตโพเล่', taxId: '0-1055-65024-54-3', branchCode: '00000' },
    { id: 'CUS-8', arCode: 'AR-906', name: 'แอนตี้ฮีโร่', taxId: '105566074315', branchCode: '00000' },
  ];
  assert.deepEqual(taxIdMatches(dirty, { taxId: '0105565024543' }).map((r) => r.arCode), ['AR-903']);
  assert.deepEqual(taxIdMatches(dirty, { taxId: '0105566074315' }).map((r) => r.arCode), ['AR-906']);
});

test('ไม่มีเลข = ไม่เทียบอะไรเลย', () => {
  assert.deepEqual(taxIdMatches(ROWS, { taxId: '' }), []);
  assert.equal(taxIdDuplicateError([]), null);
});

test('ข้อความซ้ำต้องบอกว่าชนกับใบไหน + สาขาไหน', () => {
  const message = taxIdDuplicateError([ROWS[1], ROWS[0]]);
  assert.match(message, /AR-307/);
  assert.match(message, /\(สาขา 00002\)/);
  assert.match(message, /อีก 1 ราย/);
  // สำนักงานใหญ่ไม่ต้องมีวงเล็บสาขา (ค่าตั้งต้นของทุกใบ)
  assert.doesNotMatch(taxIdDuplicateError([ROWS[0]]), /\(สาขา/);
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
