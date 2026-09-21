/* สเปคสินค้า FM-SA-04 — ทะเบียน checklist · ขอบเขตหมวด · กติกาของข้อมูลสเปค · เลขที่เอกสาร
 *
 * ⭐ มติ 21/09/2569 (mig 0370): สเปคไม่มี Rev ไม่มีด่านอนุมัติแล้ว — ด่านของเอกสารที่ออกจาก SO
 *    อยู่ที่ productSpecDocWorkflow.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCT_SPEC_CERTIFICATIONS, PRODUCT_SPEC_CERT_STATUS_LABELS, PRODUCT_SPEC_CHECKLIST,
  PRODUCT_SPEC_CHECKLIST_KEYS, productSpecCertPendingLabel, productSpecCertSeed,
  productSpecChecklistMissing, productSpecChecklistSeed, restoreChecklistItem,
} from './productSpecChecklist.js';
import {
  productSpecScopeReason, productSpecUsedForCategory, productSpecUsedForFgCode,
} from './productSpecScope.js';
import {
  SPEC_CONTENT_FIELDS, SPEC_CONTENT_LIMITS, SPEC_EDIT_ROLES, SPEC_ITEM_EXTRA_MAX, SPEC_CERT_EXTRA_MAX,
  canEditProductSpec, normalizeProductSpecInput, normalizeSpecCertifications, normalizeSpecContent,
  normalizeSpecItems, productSpecDeleteBlock, productSpecPermissions,
} from './productSpecWorkflow.js';
import { parseProductSpecDocNo, productSpecDocNoParts } from './productSpecDocNo.js';

/* ── ทะเบียน checklist ─────────────────────────────────────────────── */

test('checklist มี 17 แถวตามแบบฟอร์มกระดาษ และคีย์ไม่ซ้ำ', () => {
  assert.equal(PRODUCT_SPEC_CHECKLIST.length, 17);
  assert.equal(new Set(PRODUCT_SPEC_CHECKLIST_KEYS).size, 17);
  for (const row of PRODUCT_SPEC_CHECKLIST) {
    assert.ok(row.label.length > 0, `แถว ${row.key} ไม่มีคำ`);
  }
});

test('สเปคใหม่ได้ 17 แถวเปล่า เรียงตามกระดาษ', () => {
  const seed = productSpecChecklistSeed();
  assert.equal(seed.length, 17);
  assert.deepEqual(seed.map((row) => row.sortOrder), [...Array(17).keys()]);
  assert.equal(seed[0].itemKey, 'raw_material');
  assert.equal(seed[0].detail, null);
  assert.equal(seed[0].preparedByS, false);
});

test('seed จากแถวเดิม = ยกค่าที่กรอกไว้มาทั้งหมด ไม่ใช่เริ่มจากศูนย์', () => {
  const previous = [
    { itemKey: 'raw_material', itemLabel: 'วัตถุดิบ/สารประกอบ', detail: 'น้ำหอม', preparedByS: true, preparedByCustomer: false, note: null },
    { itemKey: 'cap', itemLabel: 'ฝา', detail: 'สีเงิน', preparedByS: true, preparedByCustomer: false, note: 'ล็อตใหม่' },
  ];
  const seed = productSpecChecklistSeed(previous);
  assert.equal(seed.find((row) => row.itemKey === 'raw_material').detail, 'น้ำหอม');
  assert.equal(seed.find((row) => row.itemKey === 'cap').note, 'ล็อตใหม่');
  assert.deepEqual(seed.map((row) => row.sortOrder), [0, 1]);
});

test('🪤 seed จากแถวเดิม: แถวที่ถูกลบต้องไม่ฟื้น (มติ 21/09 — 17 แถวลบได้)', () => {
  // ของเดิมเหลือ 2 แถวเพราะผู้ใช้ลบที่ไม่เกี่ยวกับสินค้านี้ทิ้ง
  const seed = productSpecChecklistSeed([
    { itemKey: 'raw_material', itemLabel: 'วัตถุดิบ/สารประกอบ' },
    { itemKey: 'cap', itemLabel: 'ฝา' },
  ]);
  assert.equal(seed.length, 2);
  assert.equal(seed.some((row) => row.itemKey === 'card'), false, 'แถวที่ลบทิ้งกลับมาเอง');
});

test('สเปคแรกของสินค้ายังได้ครบ 17 แถว — "ไม่มีของเดิม" ไม่ใช่ "ลบหมด"', () => {
  assert.equal(productSpecChecklistSeed().length, 17);
  assert.equal(productSpecChecklistSeed([]).length, 17);
  assert.equal(productSpecChecklistSeed(null).length, 17);
});

test('seed จากแถวเดิม: แถวที่ผู้ใช้เพิ่มเองถูกยกมาด้วย คงลำดับเดิม', () => {
  const seed = productSpecChecklistSeed([
    { itemKey: 'cap', itemLabel: 'ฝา', detail: 'สีเงิน' },
    { itemKey: null, itemLabel: 'ถุงผ้าใส่ขวด', detail: 'สีครีม', preparedByS: false, preparedByCustomer: true, note: null },
  ]);
  assert.equal(seed.length, 2);
  assert.equal(seed[1].itemLabel, 'ถุงผ้าใส่ขวด');
  assert.equal(seed[1].itemKey, null);
  assert.equal(seed[1].preparedByCustomer, true);
  assert.equal(seed[1].sortOrder, 1);
});

test('คำของแถวที่มีคีย์มาจากทะเบียนวันนี้ ไม่ใช่คำที่แถวเดิมถือไว้', () => {
  const seed = productSpecChecklistSeed([{ itemKey: 'cap', itemLabel: 'คำเก่าที่เลิกใช้' }]);
  assert.equal(seed[0].itemLabel, 'ฝา');
});

test('แถวของแบบฟอร์มที่ยังไม่อยู่ในใบ — ให้จอเสนอคืนได้', () => {
  assert.equal(productSpecChecklistMissing([]).length, 17);
  const missing = productSpecChecklistMissing([
    { itemKey: 'raw_material' }, { itemKey: 'cap' }, { itemKey: null, itemLabel: 'ถุงผ้า' },
  ]);
  assert.equal(missing.length, 15);
  assert.equal(missing.some((row) => row.key === 'cap'), false);
  assert.equal(missing[0].key, 'inner_packaging');
});

test('คืนแถวแล้วต้องกลับไปอยู่ตำแหน่งตามกระดาษ ไม่ใช่ต่อท้าย', () => {
  const items = [
    { itemKey: 'raw_material', itemLabel: 'วัตถุดิบ/สารประกอบ' },
    { itemKey: 'spray_head', itemLabel: 'หัวสเปรย์' },
    { itemKey: null, itemLabel: 'ถุงผ้าใส่ขวด' },
  ];
  const next = restoreChecklistItem(items, 'cap');
  assert.deepEqual(next.map((row) => row.itemLabel), [
    'วัตถุดิบ/สารประกอบ', 'หัวสเปรย์', 'ฝา', 'ถุงผ้าใส่ขวด',
  ]);
  assert.equal(next[2].preparedByS, false);
});

test('คืนแถวที่มีอยู่แล้ว/คีย์ที่ไม่มีในทะเบียน = ไม่เปลี่ยนอะไร', () => {
  const items = [{ itemKey: 'cap', itemLabel: 'ฝา', detail: 'สีเงิน' }];
  assert.deepEqual(restoreChecklistItem(items, 'cap'), items);
  assert.deepEqual(restoreChecklistItem(items, 'ไม่มีคีย์นี้'), items);
});

test('คืนแถวแรกสุดของกระดาษเข้าใบที่เหลือแถวท้าย ๆ — ต้องไปอยู่หน้าสุด', () => {
  const next = restoreChecklistItem([{ itemKey: 'other', itemLabel: 'อื่นๆ' }], 'raw_material');
  assert.deepEqual(next.map((row) => row.itemKey), ['raw_material', 'other']);
});

