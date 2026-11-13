// ── IFRA เก็บที่กลิ่น (ศูนย์กลางเอกสารของสินค้า P3 · มติเจ้าของ 09/11/2026: "IFRA เก็บ by กลิ่น (RD ออก)") ──────────────
// สิ่งที่ล็อก: กลิ่นเป็น entity แนบไฟล์ครบ 5 จุด · แนบ/ลบได้เฉพาะ RD + admin · คำร้องขอเอกสาร IFRA บังคับเลือกกลิ่น (บรรทัดใหม่)
// · กลิ่นต้องใช้กับลูกค้าของใบได้ · ไฟล์ของบรรทัด IFRA อยู่ที่กลิ่น (ตัวตัดสินเดียว) · หน้า FG ดึง IFRA ของทุกกลิ่นใน FG
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATTACHMENT_ENTITY_TYPES, ATTACHMENT_TYPES, SCENT_IFRA_DOC_TYPE, requiredDocKeys } from './attachmentTypes.js';
import { PARENT_TABLE } from './attachments.js';
import { FOLDER_ENTITY_TYPES } from './driveEntityMap.js';
import { SCENT_ATTACHMENT_TABLE, canAttachToScent, canViewScentAttachment, isScentAttachment } from './scentAttachmentAccess.js';
import { RD_ROLES } from '../permissions.js';
import { REQUEST_SCENT_DOC_TYPES } from '../requests/docTypes.js';
import { normalizeDocumentItems } from '../requests/lines.js';
import { docLineFileTarget } from '../requests/productDocLines.js';
import { resolveLineLabels } from '../requests/lineLabels.js';
import { fmtDate } from '../format.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('กลิ่นเป็น entity แนบไฟล์ได้ · ชนิดเดียวคือ IFRA (ไม่บังคับ) · คีย์ตรงกับชนิดที่คำร้องขอ', () => {
  assert.ok(ATTACHMENT_ENTITY_TYPES.includes('scent'));
  assert.deepEqual(ATTACHMENT_TYPES.scent.map((t) => t.key), [SCENT_IFRA_DOC_TYPE]);
  assert.equal(ATTACHMENT_TYPES.scent[0].required, false);
  assert.match(ATTACHMENT_TYPES.scent[0].label, /\(RD\)$/);
  assert.deepEqual(requiredDocKeys('scent'), []);
  assert.deepEqual([...REQUEST_SCENT_DOC_TYPES], [SCENT_IFRA_DOC_TYPE]);
});

