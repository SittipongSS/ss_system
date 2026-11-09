// ── คำร้องขอเอกสาร: บรรทัด MSDS / Spec Sheet ผูก FG และไฟล์ลงที่สินค้า (ศูนย์กลางเอกสารของสินค้า P2b · มติเจ้าของ 09/11/2026) ──
// สิ่งที่ล็อก: บังคับเลือก FG เฉพาะบรรทัดใหม่ · ชนิดอื่นทิ้ง FG · FG ต้องมีจริงและเป็นของลูกค้าของใบ · ตัวตัดสิน "ไฟล์อยู่ที่สินค้า"
// ตัวเดียว (ด่านส่งงาน · แท็บเอกสารของดีล · หน้าต่างส่งงาน · การ์ดบรรทัด) · บรรทัดเดิมเดินแบบเดิม
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeDocumentItems, normalizeDocLines } from './lines.js';
import { BILLING_DOC_VOCABULARY } from './kinds/fn/billingDocTypes.js';
import { REQUEST_DOC_VOCABULARY, REQUEST_PRODUCT_DOC_TYPES } from './docTypes.js';
import { productDocLineTarget } from './productDocLines.js';
import { requestLineDiff, lineFormRows } from './requestLineEdit.js';
import { resolveLineLabels } from './lineLabels.js';
import { documentBoard } from './documentBoard.js';
import { RD_PRODUCT_DOC_TYPES } from '../master/attachmentTypes.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('คีย์ของคำร้องตรงกับ docType ของสินค้า (ไฟล์ลงที่สินค้าด้วยคีย์เดียวกัน)', () => {
  for (const key of REQUEST_PRODUCT_DOC_TYPES) assert.ok(RD_PRODUCT_DOC_TYPES.includes(key), key);
  assert.ok(REQUEST_DOC_VOCABULARY.values.includes('msds') && REQUEST_DOC_VOCABULARY.values.includes('spec_sheet'));
  assert.equal(REQUEST_DOC_VOCABULARY.productTarget('ifra'), false, 'IFRA เป็นของกลิ่น (P3) ไม่ใช่ FG');
  assert.equal(Boolean(BILLING_DOC_VOCABULARY.productTarget?.('msds')), false, 'ชุดของบัญชีไม่มีบรรทัดที่ต้องเลือก FG');
});

test('บรรทัดใหม่ MSDS / Spec Sheet ต้องเลือก FG · มี FG = เก็บไว้ · บรรทัดเดิม (มี id) ไม่ถูกบังคับย้อนหลัง', () => {
  assert.match(normalizeDocumentItems([{ docType: 'msds', spec: '' }]).error, /เลือก FG ที่ขอ/);
  assert.match(normalizeDocumentItems([{ docType: 'spec_sheet', spec: '' }]).error, /เลือก FG ที่ขอ/);
  const ok = normalizeDocumentItems([{ docType: 'msds', productId: ' PRD-1 ', spec: '' }]);
  assert.equal(ok.error, null);
  assert.equal(ok.items[0].productId, 'PRD-1');
  const old = normalizeDocumentItems([{ id: 'DRI-old', docType: 'msds', spec: '' }]);
  assert.equal(old.error, null);
  assert.equal(old.items[0].productId, null);
});

test('ชนิดอื่นทิ้ง FG เสมอ · ขอชนิดเดียวกันของสอง FG ในใบเดียวได้ · FG เดียวกันซ้ำ = ซ้ำ', () => {
  const ifra = normalizeDocumentItems([{ docType: 'ifra', productId: 'PRD-1', spec: '' }]);
  assert.equal(ifra.items[0].productId, null, 'FG ที่ค้างจากชนิดเดิมต้องไม่ติดไปกับบรรทัด IFRA');
  assert.equal(normalizeDocumentItems([
    { docType: 'msds', productId: 'PRD-1', spec: '' }, { docType: 'msds', productId: 'PRD-2', spec: '' },
  ]).error, null);
  assert.match(normalizeDocumentItems([
    { docType: 'msds', productId: 'PRD-1', spec: '' }, { docType: 'msds', productId: 'PRD-1', spec: '' },
  ]).error, /ซ้ำ/);
  const billing = normalizeDocLines([{ docType: BILLING_DOC_VOCABULARY.values[0], productId: 'PRD-1', spec: '' }], BILLING_DOC_VOCABULARY);
  assert.equal(billing.items[0].productId, null);
});

test('แก้ใบ: productId เป็นช่องที่ผู้ขอแก้ได้ของบรรทัดเอกสาร · ฟอร์มได้ค่าเป็นสตริงเสมอ', () => {
  const before = [{ id: 'A', lineKind: 'document', docType: 'msds', productId: null, label: 'MSDS / SDS', spec: null, sortOrder: 1 }];
  const plan = requestLineDiff(before, [{ id: 'A', lineKind: 'document', docType: 'msds', productId: 'PRD-9', label: 'MSDS / SDS · FG-9', spec: null }], { lineShape: 'document' });
  assert.deepEqual(plan.update[0].patch, { productId: 'PRD-9', label: 'MSDS / SDS · FG-9' });
  assert.equal(lineFormRows([{ id: 'A', docType: 'msds', productId: null, spec: null }], 'document')[0].productId, '');
});