/* ── ขอบเขตหมวด ───────────────────────────────────────────────────── */

test('ใบสเปคใช้กับหมวด 01 และ 02 ทุกชนิด — 03/04 ไม่ใช้', () => {
  assert.equal(productSpecUsedForCategory('01-002'), true);
  assert.equal(productSpecUsedForCategory('02-001'), true);  // ระบบกระจายกลิ่น — เจ้าของยืนยันให้รวม
  assert.equal(productSpecUsedForCategory('02-024'), true);
  assert.equal(productSpecUsedForCategory('03-002'), false);
  assert.equal(productSpecUsedForCategory('04-001'), false);
});

test('อ่านหมวดจากรหัส FG ได้ตรงกัน', () => {
  assert.equal(productSpecUsedForFgCode('FG-0903-01-002-10043'), true);
  assert.equal(productSpecUsedForFgCode('FG-0903-03-002'), false);
});

test('เหตุผลที่ไม่มีใบเป็นข้อความบอกเหตุ ไม่ใช่ boolean เปล่า', () => {
  assert.equal(productSpecScopeReason({ fgCode: 'FG-0903-01-002-10043' }), null);
  assert.match(productSpecScopeReason({ fgCode: 'FG-0903-03-002' }), /หมวด 03/);
  assert.match(productSpecScopeReason({}), /ไม่มีรหัสหมวด/);
});

/* ── ข้อมูลสเปค: ใครแก้/ลบได้ (มติ 21/09 — ไม่มี Rev ไม่มีด่านอนุมัติ) ──────── */

test('แก้สเปคได้: AC + ฝ่ายขายทุกระดับ + admin · ฝ่ายอื่นไม่ได้', () => {
  assert.deepEqual([...SPEC_EDIT_ROLES].sort(), ['ac', 'admin', 'ae', 'ae_supervisor', 'senior_ae']);
  for (const role of SPEC_EDIT_ROLES) assert.equal(canEditProductSpec(role), true, role);
  for (const role of ['rd', 'ra', 'finance', 'viewer', 'pd', undefined]) {
    assert.equal(canEditProductSpec(role), false, String(role));
  }
});

const spec1 = { id: 'PSP1', productId: 'PRD1' };
const docOf = (over = {}) => ({ id: 'PSD1', docNo: 'FM-SA-04-220969-001', status: 'active', ...over });

test('สเปคที่ยังไม่มีเอกสาร ลบได้โดยทุกคนที่แก้สเปคได้', () => {
  for (const role of SPEC_EDIT_ROLES) {
    assert.equal(productSpecDeleteBlock({ spec: spec1, documents: [], role }), null, role);
  }
  assert.match(productSpecDeleteBlock({ spec: spec1, documents: [], role: 'rd' }), /AC หรือฝ่ายขาย/);
});

test('🔴 มีเอกสารแล้วลบสเปคไม่ได้ แม้แอดมิน — และบอกเลขที่ที่ขวางอยู่', () => {
  const reason = productSpecDeleteBlock({ spec: spec1, documents: [docOf()], role: 'admin' });
  assert.match(reason, /FM-SA-04-220969-001/);
  assert.match(reason, /1 ใบ/);
});

test('🔴 เอกสารที่ void แล้วก็ยังขวางการลบ — FK RESTRICT ไม่สนสถานะ', () => {
  assert.match(
    productSpecDeleteBlock({ spec: spec1, documents: [docOf({ status: 'void' })], role: 'ac' }),
    /ลบสเปคไม่ได้/,
  );
});

test('ยังไม่มีสเปค = ไม่มีอะไรให้ลบ', () => {
  assert.match(productSpecDeleteBlock({ role: 'admin' }), /ยังไม่มีสเปค/);
});

test('สิทธิ์บนหน้าสเปค: ไม่มีสิทธิ์ = ไม่โชว์ปุ่มลบ · ติดเอกสาร = โชว์พร้อมเหตุ', () => {
  assert.deepEqual(productSpecPermissions({ spec: spec1, documents: [], role: 'ac' }), {
    canEdit: true, delete: { visible: true, reason: null },
  });
  const blocked = productSpecPermissions({ spec: spec1, documents: [docOf()], role: 'ac' });
  assert.equal(blocked.delete.visible, true);
  assert.match(blocked.delete.reason, /FM-SA-04-220969-001/);
  assert.deepEqual(productSpecPermissions({ spec: spec1, documents: [], role: 'rd' }), {
    canEdit: false, delete: { visible: false, reason: 'ต้องเป็น AC หรือฝ่ายขายจึงลบสเปคได้' },
  });
  // ยังไม่มีสเปค = ไม่มีของให้ลบ ⇒ ไม่โชว์
  assert.deepEqual(productSpecPermissions({ spec: null, role: 'ac' }).delete, { visible: false, reason: null });
});

/* ── ข้อมูลที่บันทึกได้ (ด่านเดียวกับ CHECK ของ mig 0370) ─────────────── */

test('ช่องเนื้อสเปคมีแปดช่องตามกระดาษ และทุกช่องมีเพดานความยาว', () => {
  assert.equal(SPEC_CONTENT_FIELDS.length, 8);
  for (const field of SPEC_CONTENT_FIELDS) assert.ok(SPEC_CONTENT_LIMITS[field] > 0, field);
});

test('ช่องที่ไม่ส่งมา = ไม่แตะ · ส่งค่าว่าง = ล้างเป็น NULL · ตัดช่องว่างหัวท้าย', () => {
  assert.deepEqual(normalizeSpecContent({ texture: '  เจล  ', longevity: '', dosagePerUse: null }).value, {
    texture: 'เจล', longevity: null, dosagePerUse: null,
  });
  assert.deepEqual(normalizeSpecContent({}).value, {});
  assert.deepEqual(normalizeSpecContent({ ไม่ใช่ช่องสเปค: 'x' }).value, {});
});

test('เกินเพดานความยาวของช่องไหน บอกชื่อช่องนั้น', () => {
  for (const field of SPEC_CONTENT_FIELDS) {
    const max = SPEC_CONTENT_LIMITS[field];
    assert.equal(normalizeSpecContent({ [field]: 'ก'.repeat(max) }).error, undefined, `${field} พอดีเพดานต้องผ่าน`);
    assert.match(normalizeSpecContent({ [field]: 'ก'.repeat(max + 1) }).error, new RegExp(`${max}`), field);
  }
});

test('checklist: คำของแถวที่มีคีย์มาจากทะเบียน · แถวที่เพิ่มเองใช้คำที่พิมพ์ · เรียงตามที่ส่งมา', () => {
  const { value } = normalizeSpecItems([
    { itemKey: 'cap', itemLabel: 'คำเก่า', detail: ' สีเงิน ', preparedByS: 1 },
    { itemKey: null, itemLabel: ' ถุงผ้าใส่ขวด ', preparedByCustomer: true, note: '' },
  ]);
  assert.deepEqual(value, [
    { sortOrder: 0, itemKey: 'cap', itemLabel: 'ฝา', detail: 'สีเงิน', preparedByS: true, preparedByCustomer: false, note: null },
    { sortOrder: 1, itemKey: null, itemLabel: 'ถุงผ้าใส่ขวด', detail: null, preparedByS: false, preparedByCustomer: true, note: null },
  ]);
});

test('checklist: ลบหมดได้ (ส่งลิสต์ว่าง) แต่แถวไม่มีชื่อ/คีย์ปลอม/คีย์ซ้ำ/ยาวเกิน ไม่ได้', () => {
  assert.deepEqual(normalizeSpecItems([]).value, []);
  assert.match(normalizeSpecItems([{ itemKey: null, itemLabel: '  ' }]).error, /แถวที่ 1 ไม่มีชื่อ/);
  assert.match(normalizeSpecItems([{ itemKey: 'ไม่มีคีย์นี้' }]).error, /ไม่มีในแบบฟอร์ม/);
  assert.match(normalizeSpecItems([{ itemKey: 'cap' }, { itemKey: 'cap' }]).error, /แถวที่ 2 ซ้ำ/);
  assert.match(normalizeSpecItems([{ itemKey: 'cap', detail: 'ก'.repeat(501) }]).error, /500/);
  assert.match(normalizeSpecItems('ไม่ใช่ลิสต์').error, /รูปแบบ/);
});

