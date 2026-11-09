// ── เอกสารที่ RD ออก ระดับ FG (MSDS · Specification Sheet) เก็บที่สินค้า — ศูนย์กลางเอกสารของสินค้า P2 (มติเจ้าของ 09/11/2026) ──
// สิ่งที่ล็อก: สองคีย์อยู่ในทะเบียนของสินค้า แต่ไม่ขึ้นแผงทั่วไป/ไม่บังคับ · แนบ/ลบ/แก้ได้เฉพาะ RD + แอดมิน ("แทน" ด่านแก้สินค้า
// ไม่ใช่ "หรือ") ทั้ง POST และ DELETE/PATCH · หน้าสินค้ามีแผงของ RD แยก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ATTACHMENT_TYPES, PANEL_HIDDEN_DOC_TYPES, RD_PRODUCT_DOC_TYPES, isRdProductDoc, productDocTypes, requiredDocKeys,
} from './attachmentTypes.js';
import { canAttachRdProductDoc } from './attachmentAccess.js';
import { panelVisibleItems } from '../../components/attachmentsPanelItems.js';
import { RD_ROLES } from '../permissions.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('MSDS กับ Spec Sheet อยู่ในทะเบียนของสินค้า มีป้ายบอกว่าเป็นของ RD · ไม่บังคับ', () => {
  assert.deepEqual([...RD_PRODUCT_DOC_TYPES], ['msds', 'spec_sheet']);
  for (const key of RD_PRODUCT_DOC_TYPES) {
    const type = ATTACHMENT_TYPES.product.find((t) => t.key === key);
    assert.ok(type, `ต้องมี ${key} ในทะเบียนของสินค้า`);
    assert.equal(type.required, false);
    assert.match(type.label, /\(RD\)$/, 'ป้ายต้องบอกว่า RD ออก — กันสับสนกับใบสเปค FM-SA-04');
  }
  assert.equal(isRdProductDoc('product', 'msds'), true);
  assert.equal(isRdProductDoc('customer', 'msds'), false, 'เฉพาะของสินค้า');
  assert.equal(isRdProductDoc('product', 'artwork'), false);
});

test('ไม่ขึ้นการ์ด/แผงทั่วไปของสินค้า และไม่เข้าด่านอนุมัติสินค้า · แผงที่ขอมาเองยังเห็น', () => {
  const cards = productDocTypes({ categoryCode: '01-002' }).map((t) => t.key);
  for (const key of RD_PRODUCT_DOC_TYPES) {
    assert.ok(!cards.includes(key), `${key} ต้องไม่เป็นการ์ดของแผงฝ่ายขาย`);
    assert.ok(PANEL_HIDDEN_DOC_TYPES.product.includes(key));
  }
  assert.ok(!requiredDocKeys('product', productDocTypes({ categoryCode: '01-002' })).some((k) => RD_PRODUCT_DOC_TYPES.includes(k)));
  const rows = [{ id: 'M', docType: 'msds', metadata: {} }, { id: 'A', docType: 'artwork', metadata: {} }];
  assert.deepEqual(panelVisibleItems(rows, 'product', productDocTypes({})).map((r) => r.id), ['A'], 'แผงฝ่ายขายไม่เห็นไฟล์ของ RD');
  const rdCards = ATTACHMENT_TYPES.product.filter((t) => RD_PRODUCT_DOC_TYPES.includes(t.key));
  assert.deepEqual(panelVisibleItems(rows, 'product', rdCards).map((r) => r.id), ['M'],
    'แผงของ RD เห็น/นับเฉพาะไฟล์ของ RD (🐞 09/11 หัวแผงเคยขึ้น (1) จาก Artwork)');
});

test('สิทธิ์: RD ทุกตำแหน่ง + แอดมินแนบได้ · ฝ่ายขาย/RA/อื่นไม่ได้ · ชนิดอื่นไม่ใช่ช่องนี้', () => {
  for (const role of RD_ROLES) assert.equal(canAttachRdProductDoc('product', 'msds', { role }), true, role);
  assert.equal(canAttachRdProductDoc('product', 'spec_sheet', { role: 'admin' }), true);
  for (const role of ['ae', 'ac', 'senior_ae', 'ae_supervisor', 'commercial_director', 'ra', 'qc', 'viewer']) {
    assert.equal(canAttachRdProductDoc('product', 'msds', { role }), false, role);
  }
  assert.equal(canAttachRdProductDoc('product', 'artwork', { role: 'rd' }), false, 'RD ไม่ได้สิทธิ์ไฟล์อื่นของสินค้าไปด้วย');
  assert.equal(canAttachRdProductDoc('customer', 'msds', { role: 'rd' }), false);
});

test('🔴 POST: ชนิดของ RD ใช้ช่อง RD "แทน" ด่านแก้สินค้า (ฝ่ายขายแก้สินค้าได้ก็แนบไม่ได้)', () => {
  const post = code('../../app/api/attachments/route.js');
  assert.match(post, /const allowedWrite = isRdProductDoc\(entityType, safeDocType\)\s*\?\s*canAttachRdProductDoc\(entityType, safeDocType, user\)\s*:\s*allowedEdit \|\| canAttachSpecItemImage\(entityType, safeDocType, user\);/);
});

test('🔴 DELETE/PATCH: อ่าน docType ของแถว · ชนิดของ RD ตัดสินด้วยช่อง RD อย่างเดียว', () => {
  const guard = code('../../app/api/attachments/[id]/route.js');
  const fn = guard.slice(guard.indexOf('async function guardAttachmentWrite'), guard.indexOf('const SPEC_ILLUSTRATION_RETIRED_MESSAGE'));
  const branch = fn.indexOf('if (isRdProductDoc(att.entityType, att.docType)) {');
  assert.ok(branch > 0, 'ต้องแยกกิ่งของเอกสาร RD');
  assert.match(fn.slice(branch, branch + 400), /canAttachRdProductDoc\(att\.entityType, att\.docType, user\)[\s\S]*?return null;/);
  // กิ่งของ RD ต้องมาหลังด่านแถวแม่ถูกลบ (orphan) + ตัวตัดสินเดิม และก่อนด่าน 403 ของการแก้สินค้า — ไม่งั้นด่านนั้นตัด RD ทิ้งก่อน
  assert.ok(fn.indexOf('const canEditParent =') < branch);
  assert.ok(branch < fn.indexOf('if (parent && !(canEditParent || canEditSpecImage))'));
});

test('หน้าสินค้า: แผง "เอกสารจาก RD" แยกจากแผงของฝ่ายขาย · แก้ได้ตามสิทธิ์ RD', () => {
  const page = code('../../app/database/products/[id]/page.js');
  assert.match(page, /const canEditRdDocs = isRdRole\(role\) \|\| role === "admin";/);
  assert.match(page, /canEdit=\{canEditRdDocs\}\s+docTypes=\{RD_DOC_TYPES\}\s+title="เอกสารจาก RD"/);
});
