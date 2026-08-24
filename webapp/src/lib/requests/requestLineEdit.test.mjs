import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isRowUntouched, lineDiffIsEmpty, lineFormRows, lineShapeEditable, requestLineDiff,
} from './requestLineEdit.js';

const docRow = (over = {}) => ({
  id: 'DRI-1', lineKind: 'document', docType: 'coa', label: 'COA', spec: null, sortOrder: 1, ...over,
});
const nextDoc = (over = {}) => ({
  id: 'DRI-1', lineKind: 'document', docType: 'coa', label: 'COA', spec: null, sortOrder: 1, ...over,
});

test('รูปร่างที่กรอกตอนเปิดใบเท่านั้นที่แก้ทางนี้ได้', () => {
  assert.equal(lineShapeEditable('document'), true);
  assert.equal(lineShapeEditable('billing_doc'), true);
  assert.equal(lineShapeEditable('product_dev'), true);
  // แถวพัฒนากลิ่นเกิดตอน RD กดส่งงาน ไม่ได้มาจากฟอร์มตอนเปิด
  assert.equal(lineShapeEditable('scent_dev'), false);
  assert.equal(lineShapeEditable(null), false);
});

test('ไม่มีอะไรเปลี่ยน = ไม่มีอะไรต้องเขียน', () => {
  const plan = requestLineDiff([docRow()], [nextDoc()], { lineShape: 'document' });
  assert.equal(plan.error, null);
  assert.equal(lineDiffIsEmpty(plan), true);
});

test('แก้รายละเอียดของแถวเดิม = update ไม่ใช่ ลบ+สร้างใหม่', () => {
  const plan = requestLineDiff(
    [docRow()],
    [nextDoc({ spec: 'ล็อต 2608' })],
    { lineShape: 'document' },
  );
  assert.equal(plan.error, null);
  assert.deepEqual(plan.update, [{ id: 'DRI-1', patch: { spec: 'ล็อต 2608' } }]);
  // ⭐ หัวใจของไฟล์นี้ — ลบแล้วสร้างใหม่จะทำให้ไฟล์แนบที่ผูก id เดิมกลายเป็นลูกกำพร้า
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.insert, []);
});

test('เปลี่ยนชนิดเอกสาร = แก้ทั้ง docType และป้าย', () => {
  const plan = requestLineDiff(
    [docRow()],
    [nextDoc({ docType: 'ifra', label: 'IFRA' })],
    { lineShape: 'document' },
  );
  assert.deepEqual(plan.update, [{ id: 'DRI-1', patch: { docType: 'ifra', label: 'IFRA' } }]);
});

test('แถวใหม่ (ไม่มี id) = insert · แถวที่หายไป = remove', () => {
  const plan = requestLineDiff(
    [docRow(), docRow({ id: 'DRI-2', docType: 'msds', label: 'MSDS', sortOrder: 2 })],
    [nextDoc(), { lineKind: 'document', docType: 'ifra', label: 'IFRA', spec: null }],
    { lineShape: 'document' },
  );
  assert.equal(plan.error, null);
  assert.deepEqual(plan.remove, ['DRI-2']);
  assert.equal(plan.insert.length, 1);
  assert.equal(plan.insert[0].docType, 'ifra');
  assert.equal(plan.insert[0].sortOrder, 2);
});

test('id ที่ไม่มีในใบนี้ = แถวใหม่ ไม่ใช่ทางไปเขียนทับใบอื่น', () => {
  const plan = requestLineDiff(
    [docRow()],
    [nextDoc(), { id: 'DRI-ของใบอื่น', lineKind: 'document', docType: 'ifra', label: 'IFRA' }],
    { lineShape: 'document' },
  );
  assert.equal(plan.error, null);
  assert.equal(plan.insert.length, 1);
  assert.deepEqual(plan.update, []);
});

test('สลับลำดับแถว = แก้ sortOrder ของทั้งคู่ ไม่ใช่สลับเนื้อกัน', () => {
  const a = docRow({ id: 'DRI-1', docType: 'coa', label: 'COA', sortOrder: 1 });
  const b = docRow({ id: 'DRI-2', docType: 'msds', label: 'MSDS', sortOrder: 2 });
  const plan = requestLineDiff([a, b], [b, a], { lineShape: 'document' });
  assert.equal(plan.error, null);
  assert.deepEqual(plan.update, [
    { id: 'DRI-2', patch: { sortOrder: 1 } },
    { id: 'DRI-1', patch: { sortOrder: 2 } },
  ]);
});

test('แถวที่เดินก้าวไปแล้ว — แก้ไม่ได้ ลบไม่ได้', () => {
  const acked = docRow({ ackAt: '2026-08-20' });
  assert.equal(isRowUntouched(acked), false);

  const edited = requestLineDiff([acked], [nextDoc({ spec: 'แก้ทีหลัง' })], { lineShape: 'document' });
  assert.match(edited.error, /เดินก้าวไปแล้ว/);

  const dropped = requestLineDiff([acked], [], { lineShape: 'document' });
  assert.match(dropped.error, /ลบไม่ได้/);

  // ⚠️ แถวที่เดินไปแล้วแต่ **ไม่ได้แก้อะไร** ต้องผ่าน — ไม่งั้นแก้ชื่อเรื่องอย่างเดียว
  // ก็ติดด่านเพราะมีแถวเก่าค้างอยู่ในใบ
  const untouched = requestLineDiff([acked], [nextDoc()], { lineShape: 'document' });
  assert.equal(untouched.error, null);
  assert.equal(lineDiffIsEmpty(untouched), true);
});

test('อ้าง id เดิมซ้ำในก้อนเดียว = ตีกลับ ไม่ใช่เขียนทับกันเงียบ ๆ', () => {
  const plan = requestLineDiff(
    [docRow()],
    [nextDoc({ spec: 'ก' }), nextDoc({ spec: 'ข' })],
    { lineShape: 'document' },
  );
  assert.match(plan.error, /ซ้ำ/);
});

test('บรรทัดพัฒนาสูตร — จำนวนที่ค่าเท่ากันแต่คนละชนิด ไม่นับว่าต่าง', () => {
  const before = [{
    id: 'DRI-9', lineKind: 'product_dev', categoryCode: '01-001', scentId: 'SC-1',
    label: 'น้ำหอม · SC-1 กลิ่นก', spec: null, qty: 12, unit: 'ชิ้น', sortOrder: 1,
  }];
  // ฟอร์มส่ง qty มาเป็นสตริง — ตัวเลขเท่ากันต้องไม่ถูกนับเป็นการแก้
  const next = [{ ...before[0], qty: '12' }];
  const plan = requestLineDiff(before, next, { lineShape: 'product_dev' });
  assert.equal(lineDiffIsEmpty(plan), true);
});

test('lineFormRows — ทุกช่องเป็นสตริง และพา id ไปด้วยเสมอ', () => {
  const [doc] = lineFormRows([{ id: 'DRI-1', docType: 'coa', spec: null }], 'document');
  assert.deepEqual(doc, { id: 'DRI-1', docType: 'coa', spec: '' });

  const [dev] = lineFormRows(
    [{ id: 'DRI-2', categoryCode: '01-001', scentId: 'SC-1', qty: 12, unit: null, spec: null }],
    'product_dev',
  );
  assert.deepEqual(dev, {
    id: 'DRI-2', categoryCode: '01-001', scentId: 'SC-1', qty: '12', unit: '', spec: '',
  });
});