test(`checklist: แถวที่เพิ่มเองได้ไม่เกิน ${SPEC_ITEM_EXTRA_MAX} แถว`, () => {
  const extras = (n) => Array.from({ length: n }, (_, i) => ({ itemKey: null, itemLabel: `แถว ${i}` }));
  assert.equal(normalizeSpecItems(extras(SPEC_ITEM_EXTRA_MAX)).error, undefined);
  assert.match(normalizeSpecItems(extras(SPEC_ITEM_EXTRA_MAX + 1)).error, /ไม่เกิน/);
});

test('เอกสารที่ขอได้: แถวมาตรฐานใช้ชื่อจากทะเบียน · สถานะว่างได้ (= ยังไม่ตอบ)', () => {
  const { value } = normalizeSpecCertifications([
    { key: 'fda', label: 'ชื่อที่จอส่งมา', status: 'ready', note: ' เลข 10-1-68 ' },
    { key: 'coa', label: 'COA', status: '', note: '' },
    { key: null, label: ' ผลทดสอบความคงตัว ', status: 'in_progress', note: null },
  ]);
  assert.deepEqual(value, [
    { key: 'fda', label: 'เอกสารจดแจ้ง อย.', status: 'ready', note: 'เลข 10-1-68' },
    { key: 'coa', label: 'COA', status: '', note: '' },
    { key: null, label: 'ผลทดสอบความคงตัว', status: 'in_progress', note: '' },
  ]);
});

test('เอกสารที่ขอได้: สถานะนอกสองค่าตามกระดาษ/คีย์ปลอม/คีย์ซ้ำ/ไม่มีชื่อ ไม่ได้', () => {
  assert.match(normalizeSpecCertifications([{ key: 'fda', status: 'done' }]).error, /สถานะ/);
  assert.match(normalizeSpecCertifications([{ key: 'gmp' }]).error, /ไม่มีในแบบฟอร์ม/);
  assert.match(normalizeSpecCertifications([{ key: 'sds' }, { key: 'sds' }]).error, /ซ้ำ/);
  assert.match(normalizeSpecCertifications([{ key: null, label: '' }]).error, /ไม่มีชื่อ/);
  const extras = Array.from({ length: SPEC_CERT_EXTRA_MAX + 1 }, (_, i) => ({ key: null, label: `เอกสาร ${i}` }));
  assert.match(normalizeSpecCertifications(extras).error, /ไม่เกิน/);
});

test('ก้อนบันทึกสเปค: certifications/items ที่ไม่ส่งมา = ไม่แตะของเดิม', () => {
  const partial = normalizeProductSpecInput({ content: { texture: 'ครีม' } });
  assert.deepEqual(partial.value, { content: { texture: 'ครีม' } });
  assert.equal('items' in partial.value, false);
  assert.equal('certifications' in partial.value, false);
  const full = normalizeProductSpecInput({ content: {}, certifications: [], items: [] });
  assert.deepEqual(full.value, { content: {}, certifications: [], items: [] });
  assert.match(normalizeProductSpecInput({ items: [{ itemKey: 'x' }] }).error, /ไม่มีในแบบฟอร์ม/);
});

test('ค่าตั้งต้นของกระดาษผ่านด่านบันทึกเสมอ (สร้างสเปคใหม่ต้องไม่ติดด่านตัวเอง)', () => {
  assert.equal(normalizeSpecItems(productSpecChecklistSeed()).error, undefined);
  assert.equal(normalizeSpecCertifications(productSpecCertSeed()).error, undefined);
});

/* ── เลขที่เอกสาร ─────────────────────────────────────────────────── */

test('ชิ้นส่วนเลขที่เอกสาร: month เป็น YYMM ค.ศ. · prefix เป็น DDMMYY พ.ศ.', () => {
  const parts = productSpecDocNoParts(new Date('2026-09-15T04:00:00Z'));
  assert.equal(parts.month, '2609');
  assert.equal(parts.prefix, 'FM-SA-04-150969-');
  assert.equal(parts.like, 'FM-SA-04-__0969-%');
  assert.equal(parts.width, 3);
});

test('like ปิดตาช่องวัน — ไม่งั้นตัวนับที่หายจะเริ่มนับ 1 ใหม่ทับเลขเดิม', () => {
  const a = productSpecDocNoParts(new Date('2026-09-01T04:00:00Z'));
  const b = productSpecDocNoParts(new Date('2026-09-28T04:00:00Z'));
  assert.notEqual(a.prefix, b.prefix);
  assert.equal(a.like, b.like);
  assert.equal(a.month, b.month);
});

test('เลขข้ามวันในเดือนเดียวกันใช้คีย์ตัวนับเดียวกัน (ตัดรอบเดือน)', () => {
  const sep = productSpecDocNoParts(new Date('2026-09-30T16:30:00Z')); // 30/09 23:30 ไทย
  const oct = productSpecDocNoParts(new Date('2026-09-30T17:30:00Z')); // 01/10 00:30 ไทย
  assert.equal(sep.month, '2609');
  assert.equal(oct.month, '2610');
});

test('อ่านเลขที่เอกสารกลับเป็นชิ้นส่วนได้ และของที่ไม่ใช่รูปแบบนี้คืน null', () => {
  assert.deepEqual(parseProductSpecDocNo('FM-SA-04-150969-004'), {
    day: '15', month: '09', beYear: '69', running: 4, dateText: '15/09/2569',
  });
  assert.equal(parseProductSpecDocNo('FM-SA-07-150969-004'), null);
  assert.equal(parseProductSpecDocNo('FM-SA-04-150969-4'), null);
  assert.equal(parseProductSpecDocNo(''), null);
});

/* ── เอกสารที่ขอได้ ───────────────────────────────────────────────── */

test('เอกสารที่ขอได้มีสี่แถวตามกระดาษ และสถานะมีสองค่า', () => {
  assert.equal(PRODUCT_SPEC_CERTIFICATIONS.length, 4);
  assert.deepEqual(Object.keys(PRODUCT_SPEC_CERT_STATUS_LABELS), ['ready', 'in_progress']);
});

test('แถว อย. ใช้คำของตัวเอง "อยู่ระหว่างยื่น" — ไม่ใช่สถานะที่สาม', () => {
  assert.equal(productSpecCertPendingLabel('fda'), 'อยู่ระหว่างยื่น');
  assert.equal(productSpecCertPendingLabel('coa'), 'อยู่ระหว่างจัดเตรียม');
  assert.equal(productSpecCertPendingLabel('ไม่มีคีย์นี้'), 'อยู่ระหว่างจัดเตรียม');
});

test('สเปคใหม่ได้สี่แถวที่ยังไม่ตอบ — สถานะว่าง ไม่ใช่ "อยู่ระหว่างจัดเตรียม"', () => {
  const seed = productSpecCertSeed();
  assert.equal(seed.length, 4);
  assert.equal(seed[0].status, '');
});

test('seed ยกสถานะเอกสารเดิมมาด้วย รวมแถวที่พิมพ์ชื่อเอง', () => {
  const seed = productSpecCertSeed([
    { key: 'fda', status: 'ready', note: 'เลข 10-1-68' },
    { key: null, label: 'ผลทดสอบความคงตัว', status: 'in_progress', note: '' },
  ]);
  assert.equal(seed.find((row) => row.key === 'fda').status, 'ready');
  assert.equal(seed.find((row) => row.key === 'fda').note, 'เลข 10-1-68');
  assert.equal(seed.length, 5);
  assert.equal(seed[4].label, 'ผลทดสอบความคงตัว');
});