test('resolveLineLabels: FG ต้องมีจริง · ต้องเป็นของลูกค้าของใบ · ป้าย = ชนิด · รหัส FG · อ่านพัง = error', async () => {
  const fake = (rows, error = null) => ({
    from: () => ({ select: () => ({ in: () => ({ limit: async () => ({ data: rows, error }) }) }) }),
  });
  const items = [{ docType: 'msds', productId: 'PRD-1', label: 'MSDS / SDS', sortOrder: 1 }];
  const ok = await resolveLineLabels(fake([{ id: 'PRD-1', fgCode: 'FG-1', customerId: 'C1' }]), items, { lineShape: 'document', customerId: 'C1' });
  assert.equal(ok.error, null);
  assert.equal(ok.items[0].label, 'MSDS / SDS · FG-1');
  assert.match((await resolveLineLabels(fake([]), items, { lineShape: 'document', customerId: 'C1' })).error, /ไม่พบสินค้า/);
  assert.match((await resolveLineLabels(fake([{ id: 'PRD-1', fgCode: 'FG-1', customerId: 'C2' }]), items, { lineShape: 'document', customerId: 'C1' })).error, /ลูกค้าคนละราย/);
  assert.equal((await resolveLineLabels(fake(null, { message: 'boom' }), items, { lineShape: 'document' })).error, 'boom');
  // ไม่มีบรรทัดไหนผูก FG = ไม่ต้องอ่านฐานเลย
  const none = [{ docType: 'ifra', productId: null, label: 'IFRA Certificate', sortOrder: 1 }];
  assert.deepEqual((await resolveLineLabels({ from: () => { throw new Error('ต้องไม่ถูกเรียก'); } }, none, { lineShape: 'document' })).items, none);
});

test('productDocLineTarget: เฉพาะบรรทัดเอกสารของ RD ชนิด MSDS / Spec Sheet ที่มี FG', () => {
  assert.deepEqual(productDocLineTarget({ lineKind: 'document', docType: 'msds', productId: 'PRD-1' }),
    { productId: 'PRD-1', docType: 'msds', label: 'MSDS / SDS' });
  assert.equal(productDocLineTarget({ lineKind: 'document', docType: 'msds', productId: null }), null, 'บรรทัดเดิม = แบบเดิม');
  assert.equal(productDocLineTarget({ lineKind: 'document', docType: 'ifra', productId: 'PRD-1' }), null);
  assert.equal(productDocLineTarget({ lineKind: 'billing_doc', docType: 'msds', productId: 'PRD-1' }), null);
  assert.equal(productDocLineTarget(null), null);
});

test('ตารางสรุปเอกสารของใบ: บรรทัดที่ผูก FG ใช้ป้ายที่มีรหัส FG (ขอ MSDS สอง FG แยกกันออก)', () => {
  const board = documentBoard([
    { id: 'A', lineKind: 'document', docType: 'msds', productId: 'PRD-1', label: 'MSDS / SDS · FG-1' },
    { id: 'B', lineKind: 'document', docType: 'msds', productId: null, label: 'MSDS / SDS' },
  ]);
  assert.deepEqual(board.map((r) => r.name), ['MSDS / SDS · FG-1', 'MSDS / SDS']);
});

test('🔴 ด่านส่งงาน: บรรทัดที่ผูก FG นับไฟล์ปัจจุบันของสินค้า (ไม่ใช่ของบรรทัด) · บรรทัดเดิมยังนับไฟล์ของบรรทัด', () => {
  const route = code('../../app/api/sa/requests/[id]/items/[itemId]/route.js');
  const target = route.indexOf('const productTarget = productDocLineTarget(row);');
  assert.ok(target > 0);
  const gate = route.slice(target, target + 1400);
  assert.match(gate, /\.eq\('entityType', 'product'\)\.eq\('entityId', productTarget\.productId\)\.eq\('docType', productTarget\.docType\)/);
  assert.match(gate, /!file\.metadata\?\.retiredAt/);
  assert.match(gate, /\} else if \(hop === 'ready' && isDocLineKind\(row\.lineKind\)\) \{/);
});

test('แท็บเอกสารของดีล · หน้าต่างส่งงาน · การ์ดบรรทัด ถามตัวตัดสินเดียวกัน', () => {
  assert.match(code('../../app/api/sales-planning/documents/all/route.js'), /productDocLineTarget\(i\)/);
  const page = code('../../app/requests/[id]/page.js');
  assert.match(page, /productDocLineTarget\(hopDraft\.item\) \? \(/);
  assert.match(page, /entityType="product"\s+entityId=\{productDocLineTarget\(hopDraft\.item\)\.productId\}/);
  assert.match(code('../../components/requests/details/DocumentDetail.js'), /const target = item \? productDocLineTarget\(item\) : null;/);
  // ฟอร์ม: ช่องเลือก FG ของบรรทัด + ทะเบียน FG ส่งจากฟอร์มลงมาถึงตาราง
  assert.match(code('../../components/requests/RequestForm.js'), /products=\{products\}\s+customerId=\{selectedDeal/);
  assert.match(code('../../components/requests/DocumentLines.js'), /const wantsProduct = Boolean\(vocabulary\.productTarget\?\.\(row\.docType\)\);/);
});