test('เช็กลิสต์ 5 จุดของ entity แนบไฟล์ใหม่ครบ (อ่าน · แนบ · ลบ · Drive · proxy เปิดไฟล์) + ลบกลิ่นกวาดไฟล์', () => {
  assert.equal(SCENT_ATTACHMENT_TABLE.scent, 'scents');
  assert.equal(isScentAttachment('scent'), true);
  assert.equal(PARENT_TABLE.scent, 'scents', 'proxy /file หาแถวแม่ไม่เจอ = 403 ทุกไฟล์');
  assert.ok(FOLDER_ENTITY_TYPES.includes('scent'), 'ไม่มี = ตกถัง "_รอจัดที่"');
  assert.match(code('../drive.js'), /if \(type === 'scent'\) \{/);
  assert.match(code('../../app/api/attachments/route.js'), /\|\| SCENT_ATTACHMENT_TABLE\[entityType\];/);
  const access = code('./attachmentAccess.js');
  assert.match(access, /if \(isScentAttachment\(entityType\)\) return canViewScentAttachment\(user\);/);
  assert.match(access, /if \(isScentAttachment\(entityType\)\) return canAttachToScent\(user\);/);
  assert.match(code('../../app/api/attachments/[id]/route.js'), /if \(scentRow && !canAttachToScent\(user\)\)/);
  const del = code('../../app/api/master/scents/[id]/route.js');
  assert.equal((del.match(/purgeAttachments\('scent', id\)/g) || []).length, 2, 'ลบกลิ่นทั้งสองทาง (ปกติ · force) ต้องกวาดไฟล์');
});

test('สิทธิ์: RD ทุกตำแหน่ง + role admin แนบ/ลบ IFRA ได้ · ฝ่ายขาย (รวมหัวหน้า) ไม่ได้ · ดู = เห็นทะเบียนกลิ่น', () => {
  for (const role of RD_ROLES) assert.equal(canAttachToScent({ role }), true, role);
  assert.equal(canAttachToScent({ role: 'admin' }), true);
  for (const role of ['ae', 'ac', 'senior_ae', 'ae_supervisor', 'ac_supervisor', 'commercial_director', 'ra', 'qc', 'viewer']) {
    assert.equal(canAttachToScent({ role }), false, role);
  }
  assert.equal(canViewScentAttachment({ role: 'ae' }), true, 'ฝ่ายขายเปิดดู/ส่งลูกค้าได้');
});

test('คำร้องขอเอกสาร: บรรทัด IFRA ใหม่ต้องเลือกกลิ่น · บรรทัดเดิมไม่ถูกบังคับ · IFRA ของสองกลิ่นในใบเดียวได้', () => {
  assert.match(normalizeDocumentItems([{ docType: 'ifra', spec: '' }]).error, /เลือกกลิ่นที่ขอ/);
  const ok = normalizeDocumentItems([{ docType: 'ifra', scentId: ' SC-1 ', spec: '' }]);
  assert.equal(ok.error, null);
  assert.equal(ok.items[0].scentId, 'SC-1');
  assert.equal(normalizeDocumentItems([{ id: 'DRI-old', docType: 'ifra', spec: '' }]).error, null);
  assert.equal(normalizeDocumentItems([
    { docType: 'ifra', scentId: 'SC-1', spec: '' }, { docType: 'ifra', scentId: 'SC-2', spec: '' },
  ]).error, null);
});

test('ไฟล์ของบรรทัด IFRA ที่ผูกกลิ่นอยู่ที่กลิ่น · MSDS ที่ผูก FG อยู่ที่สินค้า · บรรทัดเดิมอยู่ที่บรรทัด', () => {
  assert.deepEqual(docLineFileTarget({ lineKind: 'document', docType: 'ifra', scentId: 'SC-1' }),
    { entityType: 'scent', entityId: 'SC-1', docType: 'ifra', label: 'IFRA Certificate' });
  assert.equal(docLineFileTarget({ lineKind: 'document', docType: 'msds', productId: 'PRD-1' }).entityType, 'product');
  assert.equal(docLineFileTarget({ lineKind: 'document', docType: 'ifra', scentId: null }), null);
  assert.equal(docLineFileTarget({ lineKind: 'product_dev', docType: null, scentId: 'SC-1' }), null, 'บรรทัดพัฒนาสูตรไม่ใช่บรรทัดเอกสาร');
});

/* ตัวจำลองแบบ thenable — ทุกเมธอดคืนตัวเอง · await ได้ผลของตารางนั้น (scents · ตารางแชร์) */
function fakeDb(tables) {
  return {
    from(table) {
      const result = { data: tables[table] ?? [], error: null };
      const q = {};
      for (const m of ['select', 'in', 'eq', 'order', 'limit', 'range']) q[m] = () => q;
      q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return q;
    },
  };
}

test('resolveLineLabels: กลิ่นต้องมีจริง · ใช้กับลูกค้าของใบได้ (เจ้าของหรือได้รับแชร์) · ป้าย = ชนิด · PF · ชื่อ · วันที่ผลิต', async () => {
  const items = [{ docType: 'ifra', scentId: 'SC-1', label: 'IFRA Certificate', sortOrder: 1 }];
  const own = fakeDb({ scents: [{ id: 'SC-1', code: 'S-0001', name: 'กลิ่นทดสอบ', producedAt: '2026-10-12', customerId: 'C1' }] });
  const ok = await resolveLineLabels(own, items, { lineShape: 'document', customerId: 'C1' });
  assert.equal(ok.error, null);
  // มติเจ้าของ 13/11 — ป้ายกลิ่นครบสามท่อนเสมอ
  assert.equal(ok.items[0].label, `IFRA Certificate · S-0001 · กลิ่นทดสอบ · ${fmtDate('2026-10-12')}`);
  assert.match((await resolveLineLabels(fakeDb({ scents: [] }), items, { lineShape: 'document', customerId: 'C1' })).error, /ไม่พบกลิ่น/);
  const other = fakeDb({ scents: [{ id: 'SC-1', code: 'S-0001', name: 'x', customerId: 'C2' }] });
  assert.match((await resolveLineLabels(other, items, { lineShape: 'document', customerId: 'C1' })).error, /ลูกค้าคนละราย/);
});

test('ด่านส่งงาน · แท็บเอกสารของดีล · หน้าต่างส่งงาน · การ์ดบรรทัด รู้จักกลิ่น · ฟอร์มมีช่องเลือกกลิ่น · หน้าแก้โหลดทะเบียนกลิ่น', () => {
  assert.match(code('../../app/api/sa/requests/[id]/items/[itemId]/route.js'), /\.eq\('entityType', fileTarget\.entityType\)/);
  assert.match(code('../../app/api/sales-planning/documents/all/route.js'), /for \(const entityType of \['product', 'scent'\]\)/);
  assert.match(code('../../components/requests/details/DocumentDetail.js'), /entityType=\{target\.entityType\}/);
  assert.match(code('../../components/requests/DocumentLines.js'), /const wantsScent = Boolean\(vocabulary\.scentTarget\?\.\(row\.docType\)\);/);
  assert.match(code('../../components/requests/RequestEditableFields.js'), /scents=\{scents\}\s+customerId=\{customerId\}\s+\/>/);
  assert.match(code('../../app/requests/[id]/page.js'), /const needsScents = hasFormulaRows \|\| pdrPicksScent \|\| req\?\.kind === "document";/);
  assert.match(code('../../app/api/sa/requests/route.js'), /scentId: item\.scentId \?\? null,/);
});

test('หน้า FG ดึง IFRA ของทุกกลิ่นใน FG (กลิ่นตรง · ของสูตร · ทุกสูตรในชุดของขวัญ) · หน้ากลิ่นมีแผง IFRA', () => {
  const api = code('../../app/api/products/[id]/route.js');
  assert.match(api, /data\.scentId, formulaScentId, \.\.\.formulaComponents\.map\(\(row\) => row\.scentId\)/);
  assert.match(api, /formulaIngredientList, formulaCategoryCode, fgScents,/);
  const page = code('../../app/database/products/[id]/page.js');
  assert.match(page, /\(product\.fgScents \|\| \[\]\)\.map\(\(scent\) => \(/);
  assert.match(page, /entityType="scent"/);
  assert.match(code('../../app/database/scents/[id]/page.js'), /entityType="scent"[\s\S]*canEdit=\{isRdRole\(role\) \|\| role === "admin"\}/);
});