/* ── ชั้นฐาน (productSpecStore) กับฐานจำลองในหน่วยความจำ ─────────────────────
 *
 * ⚠️ ฐานจำลองนี้ไม่ใช่ Postgres — ไม่มี CHECK/FK/trigger (ของพวกนั้นตรึงไว้ที่
 *    productSpecMigration.test.mjs) · ที่นี่ตรวจ "ลำดับ/ก้อน/ตัวกรอง" ที่ store ยิงจริง
 *    โดยเฉพาะจังหวะ SO ออก Rev ซึ่งแตะเอกสารหลายใบในคำสั่งเดียว
 */
const {
  activeDocumentsForOrder, applyFinalApproval, buildDocumentSnapshot, createProductSpec, createSpecDocument,
  deleteProductSpec, isIllustrationReferenced, loadDealOwner, loadProductSpec, missingSnapshotIllustrations,
  moveDocumentsToRevisedOrder, revisedOrderLineId, saveProductSpec, transitionRevision, voidDocumentsByIds,
  voidDocumentsForOrder,
} = await import('./productSpecStore.js');

function fakeDb(seed = {}, { fail = () => null, rpc = null, users = {} } = {}) {
  const tables = structuredClone(seed);
  const rowsOf = (table) => (tables[table] ||= []);
  const from = (table) => {
    const st = { action: 'select', filters: [], order: [], single: false, limit: null, range: null };
    const match = (row) => st.filters.every((test0) => test0(row));
    const run = () => {
      const failure = fail(table, st.action, st);
      if (failure) return { data: null, error: failure };
      let out;
      if (st.action === 'insert') {
        const list = (Array.isArray(st.rows) ? st.rows : [st.rows]).map((row) => ({ ...row }));
        if (list.some((row) => rowsOf(table).some((have) => have.id === row.id))) {
          return { data: null, error: { code: '23505', message: 'duplicate key value' } };
        }
        rowsOf(table).push(...list);
        out = list;
      } else if (st.action === 'update') {
        out = rowsOf(table).filter(match);
        for (const row of out) Object.assign(row, st.patch);
      } else if (st.action === 'delete') {
        out = rowsOf(table).filter(match);
        tables[table] = rowsOf(table).filter((row) => !match(row));
      } else {
        out = rowsOf(table).filter(match);
      }
      out = out.map((row) => structuredClone(row));
      out.sort((a, b) => {
        for (const [col, asc] of st.order) {
          if (a[col] === b[col]) continue;
          return (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1);
        }
        return 0;
      });
      if (st.range) out = out.slice(st.range[0], st.range[1] + 1);
      if (st.limit !== null) out = out.slice(0, st.limit);
      return st.single ? { data: out[0] ?? null, error: null } : { data: out, error: null };
    };
    const b = {
      select: () => b,
      insert: (rows) => { st.action = 'insert'; st.rows = rows; return b; },
      update: (patch) => { st.action = 'update'; st.patch = patch; return b; },
      delete: () => { st.action = 'delete'; return b; },
      eq: (col, value) => { st.filters.push((row) => row[col] === value); return b; },
      neq: (col, value) => { st.filters.push((row) => row[col] !== value); return b; },
      in: (col, values) => { st.filters.push((row) => values.includes(row[col])); return b; },
      not: (col, _op, list) => {
        const ids = String(list).replace(/[()]/g, '').split(',');
        st.filters.push((row) => !ids.includes(row[col]));
        return b;
      },
      contains: (col, values) => { st.filters.push((row) => values.every((v) => (row[col] || []).includes(v))); return b; },
      order: (col, opts = {}) => { st.order.push([col, opts.ascending !== false]); return b; },
      limit: (n) => { st.limit = n; return b; },
      range: (a, z) => { st.range = [a, z]; return b; },
      maybeSingle: () => { st.single = true; return b; },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    };
    return b;
  };
  return {
    from,
    tables,
    rpc: async (name, args) => (rpc ? rpc(name, args, tables) : { data: null, error: { message: 'no rpc' } }),
    auth: {
      admin: {
        getUserById: async (id) => (users[id] instanceof Error
          ? { data: null, error: users[id] }
          : { data: { user: users[id] || null }, error: null }),
      },
    },
  };
}

const NOW = '2026-09-22T03:00:00.000Z';
const ADMIN = { id: 'U-ADM', role: 'admin', name: 'แอดมิน' };

/* RPC `replace_product_spec_items` ของ 0370 จำลอง — ลบทั้งชุดของสเปคแล้วเขียนชุดใหม่ในคำสั่งเดียว
   (ของจริงล็อกแถวสเปคด้วย · ที่นี่ตรวจแค่ว่า store ส่งอะไรไปและผลบนตาราง) */
const itemsRpc = (calls = []) => (name, args, tables) => {
  if (name !== 'replace_product_spec_items') return { data: null, error: { message: `no rpc ${name}` } };
  calls.push(args);
  if (!(tables.product_specs || []).some((row) => row.id === args.p_spec_id)) {
    return { data: null, error: { message: `product_spec_not_found: ${args.p_spec_id}` } };
  }
  tables.product_spec_items = (tables.product_spec_items || [])
    .filter((row) => row.specId !== args.p_spec_id)
    .concat(args.p_rows.map((row) => ({ ...row, specId: args.p_spec_id })));
  return { data: args.p_rows.length, error: null };
};
const revRow = (id, documentId, revNo, status, over = {}) => ({
  id, documentId, revNo, status, reason: revNo > 0 ? 'เหตุผลของ Rev นี้ยาวพอ' : null,
  snapshot: status === 'draft' ? null : { spec: {} }, illustrationIds: status === 'draft' ? [] : ['ATT1'],
  submittedAt: status === 'draft' ? null : NOW, submittedBy: 'U-AC', submittedByName: 'เอซี',
  aeApprovedAt: ['pending_ae_supervisor', 'approved', 'superseded'].includes(status) ? NOW : null,
  supApprovedAt: ['approved', 'superseded'].includes(status) ? NOW : null,
  ...over,
});

