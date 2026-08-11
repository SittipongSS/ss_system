import test from 'node:test';
import assert from 'node:assert/strict';
import {
  branchKeyOf,
  isCompleteTaxId,
  splitTaxIdMatches,
  taxIdDigits,
  taxIdDuplicateError,
  taxIdOtherBranchWarning,
} from './customerTaxId.js';

const ROWS = [
  { id: 'CUS-1', arCode: 'AR-306', name: 'เคพี อาร์ท เซ็นเตอร์', taxId: '0105560000069', branchCode: '00000' },
  { id: 'CUS-2', arCode: 'AR-307', name: 'เคพี อาร์ท เซ็นเตอร์ (สาขา 2)', taxId: '0105560000069', branchCode: '00002' },
  { id: 'CUS-3', arCode: 'AR-901', name: 'ทิพย์สมัย', taxId: '0105560131775', branchCode: '00000' },
];

test('เทียบเลขผู้เสียภาษีแบบถอดขีดก่อนเสมอ', () => {
  assert.equal(taxIdDigits('0-1055-60000-06-9'), '0105560000069');
  assert.equal(taxIdDigits(null), '');
  assert.equal(isCompleteTaxId('0-1055-60000-06-9'), true);
  assert.equal(isCompleteTaxId('010556000'), false);
});

test('ไม่ระบุสาขา = สำนักงานใหญ่ 00000', () => {
  assert.equal(branchKeyOf(''), '00000');
  assert.equal(branchKeyOf(null), '00000');
  assert.equal(branchKeyOf('00002'), '00002');
});

test('เลขซ้ำ + สาขาเดียวกัน = ซ้ำจริง · คนละสาขา = แค่เตือน', () => {
  const hit = splitTaxIdMatches(ROWS, { taxId: '0-1055-60000-06-9', branchCode: '' });
  assert.deepEqual(hit.sameBranch.map((r) => r.id), ['CUS-1']);
  assert.deepEqual(hit.otherBranch.map((r) => r.id), ['CUS-2']);

  const branch2 = splitTaxIdMatches(ROWS, { taxId: '0105560000069', branchCode: '00002' });
  assert.deepEqual(branch2.sameBranch.map((r) => r.id), ['CUS-2']);
  assert.deepEqual(branch2.otherBranch.map((r) => r.id), ['CUS-1']);
});

test('โหมดแก้ต้องไม่รายงานว่าซ้ำกับตัวเอง', () => {
  const hit = splitTaxIdMatches(ROWS, { taxId: '0105560000069', branchCode: '00000', excludeId: 'CUS-1' });
  assert.deepEqual(hit.sameBranch, []);
  assert.deepEqual(hit.otherBranch.map((r) => r.id), ['CUS-2']);
});

test('เลขว่าง = ไม่เช็ค (ช่องนี้ไม่บังคับกรอก)', () => {
  const hit = splitTaxIdMatches(ROWS, { taxId: '', branchCode: '00000' });
  assert.deepEqual(hit, { sameBranch: [], otherBranch: [] });
});

test('ข้อความตีกลับต้องบอกว่าชนกับรายไหน ไม่ใช่แค่ "มีในระบบแล้ว"', () => {
  const message = taxIdDuplicateError([ROWS[0]], { branchCode: '00000' });
  assert.match(message, /AR-306/);
  assert.match(message, /สาขา 00000/);
  assert.equal(taxIdDuplicateError([], { branchCode: '00000' }), null);
});

test('คำเตือนคนละสาขาบอกรายเดิมและบันทึกต่อได้', () => {
  const message = taxIdOtherBranchWarning([ROWS[1]]);
  assert.match(message, /AR-307/);
  assert.match(message, /สาขา 00002/);
  assert.match(message, /บันทึกต่อได้/);
  assert.equal(taxIdOtherBranchWarning([]), null);
});
