// ── COA ประจำล็อตการผลิต เก็บที่สินค้า (ศูนย์กลางเอกสารของสินค้า P4 · มติเจ้าของ 09/11/2026) ──────────────────────────────
// มติ: "COA เป็น by FG by lot การผลิต (QC ออก)" · "พิมพ์เลขล็อตเอง"
// สิ่งที่ล็อก: ชนิด coa ของสินค้า (ไม่บังคับ · ซ่อนจากแผงฝ่ายขาย) · แนบ/ลบเฉพาะ QC + admin (แทนด่านแก้สินค้า) · เลขล็อตบังคับ
// ทั้งตอนแนบและตอนแก้รายละเอียด · แผงของหน้าสินค้ามีฟอร์มรายละเอียดที่บังคับเลขล็อต
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ATTACHMENT_TYPES, COA_LOT_FIELD, COA_LOT_MAX_LENGTH, COA_META_FIELDS, ISSUED_PRODUCT_DOC_TYPES, PANEL_HIDDEN_DOC_TYPES,
  PRODUCT_COA_DOC_TYPE, QC_PRODUCT_DOC_TYPES, coaLotError, isIssuedProductDoc, productDocTypes, requiredDocKeys,
} from './attachmentTypes.js';
import { canAttachIssuedProductDoc, canAttachRdProductDoc } from './attachmentAccess.js';
import { RD_ROLES } from '../permissions.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('COA เป็นชนิดของสินค้า (QC) · ไม่บังคับ · ไม่อยู่ในแผง/ด่านอนุมัติของฝ่ายขาย · อยู่ในชุดเอกสารของผู้ออก', () => {
  const type = ATTACHMENT_TYPES.product.find((t) => t.key === PRODUCT_COA_DOC_TYPE);
  assert.ok(type);
  assert.equal(type.required, false);
  assert.match(type.label, /\(QC\)$/);
  assert.deepEqual([...QC_PRODUCT_DOC_TYPES], ['coa']);
  assert.ok(ISSUED_PRODUCT_DOC_TYPES.includes('coa') && ISSUED_PRODUCT_DOC_TYPES.includes('msds'));
  assert.ok(PANEL_HIDDEN_DOC_TYPES.product.includes('coa'));
  assert.ok(!productDocTypes({ categoryCode: '01-002' }).some((t) => t.key === 'coa'));
  assert.ok(!requiredDocKeys('product', productDocTypes({ categoryCode: '01-002' })).includes('coa'));
  assert.equal(isIssuedProductDoc('product', 'coa'), true);
  assert.equal(isIssuedProductDoc('customer', 'coa'), false);
});

test('เลขล็อต: ว่าง/ช่องว่าง = ขาด · ยาวเกินเพดาน = ไม่รับ · มีค่า = ผ่าน · ฟอร์มประกาศช่องนี้เป็นบังคับ', () => {
  assert.match(coaLotError({}), /เลขล็อต/);
  assert.match(coaLotError({ [COA_LOT_FIELD]: '   ' }), /เลขล็อต/);
  assert.match(coaLotError(null), /เลขล็อต/);
  assert.match(coaLotError({ [COA_LOT_FIELD]: 'x'.repeat(COA_LOT_MAX_LENGTH + 1) }), /ยาวเกิน/);
  assert.equal(coaLotError({ [COA_LOT_FIELD]: 'L2611-001' }), null);
  assert.deepEqual(COA_META_FIELDS.map((f) => [f.key, f.required]), [[COA_LOT_FIELD, true]]);
});

test('สิทธิ์: COA = QC + admin · RD แนบ COA ไม่ได้ · QC แนบ MSDS ไม่ได้ · ฝ่ายขายแนบไม่ได้ทั้งคู่', () => {
  assert.equal(canAttachIssuedProductDoc('product', 'coa', { role: 'qc' }), true);
  assert.equal(canAttachIssuedProductDoc('product', 'coa', { role: 'admin' }), true);
  for (const role of RD_ROLES) assert.equal(canAttachIssuedProductDoc('product', 'coa', { role }), false, role);
  for (const role of ['ae', 'ae_supervisor', 'commercial_director', 'pd', 'wh', 'ra', 'viewer']) {
    assert.equal(canAttachIssuedProductDoc('product', 'coa', { role }), false, role);
  }
  assert.equal(canAttachIssuedProductDoc('product', 'msds', { role: 'qc' }), false);
  assert.equal(canAttachIssuedProductDoc('product', 'msds', { role: 'rd' }), true);
  assert.equal(canAttachIssuedProductDoc('product', 'artwork', { role: 'qc' }), false, 'ไม่ใช่เอกสารของผู้ออก');
  assert.equal(canAttachRdProductDoc('product', 'coa', { role: 'admin' }), false, 'ตัวถามของ RD ไม่รับ COA');
});

test('🔴 POST: ด่านผู้ออกตัวเดียว (RD · QC) · เลขล็อตของ COA ตรวจหลังด่านสิทธิ์ และก่อนคุยกับ Drive/เขียนแถว', () => {
  const post = code('../../app/api/attachments/route.js');
  const handler = post.slice(post.indexOf('export async function POST('));
  const gate = handler.indexOf('canAttachIssuedProductDoc(entityType, safeDocType, user)');
  const lot = handler.indexOf('const lotError = coaLotError(metadata);');
  assert.ok(gate > 0 && lot > gate, 'ตรวจเลขล็อตหลังด่านสิทธิ์');
  assert.ok(lot < handler.indexOf('requireUploadReceipt('), 'ก่อนตรวจใบรับไฟล์ (Drive)');
  assert.ok(lot < handler.indexOf('.insert('), 'ก่อนเขียนแถว');
  assert.match(handler.slice(lot - 120, lot + 160), /safeDocType === PRODUCT_COA_DOC_TYPE[\s\S]*status: 400/);
});

test('🔴 แก้รายละเอียด (PATCH): COA เลขล็อตว่างไม่ได้ · ลบ/แก้: ผู้ออกรายชนิด (QC สำหรับ COA)', () => {
  const route = code('../../app/api/attachments/[id]/route.js');
  const patch = route.slice(route.indexOf('export async function PATCH('));
  assert.match(patch, /att\.docType === PRODUCT_COA_DOC_TYPE\) \{\s*const lotError = coaLotError\(merged\);/);
  assert.match(route, /if \(isIssuedProductDoc\(att\.entityType, att\.docType\)\) \{\s*if \(parent && !canAttachIssuedProductDoc\(att\.entityType, att\.docType, user\)\)/);
});

test('หน้าสินค้า: แผง "COA ประจำล็อต (QC)" ใช้ฟอร์มรายละเอียดที่บังคับเลขล็อต · แผงไฟล์แนบรับช่องรายละเอียดเฉพาะแผงได้', () => {
  const page = code('../../app/database/products/[id]/page.js');
  assert.match(page, /const canEditQcDocs = role === "qc" \|\| role === "admin";/);
  assert.match(page, /canEdit=\{canEditQcDocs\}\s+docTypes=\{QC_DOC_TYPES\}\s+metaFields=\{COA_META_FIELDS\}/);
  const panel = code('../../components/AttachmentsPanel.js');
  assert.match(panel, /const metaFields = metaFieldsProp \|\| ATTACHMENT_META_FIELDS\[entityType\] \|\| \[\];/);
  assert.match(panel, /const missingField = metaFields\.find\(\(f\) => f\.required && !String\(meta\[f\.key\] \?\? ""\)\.trim\(\)\);/);
});