test('store: SO ออก Rev — อนุมัติแล้ว = Rev+1 ร่าง · รออนุมัติ = ถอยเป็นร่าง · ร่าง/ตีกลับ = คงไว้ · บรรทัดหาย = เตือน + ถอยที่รออนุมัติ', async () => {
  const OLD = 'SOR-OLD';
  const NEW = 'SOR-NEW';
  const doc0 = (id, line, over = {}) => ({
    id, docNo: `FM-SA-04-220969-00${id.slice(-1)}`, status: 'active', salesOrderId: OLD, salesOrderLineId: line,
    createdAt: `2026-09-2${id.slice(-1)}T00:00:00Z`, ...over,
  });
  const db = fakeDb({
    sales_orders: [{ id: OLD, orderNumber: 'SO-26090001-0' }, { id: NEW, orderNumber: 'SO-26090001-1' }],
    sales_order_lines: ['L1', 'L2', 'L3'].map((line) => ({ id: revisedOrderLineId(NEW, line), salesOrderId: NEW })),
    product_spec_documents: [
      doc0('PSD1', 'L1'), doc0('PSD2', 'L2'), doc0('PSD3', 'L3'), doc0('PSD4', 'L4-ถูกถอด'),
      doc0('PSD5', 'L1', { status: 'void' }), doc0('PSD6', 'L6-ถูกถอด'),
    ],
    product_spec_document_revisions: [
      revRow('R1a', 'PSD1', 0, 'approved'),
      revRow('R2a', 'PSD2', 0, 'pending_ae_supervisor'),
      revRow('R3a', 'PSD3', 0, 'rejected', { rejectionReason: 'แก้ขนาดบรรจุ', rejectedStage: 'ae' }),
      revRow('R4a', 'PSD4', 0, 'approved'),
      revRow('R6a', 'PSD6', 0, 'pending_ae'),
    ],
  });
  const result = await moveDocumentsToRevisedOrder(db, {
    oldOrderId: OLD, newOrder: { id: NEW, orderNumber: 'SO-26090001-1' }, user: ADMIN, now: NOW,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.moved, 5);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.documents.map((row) => [row.id, row.outcome]), [
    ['PSD1', 'revised'], ['PSD2', 'reset'], ['PSD3', 'kept'], ['PSD4', 'orphaned'], ['PSD6', 'orphaned_reset'],
  ]);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /FM-SA-04-220969-004/);
  assert.match(result.warnings[1], /FM-SA-04-220969-006/);

  const docs = new Map(db.tables.product_spec_documents.map((row) => [row.id, row]));
  assert.equal(docs.get('PSD1').salesOrderId, NEW);
  assert.equal(docs.get('PSD1').salesOrderLineId, revisedOrderLineId(NEW, 'L1'));
  assert.equal(docs.get('PSD4').salesOrderId, NEW, 'เอกสารที่บรรทัดหายต้องไปโผล่บน SO ใบใหม่ ให้ยกเลิกได้');
  assert.equal(docs.get('PSD4').salesOrderLineId, null);
  assert.equal(docs.get('PSD5').salesOrderId, OLD, 'ใบที่ void แล้วไม่ย้าย');

  const revs = db.tables.product_spec_document_revisions;
  const opened = revs.find((row) => row.documentId === 'PSD1' && row.revNo === 1);
  assert.equal(opened.status, 'draft');
  assert.equal(opened.reason, 'ออก Rev. ใบสั่งขาย SO-26090001-0 → SO-26090001-1');
  assert.equal(revs.find((row) => row.id === 'R1a').status, 'approved', 'Rev ที่อนุมัติแล้วยังเป็นฉบับที่ใช้จนกว่า Rev ใหม่จะอนุมัติ');
  const reset = revs.find((row) => row.id === 'R2a');
  assert.equal(reset.status, 'draft');
  assert.equal(reset.snapshot, null);
  assert.equal(reset.submittedAt, null);
  assert.equal(reset.aeApprovedAt, null);
  assert.equal(revs.find((row) => row.id === 'R3a').status, 'rejected');
  assert.equal(revs.some((row) => row.documentId === 'PSD4' && row.revNo === 1), false, 'บรรทัดหาย = ไม่เปิด Rev ใหม่ (ยื่นไม่ได้ตลอดกาล)');
  const orphanReset = revs.find((row) => row.id === 'R6a');
  assert.equal(orphanReset.status, 'draft', 'บรรทัดหายแต่รออนุมัติอยู่ = ถอยเป็นร่าง ไม่ค้างในคิวผู้อนุมัติ');
  assert.equal(orphanReset.snapshot, null);
  assert.equal(new Map(db.tables.product_spec_documents.map((row) => [row.id, row])).get('PSD6').salesOrderLineId, null);

  const again = await moveDocumentsToRevisedOrder(db, {
    oldOrderId: OLD, newOrder: { id: NEW, orderNumber: 'SO-26090001-1' }, user: ADMIN, now: NOW,
  });
  assert.equal(again.moved, 0, 'รันซ้ำต้องไม่ย้าย/เปิด Rev ซ้ำ');
});

test('store: สูตร id บรรทัดของ SO Rev ใหม่ตรงกับ md5 ของ Postgres', () => {
  // ค่าเทียบจาก 'SOL-' || md5('SOR-abc' || ':' || 'SOL-xyz') บนฐานจริง (รูปแบบเดียวกับ 0346/0363)
  assert.equal(revisedOrderLineId('SOR-abc', 'SOL-xyz'), 'SOL-7b61ed60e782f30c7b3ea1b4795477ff');
  assert.match(revisedOrderLineId('A', 'B'), /^SOL-[0-9a-f]{32}$/);
});

test('store: เปลี่ยนสถานะ Rev ที่ไม่โดนแถว = 409 ไม่ใช่ "สำเร็จ"', async () => {
  const db = fakeDb({ product_spec_document_revisions: [revRow('R1', 'PSD1', 0, 'draft')] });
  const stale = await transitionRevision(db, {
    revision: { id: 'R1', status: 'pending_ae' }, patch: { status: 'pending_ae_supervisor' },
  });
  assert.equal(stale.conflict, true);
  assert.equal(stale.status, 409);
  assert.match(stale.error, /สถานะเปลี่ยนแล้ว/);
  const ok = await transitionRevision(db, { revision: { id: 'R1', status: 'draft' }, patch: { status: 'pending_ae' } });
  assert.equal(ok.row.status, 'pending_ae');
});

test('store: ยามของฐานปฏิเสธการเดินหน้า (เอกสาร void · SO หลุดอนุมัติกลางคำขอ) = 409 ภาษาคน', async () => {
  const guarded = (message) => fakeDb({ product_spec_document_revisions: [revRow('R1', 'PSD1', 0, 'pending_ae_supervisor')] }, {
    fail: (table, action) => (table === 'product_spec_document_revisions' && action === 'update' ? { message } : null),
  });
  const run = (message) => transitionRevision(guarded(message), {
    revision: { id: 'R1', status: 'pending_ae_supervisor' }, patch: { status: 'approved' },
  });
  const voided = await run('product_spec_document_not_active: PSD1 (void)');
  assert.equal(voided.status, 409);
  assert.equal(voided.conflict, true);
  assert.match(voided.error, /ถูกยกเลิก/);
  const revoked = await run('sales_order_not_approved: SO1 (revision_pending)');
  assert.equal(revoked.status, 409);
  assert.match(revoked.error, /ใบสั่งขาย/);
  assert.equal((await run('boom')).status, undefined, 'error อื่น = 500 พร้อมข้อความเดิม');
});

test('store: บังคับลบ SO — จดเอกสาร active ไว้ก่อน แล้ว void ตาม id (หลังลบ salesOrderId เป็น NULL แล้ว)', async () => {
  const db = fakeDb({
    product_spec_documents: [
      { id: 'D1', docNo: 'FM-SA-04-220969-001', salesOrderId: 'SO1', status: 'active' },
      { id: 'D2', docNo: 'FM-SA-04-220969-002', salesOrderId: 'SO1', status: 'void', voidReason: 'เดิม' },
      { id: 'D3', docNo: 'FM-SA-04-220969-003', salesOrderId: 'SO2', status: 'active' },
    ],
  });
  const listed = await activeDocumentsForOrder(db, 'SO1');
  assert.deepEqual(listed.documents.map((row) => [row.id, row.docNo]), [['D1', 'FM-SA-04-220969-001']]);
  for (const row of db.tables.product_spec_documents) if (row.salesOrderId === 'SO1') row.salesOrderId = null; // FK SET NULL
  const res = await voidDocumentsByIds(db, {
    documentIds: [...listed.documents.map((row) => row.id), 'D2'], reason: 'ใบสั่งขาย SO-1 ถูกลบถาวร', user: ADMIN, now: NOW,
  });
  assert.equal(res.voided, 1);
  const byId = new Map(db.tables.product_spec_documents.map((row) => [row.id, row]));
  assert.equal(byId.get('D1').status, 'void');
  assert.equal(byId.get('D1').voidReason, 'ใบสั่งขาย SO-1 ถูกลบถาวร');
  assert.equal(byId.get('D2').voidReason, 'เดิม', 'ใบที่ void อยู่แล้วไม่ถูกเขียนทับ');
  assert.equal(byId.get('D3').status, 'active');
  const broken = fakeDb({}, { fail: () => ({ message: 'down' }) });
  assert.equal((await activeDocumentsForOrder(broken, 'SO1')).error, 'down', 'อ่านไม่ขึ้นต้องเป็น error ไม่ใช่ "ไม่มีเอกสาร"');
  assert.deepEqual(await voidDocumentsByIds(db, { documentIds: [], reason: 'x', user: ADMIN }), { voided: 0, documents: [] });
});

test('store: ตรวจรูปในภาพนิ่งหลังยื่น — รูปที่หายหรือถูกปลดระวางกลางทาง = ไม่ครบ · อ่านไม่ขึ้น = error', async () => {
  const db = fakeDb({
    attachments: [
      { id: 'A1', metadata: {} },
      { id: 'A2', metadata: { retiredAt: NOW } },
    ],
  });
  assert.deepEqual(await missingSnapshotIllustrations(db, ['A1', 'A2', 'A3']), { missing: ['A2', 'A3'] });
  assert.deepEqual(await missingSnapshotIllustrations(db, []), { missing: [] });
  const broken = fakeDb({}, { fail: () => ({ message: 'down' }) });
  assert.match((await missingSnapshotIllustrations(broken, ['A1'])).error, /down/);
});

test('store: SO ยกเลิก = void เฉพาะเอกสารที่ยัง active ของ SO นั้น', async () => {
  const db = fakeDb({
    product_spec_documents: [
      { id: 'D1', docNo: 'FM-SA-04-220969-001', salesOrderId: 'SO1', status: 'active' },
      { id: 'D2', docNo: 'FM-SA-04-220969-002', salesOrderId: 'SO1', status: 'void', voidReason: 'เดิม' },
      { id: 'D3', docNo: 'FM-SA-04-220969-003', salesOrderId: 'SO2', status: 'active' },
    ],
  });
  const res = await voidDocumentsForOrder(db, {
    salesOrderId: 'SO1', reason: 'ใบสั่งขาย SO-1 ถูกยกเลิก', user: ADMIN, now: NOW,
  });
  assert.equal(res.voided, 1);
  assert.deepEqual(res.documents.map((row) => row.docNo), ['FM-SA-04-220969-001']);
  const byId = new Map(db.tables.product_spec_documents.map((row) => [row.id, row]));
  assert.equal(byId.get('D1').status, 'void');
  assert.equal(byId.get('D1').voidReason, 'ใบสั่งขาย SO-1 ถูกยกเลิก');
  assert.equal(byId.get('D2').voidReason, 'เดิม', 'ใบที่ void อยู่แล้วไม่ถูกเขียนทับ');
  assert.equal(byId.get('D3').status, 'active');
});

test('store: อนุมัติขั้นสุดท้าย — Rev ที่อนุมัติก่อนหน้าเป็น superseded และ currentRevNo ขยับ', async () => {
  const db = fakeDb({
    product_spec_documents: [{ id: 'D1', currentRevNo: 0 }],
    product_spec_document_revisions: [revRow('R0', 'D1', 0, 'approved'), revRow('R1', 'D1', 1, 'approved')],
  });
  const res = await applyFinalApproval(db, { document: { id: 'D1' }, revision: { id: 'R1', revNo: 1 }, now: NOW });
  assert.equal(res.superseded, 1);
  const revs = new Map(db.tables.product_spec_document_revisions.map((row) => [row.id, row]));
  assert.equal(revs.get('R0').status, 'superseded');
  assert.equal(revs.get('R0').supersededAt, NOW);
  assert.equal(revs.get('R1').status, 'approved');
  assert.equal(db.tables.product_spec_documents[0].currentRevNo, 1);
});

test('store: สร้างสเปคได้ checklist 17 แถว + เอกสารที่ขอได้ 4 แถว และซิงก์กระจกลงสินค้า', async () => {
  const db = fakeDb({ products: [{ id: 'PRD1', texture: null, standardPackaging: null }] }, { rpc: itemsRpc() });
  const res = await createProductSpec(db, {
    productId: 'PRD1', input: { content: { texture: 'เจลใส', standardPackaging: 'ขวดแก้ว 50 ml' } }, user: ADMIN, now: NOW,
  });
  assert.equal(res.error, undefined);
  assert.equal(res.spec.items.length, 17);
  assert.equal(db.tables.product_spec_items.length, 17);
  assert.deepEqual(res.spec.certifications.map((row) => row.key), PRODUCT_SPEC_CERTIFICATIONS.map((row) => row.key));
  assert.equal(res.spec.updatedByName, 'แอดมิน');
  assert.deepEqual(db.tables.products[0], { id: 'PRD1', texture: 'เจลใส', standardPackaging: 'ขวดแก้ว 50 ml' });
  assert.equal('currentRevNo' in db.tables.product_specs[0], false, 'สเปคไม่มีเลขฉบับแล้ว');
});

test('store: สร้างสเปคซ้ำ (ชน UNIQUE productId) = 409 · ข้อมูลผิด = 400 ก่อนแตะฐาน', async () => {
  const dup = fakeDb({}, {
    fail: (table, action) => (table === 'product_specs' && action === 'insert'
      ? { code: '23505', message: 'duplicate key value violates unique constraint' } : null),
  });
  const res = await createProductSpec(dup, { productId: 'PRD1', input: {}, user: ADMIN, now: NOW });
  assert.equal(res.status, 409);
  assert.match(res.error, /มีสเปคอยู่แล้ว/);
  const bad = await createProductSpec(fakeDb(), {
    productId: 'PRD1', input: { content: { texture: 'ก'.repeat(201) } }, user: ADMIN,
  });
  assert.equal(bad.status, 400);
});

test('store: checklist ล้มตอนสร้าง = ถอยแถวสเปคทิ้ง ไม่ค้างใบครึ่งเดียว', async () => {
  const db = fakeDb({ products: [{ id: 'PRD1' }] }, {
    rpc: () => ({ data: null, error: { message: 'boom' } }),
  });
  const res = await createProductSpec(db, { productId: 'PRD1', input: {}, user: ADMIN, now: NOW });
  assert.match(res.error, /checklist/);
  assert.equal((db.tables.product_specs || []).length, 0);
});

test('store: บันทึก checklist = ทับทั้งชุดผ่าน RPC เดียว (ไม่มีจังหวะที่สองชุดซ้อนกัน) · ไม่ส่ง items = ไม่แตะ', async () => {
  const spec = { id: 'PSP1', productId: 'PRD1', updatedAt: NOW };
  const calls = [];
  const db = fakeDb({
    products: [{ id: 'PRD1' }],
    product_specs: [{ ...spec }],
    product_spec_items: [
      { id: 'OLD1', specId: 'PSP1', sortOrder: 0, itemKey: 'cap', itemLabel: 'ฝา' },
      { id: 'OLD2', specId: 'PSP1', sortOrder: 1, itemKey: 'ring', itemLabel: 'แหวน' },
      { id: 'OTHER', specId: 'PSP9', sortOrder: 0, itemKey: 'cap', itemLabel: 'ฝา' },
    ],
  }, { rpc: itemsRpc(calls) });
  const res = await saveProductSpec(db, {
    spec, input: { content: { longevity: '8 ชั่วโมง' }, items: [{ itemKey: 'box', detail: 'กล่องขาว' }] }, user: ADMIN, now: NOW,
  });
  assert.equal(res.error, undefined);
  assert.equal(calls.length, 1, 'ลบ + เขียนต้องเป็นคำขอเดียว');
  assert.equal(calls[0].p_spec_id, 'PSP1');
  assert.equal('specId' in calls[0].p_rows[0], false, 'specId มาจากพารามิเตอร์ ไม่ใช่คีย์ในแถว');
  assert.equal(res.spec.items[0].specId, 'PSP1');
  assert.deepEqual(res.spec.items.map((row) => row.itemLabel), ['กล่องบรรจุภัณฑ์']);
  const mine = db.tables.product_spec_items.filter((row) => row.specId === 'PSP1');
  assert.deepEqual(mine.map((row) => row.itemKey), ['box']);
  assert.ok(db.tables.product_spec_items.some((row) => row.id === 'OTHER'), 'ห้ามลบ checklist ของสเปคอื่น');

  const untouched = await saveProductSpec(db, { spec, input: { content: { pricingTier: 'พรีเมียม' } }, user: ADMIN, now: NOW });
  assert.deepEqual(untouched.spec.items.map((row) => row.itemKey), ['box']);
  assert.equal(untouched.spec.pricingTier, 'พรีเมียม');
  assert.equal(calls.length, 1, 'ไม่ส่ง items = ไม่เรียก RPC');
});

test('store: RPC checklist ล้ม = บอกว่าเนื้อสเปคเข้าแล้วแต่ checklist ไม่เข้า · ไม่มีแถวซ้อนค้าง', async () => {
  const spec = { id: 'PSP1', productId: 'PRD1', updatedAt: NOW };
  const db = fakeDb({
    products: [{ id: 'PRD1' }],
    product_specs: [{ ...spec }],
    product_spec_items: [{ id: 'OLD1', specId: 'PSP1', sortOrder: 0, itemKey: 'cap', itemLabel: 'ฝา' }],
  }, { rpc: () => ({ data: null, error: { message: 'timeout' } }) });
  const res = await saveProductSpec(db, {
    spec, input: { content: {}, items: [{ itemKey: 'box' }] }, user: ADMIN, now: NOW,
  });
  assert.match(res.error, /บันทึกเนื้อสเปคแล้ว แต่ บันทึก checklist ไม่สำเร็จ: timeout/);
  assert.deepEqual(db.tables.product_spec_items.map((row) => row.id), ['OLD1'], 'ชุดเดิมอยู่ครบ ไม่มีครึ่งชุดใหม่ซ้อน');
});

test('store: บันทึกสเปคที่มีคนแก้ไปก่อน (updatedAt ไม่ตรง) = 409', async () => {
  const db = fakeDb({ product_specs: [{ id: 'PSP1', productId: 'PRD1', updatedAt: 'ใหม่กว่า' }] });
  const res = await saveProductSpec(db, {
    spec: { id: 'PSP1' }, input: { content: {} }, user: ADMIN, now: NOW, expectedUpdatedAt: 'ของเก่า',
  });
  assert.equal(res.status, 409);
  assert.equal(res.conflict, true);
});

test('store: ลบสเปคที่มีเอกสารอ้าง (FK RESTRICT) ตอบเป็นภาษาคน', async () => {
  const db = fakeDb({ product_specs: [{ id: 'PSP1' }] }, {
    fail: (table, action) => (table === 'product_specs' && action === 'delete'
      ? { code: '23503', message: 'violates foreign key constraint' } : null),
  });
  const res = await deleteProductSpec(db, { spec: { id: 'PSP1' } });
  assert.equal(res.status, 400);
  assert.match(res.error, /มีเอกสาร/);
  const gone = await deleteProductSpec(fakeDb({ product_specs: [{ id: 'PSP1' }] }), { spec: { id: 'PSP1' } });
  assert.equal(gone.deleted, true);
});

test('store: ลบสเปคแล้วล้างกระจกบนทะเบียนสินค้า · ล้างไม่ผ่าน = ลบสำเร็จพร้อมคำเตือน', async () => {
  const seed = {
    products: [{ id: 'PRD1', texture: 'ครีม', standardPackaging: 'ขวดแก้ว 50 ml' }],
    product_specs: [{ id: 'PSP1', productId: 'PRD1', texture: 'ครีม', standardPackaging: 'ขวดแก้ว 50 ml' }],
  };
  const db = fakeDb(seed);
  const res = await deleteProductSpec(db, { spec: { id: 'PSP1', productId: 'PRD1' } });
  assert.equal(res.deleted, true);
  assert.equal(res.warning, undefined);
  assert.deepEqual(db.tables.products[0], { id: 'PRD1', texture: null, standardPackaging: null });

  const broken = fakeDb(seed, {
    fail: (table, action) => (table === 'products' && action === 'update' ? { message: 'down' } : null),
  });
  const partial = await deleteProductSpec(broken, { spec: { id: 'PSP1', productId: 'PRD1' } });
  assert.equal(partial.deleted, true);
  assert.match(partial.warning, /^ลบสเปคแล้ว แต่ซิงก์ลงทะเบียนสินค้าไม่สำเร็จ: down/);
});

test('store: ภาพนิ่งเก็บทุกช่องที่กระดาษพิมพ์ + SO/บรรทัด/เจ้าของดีล + รูปที่ยังใช้ตามลำดับจอ', async () => {
  const db = fakeDb({
    product_specs: [{
      id: 'PSP1', productId: 'PRD1', texture: 'เจล', standardPackaging: 'ขวด', targetGroup: null,
      keySellingPoint: 'หอมนาน', pricingTier: null, productBenefit: null, longevity: '8 ชม.', dosagePerUse: null,
      certifications: [{ key: 'fda', label: 'เอกสารจดแจ้ง อย.', status: 'ready', note: '' }],
    }],
    product_spec_items: [{ id: 'I1', specId: 'PSP1', sortOrder: 0, itemKey: 'cap', itemLabel: 'ฝา', detail: 'เงิน', preparedByS: true, preparedByCustomer: false, note: null, createdAt: NOW }],
    products: [{
      id: 'PRD1', fgCode: 'FG-0903-01-002-10043', productDescription: 'สเปรย์ปรับอากาศ', brandName: 'แบรนด์ A',
      customerName: 'ลูกค้าในทะเบียน', categoryCode: '01-002', volume: 50, volumeUnit: 'ml', scentId: 'SCT1',
    }],
    product_types: [{ mainCategoryCode: '01', typeCode: '002', nameTh: 'สเปรย์', nameEn: 'SPRAY' }],
    scents: [{ id: 'SCT1', code: 'PF9010103', name: 'FIRST PLATE' }],
    attachments: [
      { id: 'A2', entityType: 'product', entityId: 'PRD1', docType: 'spec_illustration', mimeType: 'image/png', fileName: 'b.png', metadata: { sortOrder: 1, caption: 'ด้านข้าง' }, createdAt: NOW },
      { id: 'A1', entityType: 'product', entityId: 'PRD1', docType: 'spec_illustration', mimeType: 'image/png', fileName: 'a.png', metadata: { sortOrder: 0, caption: ' ด้านหน้า ' }, createdAt: NOW },
      { id: 'A3', entityType: 'product', entityId: 'PRD1', docType: 'spec_illustration', mimeType: 'image/png', fileName: 'c.png', metadata: { sortOrder: 2, retiredAt: NOW }, createdAt: NOW },
      { id: 'A4', entityType: 'product', entityId: 'PRD1', docType: 'spec_illustration', mimeType: 'application/pdf', fileName: 'd.pdf', metadata: {}, createdAt: NOW },
    ],
  });
  const res = await buildDocumentSnapshot(db, {
    productId: 'PRD1',
    order: {
      id: 'SO1', orderNumber: 'SO-26090001-0', metadata: { quoteNumber: 'QT-26090001-0' }, confirmDocNo: 'PO-77',
      confirmDocDate: '2026-09-20', deliveryDueDate: '2026-10-15', customerName: 'ลูกค้าบน SO',
    },
    line: { id: 'SOL-1', qty: 1200, unit: 'ชิ้น', description: 'สเปรย์ 50 ml' },
    dealOwner: { id: 'U-OWNER', name: 'เอกี', email: 'ae@example.com', phone: '081' },
    now: NOW,
  });
  assert.equal(res.error, undefined);
  const { snapshot } = res;
  assert.equal(snapshot.spec.texture, 'เจล');
  assert.equal(snapshot.spec.certifications[0].status, 'ready');
  assert.deepEqual(Object.keys(snapshot.spec).sort(), [...SPEC_CONTENT_FIELDS, 'certifications'].sort());
  assert.deepEqual(snapshot.items, [{ sortOrder: 0, itemKey: 'cap', itemLabel: 'ฝา', detail: 'เงิน', preparedByS: true, preparedByCustomer: false, note: null }]);
  assert.equal(snapshot.product.categoryName, 'SPRAY · สเปรย์');
  assert.equal(snapshot.product.scentText, 'FIRST PLATE | PF9010103');
  assert.equal(snapshot.product.volumeText, '50 ml');
  assert.equal(snapshot.product.fgCode, 'FG-0903-01-002-10043');
  assert.equal(snapshot.order.quotationNumber, 'QT-26090001-0');
  assert.equal(snapshot.order.qty, 1200);
  assert.equal(snapshot.order.customerName, 'ลูกค้าบน SO');
  assert.equal(snapshot.order.dealOwnerEmail, 'ae@example.com');
  assert.deepEqual(snapshot.illustrations, [
    { attachmentId: 'A1', caption: 'ด้านหน้า', sortOrder: 0, fileName: 'a.png' },
    { attachmentId: 'A2', caption: 'ด้านข้าง', sortOrder: 1, fileName: 'b.png' },
  ]);
  assert.deepEqual(res.illustrationIds, ['A1', 'A2'], 'รูปที่ปลดระวางแล้ว/ไม่ใช่รูป ไม่เข้าภาพนิ่ง');
});

test('store: ตัวอย่างจากหน้าสเปค (ไม่มี SO) ได้ก้อน order ครบคีย์เป็นค่าว่าง', async () => {
  const db = fakeDb({
    product_specs: [{ id: 'PSP1', productId: 'PRD1', certifications: [] }],
    products: [{ id: 'PRD1', fgCode: 'FG-0903-01-002-10043', customerName: 'ลูกค้าในทะเบียน' }],
  });
  const { snapshot } = await buildDocumentSnapshot(db, { productId: 'PRD1', now: NOW });
  assert.equal(snapshot.order.orderNumber, null);
  assert.equal(snapshot.order.customerName, 'ลูกค้าในทะเบียน');
  assert.equal(snapshot.product.categoryName, '01-002', 'ไม่มีชนิดในทะเบียน = ถอยไปรหัสหมวด');
  const none = await buildDocumentSnapshot(fakeDb(), { productId: 'PRD1' });
  assert.equal(none.status, 400);
});

test('store: เจ้าของดีลอ่านจากดีลของ SO · บัญชีอ่านไม่ได้ = ใช้ชื่อที่ดีลแช่ไว้ · ดีลอ่านไม่ได้ = error', async () => {
  const deals = { sales_deals: [{ id: 'DEAL1', ownerId: 'U-OWNER', ownerName: 'ชื่อบนดีล' }] };
  const withAuth = fakeDb(deals, {
    users: { 'U-OWNER': { id: 'U-OWNER', email: 'ae@example.com', user_metadata: { name: 'เอกี', phone: '081' }, app_metadata: {} } },
  });
  assert.deepEqual((await loadDealOwner(withAuth, { dealId: 'DEAL1' })).dealOwner, {
    id: 'U-OWNER', name: 'เอกี', email: 'ae@example.com', phone: '081',
  });
  const noAuth = fakeDb(deals, { users: { 'U-OWNER': new Error('auth down') } });
  assert.deepEqual((await loadDealOwner(noAuth, { dealId: 'DEAL1' })).dealOwner, {
    id: 'U-OWNER', name: 'ชื่อบนดีล', email: null, phone: null,
  });
  assert.deepEqual(await loadDealOwner(fakeDb(), { dealId: null }), { dealOwner: null });
  const broken = fakeDb(deals, { fail: (table) => (table === 'sales_deals' ? { message: 'timeout' } : null) });
  assert.equal((await loadDealOwner(broken, { dealId: 'DEAL1' })).error, 'timeout',
    'ดีลอ่านไม่ได้ต้องเป็น error ไม่ใช่ "ไม่มีเจ้าของ" (ซึ่งซ่อนปุ่มของเจ้าของดีลตัวจริง)');
});

test('store: รูปที่ Rev ที่ไม่ใช่ร่างอ้างอยู่ = ห้ามลบไฟล์ · ร่างไม่นับ', async () => {
  const db = fakeDb({
    product_spec_document_revisions: [
      revRow('R1', 'D1', 0, 'draft', { illustrationIds: ['A-DRAFT'] }),
      revRow('R2', 'D2', 0, 'rejected', { illustrationIds: ['A-REJ'], rejectionReason: 'x'.repeat(10), rejectedStage: 'ae' }),
    ],
  });
  assert.deepEqual(await isIllustrationReferenced(db, 'A-DRAFT'), { referenced: false });
  assert.deepEqual(await isIllustrationReferenced(db, 'A-REJ'), { referenced: true });
  const broken = fakeDb({}, { fail: () => ({ message: 'down' }) });
  assert.equal((await isIllustrationReferenced(broken, 'A')).error, 'down');
});

test('store: ออกเอกสารส่งชิ้นส่วนเลขที่ + payload ให้ RPC และแปล error ของ RPC เป็นภาษาคน', async () => {
  let args = null;
  const ok = fakeDb({}, {
    rpc: (name, a) => {
      args = { name, ...a };
      return { data: { document: { id: a.p_document_id, docNo: 'FM-SA-04-220969-001' }, revision: { id: a.p_revision_id, revNo: 0 } }, error: null };
    },
  });
  const res = await createSpecDocument(ok, {
    spec: { id: 'PSP1', productId: 'PRD1' }, product: { id: 'PRD1' }, order: { id: 'SO1' }, line: { id: 'SOL-1' },
    user: ADMIN, now: new Date('2026-09-22T04:00:00Z'),
  });
  assert.equal(res.document.docNo, 'FM-SA-04-220969-001');
  assert.equal(args.name, 'create_product_spec_document');
  assert.equal(args.p_prefix, 'FM-SA-04-220969-');
  assert.equal(args.p_like, 'FM-SA-04-__0969-%');
  assert.equal(args.p_month, '2609');
  assert.deepEqual(args.p_payload, { salesOrderId: 'SO1', salesOrderLineId: 'SOL-1', createdBy: 'U-ADM', createdByName: 'แอดมิน' });
  assert.match(args.p_document_id, /^PSD-/);
  assert.match(args.p_revision_id, /^PSDR-/);

  const failing = (message) => fakeDb({}, { rpc: () => ({ data: null, error: { message } }) });
  const call = (message) => createSpecDocument(failing(message), {
    spec: { id: 'PSP1' }, product: { id: 'PRD1' }, order: { id: 'SO1' }, line: { id: 'SOL-1' }, user: ADMIN,
  });
  const exists = await call('product_spec_document_exists: FM-SA-04-210969-004');
  assert.equal(exists.status, 409);
  assert.match(exists.error, /FM-SA-04-210969-004/);
  assert.equal((await call('sales_order_not_approved: SO-1 (draft)')).status, 400);
  assert.match((await call('sales_order_historical: SO-1')).error, /ย้อนหลัง/);
  assert.equal((await call('something else')).status, undefined, 'error ที่ไม่รู้จัก = 500 พร้อมข้อความเดิม');
});

test('store: รายการเอกสารของสินค้าพก Rev ล่าสุด + เลขที่ SO ปัจจุบัน (รวมใบที่ void)', async () => {
  const db = fakeDb({
    product_specs: [{ id: 'PSP1', productId: 'PRD1' }],
    product_spec_documents: [
      { id: 'D1', productId: 'PRD1', salesOrderId: 'SO1', status: 'active', docNo: 'N1', createdAt: '2026-09-21' },
      { id: 'D2', productId: 'PRD1', salesOrderId: null, status: 'void', docNo: 'N2', createdAt: '2026-09-22' },
    ],
    product_spec_document_revisions: [
      { id: 'R0', documentId: 'D1', revNo: 0, status: 'superseded' },
      { id: 'R1', documentId: 'D1', revNo: 1, status: 'pending_ae' },
    ],
    sales_orders: [{ id: 'SO1', orderNumber: 'SO-26090001-1', status: 'approved' }],
  });
  const res = await loadProductSpec(db, 'PRD1');
  assert.equal(res.spec.id, 'PSP1');
  assert.deepEqual(res.spec.items, []);
  assert.deepEqual(res.documents.map((row) => [row.id, row.latest?.revNo ?? null, row.orderNumber]), [
    ['D2', null, null], ['D1', 1, 'SO-26090001-1'],
  ]);
  assert.match(productSpecDeleteBlock({ spec: res.spec, documents: res.documents, role: 'ac' }), /2 ใบ/);
});
