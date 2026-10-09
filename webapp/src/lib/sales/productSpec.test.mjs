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
  SPEC_CONTENT_FIELDS, SPEC_CONTENT_LIMITS, SPEC_EDIT_ROLES, SPEC_ITEM_COST_MAX, SPEC_ITEM_EXTRA_MAX, SPEC_CERT_EXTRA_MAX,
  canEditProductSpec, canSeeSpecItemCost, normalizeProductSpecInput, normalizeSpecCertifications, normalizeSpecContent,
  normalizeSpecItems, prepareSpecItemRows, productSpecDeleteBlock, productSpecPermissions, redactSpecForViewer,
} from './productSpecWorkflow.js';
import { canSeeProductCost } from '@/lib/permissions';
import { formatSpecDocNo, parseProductSpecDocNo, productSpecDocNoParts } from './productSpecDocNo.js';

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
  // ผังตำแหน่ง 2026-09-24: ฝ่ายขายทุกตำแหน่ง (SALES_ROLES) + admin
  assert.deepEqual([...SPEC_EDIT_ROLES].sort(), [
    'ac', 'ac_supervisor', 'admin', 'ae', 'ae_supervisor', 'commercial_director', 'commercial_manager', 'senior_ac', 'senior_ae',
  ]);
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
    canSeeItemCost: true, canEditItemCost: true, canAttachItemImage: true,
  });
  const blocked = productSpecPermissions({ spec: spec1, documents: [docOf()], role: 'ac' });
  assert.equal(blocked.delete.visible, true);
  assert.match(blocked.delete.reason, /FM-SA-04-220969-001/);
  assert.deepEqual(productSpecPermissions({ spec: spec1, documents: [], role: 'rd' }), {
    canEdit: false, delete: { visible: false, reason: 'ต้องเป็น AC หรือฝ่ายขายจึงลบสเปคได้' },
    canSeeItemCost: false, canEditItemCost: false, canAttachItemImage: false,
  });
  // ยังไม่มีสเปค = ไม่มีของให้ลบ ⇒ ไม่โชว์
  assert.deepEqual(productSpecPermissions({ spec: null, role: 'ac' }).delete, { visible: false, reason: null });
});

/* ── ข้อมูลที่บันทึกได้ (ด่านเดียวกับ CHECK ของ mig 0370) ─────────────── */

test('ช่องเนื้อสเปคมีเจ็ดช่องตามกระดาษ (ระดับราคาตัดออก 22/09) และทุกช่องมีเพดานความยาว', () => {
  assert.equal(SPEC_CONTENT_FIELDS.length, 7);
  // ⭐ มติผู้ใช้ 2026-09-22 "ตัดระดับราคาออก" — ลิสต์นี้คือตัวเดียวที่จอ/บันทึก/ภาพนิ่ง/กระดาษอ่าน
  assert.ok(!SPEC_CONTENT_FIELDS.includes('pricingTier'), 'ระดับราคาต้องไม่กลับมาโดยไม่ถามเจ้าของ');
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

/* ── ราคาทุน + รูปประจำแถว checklist (mig 0405 · มติเจ้าของ 08/10/2569 — ใช้ในระบบเท่านั้น) ─────────── */

const IMG1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const IMG2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const IMG3 = 'aaaaaaaa-0000-4000-8000-000000000003';

test('⭐ ทุกตำแหน่งที่แก้สเปคได้เห็นราคาทุนของสินค้าอยู่แล้ว — ไม่มีคนแก้สเปคที่กรอกแถวได้แต่ไม่เห็นคอลัมน์ราคาทุน', () => {
  for (const role of SPEC_EDIT_ROLES) {
    assert.equal(canSeeProductCost(role), true, role);
    assert.equal(canSeeSpecItemCost({ role }), true, role);
  }
  // ด่านเดียวกับราคาทุนของทะเบียนสินค้า: ผู้ดูที่ไม่ใช่ฝ่ายขายบางตำแหน่งเห็น (FN · RA) · RD/ผู้ดูไม่เห็น
  for (const role of ['finance', 'ra']) assert.equal(canSeeSpecItemCost({ role }), true, role);
  for (const role of ['rd', 'rd_supervisor', 'viewer', 'marketing', 'ts']) assert.equal(canSeeSpecItemCost({ role }), false, role);
  assert.equal(canSeeSpecItemCost(null), false);
  assert.equal(canSeeSpecItemCost(undefined), false);
});

test('สิทธิ์บนหน้าสเปค (0405): เรียกด้วย role อย่างเดียว = ถามเป็นผู้ใช้ที่มีแค่ role · ส่ง user มา = ใช้สิทธิ์รายคนของ user', () => {
  // ยังไม่มีสเปค = แนบรูปไม่ได้ (รูปผูกกับแถวที่บันทึกแล้ว) แต่ราคาทุนกรอกตอนสร้างได้
  const fresh = productSpecPermissions({ spec: null, role: 'ac' });
  assert.equal(fresh.canAttachItemImage, false);
  assert.equal(fresh.canEditItemCost, true);
  // ผู้ดูที่เห็นต้นทุนได้: เห็นคอลัมน์ แก้ไม่ได้ แนบรูปไม่ได้
  const finance = productSpecPermissions({ spec: spec1, role: 'finance' });
  assert.deepEqual([finance.canEdit, finance.canSeeItemCost, finance.canEditItemCost, finance.canAttachItemImage], [false, true, false, false]);
  // ส่ง user มา: สิทธิ์รายคน (`products:margin` ที่ให้เพิ่ม) นับด้วย — role อย่างเดียวไม่เห็น
  assert.equal(productSpecPermissions({ spec: spec1, role: 'rd' }).canSeeItemCost, false);
  const granted = productSpecPermissions({ spec: spec1, role: 'rd', user: { role: 'rd', extraCaps: ['products:margin'] } });
  assert.equal(granted.canSeeItemCost, true, 'สิทธิ์รายคนต้องถึงคอลัมน์ราคาทุน');
  assert.equal(granted.canEditItemCost, false, 'เห็นได้แต่แก้สเปคไม่ได้ = แก้ราคาทุนไม่ได้');
  // ไม่มีทั้ง role และ user
  assert.deepEqual(productSpecPermissions({ spec: spec1 }), {
    canEdit: false, delete: { visible: false, reason: 'ต้องเป็น AC หรือฝ่ายขายจึงลบสเปคได้' },
    canSeeItemCost: false, canEditItemCost: false, canAttachItemImage: false,
  });
});

test('🔴 checklist สามสถานะ: ไม่ส่งคีย์ = ไม่มีคีย์ในผลลัพธ์ · null/ว่าง = ล้าง · มีค่า = ตรวจแล้วเขียน', () => {
  const { value } = normalizeSpecItems([
    { itemKey: 'cap' },
    { itemKey: 'box', costPrice: null, imageAttachmentId: null },
    { itemKey: 'ring', costPrice: '', imageAttachmentId: '  ' },
    { itemKey: 'card', costPrice: 0, imageAttachmentId: IMG1.toUpperCase() },
    { itemLabel: 'ถุงผ้า', costPrice: ' 1,234.567 ', imageAttachmentId: ` ${IMG2} ` },
    { itemLabel: 'เชือก', costPrice: SPEC_ITEM_COST_MAX, id: 'PSI-abc_1' },
    { itemLabel: 'ป้าย', costPrice: 12.345, id: 'มี ช่องว่าง' },
    { itemLabel: 'ริบบิ้น', costPrice: undefined, imageAttachmentId: undefined, id: 42 },
  ]);
  // 🔴 แถวที่ไม่ส่งคีย์ต้องไม่มีคีย์ — เติม null ให้เมื่อไร คนที่ไม่เห็นราคาทุนกดบันทึก = ล้างของคนอื่น
  assert.deepEqual(Object.keys(value[0]).sort(), ['detail', 'itemKey', 'itemLabel', 'note', 'preparedByCustomer', 'preparedByS', 'sortOrder']);
  assert.deepEqual([value[1].costPrice, value[1].imageAttachmentId], [null, null]);
  assert.deepEqual([value[2].costPrice, value[2].imageAttachmentId], [null, null]);
  assert.deepEqual([value[3].costPrice, value[3].imageAttachmentId], [0, IMG1], '0 ≠ ว่าง · uuid เป็นตัวเล็ก');
  assert.deepEqual([value[4].costPrice, value[4].imageAttachmentId], [1234.57, IMG2], 'ข้อความเลข (มีลูกน้ำ) ปัดสองตำแหน่ง');
  assert.equal(value[5].costPrice, SPEC_ITEM_COST_MAX, 'เพดานพอดีต้องผ่าน');
  assert.equal(value[5].id, 'PSI-abc_1');
  assert.equal(value[6].costPrice, 12.35);
  assert.equal('id' in value[6], false, 'id รูปร่างผิดถูกทิ้งเงียบ ไม่ใช่ error');
  assert.deepEqual(['costPrice' in value[7], 'imageAttachmentId' in value[7], 'id' in value[7]], [false, false, false],
    'undefined = ไม่ส่งคีย์ (JSON ทิ้งให้อยู่แล้ว) · id ที่ไม่ใช่ข้อความถูกทิ้ง');
  assert.equal(Object.is(normalizeSpecItems([{ itemKey: 'cap', costPrice: -0 }]).value[0].costPrice, 0), true, '-0 เก็บเป็น 0');
});

test('checklist: ราคาทุนผิดรูป/ติดลบ/เกินเพดาน · รูปผิดรูป · รูปซ้ำสองแถว = error บอกเลขแถว', () => {
  const COST = /ราคาทุน checklist แถวที่ 2 ต้องเป็นตัวเลขตั้งแต่ 0 ถึง 999,999,999\.99/;
  for (const bad of [-0.01, -1, 1000000000, 999999999.995, NaN, Infinity, 'abc', '1e3', '0x10', '-5', '12.', true, [], {}, '1 2']) {
    assert.match(normalizeSpecItems([{ itemKey: 'cap' }, { itemKey: 'box', costPrice: bad }]).error, COST, String(bad));
  }
  const IMAGE = /รูป checklist แถวที่ 1 ไม่ถูกต้อง/;
  for (const bad of ['not-a-uuid', 'ATT-1', 12, {}, [], true, `${IMG1}x`, IMG1.replace(/-/g, '')]) {
    assert.match(normalizeSpecItems([{ itemKey: 'cap', imageAttachmentId: bad }]).error, IMAGE, String(bad));
  }
  assert.match(normalizeSpecItems([
    { itemKey: 'cap', imageAttachmentId: IMG1 }, { itemKey: 'box', imageAttachmentId: null },
    { itemKey: 'ring', imageAttachmentId: IMG1.toUpperCase() },
  ]).error, /รูป checklist แถวที่ 3 ซ้ำกับแถวก่อนหน้า/);
  // หลายแถวไม่มีรูป (null) ไม่นับว่าซ้ำ
  assert.equal(normalizeSpecItems([{ itemKey: 'cap', imageAttachmentId: null }, { itemKey: 'box', imageAttachmentId: null }]).error, undefined);
  // ด่านผ่านมาถึงก้อนรวมของ API
  assert.match(normalizeProductSpecInput({ content: {}, items: [{ itemKey: 'cap', costPrice: -1 }] }).error, /ราคาทุน checklist แถวที่ 1/);
});

test('🔴 prepareSpecItemRows: id ที่ส่งมาคงไว้เฉพาะของแถวในสเปคนี้ที่ยังไม่ถูกใช้ · คนแก้ราคาทุนไม่ได้เสียคีย์ costPrice · explicitImages (ลิสต์ว่าง = ไม่นับ)', () => {
  const stored = [{ id: 'S1', itemKey: 'cap' }, { id: 'S2', itemKey: null }];
  const input = normalizeSpecItems([
    { id: 'S1', itemKey: 'cap', costPrice: 5, imageAttachmentId: IMG1 },
    { id: 'S1', itemLabel: 'ซ้ำ id แถวบน', costPrice: 6, imageAttachmentId: null },
    { id: 'PSI-of-other-spec', itemLabel: 'id ของสเปคอื่น', costPrice: 7, imageAttachmentId: null },
    { id: 'S2', itemLabel: 'แถวเพิ่มเอง', costPrice: null, imageAttachmentId: IMG2 },
    { itemLabel: 'แถวใหม่ไม่มี id', imageAttachmentId: null },
  ]).value;
  const frozen = structuredClone(input);
  const editor = prepareSpecItemRows(input, stored, { canEditCost: true });
  assert.deepEqual(editor.rows.map((row) => row.id), ['S1', undefined, undefined, 'S2', undefined]);
  assert.deepEqual(editor.rows.map((row) => 'id' in row), [true, false, false, true, false], 'ตัดคีย์ทิ้ง ไม่ใช่ใส่ undefined');
  assert.deepEqual(editor.rows.map((row) => row.costPrice), [5, 6, 7, null, undefined]);
  assert.equal('costPrice' in editor.rows[4], false, 'แถวที่ไม่ได้ส่งราคาทุนมาก็ยังไม่มีคีย์');
  assert.equal(editor.explicitImages, true);
  assert.deepEqual(input, frozen, 'ห้ามแก้แถวที่รับมา');

  // แก้ราคาทุนไม่ได้: คีย์หายทุกแถว (RPC ยกค่าเดิมมาให้) · รูปยังอยู่
  const viewer = prepareSpecItemRows(input, stored, { canEditCost: false });
  assert.equal(viewer.rows.some((row) => 'costPrice' in row), false);
  assert.deepEqual(viewer.rows.map((row) => row.imageAttachmentId), [IMG1, null, null, IMG2, null]);
  assert.equal(prepareSpecItemRows(input, stored).rows.some((row) => 'costPrice' in row), false, 'ไม่บอกสิทธิ์ = ไม่ได้');

  // จอรุ่นก่อน/แท็บค้าง: บางแถว (หรือทุกแถว) ไม่มีคีย์รูป ⇒ ห้ามเก็บกวาด
  const mixed = normalizeSpecItems([{ itemKey: 'cap', imageAttachmentId: null }, { itemKey: 'box' }]).value;
  assert.equal(prepareSpecItemRows(mixed, stored, { canEditCost: true }).explicitImages, false);
  assert.equal(prepareSpecItemRows(normalizeSpecItems([{ itemKey: 'cap' }]).value, stored).explicitImages, false);
  // 🔴 ลิสต์ว่างไม่ใช่ "ส่งคีย์รูปครบทุกแถว" — จอรุ่นก่อนที่ลบทุกแถวก็ส่ง [] เหมือนกัน และมันไม่เคยเห็นว่ามีรูปอยู่
  assert.equal(prepareSpecItemRows([], stored).explicitImages, false, 'ไม่มีแถวให้รู้ว่าผู้เรียกรู้จักรูปของแถวไหม = ห้ามเก็บกวาด');
  assert.equal(prepareSpecItemRows(null, stored).explicitImages, false);
  assert.equal(prepareSpecItemRows(normalizeSpecItems([{ itemKey: 'cap', imageAttachmentId: null }]).value, stored).explicitImages, true);

  // ตอนสร้าง (ไม่มีแถวที่เก็บอยู่): id จาก client ไม่รอดสักตัว
  const created = prepareSpecItemRows(input, [], { canEditCost: true });
  assert.equal(created.rows.some((row) => 'id' in row), false);
  assert.equal(prepareSpecItemRows(input, null, { canEditCost: true }).rows.some((row) => 'id' in row), false);
});

test('🔴 prepareSpecItemRows: แถวที่ไม่มี id (จอรุ่นก่อน/แท็บค้าง) รับ id ของแถวเดิม — itemKey ตรงกัน · ไม่มีค่อยแถวที่เพิ่มเองชื่อตรงกันเป๊ะ · แถวเดิมหนึ่งแถวใช้ได้ครั้งเดียว', () => {
  const stored = [
    { id: 'K-CAP', itemKey: 'cap', itemLabel: 'ฝา' },
    { id: 'C-BAG', itemKey: null, itemLabel: 'ถุงผ้า' },
    { id: 'C-RIB1', itemKey: null, itemLabel: 'ริบบิ้น' },
    { id: 'C-RIB2', itemKey: null, itemLabel: 'ริบบิ้น' },
    { id: 'K-BOX', itemKey: 'box', itemLabel: 'กล่อง' },
  ];
  const ids = (rows, have = stored) => prepareSpecItemRows(normalizeSpecItems(rows).value, have).rows.map((row) => row.id);

  // จอรุ่นก่อน: ไม่มี id สักแถว — ทุกแถวได้ id เดิมกลับ (ลำดับที่ส่งมาไม่เกี่ยว)
  assert.deepEqual(ids([{ itemLabel: 'ถุงผ้า' }, { itemKey: 'box' }, { itemKey: 'cap' }]), ['C-BAG', 'K-BOX', 'K-CAP']);
  // แก้ชื่อแถวที่เพิ่มเอง = ไม่เหลืออะไรให้จับ ⇒ ไม่มี id (store ออกใหม่) · ชื่อต้องตรงเป๊ะ (ช่องว่างหัวท้ายถูกตัดก่อนถึงที่นี่)
  assert.deepEqual(ids([{ itemLabel: 'ถุงผ้า (แก้ชื่อ)' }, { itemLabel: '  ถุงผ้า  ' }, { itemLabel: 'ถุงผ้า' }]), [undefined, 'C-BAG', undefined],
    'แถวเดิมหนึ่งแถวให้ id ได้ครั้งเดียว — แถวชื่อซ้ำแถวถัดไปไม่ได้');
  const renamed = prepareSpecItemRows(normalizeSpecItems([{ itemLabel: 'ถุงผ้า (แก้ชื่อ)' }]).value, stored).rows[0];
  assert.equal('id' in renamed, false, 'ไม่มีคีย์ ไม่ใช่ใส่ undefined');
  // แถวเดิมชื่อซ้ำสองแถว: จับตามลำดับที่เก็บอยู่ ทีละแถว · แถวที่สามไม่เหลือให้จับ
  assert.deepEqual(ids([{ itemLabel: 'ริบบิ้น' }, { itemLabel: 'ริบบิ้น' }, { itemLabel: 'ริบบิ้น' }]), ['C-RIB1', 'C-RIB2', undefined]);
  // แถวที่มี itemKey ไม่ตกไปจับด้วยชื่อ · แถวที่เพิ่มเองไม่จับแถวของแบบฟอร์มแม้ชื่อเหมือน
  assert.deepEqual(ids([{ itemKey: 'ring' }]), [undefined], 'itemKey ที่ไม่มีแถวเดิม = แถวใหม่');
  assert.deepEqual(ids([{ itemLabel: 'ฝา' }, { itemLabel: 'กล่อง' }]), [undefined, undefined], 'ชื่อเหมือนแถวของแบบฟอร์ม ≠ แถวเดียวกัน');
  assert.deepEqual(ids([{ itemKey: 'cap' }], [{ id: 'X', itemKey: null, itemLabel: 'ฝา' }]), [undefined]);

  // 🔴 id ที่ส่งมาชนะเสมอ (รอบแรกจบก่อน): แถวล่างถือ id ของ C-BAG อยู่ ⇒ แถวบนที่ชื่อ "ถุงผ้า" จับ C-BAG ไม่ได้
  assert.deepEqual(ids([{ itemLabel: 'ถุงผ้า' }, { id: 'C-BAG', itemLabel: 'ถุงผ้าใบใหม่' }]), [undefined, 'C-BAG']);
  assert.deepEqual(ids([{ itemKey: 'cap' }, { id: 'K-CAP', itemLabel: 'ย้ายมาเป็นแถวเพิ่มเอง' }]), [undefined, 'K-CAP']);
  // id ที่ส่งมาใช้ไม่ได้ (ของสเปคอื่น) ⇒ ตัดทิ้งแล้วเข้ารอบจับด้วยคีย์/ชื่อเหมือนแถวที่ไม่มี id
  assert.deepEqual(ids([{ id: 'PSI-of-other-spec', itemKey: 'cap' }, { id: 'PSI-other-2', itemLabel: 'ถุงผ้า' }]), ['K-CAP', 'C-BAG']);
  // id ซ้ำสองแถว: แถวแรกได้ id · แถวที่สองเข้ารอบสอง (itemKey ของมันเองยังว่างอยู่)
  assert.deepEqual(ids([{ id: 'C-BAG', itemLabel: 'ก' }, { id: 'C-BAG', itemKey: 'box' }]), ['C-BAG', 'K-BOX']);

  // สองคีย์ใหม่ไม่ถูกแตะ: แถวที่ไม่ส่งคีย์ก็ยังไม่มีคีย์ (RPC ยกค่าเดิมให้ด้วย id ที่เพิ่งจับ)
  const keyless = prepareSpecItemRows(normalizeSpecItems([{ itemLabel: 'ถุงผ้า' }]).value, stored, { canEditCost: true });
  assert.deepEqual(Object.keys(keyless.rows[0]).filter((key) => ['costPrice', 'imageAttachmentId'].includes(key)), []);
  assert.equal(keyless.explicitImages, false);
  // แถวที่เก็บอยู่ไม่มี id/ชื่อ (ไม่ควรเกิด) ไม่ทำให้จับผิดตัว · ตอนสร้าง (ไม่มีแถวเดิม) ไม่มีอะไรให้จับ
  assert.deepEqual(ids([{ itemLabel: 'ถุงผ้า' }], [{ itemKey: null, itemLabel: 'ถุงผ้า' }, null, { id: 'NOLABEL', itemKey: null }]), [undefined]);
  assert.deepEqual(ids([{ itemKey: 'cap' }, { itemLabel: 'ถุงผ้า' }], []), [undefined, undefined]);
});

test('🔴 redactSpecForViewer: คนที่ไม่เห็นต้นทุนได้สำเนาที่ไม่มีคีย์ costPrice และ pricingTier · คนที่เห็นได้ก้อนเดิม · ไม่แก้ก้อนที่รับมา', () => {
  const spec = Object.freeze({
    id: 'PSP1', productId: 'PRD1', texture: 'เจล', pricingTier: 'ราคาต้นทุน 200 บาท/ขวด',
    items: Object.freeze([
      Object.freeze({ id: 'I1', itemKey: 'cap', itemLabel: 'ฝา', costPrice: 987654.32, imageAttachmentId: IMG1 }),
      Object.freeze({ id: 'I2', itemKey: null, itemLabel: 'ถุงผ้า', costPrice: null, imageAttachmentId: null }),
    ]),
  });
  for (const role of ['rd', 'viewer', 'marketing', 'ts']) {
    const out = redactSpecForViewer(spec, { id: 'U', role });
    assert.notEqual(out, spec, role);
    assert.equal('pricingTier' in out, false, role);
    assert.deepEqual(out.items.map((row) => 'costPrice' in row), [false, false], `${role}: ตัดคีย์ ไม่ใช่ใส่ null`);
    assert.doesNotMatch(JSON.stringify(out), /987654|ราคาต้นทุน/, role);
    // ช่องอื่นอยู่ครบ — รูปของแถวไม่ใช่ความลับ
    assert.deepEqual(out.items.map((row) => [row.id, row.itemLabel, row.imageAttachmentId]), [['I1', 'ฝา', IMG1], ['I2', 'ถุงผ้า', null]]);
    assert.equal(out.texture, 'เจล');
  }
  for (const role of ['ac', 'ae', 'finance', 'ra', 'admin']) {
    assert.equal(redactSpecForViewer(spec, { id: 'U', role }), spec, `${role} ได้ก้อนเดิม`);
  }
  // ไม่มีผู้ใช้ = ไม่เห็น · ก้อนที่รับมายังเต็ม (audit ถือก้อนเดียวกัน)
  assert.equal('costPrice' in redactSpecForViewer(spec, null).items[0], false);
  assert.equal(spec.items[0].costPrice, 987654.32);
  assert.equal(spec.pricingTier, 'ราคาต้นทุน 200 บาท/ขวด');
  // null-safe
  assert.equal(redactSpecForViewer(null, { role: 'rd' }), null);
  assert.equal(redactSpecForViewer(undefined, null), undefined);
  assert.deepEqual(redactSpecForViewer({ id: 'X', pricingTier: 'p' }, { role: 'rd' }), { id: 'X' }, 'สเปคที่ไม่มี items');
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

test('⭐ เลขที่ที่คนอ่าน = DDMMYY-XXX-RR (มติผู้ใช้ 22/09) — ตัดรหัสแบบฟอร์ม · Rev ของเอกสาร 2 หลัก', () => {
  assert.equal(formatSpecDocNo('FM-SA-04-220969-001', 0), '220969-001-00');
  assert.equal(formatSpecDocNo('FM-SA-04-220969-001', 3), '220969-001-03');
  assert.equal(formatSpecDocNo('FM-SA-04-220969-001', '12'), '220969-001-12');
  // ตัวนับเกิน 999 ในเดือนเดียว (เลขรันยาวขึ้น) ยังตัดถูก
  assert.equal(formatSpecDocNo('FM-SA-04-220969-1000', 1), '220969-1000-01');
});

test('เลขที่ที่คนอ่าน: ไม่มีเลขที่ = "-" · ไม่รู้ Rev = ไม่เดา (ไม่ต่อ -RR) · รูปอื่นพิมพ์ตามเดิม', () => {
  assert.equal(formatSpecDocNo(null, 0), '-');
  assert.equal(formatSpecDocNo(undefined, undefined), '-');
  assert.equal(formatSpecDocNo('  ', 1), '-');
  assert.equal(formatSpecDocNo('FM-SA-04-220969-001', null), '220969-001');
  assert.equal(formatSpecDocNo('FM-SA-04-220969-001', ''), '220969-001');
  assert.equal(formatSpecDocNo('FM-SA-04-220969-001', 'x'), '220969-001');
  assert.equal(formatSpecDocNo('FM-SA-04-220969-001', true), '220969-001', 'boolean ไม่ใช่ Rev');
  assert.equal(formatSpecDocNo('FM-SA-04-220969-001', 123), '220969-001-123', 'Rev ≥ 100 พิมพ์เต็มหลัก ไม่ตัดทิ้ง');
  assert.equal(formatSpecDocNo('FM-SA-04-220969-001', -1), '220969-001');
  assert.equal(formatSpecDocNo('XYZ-1', 2), 'XYZ-1-02');
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
  deleteDraftDocument, deleteProductSpec, isIllustrationReferenced, loadDealOwner, loadProductSpec,
  missingSnapshotIllustrations, moveDocumentsToRevisedOrder, revisedOrderLineId, saveProductSpec,
  transitionRevision, voidDocumentsByIds, voidDocumentsForOrder,
} = await import('./productSpecStore.js');

function fakeDb(seed = {}, { fail = () => null, rpc = null, users = {} } = {}) {
  const tables = structuredClone(seed);
  const rowsOf = (table) => (tables[table] ||= []);
  const from = (table) => {
    const st = { action: 'select', filters: [], order: [], ors: [], single: false, limit: null, range: null };
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
      /* `.or('คอลัมน์.eq.ค่า,คอลัมน์->>คีย์.eq.ค่า')` — เฉพาะรูปที่โค้ดใช้จริง (driveFileHeld) · รูปอื่น = โยน error ให้เทสต์แดง
         ไม่ใช่กรองไม่ติดเงียบ ๆ · ตัวหนังสือดิบเก็บไว้ใน `st.ors` ให้เทสต์ดูได้ว่าค่าอะไรถึงตัวกรอง */
      or: (expr) => {
        st.ors.push(expr);
        const terms = String(expr).split(',').map((term) => {
          const m = term.match(/^([A-Za-z]+)(?:->>([A-Za-z]+))?\.eq\.([A-Za-z0-9_-]+)$/);
          if (!m) throw new Error(`fakeDb.or: ไม่รู้จักเงื่อนไข "${term}"`);
          return (row) => (m[2] ? row[m[1]]?.[m[2]] : row[m[1]]) === m[3];
        });
        st.filters.push((row) => terms.some((hit) => hit(row)));
        return b;
      },
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

  const untouched = await saveProductSpec(db, { spec, input: { content: { longevity: '6 ชม.' } }, user: ADMIN, now: NOW });
  assert.deepEqual(untouched.spec.items.map((row) => row.itemKey), ['box']);
  assert.equal(untouched.spec.longevity, '6 ชม.');
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
  // FG นี้ไม่ผูกสูตร ⇒ ช่องสูตรมีครบคีย์แต่เป็น null ทั้งสี่ (กระดาษถอยไปแถวกลิ่น · มติ 01/10/2569)
  // 🔴 "มีคีย์" คือสัญญาณที่ตัวประกอบแถวใช้แยกของใหม่จากภาพนิ่งเก่า — ตัดคีย์ทิ้งตอนว่าง = ใบใหม่ได้ป้ายกลิ่นเดิม
  assert.deepEqual(
    ['formulaId', 'formulaName', 'formulaCode', 'formulaDate'].map((key) => [key in snapshot.product, snapshot.product[key]]),
    Array(4).fill([true, null]),
  );
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

/* ⭐ มติเจ้าของ 01/10/2569 — แถว "สูตร / รหัสสูตร / วันที่" ของกระดาษ: ภาพนิ่งเก็บชิ้นดิบของ **สูตรที่ FG ผูกอยู่จริง**
   แหล่งจริง = แถวสดในทะเบียนสูตร (เหตุผลที่หัว `loadProductPrintFields`) · ของจริงบน prod: FG-0510-02-020-10067 ผูกสูตร
   "THE MOMENT OF TEA TIME #3.1 REV1" ขณะที่กลิ่นแม่คือ "THE MOMENT OF TEA TIME #3 | PF859010103" */
const formulaSeed = (over = {}) => ({
  product_specs: [{ id: 'PSP1', productId: 'PRD1', certifications: [] }],
  products: [{
    id: 'PRD1', fgCode: 'FG-0510-02-020-10067', customerName: 'ลูกค้าในทะเบียน', scentId: 'SCT1',
    formulaId: 'FML1', formulaName: 'THE MOMENT OF TEA TIME #3.1 REV1', formulaCode: 'PF85901010301', formulaDate: '2026-09-10',
  }],
  scents: [{ id: 'SCT1', code: 'PF859010103', name: 'THE MOMENT OF TEA TIME #3' }],
  formulas: [{ id: 'FML1', code: 'PF85901010301', name: 'THE MOMENT OF TEA TIME #3.1 REV1', formulaDate: '2026-09-10', scentId: 'SCT1' }],
  ...over,
});
const formulaOf = ({ formulaId, formulaName, formulaCode, formulaDate }) => ({ formulaId, formulaName, formulaCode, formulaDate });

test('⭐ store: ภาพนิ่งถ่ายสูตรที่ FG ผูก (ชื่อ · รหัส · วันที่) · ช่องกลิ่นคงเดิมทุกตัว', async () => {
  const { snapshot, error } = await buildDocumentSnapshot(fakeDb(formulaSeed()), { productId: 'PRD1', now: NOW });
  assert.equal(error, undefined, error);
  assert.equal(snapshot.schemaVersion, 2, 'คีย์เพิ่มแบบไม่บังคับ — ไม่ขยับ schemaVersion');
  assert.deepEqual(formulaOf(snapshot.product), {
    formulaId: 'FML1', formulaName: 'THE MOMENT OF TEA TIME #3.1 REV1', formulaCode: 'PF85901010301', formulaDate: '2026-09-10',
  });
  // ช่องกลิ่นยังเป็นกลิ่นแม่ (ผู้อ่านเดิม/ทางถอย) — ไม่ถูกทับด้วยสูตร
  assert.equal(snapshot.product.scentName, 'THE MOMENT OF TEA TIME #3');
  assert.equal(snapshot.product.scentCode, 'PF859010103');
  assert.equal(snapshot.product.scentText, 'THE MOMENT OF TEA TIME #3 | PF859010103');
});

test('⭐ store: สูตรอ่านสดจากทะเบียนสูตร — สำเนาบนแถวสินค้าที่ค้างของเก่าไม่ถูกพิมพ์', async () => {
  // RD ออกรหัส/แก้ชื่อ/แก้วันที่ที่ทะเบียนสูตรทีหลัง — สำเนาบน products ยังเป็นของวันที่บันทึก FG (ไม่มีรหัส)
  const seed = formulaSeed();
  seed.products[0] = { ...seed.products[0], formulaName: 'Secret Valley #1', formulaCode: null, formulaDate: '2026-08-21' };
  seed.formulas = [{ id: 'FML1', code: 'PF0020401-01', name: 'Secret Valley #1 REV1', formulaDate: '2026-10-01' }];
  const { snapshot } = await buildDocumentSnapshot(fakeDb(seed), { productId: 'PRD1', now: NOW });
  assert.deepEqual(formulaOf(snapshot.product), {
    formulaId: 'FML1', formulaName: 'Secret Valley #1 REV1', formulaCode: 'PF0020401-01', formulaDate: '2026-10-01',
  });
  // สูตรที่ยังไม่มีรหัส/วันที่ในทะเบียน = null (กระดาษพิมพ์ขีดตรงชิ้นนั้น) — ไม่ยืมสำเนาบนสินค้ามาเติม
  seed.formulas = [{ id: 'FML1', code: null, name: 'Secret Valley #1', formulaDate: null }];
  seed.products[0] = { ...seed.products[0], formulaCode: 'รหัสเก่าที่ถูกถอน', formulaDate: '2026-08-21' };
  const bare = await buildDocumentSnapshot(fakeDb(seed), { productId: 'PRD1', now: NOW });
  assert.deepEqual(formulaOf(bare.snapshot.product), { formulaId: 'FML1', formulaName: 'Secret Valley #1', formulaCode: null, formulaDate: null });
});

test('🔴 store: อ่านทะเบียนสูตรไม่ได้ = error ไม่ใช่ถอยไปกลิ่นเงียบ ๆ (กระดาษที่ลูกค้าเซ็นจะพิมพ์ผิดตัว)', async () => {
  const db = fakeDb(formulaSeed(), { fail: (table) => (table === 'formulas' ? { message: 'timeout' } : null) });
  const res = await buildDocumentSnapshot(db, { productId: 'PRD1', now: NOW });
  assert.match(res.error, /อ่านสูตรของสินค้าไม่สำเร็จ: timeout/);
  assert.equal(res.snapshot, undefined);
  // FG ที่ไม่ผูกสูตรไม่แตะทะเบียนสูตรเลย — ทะเบียนสูตรล่มไม่พาใบที่ไม่เกี่ยวล้มด้วย
  const seed = formulaSeed();
  seed.products[0] = { ...seed.products[0], formulaId: null, formulaName: null, formulaCode: null, formulaDate: null };
  const unlinked = await buildDocumentSnapshot(fakeDb(seed, { fail: (table) => (table === 'formulas' ? { message: 'timeout' } : null) }), { productId: 'PRD1', now: NOW });
  assert.equal(unlinked.error, undefined, unlinked.error);
});

test('store: FG ไม่ผูกสูตร = ช่องสูตร null ทั้งสี่ · ชื่อสูตรที่พิมพ์ลอย ๆ บนสินค้ารุ่นเก่าไม่ถูกยกเป็นสูตร (ยังเป็นทางถอยของกลิ่นแบบเดิม)', async () => {
  const seed = formulaSeed();
  seed.products[0] = { ...seed.products[0], formulaId: null, formulaName: null, formulaCode: null, formulaDate: null };
  const scentOnly = await buildDocumentSnapshot(fakeDb(seed), { productId: 'PRD1', now: NOW });
  assert.deepEqual(formulaOf(scentOnly.snapshot.product), { formulaId: null, formulaName: null, formulaCode: null, formulaDate: null });
  assert.equal(scentOnly.snapshot.product.scentText, 'THE MOMENT OF TEA TIME #3 | PF859010103');
  // กอง "รอจัดระเบียบ": ไม่มี formulaId/scentId แต่มีชื่อพิมพ์ไว้ในช่องสูตร (ส่วนใหญ่คือชื่อกลิ่น) — แถวกลิ่นแบบเดิม
  seed.products[0] = { ...seed.products[0], scentId: null, formulaName: 'ROSE GARDEN', formulaCode: 'RG-01', formulaDate: '2025-01-05' };
  const legacy = await buildDocumentSnapshot(fakeDb(seed), { productId: 'PRD1', now: NOW });
  assert.deepEqual(formulaOf(legacy.snapshot.product), { formulaId: null, formulaName: null, formulaCode: null, formulaDate: null });
  assert.equal(legacy.snapshot.product.scentText, 'ROSE GARDEN | RG-01');
});

test('store: formulaId ชี้อยู่แต่ไม่พบแถวสูตร (ไม่ควรเกิด) = สำเนาบนแถวสินค้า — ไม่ทิ้งแถวไปกลิ่นทั้งที่ FG บอกว่าผูกสูตร', async () => {
  const { snapshot, error } = await buildDocumentSnapshot(fakeDb(formulaSeed({ formulas: [] })), { productId: 'PRD1', now: NOW });
  assert.equal(error, undefined, error);
  assert.deepEqual(formulaOf(snapshot.product), {
    formulaId: 'FML1', formulaName: 'THE MOMENT OF TEA TIME #3.1 REV1', formulaCode: 'PF85901010301', formulaDate: '2026-09-10',
  });
});

/* ⭐ มติผู้ใช้ 2026-09-22 — กระดาษตามภาษาของ SO + กล่อง "ผู้ซื้อ / CUSTOMER" แบบใบเสนอราคา ⇒ ภาพนิ่ง v2
   ถ่ายภาษา + ลูกค้าทั้งสองภาษาดิบ · ที่มาชุดเดียวกับ salesOrderPrint (คู่อังกฤษ SO ก่อน ถอยใบเสนอราคา) */
const QUOTE_ROW = {
  id: 'QT-ID', quoteNumber: 'QT-จากใบ', customerNameEn: 'NAME FROM QUOTE', customerTaxId: '0105561234567',
  branchCode: '00002', billingAddress: 'ที่อยู่เอกสารไทย', billingAddressEn: 'Billing EN from quote',
  shippingAddress: 'ที่อยู่จัดส่งไทย', shippingAddressEn: 'Shipping EN from quote',
  contactName: 'คุณเบลล์', contactPhone: '0844326199',
};
const snapshotSeed = () => ({
  product_specs: [{ id: 'PSP1', productId: 'PRD1', certifications: [] }],
  products: [{ id: 'PRD1', fgCode: 'FG-0903-01-002-10043', customerName: 'ลูกค้าในทะเบียน' }],
  quotations: [QUOTE_ROW],
});

test('store: ภาพนิ่ง v2 ถ่ายภาษาของ SO + ลูกค้าจาก SO/ใบเสนอราคา (คู่อังกฤษ SO ก่อน) + ชนิดเอกสารยืนยัน', async () => {
  const db = fakeDb(snapshotSeed());
  const { snapshot, error } = await buildDocumentSnapshot(db, {
    productId: 'PRD1',
    order: {
      id: 'SO1', orderNumber: 'SO-1', quotationId: 'QT-ID', metadata: {}, docLanguage: 'en',
      customerName: 'ลูกค้าบน SO', customerNameEn: 'NAME ON SO', billingAddressEn: null, shippingAddressEn: 'Shipping EN on SO',
      confirmDocType: 'po', confirmDocNo: 'PO-9',
    },
    now: NOW,
  });
  assert.equal(error, undefined);
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.order.docLanguage, 'en');
  assert.equal(snapshot.order.confirmDocType, 'po');
  assert.equal(snapshot.order.quotationNumber, 'QT-จากใบ', 'ไม่มีเลขที่แช่ใน metadata = อ่านจากใบที่ผูก');
  assert.deepEqual(snapshot.customer, {
    name: 'ลูกค้าบน SO',
    nameEn: 'NAME ON SO',
    taxId: '0105561234567',
    branchCode: '00002',
    billingAddress: 'ที่อยู่เอกสารไทย',
    billingAddressEn: 'Billing EN from quote',
    shippingAddress: 'ที่อยู่จัดส่งไทย',
    shippingAddressEn: 'Shipping EN on SO',
    contactName: 'คุณเบลล์',
    contactPhone: '0844326199',
  });
});

test('store: SO ไม่มีค่าภาษา = ไทย · ใบเสนอราคาไม่กรอกสาขา = "" (สำนักงานใหญ่) ไม่ใช่ null', async () => {
  const seed = snapshotSeed();
  seed.quotations = [{ ...QUOTE_ROW, branchCode: null }];
  const { snapshot } = await buildDocumentSnapshot(fakeDb(seed), {
    productId: 'PRD1', order: { id: 'SO1', quotationId: 'QT-ID', metadata: { quoteNumber: 'QT-แช่ไว้' } }, now: NOW,
  });
  assert.equal(snapshot.order.docLanguage, 'th');
  assert.equal(snapshot.order.quotationNumber, 'QT-แช่ไว้', 'เลขที่ที่ SO แช่ไว้ชนะเลขของใบที่ผูก');
  assert.equal(snapshot.customer.branchCode, '');
});

/* ⭐ มติผู้ใช้ 2026-09-22 "ปริมาตรบรรจุ และ จำนวนผลิต ดึงมาจาก ข้อมูล FG และ QT SO" — จำนวนผลิตถ่ายลงภาพนิ่ง
   จากบรรทัด SO · บรรทัดไม่มีจำนวน/ถูกถอด ⇒ บรรทัดใบเสนอราคา (ตัวที่บรรทัด SO ชี้ก่อน · ถอยสินค้าเดียวกัน) */
test('⭐ store: จำนวนผลิต = บรรทัด SO · ไม่มี ⇒ บรรทัดใบเสนอราคาที่ชี้ · ถอยสินค้าเดียวกัน · ไม่มีทั้งคู่ = null', async () => {
  const seed = snapshotSeed();
  seed.quotation_lines = [
    { id: 'QL-1', quotationId: 'QT-ID', productId: 'PRD-OTHER', qty: 10, unit: 'ชิ้น', sortOrder: 0 },
    { id: 'QL-2', quotationId: 'QT-ID', productId: 'PRD1', qty: 3000, unit: 'ขวด', sortOrder: 1 },
    { id: 'QL-3', quotationId: 'QT-OTHER', productId: 'PRD1', qty: 1, unit: 'ชิ้น', sortOrder: 0 },
    // สินค้าเดียวกันแต่เรียงหลัง QL-2 — ลิงก์ตรงต้องชนะการค้นตามสินค้า
    { id: 'QL-4', quotationId: 'QT-ID', productId: 'PRD1', qty: 7, unit: 'แพ็คเกจ', sortOrder: 2 },
    // บรรทัดพิมพ์เอง (ไม่มี productId) — ลิงก์ตรงเป็นหลักฐานเดียว ยังเชื่อ
    { id: 'QL-5', quotationId: 'QT-ID', productId: null, qty: 9, unit: 'ชิ้น', sortOrder: 3 },
  ];
  const order = { id: 'SO1', quotationId: 'QT-ID', metadata: {} };
  const qtyOf = async (line, over = {}) => {
    const res = await buildDocumentSnapshot(fakeDb(seed), { productId: 'PRD1', order: { ...order, ...over }, line, now: NOW });
    assert.equal(res.error, undefined, res.error);
    const { qty, unit, qtySource } = res.snapshot.order;
    return [qty, unit, qtySource];
  };
  assert.deepEqual(await qtyOf({ id: 'SOL-1', qty: 2500, unit: 'แพ็คเกจ', quotationLineId: 'QL-2' }), [2500, 'แพ็คเกจ', 'sales_order_line']);
  assert.deepEqual(await qtyOf({ id: 'SOL-1', qty: null, unit: null, quotationLineId: 'QL-4' }), [7, 'แพ็คเกจ', 'quotation_line'], 'บรรทัดที่ SO ชี้มาก่อน');
  // 🐞 ตรวจรอบสาม: ลิงก์ชี้บรรทัดของสินค้าอื่น = ห้ามพิมพ์จำนวนของสินค้านั้น ⇒ ถอยไปบรรทัดของสินค้าเดียวกัน
  assert.deepEqual(await qtyOf({ id: 'SOL-1', qty: null, unit: null, quotationLineId: 'QL-1' }), [3000, 'ขวด', 'quotation_line'], 'ลิงก์คนละสินค้า = ถอยสินค้าเดียวกัน');
  assert.deepEqual(await qtyOf({ id: 'SOL-1', qty: null, unit: null, quotationLineId: 'QL-5' }), [9, 'ชิ้น', 'quotation_line'], 'บรรทัดไม่มี productId ยังเชื่อลิงก์');
  assert.deepEqual(await qtyOf({ id: 'SOL-1', qty: '', unit: null, quotationLineId: 'QL-หาย' }), [3000, 'ขวด', 'quotation_line'], 'ชี้ไปบรรทัดที่หาย = ถอยสินค้าเดียวกัน');
  assert.deepEqual(await qtyOf(null), [3000, 'ขวด', 'quotation_line'], 'บรรทัดถูกถอด (ร่างพิมพ์สด) = สินค้าเดียวกันในใบเสนอราคา');
  assert.deepEqual(await qtyOf(null, { quotationId: null }), [null, null, null]);
});

/* ── เลขแพ็คของบรรทัด (mig 0407 · งวด PR-2 · docs/qt-pack-column.md) ───────────────────────────────────
   บรรทัดที่ให้จำนวน (SO ก่อน · ถอยใบเสนอราคา) มีเลขแพ็ค ⇒ ภาพนิ่งถ่าย `order.packQty` (ตัวเลข) ไปด้วย
   🔴 บรรทัดที่ไม่มีเลขแพ็ค: ก้อน `order` มีคีย์ชุดเดิมทุกตัว — ไม่มีคีย์ packQty (ไม่ใช่ null) */
test('⭐ store: จำนวนผลิตของบรรทัดที่มีเลขแพ็คพกเลขแพ็คของบรรทัดเดียวกับที่ให้จำนวน (SO · ใบเสนอราคาที่ชี้ · ถอยสินค้าเดียวกัน)', async () => {
  const seed = snapshotSeed();
  seed.quotation_lines = [
    { id: 'QL-1', quotationId: 'QT-ID', productId: 'PRD-OTHER', qty: 10, packQty: 5, unit: 'เดือน', sortOrder: 0 },
    { id: 'QL-2', quotationId: 'QT-ID', productId: 'PRD1', qty: 12, packQty: 2, unit: 'เดือน', sortOrder: 1 },
    { id: 'QL-4', quotationId: 'QT-ID', productId: 'PRD1', qty: 7, packQty: null, unit: 'แพ็คเกจ', sortOrder: 2 },
  ];
  const order = { id: 'SO1', quotationId: 'QT-ID', metadata: {} };
  const of = async (line) => {
    const res = await buildDocumentSnapshot(fakeDb(seed), { productId: 'PRD1', order, line, now: NOW });
    assert.equal(res.error, undefined, res.error);
    const { qty, unit, qtySource, packQty } = res.snapshot.order;
    return [qty, unit, qtySource, packQty, Object.prototype.hasOwnProperty.call(res.snapshot.order, 'packQty')];
  };
  assert.deepEqual(await of({ id: 'SOL-1', qty: 12, unit: 'เดือน', packQty: 2, quotationLineId: 'QL-2' }), [12, 'เดือน', 'sales_order_line', 2, true]);
  assert.deepEqual(await of({ id: 'SOL-1', qty: '12', unit: 'เดือน', packQty: '43' }), ['12', 'เดือน', 'sales_order_line', 43, true], 'ค่าจากฐานเป็นสตริงก็ได้ตัวเลข');
  // บรรทัด SO ไม่มีจำนวน ⇒ ใบเสนอราคา: เลขแพ็คต้องมาจากบรรทัดเดียวกับจำนวน (ไม่ใช่ของบรรทัด SO)
  assert.deepEqual(await of({ id: 'SOL-1', qty: null, unit: null, packQty: 9, quotationLineId: 'QL-2' }), [12, 'เดือน', 'quotation_line', 2, true]);
  assert.deepEqual(await of({ id: 'SOL-1', qty: null, unit: null, quotationLineId: 'QL-4' }), [7, 'แพ็คเกจ', 'quotation_line', undefined, false]);
  assert.deepEqual(await of({ id: 'SOL-1', qty: null, unit: null, quotationLineId: 'QL-1' }), [12, 'เดือน', 'quotation_line', 2, true], 'ลิงก์คนละสินค้า = ถอยสินค้าเดียวกัน พร้อมเลขแพ็คของบรรทัดนั้น');
  assert.deepEqual(await of(null), [12, 'เดือน', 'quotation_line', 2, true]);
});

test('🔴 store: บรรทัดที่ไม่มีเลขแพ็ค — ก้อน order ของภาพนิ่งเท่ากับวันนี้ทุกคีย์ (ไม่มีคีย์ · packQty: null · ค่าที่เก็บไม่ได้)', async () => {
  const seed = snapshotSeed();
  seed.quotation_lines = [{ id: 'QL-2', quotationId: 'QT-ID', productId: 'PRD1', qty: 3000, unit: 'ขวด', sortOrder: 1 }];
  const order = { id: 'SO1', quotationId: 'QT-ID', metadata: {} };
  // คีย์ของก้อน order วันนี้ (ลอกจาก buildDocumentSnapshot ก่อนงวดนี้) — เพิ่มคีย์ถาวรเมื่อไร เทสต์นี้ต้องแดง
  const TODAY_KEYS = ['salesOrderId', 'salesOrderLineId', 'orderNumber', 'quotationNumber', 'confirmDocType', 'confirmDocNo', 'confirmDocDate',
    'qty', 'unit', 'qtySource', 'lineDescription', 'deliveryDueDate', 'customerName', 'docLanguage', 'dealOwnerId', 'dealOwnerName',
    'dealOwnerEmail', 'dealOwnerPhone'];
  const snap = async (db, line) => (await buildDocumentSnapshot(db, { productId: 'PRD1', order, line, now: NOW })).snapshot;
  const soLine = { id: 'SOL-1', qty: 2500, unit: 'แพ็คเกจ', quotationLineId: 'QL-2' };
  const base = await snap(fakeDb(seed), soLine);
  assert.deepEqual(Object.keys(base.order), TODAY_KEYS);
  assert.deepEqual([base.order.qty, base.order.unit, base.order.qtySource], [2500, 'แพ็คเกจ', 'sales_order_line']);
  for (const packQty of [null, undefined, '', '  ', 'abc', 0, 1.5, 10000]) {
    assert.deepEqual(await snap(fakeDb(seed), { ...soLine, packQty }), base, `บรรทัด SO · packQty: ${String(packQty)}`);
    const quoteSeed = { ...seed, quotation_lines: seed.quotation_lines.map((row) => ({ ...row, packQty })) };
    const viaQuote = await snap(fakeDb(quoteSeed), { id: 'SOL-1', qty: null, unit: null, quotationLineId: 'QL-2' });
    assert.deepEqual(Object.keys(viaQuote.order), TODAY_KEYS, `บรรทัดใบเสนอราคา · packQty: ${String(packQty)}`);
    assert.deepEqual([viaQuote.order.qty, viaQuote.order.unit, viaQuote.order.qtySource], [3000, 'ขวด', 'quotation_line']);
  }
});

test('store: ตัวอ่านบรรทัดใบเสนอราคาของจำนวนผลิตเลือก packQty คู่กับ qty (mig 0407)', async () => {
  // ⚠️ ฐานจำลองของไฟล์นี้ไม่ตัดคอลัมน์ตาม select ⇒ ต้องอ่านข้อความ select ของจริง
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./productSpecStore.js', import.meta.url), 'utf8');
  const select = source.match(/from\('quotation_lines'\)\s*\.select\('([^']*)'\)/)?.[1] || '';
  const columns = select.split(',').map((col) => col.trim());
  assert.ok(columns.includes('qty') && columns.includes('packQty'), select);
});

test('🔴 store: อ่านบรรทัดใบเสนอราคา (ค่าสำรองของจำนวนผลิต) ไม่ได้ = error ไม่ใช่ N/A บนกระดาษ', async () => {
  const db = fakeDb(snapshotSeed(), { fail: (table) => (table === 'quotation_lines' ? { message: 'timeout' } : null) });
  const res = await buildDocumentSnapshot(db, { productId: 'PRD1', order: { id: 'SO1', quotationId: 'QT-ID' }, line: null, now: NOW });
  assert.match(res.error, /อ่านบรรทัดใบเสนอราคาไม่สำเร็จ: timeout/);
  // บรรทัด SO มีจำนวน = ไม่แตะใบเสนอราคาเลย
  const ok = await buildDocumentSnapshot(db, { productId: 'PRD1', order: { id: 'SO1', quotationId: 'QT-ID' }, line: { id: 'L', qty: 5, unit: 'ชิ้น' }, now: NOW });
  assert.equal(ok.error, undefined);
});

test('🔴 store: อ่านใบเสนอราคาที่ SO ผูกไม่ได้ = error (ไม่ใช่กล่องผู้ซื้อว่างเงียบ ๆ บนกระดาษที่ลูกค้าเซ็น)', async () => {
  const db = fakeDb(snapshotSeed(), { fail: (table) => (table === 'quotations' ? { message: 'timeout' } : null) });
  const res = await buildDocumentSnapshot(db, { productId: 'PRD1', order: { id: 'SO1', quotationId: 'QT-ID' }, now: NOW });
  assert.match(res.error, /อ่านใบเสนอราคาของใบสั่งขายไม่สำเร็จ: timeout/);
  assert.equal(res.snapshot, undefined);
});

test('store: ตัวอย่างจากหน้าสเปค (ไม่มี SO) ได้ก้อน order ครบคีย์เป็นค่าว่าง', async () => {
  const db = fakeDb({
    product_specs: [{ id: 'PSP1', productId: 'PRD1', certifications: [] }],
    products: [{ id: 'PRD1', fgCode: 'FG-0903-01-002-10043', customerName: 'ลูกค้าในทะเบียน' }],
  });
  const { snapshot } = await buildDocumentSnapshot(db, { productId: 'PRD1', now: NOW });
  assert.equal(snapshot.order.orderNumber, null);
  assert.equal(snapshot.order.customerName, 'ลูกค้าในทะเบียน');
  // ไม่มี SO = ไม่มีภาษา (ตัวพิมพ์ถือเป็นไทย) · ไม่มีใบเสนอราคา = สาขาเป็น null (พิมพ์ขีด ไม่ใช่ 00000)
  assert.equal(snapshot.order.docLanguage, null);
  assert.equal(snapshot.customer.name, 'ลูกค้าในทะเบียน');
  assert.equal(snapshot.customer.branchCode, null);
  assert.equal(snapshot.customer.taxId, null);
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

/* ── ลบร่างที่ยังไม่เคยยื่น (มติเจ้าของ 23/09/2569 · mig 0375) ────────────────
 *
 * ⚠️ ของจริงเดินผ่าน RPC `delete_product_spec_document_draft` ซึ่งล็อกแถว Rev ก่อนแล้วค่อยล็อก
 *    เอกสาร ตรวจกติกาซ้ำที่ฐาน แล้วลบทั้งคู่ในทรานแซกชันเดียว · ที่นี่ตรวจสองอย่างที่ฝั่ง JS
 *    รับผิดชอบ: **ส่งอาร์กิวเมนต์ให้ถูก** และ **แปล error ของฐานเป็นภาษาคนพร้อมรหัสสถานะ**
 * 🔴 store ต้องไม่แตะ `entity_number_counters` เลย — เลขที่ที่ลบไปแล้วเป็นรูถาวรตามมติ
 */
test('store: ลบร่างเรียก RPC ของ 0375 ด้วย id ของเอกสาร และคืนแถวที่ลบไว้ให้ audit', async () => {
  let args = null;
  const removedDoc = { id: 'D1', docNo: 'FM-SA-04-230969-001', status: 'active', currentRevNo: null };
  const removedRev = { id: 'R1', documentId: 'D1', revNo: 0, status: 'draft' };
  const db = fakeDb({}, {
    rpc: (name, a) => {
      args = { name, ...a };
      return { data: { docNo: removedDoc.docNo, document: removedDoc, revision: removedRev }, error: null };
    },
  });
  const res = await deleteDraftDocument(db, { document: { id: 'D1', docNo: removedDoc.docNo } });
  assert.equal(args.name, 'delete_product_spec_document_draft');
  assert.deepEqual(Object.keys(args).sort(), ['name', 'p_document_id']);
  assert.equal(args.p_document_id, 'D1');
  assert.equal(res.docNo, 'FM-SA-04-230969-001');
  // ⚠️ แถวเต็มทั้งคู่ — `audit_logs.before` คือทางกู้ทางเดียว (ระบบไม่มีถังขยะ)
  assert.deepEqual(res.document, removedDoc);
  assert.deepEqual(res.revision, removedRev);
  assert.equal((await deleteDraftDocument(db, {})).status, 404);
});

test('🔴 store: ฐานปฏิเสธการลบ = 409 พร้อมเหตุไทยของฐาน ไม่ใช่สตริงดิบภาษาอังกฤษ', async () => {
  const failing = (message) => fakeDb({}, { rpc: () => ({ data: null, error: { message } }) });
  const call = (message) => deleteDraftDocument(failing(message), { document: { id: 'D1' } });

  const submitted = await call('product_spec_document_draft_delete_forbidden: FM-SA-04-230969-003 — เคยยื่นให้ผู้อนุมัติดูแล้ว ลบไม่ได้ ใช้ยกเลิกเอกสารแทน');
  assert.equal(submitted.status, 409);
  assert.equal(submitted.conflict, true);
  assert.match(submitted.error, /^ลบร่างไม่ได้ — เคยยื่นให้ผู้อนุมัติดูแล้ว/);
  assert.doesNotMatch(submitted.error, /forbidden|FM-SA-04-230969-003/, 'ห้ามมีรหัสดิบ/เลขที่ดิบบน toast');

  const approved = await call('product_spec_document_draft_delete_forbidden: FM-SA-04-230969-005 — เอกสารผ่านการอนุมัติแล้ว (Rev.0)');
  assert.match(approved.error, /เอกสารผ่านการอนุมัติแล้ว/);
  assert.equal(approved.status, 409);

  const missing = await call('product_spec_document_not_found: D-NOPE');
  assert.equal(missing.status, 404);
  assert.match(missing.error, /ไม่พบเอกสารนี้/);

  // ยามของ 0375 ⑤ / DELETE ของ 0370 — ถึงตรงนี้ได้แปลว่ามีคนลบนอกทาง RPC ต้องไม่เงียบ
  const orphan = await call('product_spec_document_revision_orphan_delete: R1 — ลบ Rev. เดี่ยว ๆ ไม่ได้ ต้องลบทั้งเอกสาร');
  assert.equal(orphan.status, 409);
  assert.match(orphan.error, /ฐานข้อมูลปฏิเสธการลบ/);

  // error ที่ไม่รู้จัก = 500 พร้อมข้อความเดิม (ไม่กลืน ไม่เดา)
  const unknown = await call('connection reset');
  assert.equal(unknown.status, undefined);
  assert.match(unknown.error, /connection reset/);
});

test('🔴 store: RPC ตอบสำเร็จแต่ไม่คืนแถว = ห้ามบอกว่าลบแล้ว (audit จะไม่มีของกู้)', async () => {
  const db = fakeDb({}, { rpc: () => ({ data: { docNo: 'X' }, error: null }) });
  const res = await deleteDraftDocument(db, { document: { id: 'D1' } });
  assert.ok(res.error);
  assert.match(res.error, /ไม่คืนแถวที่ลบ/);
  assert.equal(res.docNo, undefined);
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


/* ── store: ราคาทุน + รูปประจำแถว checklist (mig 0405) ───────────────────────────────────────────── */

const { listSpecItemImages, isSpecItemImageReferenced, SPEC_ITEM_IMAGE_CLEANUP_MAX, SPEC_ITEM_IMAGE_GRACE_MS } = await import('./productSpecStore.js');
const { deleteAttachmentRows, driveFileHeld } = await import('@/lib/master/attachments');

/* RPC ของ **0405** จำลอง — เหมือน `itemsRpc` แต่ยกราคาทุน/รูปของแถวเดิมมาให้เมื่อแถวที่ส่งมาไม่มีคีย์
   (จับคู่สามขั้นเหมือนของจริง: id → itemKey ที่ไม่ว่าง → แถวที่เพิ่มเอง (itemKey ว่างทั้งคู่) ที่ itemLabel ตรงกันเป๊ะ ·
   หลายแถวเข้าข่าย = แถวบนสุดตาม sortOrder, id) และทุกแถวที่เก็บมีสองคีย์เสมอ · ของจริงพิสูจน์ด้วย PGlite ตอนเขียน migration */
const itemsRpc0405 = (calls = []) => (name, args, tables) => {
  if (name !== 'replace_product_spec_items') return { data: null, error: { message: `no rpc ${name}` } };
  calls.push(structuredClone(args));
  if (!(tables.product_specs || []).some((row) => row.id === args.p_spec_id)) {
    return { data: null, error: { message: `product_spec_not_found: ${args.p_spec_id}` } };
  }
  const old = (tables.product_spec_items || []).filter((row) => row.specId === args.p_spec_id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.id < b.id ? -1 : 1));
  const next = args.p_rows.map((row) => {
    const prev = old.find((have) => have.id === row.id)
      || (row.itemKey != null
        ? old.find((have) => have.itemKey === row.itemKey)
        : old.find((have) => have.itemKey == null && have.itemLabel === row.itemLabel));
    return {
      ...row,
      specId: args.p_spec_id,
      costPrice: 'costPrice' in row ? row.costPrice : prev?.costPrice ?? null,
      imageAttachmentId: 'imageAttachmentId' in row ? row.imageAttachmentId : prev?.imageAttachmentId ?? null,
    };
  });
  tables.product_spec_items = (tables.product_spec_items || []).filter((row) => row.specId !== args.p_spec_id).concat(next);
  return { data: next.length, error: null };
};
/* RPC ของ **0370** จำลอง (ฐานที่ยังไม่รัน 0405) — สองคีย์ใหม่ถูกทิ้งเงียบ แล้วตอบว่าสำเร็จ */
const itemsRpc0370 = (calls = []) => (name, args, tables) => {
  if (name !== 'replace_product_spec_items') return { data: null, error: { message: `no rpc ${name}` } };
  calls.push(structuredClone(args));
  const next = args.p_rows.map(({ costPrice: _c, imageAttachmentId: _i, ...row }) => ({ ...row, specId: args.p_spec_id }));
  tables.product_spec_items = (tables.product_spec_items || []).filter((row) => row.specId !== args.p_spec_id).concat(next);
  return { data: next.length, error: null };
};
// จดทุกคำสั่งที่ไม่ใช่การอ่าน — ใช้ยืนยันว่า "ด่านหยุดก่อนคำสั่งเขียนตัวแรก"
const writeLog = () => {
  const log = [];
  return { log, fail: (table, action) => { if (action !== 'select') log.push(`${action}:${table}`); return null; } };
};
const HOUR_AGO_2 = '2026-09-22T00:59:59.000Z';   // เกินหนึ่งชั่วโมงก่อน NOW
const MIN_AGO_10 = '2026-09-22T02:50:00.000Z';   // ภายในหนึ่งชั่วโมง
const rowImage = (id, over = {}) => ({
  id, entityType: 'product', entityId: 'PRD1', docType: 'spec_item_image', fileName: `${id}.png`, mimeType: 'image/png',
  driveFileId: null, metadata: {}, createdAt: HOUR_AGO_2, ...over,
});
const storedItem = (id, over = {}) => ({
  id, specId: 'PSP1', sortOrder: 0, itemKey: null, itemLabel: id, detail: null, preparedByS: false, preparedByCustomer: false,
  note: null, costPrice: null, imageAttachmentId: null, createdAt: NOW, ...over,
});
const SPEC1 = { id: 'PSP1', productId: 'PRD1', updatedAt: NOW };
const specDb = ({ items = [], attachments = [], rpcCalls = [], rpc = itemsRpc0405, fail } = {}) => fakeDb({
  products: [{ id: 'PRD1' }],
  product_specs: [{ ...SPEC1 }],
  product_spec_items: items,
  attachments,
}, { rpc: rpc(rpcCalls), ...(fail ? { fail } : {}) });
const releaseSpy = () => {
  const released = [];
  return { released, releaseFile: async (att) => { released.push(att.id); } };
};

test('store: รูปของแถว checklist ของสินค้า = เฉพาะ docType spec_item_image ของสินค้านั้น · อ่านพัง = error', async () => {
  const db = fakeDb({
    attachments: [
      rowImage(IMG2), rowImage(IMG1),
      rowImage(IMG3, { entityId: 'PRD9' }),
      { id: 'ILL', entityType: 'product', entityId: 'PRD1', docType: 'spec_illustration' },
      { id: 'ART', entityType: 'product', entityId: 'PRD1', docType: 'artwork' },
    ],
  });
  assert.deepEqual((await listSpecItemImages(db, 'PRD1')).images.map((row) => row.id), [IMG1, IMG2]);
  const broken = fakeDb({}, { fail: (table) => (table === 'attachments' ? { message: 'down' } : null) });
  assert.equal((await listSpecItemImages(broken, 'PRD1')).error, 'down');
});

test('store: บันทึกราคาทุน + รูปของแถว — id ของแถวคงเดิม · ผลลัพธ์คือแถวที่อ่านกลับจากฐาน', async () => {
  const calls = [];
  const db = specDb({
    items: [storedItem('OLD1', { itemKey: 'cap', itemLabel: 'ฝา' }), storedItem('OLD2', { sortOrder: 1, itemLabel: 'ถุงผ้า' })],
    attachments: [rowImage(IMG1)],
    rpcCalls: calls,
  });
  const spec = { ...SPEC1, items: structuredClone(db.tables.product_spec_items) };
  const res = await saveProductSpec(db, {
    spec, user: ADMIN, now: NOW, canEditItemCost: true,
    input: { content: {}, items: [
      { id: 'OLD1', itemKey: 'cap', costPrice: 12.5, imageAttachmentId: IMG1 },
      { id: 'OLD2', itemLabel: 'ถุงผ้า', costPrice: 0, imageAttachmentId: null },
      { id: 'PSI-from-another-spec', itemLabel: 'แถวใหม่', costPrice: null, imageAttachmentId: null },
    ] },
  });
  assert.equal(res.error, undefined, res.error);
  const sent = calls[0].p_rows;
  assert.deepEqual(sent.slice(0, 2).map((row) => row.id), ['OLD1', 'OLD2'], 'id ของแถวเดิมคงอยู่');
  assert.match(sent[2].id, /^PSI-/);
  assert.notEqual(sent[2].id, 'PSI-from-another-spec', '🔴 id ที่ไม่ใช่ของสเปคนี้ต้องไม่ถึง RPC (PK เป็นของทั้งระบบ)');
  assert.deepEqual(sent.map((row) => [row.costPrice, row.imageAttachmentId]), [[12.5, IMG1], [0, null], [null, null]]);
  assert.deepEqual(res.spec.items.map((row) => [row.id, row.costPrice, row.imageAttachmentId, row.specId]), [
    ['OLD1', 12.5, IMG1, 'PSP1'], ['OLD2', 0, null, 'PSP1'], [sent[2].id, null, null, 'PSP1'],
  ]);
});

test('🔴 store: คนที่แก้ราคาทุนไม่ได้บันทึก — คีย์ costPrice ไม่ถึง RPC เลย · ราคาทุนเดิมคงอยู่และกลับมาในผลลัพธ์ (audit เห็นค่าจริง)', async () => {
  const calls = [];
  const db = specDb({ items: [storedItem('OLD1', { itemKey: 'cap', itemLabel: 'ฝา', costPrice: 987654.32 })], rpcCalls: calls });
  const spec = { ...SPEC1, items: structuredClone(db.tables.product_spec_items) };
  const res = await saveProductSpec(db, {
    spec, user: ADMIN, now: NOW,   // ไม่ส่ง canEditItemCost = ไม่ได้
    input: { content: {}, items: [{ id: 'OLD1', itemKey: 'cap', detail: 'สีทอง', costPrice: 1, imageAttachmentId: null }] },
  });
  assert.equal(res.error, undefined, res.error);
  assert.equal('costPrice' in calls[0].p_rows[0], false, 'คีย์ต้องไม่มี — ส่ง null = ล้างราคาทุนของคนอื่น');
  assert.equal('imageAttachmentId' in calls[0].p_rows[0], true);
  assert.equal(db.tables.product_spec_items[0].costPrice, 987654.32);
  assert.equal(res.spec.items[0].costPrice, 987654.32, 'ผลลัพธ์ = แถวที่อ่านกลับ ไม่ใช่แถวที่ส่งไป');
  assert.equal(res.spec.items[0].detail, 'สีทอง');
});

test('🔴 store: จอรุ่นก่อน (ไม่ส่งสองคีย์ ไม่ส่ง id) **แก้ชื่อแถวที่เพิ่มเอง** แล้วบันทึก — แถวที่มีคีย์ทะเบียนได้ค่าเดิม · แถวที่แก้ชื่อเสียตัวชี้ (ยอมรับ) · ไม่ลบไฟล์สักไฟล์', async () => {
  const calls = [];
  const spy = releaseSpy();
  const writes = writeLog();
  const db = specDb({
    items: [
      storedItem('OLD1', { itemKey: 'cap', itemLabel: 'ฝา', costPrice: 50, imageAttachmentId: IMG1 }),
      storedItem('OLD2', { sortOrder: 1, itemLabel: 'ถุงผ้า', costPrice: 9, imageAttachmentId: IMG2 }),
    ],
    attachments: [rowImage(IMG1, { driveFileId: 'DRV1' }), rowImage(IMG2, { driveFileId: 'DRV2' }), rowImage(IMG3, { driveFileId: 'DRV3' })],
    rpcCalls: calls, fail: writes.fail,
  });
  const spec = { ...SPEC1, items: structuredClone(db.tables.product_spec_items) };
  // แท็บค้าง: แก้ชื่อแถวที่เพิ่มเอง ⇒ ไม่มี id · ไม่มี itemKey · ชื่อไม่ตรง = จับคู่กับของเดิมไม่ได้ ตัวชี้รูปหลุด (ยอมรับได้)
  // — แต่ไฟล์ต้องอยู่ · ชื่อไม่เปลี่ยน = ไม่หลุด (เทสต์ถัดไป)
  const res = await saveProductSpec(db, {
    spec, user: ADMIN, now: NOW, canEditItemCost: true, releaseFile: spy.releaseFile,
    input: { content: {}, items: [{ itemKey: 'cap', detail: 'แก้จากแท็บเก่า' }, { itemLabel: 'ถุงผ้า (แก้ชื่อ)' }] },
  });
  assert.equal(res.error, undefined, res.error);
  assert.deepEqual(calls[0].p_rows.map((row) => ['costPrice' in row, 'imageAttachmentId' in row]), [[false, false], [false, false]]);
  assert.deepEqual([res.spec.items[0].costPrice, res.spec.items[0].imageAttachmentId], [50, IMG1], 'แถวที่มีคีย์ทะเบียนได้ค่าเดิม');
  assert.deepEqual([res.spec.items[1].costPrice, res.spec.items[1].imageAttachmentId], [null, null]);
  assert.equal(calls[0].p_rows[0].id, 'OLD1', 'แถวที่มีคีย์ทะเบียนได้ id เดิมจาก itemKey');
  assert.notEqual(calls[0].p_rows[1].id, 'OLD2', 'แถวที่แก้ชื่อคือแถวใหม่ — ไม่รับ id ของแถวเดิม');
  assert.equal(db.tables.attachments.length, 3, '🔴 คำขอที่ไม่รู้จักรูปของแถว ห้ามลบไฟล์ — ทั้งรูปที่เพิ่งหลุดและรูปเก่าที่ไม่มีใครชี้');
  assert.deepEqual(spy.released, []);
  assert.equal(writes.log.includes('delete:attachments'), false, 'ไม่มีคำสั่งลบไฟล์แนบสักคำสั่ง');

  // ส่งคีย์รูปมาแค่บางแถว ก็ยังไม่เก็บกวาด
  const mixed = await saveProductSpec(db, {
    spec: { ...SPEC1, items: structuredClone(db.tables.product_spec_items) }, user: ADMIN, now: NOW, canEditItemCost: true,
    releaseFile: spy.releaseFile,
    input: { content: {}, items: [{ itemKey: 'cap', imageAttachmentId: null }, { itemLabel: 'ถุงผ้า (แก้ชื่อ)' }] },
  });
  assert.equal(mixed.error, undefined, mixed.error);
  assert.equal(db.tables.attachments.length, 3);
  assert.deepEqual(spy.released, []);
});

test('🔴 store: จอรุ่นก่อน (ไม่ส่ง id ไม่ส่งสองคีย์) บันทึกโดย **ไม่แก้ชื่อ** แถวที่เพิ่มเอง — ราคาทุนกับรูปอยู่ครบ · แถวได้ id เดิม · ไม่ลบไฟล์สักไฟล์', async () => {
  // 🐞 เดิมแถวที่เพิ่มเอง (itemKey ว่าง) ของผู้เรียกแบบนี้ไม่มีอะไรให้จับคู่เลย ⇒ ราคาทุนกับรูปหายทุกครั้งที่แท็บค้างกดบันทึก
  //    แล้วรูปที่หลุดถูกเก็บกวาดทิ้งในการบันทึกครั้งถัดไปของจอรุ่นใหม่
  const calls = [];
  const spy = releaseSpy();
  const writes = writeLog();
  const db = specDb({
    items: [
      storedItem('OLD1', { itemKey: 'cap', itemLabel: 'ฝา', costPrice: 50, imageAttachmentId: IMG1 }),
      storedItem('OLD2', { sortOrder: 1, itemLabel: 'ถุงผ้า', costPrice: 9, imageAttachmentId: IMG2 }),
    ],
    attachments: [rowImage(IMG1, { driveFileId: 'DRV1' }), rowImage(IMG2, { driveFileId: 'DRV2' }), rowImage(IMG3, { driveFileId: 'DRV3' })],
    rpcCalls: calls, fail: writes.fail,
  });
  const res = await saveProductSpec(db, {
    spec: { ...SPEC1, items: structuredClone(db.tables.product_spec_items) }, user: ADMIN, now: NOW, canEditItemCost: true,
    releaseFile: spy.releaseFile,
    // สลับลำดับแถวด้วย — การจับคู่ไม่ขึ้นกับตำแหน่ง
    input: { content: {}, items: [{ itemLabel: ' ถุงผ้า ', note: 'แก้จากแท็บเก่า' }, { itemKey: 'cap' }] },
  });
  assert.equal(res.error, undefined, res.error);
  assert.deepEqual(calls[0].p_rows.map((row) => [row.id, 'costPrice' in row, 'imageAttachmentId' in row]), [
    ['OLD2', false, false], ['OLD1', false, false],
  ], 'แถวได้ id เดิม (ชื่อตรงกัน / itemKey ตรงกัน) และยังไม่มีสองคีย์ใหม่ — RPC ยกค่าให้ด้วย id');
  assert.deepEqual(res.spec.items.map((row) => [row.id, row.costPrice, row.imageAttachmentId, row.note]), [
    ['OLD2', 9, IMG2, 'แก้จากแท็บเก่า'], ['OLD1', 50, IMG1, null],
  ]);
  assert.equal(db.tables.attachments.length, 3);
  assert.deepEqual(spy.released, []);
  assert.equal(writes.log.includes('delete:attachments'), false, 'ไม่มีคำสั่งลบไฟล์แนบสักคำสั่ง');
});

test('RPC จำลองของ 0405: ผู้เรียกที่ไม่ผ่าน store รุ่นนี้ (id ใหม่ทุกแถว ไม่มีสองคีย์) — แถวที่เพิ่มเองชื่อเดิมได้ค่าเดิม · แก้ชื่อ = NULL · id ชนะ itemKey ชนะชื่อ', async () => {
  // ⚠️ ที่นี่ยืนยันแค่ว่า **ตัวจำลอง** ทำตามกฎสามขั้นของ SQL (เทสต์ store ข้างบนพึ่งมัน) — ตัว SQL จริงพิสูจน์ด้วย PGlite
  const db = specDb({ items: [
    storedItem('OLD1', { itemKey: 'cap', itemLabel: 'ฝา', costPrice: 50, imageAttachmentId: IMG1 }),
    storedItem('OLD2', { sortOrder: 1, itemLabel: 'ถุงผ้า', costPrice: 9, imageAttachmentId: IMG2 }),
    storedItem('OLD3', { sortOrder: 2, itemLabel: 'ริบบิ้น', costPrice: 3, imageAttachmentId: IMG3 }),
  ] });
  const bare = (id, over) => ({ id, sortOrder: 0, itemKey: null, itemLabel: id, detail: null, preparedByS: false, preparedByCustomer: false, note: null, ...over });
  const call = (rows) => db.rpc('replace_product_spec_items', { p_spec_id: 'PSP1', p_rows: rows });
  await call([
    bare('N1', { itemLabel: 'ถุงผ้า' }), bare('N2', { itemLabel: 'ริบบิ้น (แก้ชื่อ)' }), bare('N3', { itemKey: 'cap', itemLabel: 'ฝา' }),
    bare('N4', { itemLabel: 'ฝา' }),   // แถวที่เพิ่มเองชื่อเหมือนแถวของแบบฟอร์ม — ไม่ใช่แถวเดียวกัน
  ]);
  assert.deepEqual(db.tables.product_spec_items.map((row) => [row.id, row.costPrice, row.imageAttachmentId]), [
    ['N1', 9, IMG2], ['N2', null, null], ['N3', 50, IMG1], ['N4', null, null],
  ]);
  // id ตรงแถวหนึ่ง แต่ itemKey/ชื่อไปตรงอีกแถว ⇒ ได้ของแถวที่ id ตรง
  await call([bare('N1', { itemKey: 'cap', itemLabel: 'ฝา' }), bare('N3', { itemLabel: 'ถุงผ้า' })]);
  assert.deepEqual(db.tables.product_spec_items.map((row) => [row.id, row.costPrice, row.imageAttachmentId]), [
    ['N1', 9, IMG2], ['N3', 50, IMG1],
  ]);
});

test('🔴 store: คำขอที่ส่ง checklist ว่าง (ลบทุกแถว) ไม่เก็บกวาดรูป — จอรุ่นก่อนก็ส่ง [] ได้โดยไม่เคยเห็นว่ามีรูป · รูปค้างไปกับกฎอายุรอบถัดไป', async () => {
  const spy = releaseSpy();
  const writes = writeLog();
  const db = specDb({
    items: [storedItem('OLD1', { imageAttachmentId: IMG1 }), storedItem('OLD2', { sortOrder: 1, imageAttachmentId: IMG2 })],
    // IMG1 เพิ่งอัป (แถวชี้อยู่) · IMG2 เก่า (แถวชี้อยู่) · IMG3 เก่าและไม่มีใครชี้ — ทั้งสามแบบต้องรอด
    attachments: [
      rowImage(IMG1, { driveFileId: 'DRV1', createdAt: MIN_AGO_10 }), rowImage(IMG2, { driveFileId: 'DRV2' }),
      rowImage(IMG3, { driveFileId: 'DRV3' }),
    ],
    fail: writes.fail,
  });
  const res = await saveProductSpec(db, {
    spec: { ...SPEC1, items: structuredClone(db.tables.product_spec_items) }, user: ADMIN, now: NOW, canEditItemCost: true,
    releaseFile: spy.releaseFile, input: { content: {}, items: [] },
  });
  assert.equal(res.error, undefined, res.error);
  assert.deepEqual(res.spec.items, [], 'แถวถูกลบตามคำขอ');
  assert.equal(db.tables.attachments.length, 3, '🔴 ลิสต์ว่างไม่ได้บอกว่าผู้เรียกรู้จักรูปของแถว — ห้ามลบไฟล์');
  assert.deepEqual(spy.released, []);
  assert.equal(writes.log.includes('delete:attachments'), false);

  // การบันทึกครั้งถัดไปที่มีแถวและส่งคีย์รูปครบ (จอรุ่นใหม่) เก็บรูปที่ค้างเกินชั่วโมง · รูปที่เพิ่งอัปยังอยู่
  const next = await saveProductSpec(db, {
    spec: { ...SPEC1, items: [] }, user: ADMIN, now: NOW, releaseFile: spy.releaseFile,
    input: { content: {}, items: [{ itemLabel: 'แถวใหม่', imageAttachmentId: null }] },
  });
  assert.equal(next.error, undefined, next.error);
  assert.deepEqual(db.tables.attachments.map((row) => row.id), [IMG1]);
  assert.deepEqual(spy.released.sort(), [IMG2, IMG3].sort());
});

test('🔴 store: เขียน checklist สำเร็จแต่อ่านกลับไม่ขึ้น = บันทึกสำเร็จ คืนแถวที่ส่งไป และ **ไม่เก็บกวาดรูป** — ทั้งบันทึกและสร้าง', async () => {
  // อ่าน product_spec_items ล้มเฉพาะ **หลัง** RPC วิ่งแล้ว (การอ่านก่อนเขียนต้องผ่านตามปกติ)
  const readFailsAfterRpc = (calls, log) => (table, action) => {
    if (action !== 'select') log.push(`${action}:${table}`);
    return table === 'product_spec_items' && action === 'select' && calls.length > 0 ? { message: 'timeout' } : null;
  };

  // บันทึก: แถวเดิมชี้ IMG1 · คำขอเอารูปออก (ส่งคีย์ครบ) ⇒ ถ้าเก็บกวาดด้วย "อ่านกลับ = ว่าง" IMG1 จะถูกลบทั้งที่ไม่รู้ว่าฐานเก็บอะไร
  const calls = [];
  const log = [];
  const spy = releaseSpy();
  const db = specDb({
    items: [storedItem('OLD1', { imageAttachmentId: IMG1 })],
    attachments: [rowImage(IMG1, { driveFileId: 'DRV1' }), rowImage(IMG2, { driveFileId: 'DRV2' })],
    rpcCalls: calls, fail: readFailsAfterRpc(calls, log),
  });
  const res = await saveProductSpec(db, {
    spec: { ...SPEC1, items: structuredClone(db.tables.product_spec_items) }, user: ADMIN, now: NOW, canEditItemCost: true,
    releaseFile: spy.releaseFile,
    input: { content: { longevity: '8 ชม.' }, items: [{ id: 'OLD1', itemLabel: 'OLD1', costPrice: 4, imageAttachmentId: null }] },
  });
  assert.equal(res.error, undefined, res.error);
  assert.equal(calls.length, 1);
  assert.equal(res.spec.longevity, '8 ชม.');
  assert.deepEqual(res.spec.items, calls[0].p_rows.map((row) => ({ ...row, specId: 'PSP1' })), 'คืนแถวที่ส่งเข้า RPC');
  assert.deepEqual(db.tables.attachments.map((row) => row.id), [IMG1, IMG2], '🔴 ไม่รู้ว่าฐานเก็บอะไรจริง = ห้ามลบไฟล์');
  assert.deepEqual(spy.released, []);
  assert.equal(log.includes('delete:attachments'), false);

  // สร้าง: มีรูปเก่าเกินชั่วโมงที่ไม่มีใครชี้ (ของเดียวที่เก็บกวาดได้ตอนสร้าง) — ต้องรอด และแถวสเปคต้องไม่ถูกถอย
  const createCalls = [];
  const createLog = [];
  const createDb = fakeDb({ products: [{ id: 'PRD1' }], attachments: [rowImage(IMG3, { driveFileId: 'DRV3' })] }, {
    rpc: itemsRpc0405(createCalls), fail: readFailsAfterRpc(createCalls, createLog),
  });
  const created = await createProductSpec(createDb, {
    productId: 'PRD1', user: ADMIN, now: NOW, canEditItemCost: true, releaseFile: spy.releaseFile,
    input: { content: {}, items: [{ itemKey: 'cap', costPrice: 4, imageAttachmentId: null }] },
  });
  assert.equal(created.error, undefined, created.error);
  assert.equal(createDb.tables.product_specs.length, 1, 'เขียนสำเร็จแล้ว — ห้ามถอยแถวสเปค');
  assert.deepEqual(created.spec.items, createCalls[0].p_rows.map((row) => ({ ...row, specId: created.spec.id })));
  assert.deepEqual(createDb.tables.attachments.map((row) => row.id), [IMG3]);
  assert.deepEqual(spy.released, []);
  assert.deepEqual(createLog.filter((entry) => entry.startsWith('delete:')), []);
});

test('🔴 store: ตัวชี้รูปที่ไม่ใช่รูปของแถว checklist ของสินค้านี้ = 400 บอกเลขแถว **ก่อนเขียนอะไรทั้งสิ้น**', async () => {
  const cases = [
    ['ไม่มีไฟล์นี้', []],
    ['ไฟล์ของสินค้าอื่น', [rowImage(IMG2, { entityId: 'PRD9' })]],
    ['ไฟล์ชนิดอื่นของสินค้านี้', [rowImage(IMG2, { docType: 'spec_illustration' })]],
  ];
  for (const [label, attachments] of cases) {
    const calls = [];
    const writes = writeLog();
    const db = specDb({ items: [storedItem('OLD1')], attachments: [rowImage(IMG1), ...attachments], rpcCalls: calls, fail: writes.fail });
    const res = await saveProductSpec(db, {
      spec: { ...SPEC1, items: structuredClone(db.tables.product_spec_items) }, user: ADMIN, now: NOW, canEditItemCost: true,
      input: { content: { longevity: 'ต้องไม่ถูกเขียน' }, items: [
        { itemLabel: 'แถวหนึ่ง', imageAttachmentId: IMG1 }, { itemLabel: 'แถวสอง', imageAttachmentId: IMG2 },
      ] },
    });
    assert.equal(res.status, 400, label);
    assert.match(res.error, /ไม่พบรูปของ checklist แถวที่ 2/, label);
    assert.deepEqual(writes.log, [], `${label}: ต้องไม่มีคำสั่งเขียน`);
    assert.equal(calls.length, 0, label);
    assert.equal(db.tables.product_specs[0].longevity, undefined, label);
  }
  // อ่านรายการรูปไม่ได้ = หยุด (ไม่มี status = 500) ไม่ใช่ปล่อยผ่าน
  const calls = [];
  const down = specDb({ rpcCalls: calls, fail: (table, action) => (table === 'attachments' && action === 'select' ? { message: 'down' } : null) });
  const res = await saveProductSpec(down, {
    spec: { ...SPEC1, items: [] }, user: ADMIN, now: NOW, input: { content: {}, items: [{ itemLabel: 'x', imageAttachmentId: IMG1 }] },
  });
  assert.match(res.error, /ตรวจรูปของ checklist ไม่สำเร็จ/);
  assert.equal(res.status, undefined);
  assert.equal(calls.length, 0);
  // ตอนสร้างสเปค: ด่านเดียวกัน และต้องไม่มีแถวสเปคค้าง
  const createDb = fakeDb({ products: [{ id: 'PRD1' }] }, { rpc: itemsRpc0405() });
  const created = await createProductSpec(createDb, {
    productId: 'PRD1', user: ADMIN, now: NOW, input: { content: {}, items: [{ itemKey: 'cap', imageAttachmentId: IMG1 }] },
  });
  assert.equal(created.status, 400);
  assert.match(created.error, /แถวที่ 1/);
  assert.equal((createDb.tables.product_specs || []).length, 0);
});

test('🔴 store: ฐานยังไม่รัน 0405 (แถวที่เก็บอยู่ไม่มีคีย์ใหม่) + ส่งราคาทุน/รูปมา = 503 บอกให้รัน migration **ก่อนเขียน**', async () => {
  const legacyRow = { id: 'OLD1', specId: 'PSP1', sortOrder: 0, itemKey: 'cap', itemLabel: 'ฝา', detail: null, note: null };
  for (const [label, row] of [['ราคาทุน', { costPrice: 5 }], ['ราคาทุนเป็น 0', { costPrice: 0 }], ['รูป', { imageAttachmentId: IMG1 }]]) {
    const calls = [];
    const writes = writeLog();
    const db = specDb({ items: [legacyRow], attachments: [rowImage(IMG1)], rpc: itemsRpc0370, rpcCalls: calls, fail: writes.fail });
    const res = await saveProductSpec(db, {
      spec: { ...SPEC1, items: [legacyRow] }, user: ADMIN, now: NOW, canEditItemCost: true,
      input: { content: { longevity: 'x' }, items: [{ id: 'OLD1', itemKey: 'cap', ...row }] },
    });
    assert.equal(res.status, 503, label);
    assert.equal(res.error, 'ฐานข้อมูลยังไม่รองรับราคาทุน/รูปของ checklist — ต้องรัน migration 0405 ก่อน', label);
    assert.deepEqual(writes.log, [], label);
    assert.equal(calls.length, 0, label);
  }
  // ไม่ได้ส่งค่าใหม่ (จอใหม่ส่ง null ทั้งคู่) = บันทึกได้ตามปกติบนฐานเก่า — ฟีเจอร์เดิมต้องไม่พังเพราะยังไม่รัน SQL
  const calls = [];
  const spy = releaseSpy();
  const db = specDb({ items: [legacyRow], attachments: [rowImage(IMG1, { driveFileId: 'DRV1' })], rpc: itemsRpc0370, rpcCalls: calls });
  const ok = await saveProductSpec(db, {
    spec: { ...SPEC1, items: [legacyRow] }, user: ADMIN, now: NOW, canEditItemCost: true, releaseFile: spy.releaseFile,
    input: { content: {}, items: [{ id: 'OLD1', itemKey: 'cap', detail: 'ยังบันทึกได้', costPrice: null, imageAttachmentId: null }] },
  });
  assert.equal(ok.error, undefined, ok.error);
  assert.equal(ok.spec.items[0].detail, 'ยังบันทึกได้');
  // 🔴 แถวที่อ่านกลับไม่มีคีย์ `imageAttachmentId` = ฐานเก่า ⇒ ห้ามเก็บกวาด แม้คำขอจะส่งคีย์รูปครบทุกแถวและรูปจะเก่าเกินชั่วโมง
  assert.equal(db.tables.attachments.length, 1);
  assert.deepEqual(spy.released, []);
});

test('🔴 store: อ่านกลับหลังเขียนแล้วราคาทุน/รูปไม่ถึงฐาน (RPC ตัวเก่าทิ้งคีย์เงียบ) = 503 · ไม่ลบไฟล์สักไฟล์', async () => {
  // สเปคที่ยังไม่มีแถวเลย ⇒ ด่านก่อนเขียนมองไม่เห็นว่าฐานเก่า — ตาข่ายคือการอ่านกลับ
  const spy = releaseSpy();
  const db = specDb({
    attachments: [rowImage(IMG1, { driveFileId: 'DRV1' }), rowImage(IMG2, { driveFileId: 'DRV2', createdAt: HOUR_AGO_2 })],
    rpc: itemsRpc0370,
  });
  const res = await saveProductSpec(db, {
    spec: { ...SPEC1, items: [] }, user: ADMIN, now: NOW, canEditItemCost: true, releaseFile: spy.releaseFile,
    input: { content: {}, items: [{ itemLabel: 'แถวหนึ่ง', costPrice: 5, imageAttachmentId: IMG1 }] },
  });
  assert.equal(res.status, 503);
  assert.match(res.error, /ต้องรัน migration 0405 ก่อน/);
  assert.equal(db.tables.attachments.length, 2, '🔴 ฐานเก่าไม่มีแถวไหนชี้อะไรได้ — ทุกรูปดูเหมือนไม่มีใครชี้ ห้ามเก็บกวาด');
  assert.deepEqual(spy.released, []);

  // 🔴 ส่ง **รูปอย่างเดียว** (คนที่แก้ราคาทุนไม่ได้: คีย์ costPrice ถูกตัดก่อนถึง RPC = ก้อนปกติของคนแก้สเปคส่วนใหญ่) ก็ต้อง 503
  //    ⚠️ IMG1 ต้องเป็นรูปของแถวของสินค้านี้จริง — ไม่งั้นหยุดที่ด่านตัวชี้รูป (400) ก่อนถึงการอ่านกลับ
  const imageOnlyDb = specDb({ attachments: [rowImage(IMG1, { driveFileId: 'DRV1' })], rpc: itemsRpc0370 });
  const imageOnly = await saveProductSpec(imageOnlyDb, {
    spec: { ...SPEC1, items: [] }, user: ADMIN, now: NOW, releaseFile: spy.releaseFile,   // ไม่ส่ง canEditItemCost
    input: { content: {}, items: [{ itemLabel: 'แถวหนึ่ง', imageAttachmentId: IMG1 }] },
  });
  assert.equal(imageOnly.status, 503, 'รูปที่ส่งไปไม่ถึงฐานต้องดัง ไม่ใช่ตอบว่าบันทึกแล้ว');
  assert.match(imageOnly.error, /ต้องรัน migration 0405 ก่อน/);
  assert.equal(imageOnlyDb.tables.attachments.length, 1);
  assert.deepEqual(spy.released, []);
  const imageOnlyCreateDb = fakeDb({ products: [{ id: 'PRD1' }], attachments: [rowImage(IMG1)] }, { rpc: itemsRpc0370() });
  const imageOnlyCreated = await createProductSpec(imageOnlyCreateDb, {
    productId: 'PRD1', user: ADMIN, now: NOW, releaseFile: spy.releaseFile,
    input: { content: {}, items: [{ itemKey: 'cap', imageAttachmentId: IMG1 }] },
  });
  assert.equal(imageOnlyCreated.status, 503);
  assert.match(imageOnlyCreated.error, /ต้องรัน migration 0405 ก่อน/);
  assert.equal(imageOnlyCreateDb.tables.product_specs.length, 0);
  assert.equal(imageOnlyCreateDb.tables.attachments.length, 1);
  assert.deepEqual(spy.released, []);

  // ตอนสร้าง: 503 เหมือนกัน และถอยแถวสเปคทิ้ง (กดสร้างใหม่หลังรัน SQL ได้ ไม่ชน "มีสเปคอยู่แล้ว")
  const createDb = fakeDb({ products: [{ id: 'PRD1' }], attachments: [rowImage(IMG2)] }, { rpc: itemsRpc0370() });
  const created = await createProductSpec(createDb, {
    productId: 'PRD1', user: ADMIN, now: NOW, canEditItemCost: true, releaseFile: spy.releaseFile,
    input: { content: {}, items: [{ itemKey: 'cap', costPrice: 5 }] },
  });
  assert.equal(created.status, 503);
  assert.equal(createDb.tables.product_specs.length, 0);
  assert.equal(createDb.tables.attachments.length, 1);
  assert.deepEqual(spy.released, []);
  // ไม่ได้ส่งค่าใหม่ = สร้างได้บนฐานเก่า
  const plain = await createProductSpec(fakeDb({ products: [{ id: 'PRD1' }] }, { rpc: itemsRpc0370() }), {
    productId: 'PRD1', user: ADMIN, now: NOW, canEditItemCost: true, input: { content: {} },
  });
  assert.equal(plain.error, undefined, plain.error);
  assert.equal(plain.spec.items.length, 17);
});

test('store: error ของ RPC checklist แปลเป็นไทยพร้อม status ที่ถึงผู้เรียกจริง — ทั้งบันทึกและสร้าง · ไม่มีข้อความดิบของ Postgres', async () => {
  const cases = [
    [{ code: '23503', message: 'insert or update on table "product_spec_items" violates foreign key constraint "product_spec_items_image_fk"' }, 400, /รูปของบางแถวถูกลบไปแล้ว/],
    [{ code: '23514', message: 'new row for relation "product_spec_items" violates check constraint "product_spec_items_cost_check"' }, 400, /เกินที่ระบบรับได้/],
    [{ code: '22P02', message: 'invalid input syntax for type uuid: "x"' }, 400, /รูปแบบไม่ถูกต้อง/],
    [{ code: '22003', message: 'numeric field overflow' }, 400, /รูปแบบไม่ถูกต้อง/],
    [{ code: '23505', message: 'duplicate key value violates unique constraint "product_spec_items_pkey"' }, 400, /รหัสของบางแถวซ้ำกัน/],
    // ไม่มี code (ชั้นกลางตัดทิ้ง) ก็ยังจำได้จากข้อความ
    [{ message: 'violates foreign key constraint "product_spec_items_image_fk"' }, 400, /รูปของบางแถวถูกลบไปแล้ว/],
    [{ message: 'violates check constraint "product_spec_items_cost_check"' }, 400, /เกินที่ระบบรับได้/],
    [{ message: 'product_spec_not_found: PSP1' }, 404, /ไม่พบสเปคนี้/],
  ];
  for (const [error, status, text] of cases) {
    const rpc = () => () => ({ data: null, error });
    const saved = await saveProductSpec(specDb({ rpc }), {
      spec: { ...SPEC1, items: [] }, user: ADMIN, now: NOW, input: { content: {}, items: [{ itemKey: 'cap' }] },
    });
    assert.equal(saved.status, status, `save ${error.code || error.message}`);
    assert.match(saved.error, /^บันทึกเนื้อสเปคแล้ว แต่ บันทึก checklist ไม่สำเร็จ: /);
    assert.match(saved.error, text);
    // 🪤 เราต์อ่านคำว่า "foreign key" ในข้อความที่ไม่มี status แล้วตอบ 409 "ไม่พบสเปคนี้" — ข้อความที่แปลแล้วต้องสะอาด
    assert.doesNotMatch(saved.error, /foreign key|violates|constraint|invalid input|duplicate key|product_spec_items/i);

    const createDb = fakeDb({ products: [{ id: 'PRD1' }] }, { rpc: () => ({ data: null, error }) });
    const created = await createProductSpec(createDb, { productId: 'PRD1', user: ADMIN, now: NOW, input: { content: {} } });
    assert.equal(created.status, status, `create ${error.code || error.message}`);
    assert.match(created.error, text);
    assert.equal(createDb.tables.product_specs.length, 0, 'สร้างไม่สำเร็จต้องถอยแถวสเปค');
  }
  // error ที่ไม่รู้จัก = ไม่มี status (500) และคงข้อความเดิมไว้ให้คนดูแลอ่าน
  const unknown = await saveProductSpec(specDb({ rpc: () => () => ({ data: null, error: { message: 'timeout' } }) }), {
    spec: { ...SPEC1, items: [] }, user: ADMIN, now: NOW, input: { content: {}, items: [{ itemKey: 'cap' }] },
  });
  assert.equal(unknown.status, undefined);
  assert.match(unknown.error, /timeout/);
});

test('🔴 store: เก็บกวาดรูปหลังบันทึก — แถวเคยชี้แล้วเลิกชี้ = ลบทันที · ไม่มีใครชี้เกิน 1 ชม. = ลบ · เพิ่งอัป = เก็บ · ยังชี้อยู่ = เก็บ', async () => {
  const KEPT = 'bbbbbbbb-0000-4000-8000-000000000001';      // ยังมีแถวชี้
  const DROPPED = 'bbbbbbbb-0000-4000-8000-000000000002';   // แถวเคยชี้ ชุดใหม่เอาออก (เพิ่งอัป 10 นาที — ลบอยู่ดี)
  const FRESH = 'bbbbbbbb-0000-4000-8000-000000000003';     // ไม่มีใครชี้ เพิ่งอัป (อาจเป็นของแท็บอื่นที่ยังไม่บันทึก)
  const STALE = 'bbbbbbbb-0000-4000-8000-000000000004';     // ไม่มีใครชี้ เกินหนึ่งชั่วโมง
  const NODATE = 'bbbbbbbb-0000-4000-8000-000000000005';    // ไม่รู้อายุ = เก็บไว้
  const spy = releaseSpy();
  const db = specDb({
    items: [storedItem('OLD1', { imageAttachmentId: KEPT }), storedItem('OLD2', { sortOrder: 1, imageAttachmentId: DROPPED })],
    attachments: [
      rowImage(KEPT, { driveFileId: 'D-KEPT' }), rowImage(DROPPED, { driveFileId: 'D-DROPPED', createdAt: MIN_AGO_10 }),
      rowImage(FRESH, { driveFileId: 'D-FRESH', createdAt: MIN_AGO_10 }), rowImage(STALE, { driveFileId: 'D-STALE' }),
      rowImage(NODATE, { driveFileId: 'D-NODATE', createdAt: null }),
      // ของที่ไม่ใช่รูปของแถว checklist ต้องไม่ถูกแตะไม่ว่าเก่าแค่ไหน
      { id: 'ILL', entityType: 'product', entityId: 'PRD1', docType: 'spec_illustration', driveFileId: 'D-ILL', createdAt: HOUR_AGO_2 },
      { id: 'ART', entityType: 'product', entityId: 'PRD1', docType: 'artwork', driveFileId: 'D-ART', createdAt: HOUR_AGO_2 },
      rowImage('cccccccc-0000-4000-8000-000000000009', { entityId: 'PRD9', driveFileId: 'D-OTHER' }),
    ],
  });
  const res = await saveProductSpec(db, {
    spec: { ...SPEC1, items: structuredClone(db.tables.product_spec_items) }, user: ADMIN, now: NOW, canEditItemCost: true,
    releaseFile: spy.releaseFile,
    input: { content: {}, items: [
      { id: 'OLD1', itemLabel: 'OLD1', imageAttachmentId: KEPT }, { id: 'OLD2', itemLabel: 'OLD2', imageAttachmentId: null },
    ] },
  });
  assert.equal(res.error, undefined, res.error);
  assert.deepEqual(db.tables.attachments.map((row) => row.id).sort(), [
    'ART', 'ILL', KEPT, FRESH, NODATE, 'cccccccc-0000-4000-8000-000000000009',
  ].sort());
  assert.deepEqual(spy.released.sort(), [DROPPED, STALE].sort(), 'ปล่อยไฟล์เฉพาะของแถวที่ลบ');
  assert.equal(SPEC_ITEM_IMAGE_GRACE_MS, 60 * 60 * 1000);
});

test('store: เก็บกวาดรูปต่อการบันทึกไม่เกินเพดาน — ที่เหลือรอบถัดไป', async () => {
  const many = Array.from({ length: SPEC_ITEM_IMAGE_CLEANUP_MAX + 5 }, (_, index) => (
    rowImage(`dddddddd-0000-4000-8000-${String(index).padStart(12, '0')}`, { driveFileId: `D-${index}` })
  ));
  const spy = releaseSpy();
  const db = specDb({ attachments: many });
  const save = () => saveProductSpec(db, {
    spec: { ...SPEC1, items: [] }, user: ADMIN, now: NOW, releaseFile: spy.releaseFile,
    input: { content: {}, items: [{ itemLabel: 'แถวเดียว', imageAttachmentId: null }] },
  });
  assert.equal((await save()).error, undefined);
  assert.equal(SPEC_ITEM_IMAGE_CLEANUP_MAX, 25);
  assert.equal(db.tables.attachments.length, 5);
  assert.equal(spy.released.length, 25);
  assert.equal((await save()).error, undefined);
  assert.equal(db.tables.attachments.length, 0);
  assert.equal(spy.released.length, 30);
});

test('🔴 store: ไฟล์ Drive ที่แถวอื่นถืออยู่ด้วย — ลบแถวรูป แต่ **ไม่ปล่อยไฟล์** (driveFileId มาจาก client ตอนแนบ)', async () => {
  const spy = releaseSpy();
  const db = specDb({
    attachments: [
      rowImage(IMG1, { driveFileId: 'DRV-CONTRACT' }), rowImage(IMG2, { driveFileId: 'DRV-OWN' }),
      { id: 'CONTRACT-FILE', entityType: 'contract', entityId: 'CT1', docType: 'signed', driveFileId: 'DRV-CONTRACT', createdAt: HOUR_AGO_2 },
    ],
  });
  const res = await saveProductSpec(db, {
    spec: { ...SPEC1, items: [] }, user: ADMIN, now: NOW, releaseFile: spy.releaseFile,
    input: { content: {}, items: [{ itemLabel: 'แถวเดียว', imageAttachmentId: null }] },
  });
  assert.equal(res.error, undefined, res.error);
  assert.deepEqual(db.tables.attachments.map((row) => row.id), ['CONTRACT-FILE'], 'แถวรูปทั้งสองถูกลบ · ไฟล์ของสัญญาอยู่');
  assert.deepEqual(spy.released, [IMG2], '🔴 ไฟล์ที่สัญญาถืออยู่ต้องไม่ถูกทิ้งลงถังขยะ Drive');

  // 🔴 เอกสาร Google ที่ผูกไว้กับระเบียนอื่นถือไฟล์ที่ `metadata.googleFileId` (driveFileId ของแถวนั้นเป็น null) — ต้องนับว่าถืออยู่
  const spy2 = releaseSpy();
  const sheet = specDb({
    attachments: [
      rowImage(IMG1, { driveFileId: 'GSHEET-OF-DEAL' }), rowImage(IMG2, { driveFileId: 'DRV-OWN' }),
      { id: 'DEAL-SHEET', entityType: 'deal', entityId: 'DL1', docType: 'other', driveFileId: null,
        metadata: { kind: 'gsheet', googleFileId: 'GSHEET-OF-DEAL' }, createdAt: HOUR_AGO_2 },
    ],
  });
  const res2 = await saveProductSpec(sheet, {
    spec: { ...SPEC1, items: [] }, user: ADMIN, now: NOW, releaseFile: spy2.releaseFile,
    input: { content: {}, items: [{ itemLabel: 'แถวเดียว', imageAttachmentId: null }] },
  });
  assert.equal(res2.error, undefined, res2.error);
  assert.deepEqual(sheet.tables.attachments.map((row) => row.id), ['DEAL-SHEET']);
  assert.deepEqual(spy2.released, [IMG2], '🔴 เอกสาร Google ของดีลต้องไม่ถูกทิ้งลงถังขยะ Drive');
});

test('store: เก็บกวาดรูปล้ม (ลบแถวไม่ผ่าน/อ่านรายการไม่ได้) ไม่ทำให้การบันทึกล้ม และไม่ปล่อยไฟล์', async () => {
  const spy = releaseSpy();
  const db = specDb({
    attachments: [rowImage(IMG1, { driveFileId: 'DRV1' })],
    fail: (table, action) => (table === 'attachments' && action === 'delete' ? { message: 'down' } : null),
  });
  const res = await saveProductSpec(db, {
    spec: { ...SPEC1, items: [] }, user: ADMIN, now: NOW, releaseFile: spy.releaseFile,
    input: { content: { longevity: '8 ชม.' }, items: [{ itemLabel: 'แถวเดียว', imageAttachmentId: null }] },
  });
  assert.equal(res.error, undefined, res.error);
  assert.equal(res.spec.longevity, '8 ชม.');
  assert.equal(db.tables.attachments.length, 1);
  assert.deepEqual(spy.released, [], 'ลบแถวไม่ผ่าน = ไม่แตะไฟล์ (ไฟล์หายแต่แถวอยู่ = รูปเปิดไม่ขึ้น)');

  // อ่านรายการรูปเพื่อเก็บกวาดไม่ได้ (ไม่มีแถวไหนส่งตัวชี้รูป ⇒ ด่านก่อนเขียนไม่ได้อ่านรายการไว้ให้ · ตัวเก็บกวาดอ่านเอง)
  const reads = [];
  const down = specDb({
    attachments: [rowImage(IMG1, { driveFileId: 'DRV1' })],
    fail: (table, action) => {
      if (table !== 'attachments') return null;
      reads.push(action);
      return action === 'select' ? { message: 'down' } : null;
    },
  });
  const res2 = await saveProductSpec(down, {
    spec: { ...SPEC1, items: [] }, user: ADMIN, now: NOW, releaseFile: spy.releaseFile,
    input: { content: { longevity: '6 ชม.' }, items: [{ itemLabel: 'แถวเดียว', imageAttachmentId: null }] },
  });
  assert.equal(res2.error, undefined, res2.error);
  assert.equal(res2.spec.longevity, '6 ชม.');
  assert.deepEqual(reads, ['select'], 'ตัวเก็บกวาดพยายามอ่านรายการรูปแล้วหยุด — ไม่มีคำสั่งลบตามมา');
  assert.equal(down.tables.attachments.length, 1);
  assert.deepEqual(spy.released, []);
});

test('deleteAttachmentRows: ลบเฉพาะแถวที่ส่งมาในคำสั่งเดียว · ไม่มีอะไรให้ลบ = ไม่ยิง · ไม่ throw · 🔴 ตรวจไม่ได้ว่ามีแถวอื่นถือไฟล์ไหม = เก็บไฟล์ไว้', async () => {
  // แถวมี driveFileId จริง — การปล่อยไฟล์ในทางปกติต้องเดินผ่านด่าน "มีแถวอื่นถือไหม" ไม่ใช่ข้ามเพราะ id ว่าง
  const files = () => [rowImage(IMG1, { driveFileId: 'DRV1' }), rowImage(IMG2, { driveFileId: 'DRV2' }), rowImage(IMG3, { driveFileId: 'DRV3' })];
  const writes = writeLog();
  const db = fakeDb({ attachments: files() }, { fail: writes.fail });
  const spy = releaseSpy();
  assert.deepEqual(await deleteAttachmentRows(db, [], { release: spy.releaseFile }), { count: 0, error: null });
  assert.deepEqual(await deleteAttachmentRows(db, null, { release: spy.releaseFile }), { count: 0, error: null });
  assert.deepEqual(writes.log, []);
  const res = await deleteAttachmentRows(db, [files()[0], files()[2], { id: null }], { release: spy.releaseFile });
  assert.deepEqual(res, { count: 2, error: null });
  assert.deepEqual(writes.log, ['delete:attachments'], 'คำสั่งลบเดียว');
  assert.deepEqual(db.tables.attachments.map((row) => row.id), [IMG2]);
  assert.deepEqual(spy.released.sort(), [IMG1, IMG3].sort());
  // ตัวปล่อยไฟล์โยน error = ไม่ล้ม
  const boom = await deleteAttachmentRows(db, [files()[1]], { release: async () => { throw new Error('drive down'); } });
  assert.deepEqual(boom, { count: 1, error: null });

  // 🔴 ลบแถวผ่าน แต่คำถาม "มีแถวอื่นถือไฟล์นี้ไหม" ล้ม ⇒ แถวหายแล้ว ไฟล์ต้องอยู่ (อาจเป็นไฟล์ที่สัญญา/บัตรประชาชนถืออยู่)
  let deleted = false;
  const flaky = fakeDb({ attachments: [files()[0]] }, {
    fail: (table, action) => {
      if (table !== 'attachments') return null;
      if (action === 'delete') { deleted = true; return null; }
      return deleted && action === 'select' ? { message: 'down' } : null;
    },
  });
  const spy2 = releaseSpy();
  assert.deepEqual(await deleteAttachmentRows(flaky, [files()[0]], { release: spy2.releaseFile }), { count: 1, error: null });
  assert.deepEqual(flaky.tables.attachments, []);
  assert.deepEqual(spy2.released, [], 'ตรวจไม่ได้ = เก็บไฟล์ไว้');
  // id ไฟล์ผิดรูป (ไม่ควรเกิด — POST กันไว้) = ไม่ยิงคำถาม และเก็บไฟล์ไว้เหมือนกัน
  const odd = rowImage(IMG1, { driveFileId: 'x,id.neq.0' });
  const oddDb = fakeDb({ attachments: [odd] });
  assert.deepEqual(await deleteAttachmentRows(oddDb, [odd], { release: spy2.releaseFile }), { count: 1, error: null });
  assert.deepEqual(spy2.released, []);
});

test('🔴 driveFileHeld: แถวถือไฟล์ได้สองช่อง (driveFileId · metadata.googleFileId) · excludeId · id ผิดรูปไม่ถึงตัวกรอง · query ล้ม = ถือว่ามีคนถือ', async () => {
  const seen = [];
  const seed = {
    attachments: [
      { id: 'A-FILE', entityType: 'contract', entityId: 'CT1', driveFileId: 'DRV_file-1', metadata: {} },
      { id: 'A-SHEET', entityType: 'deal', entityId: 'DL1', driveFileId: null, metadata: { kind: 'gsheet', googleFileId: 'GSHEET_1-x' } },
      { id: 'A-NOMETA', entityType: 'product', entityId: 'PRD1', driveFileId: null, metadata: null },
    ],
  };
  const db = fakeDb(seed, { fail: (table, action, st) => { seen.push({ table, action, ors: [...st.ors], limit: st.limit }); return null; } });
  const free = { held: false, error: null, invalid: false };
  const taken = { held: true, error: null, invalid: false };

  assert.deepEqual(await driveFileHeld(db, 'DRV_file-1'), taken, 'ช่อง driveFileId');
  assert.deepEqual(await driveFileHeld(db, 'GSHEET_1-x'), taken, '🔴 ช่อง metadata.googleFileId — เอกสาร Google เก็บ driveFileId เป็น null');
  assert.deepEqual(await driveFileHeld(db, 'DRV_nobody'), free);
  // ตัวกรองที่ยิงจริง: คำถามเดียว สองช่อง มีเพดาน 1 แถว
  assert.deepEqual(seen[0], {
    table: 'attachments', action: 'select', limit: 1,
    ors: ['driveFileId.eq.DRV_file-1,metadata->>googleFileId.eq.DRV_file-1'],
  });
  assert.equal(seen.length, 3);

  // excludeId: แถวของผู้ถามเองไม่นับ — แต่แถวอื่นที่ถือไฟล์เดียวกันยังนับ
  assert.deepEqual(await driveFileHeld(db, 'DRV_file-1', { excludeId: 'A-FILE' }), free);
  assert.deepEqual(await driveFileHeld(db, 'GSHEET_1-x', { excludeId: 'A-SHEET' }), free);
  assert.deepEqual(await driveFileHeld(db, 'DRV_file-1', { excludeId: 'A-SHEET' }), taken);
  const twice = fakeDb({ attachments: [...seed.attachments, { id: 'A-COPY', driveFileId: 'DRV_file-1', metadata: {} }] });
  assert.deepEqual(await driveFileHeld(twice, 'DRV_file-1', { excludeId: 'A-FILE' }), taken);

  // 🔴 id ผิดรูป = invalid + held และ **ไม่มีคำถามถึงฐานเลย** (`,` `)` `.` คือการเขียนเงื่อนไข .or() เอง)
  const before = seen.length;
  for (const bad of ['x,id.neq.0', 'a)', 'a.b', 'a b', 'ไทย', '', ' DRV_file-1', null, undefined, 123, {}, ['DRV_file-1']]) {
    assert.deepEqual(await driveFileHeld(db, bad), { held: true, error: null, invalid: true }, JSON.stringify(bad));
  }
  assert.equal(seen.length, before, 'id ผิดรูปต้องไม่ถูกต่อเข้าตัวกรอง');

  // query ล้ม = ถือว่ามีคนถือ (ผู้เรียกที่กำลังจะทิ้งไฟล์อ่านแค่ `held` ก็ปลอดภัย) พร้อม error ให้ผู้เรียกที่ต้องตอบ 500
  const down = fakeDb(seed, { fail: () => ({ message: 'down' }) });
  assert.deepEqual(await driveFileHeld(down, 'DRV_nobody'), { held: true, error: { message: 'down' }, invalid: false });
});

test('store: ลบสเปค = ลบรูปของแถว checklist ทุกรูปของสินค้า · ภาพประกอบกระดาษ/artwork/ของสินค้าอื่นอยู่ครบ · ลบรูปล้มไม่ล้มการลบสเปค', async () => {
  const seed = () => ({
    products: [{ id: 'PRD1' }],
    product_specs: [{ id: 'PSP1', productId: 'PRD1' }],
    attachments: [
      rowImage(IMG1, { driveFileId: 'DRV1', createdAt: MIN_AGO_10 }), rowImage(IMG2, { driveFileId: 'DRV2' }),
      { id: 'ILL', entityType: 'product', entityId: 'PRD1', docType: 'spec_illustration', driveFileId: 'D-ILL' },
      { id: 'ART', entityType: 'product', entityId: 'PRD1', docType: 'artwork', driveFileId: 'D-ART' },
      rowImage(IMG3, { entityId: 'PRD9', driveFileId: 'DRV3' }),
    ],
  });
  const spy = releaseSpy();
  const db = fakeDb(seed());
  const res = await deleteProductSpec(db, { spec: { id: 'PSP1', productId: 'PRD1' }, releaseFile: spy.releaseFile });
  assert.equal(res.deleted, true);
  assert.deepEqual(db.tables.attachments.map((row) => row.id).sort(), ['ART', 'ILL', IMG3].sort(),
    'รูปที่เพิ่งอัปก็ไปด้วย — สเปคไม่มีแล้ว ไม่มีแถวให้ชี้');
  assert.deepEqual(spy.released.sort(), [IMG1, IMG2].sort());

  // ลบสเปคไม่สำเร็จ (มีเอกสารอ้าง) = ห้ามแตะรูป
  const blocked = fakeDb(seed(), {
    fail: (table, action) => (table === 'product_specs' && action === 'delete' ? { code: '23503', message: 'violates foreign key constraint' } : null),
  });
  const kept = await deleteProductSpec(blocked, { spec: { id: 'PSP1', productId: 'PRD1' }, releaseFile: spy.releaseFile });
  assert.equal(kept.status, 400);
  assert.equal(blocked.tables.attachments.length, 5);
  // ลบรูปไม่ผ่าน = ลบสเปคสำเร็จตามเดิม
  const broken = fakeDb(seed(), { fail: (table) => (table === 'attachments' ? { message: 'down' } : null) });
  const partial = await deleteProductSpec(broken, { spec: { id: 'PSP1', productId: 'PRD1' }, releaseFile: spy.releaseFile });
  assert.equal(partial.deleted, true);
  assert.equal(broken.tables.product_specs.length, 0);
});

test('store: สร้างสเปค — id ที่ client ส่งมาไม่ถึง RPC · คนที่แก้ราคาทุนไม่ได้ ราคาทุนที่ส่งมาถูกข้าม (ไม่ใช่ error)', async () => {
  const calls = [];
  const db = fakeDb({ products: [{ id: 'PRD1' }], attachments: [] }, { rpc: itemsRpc0405(calls) });
  const res = await createProductSpec(db, {
    productId: 'PRD1', user: ADMIN, now: NOW, canEditItemCost: true,
    input: { content: {}, items: [{ id: 'PSI-squat', itemKey: 'cap', costPrice: 15, imageAttachmentId: null }] },
  });
  assert.equal(res.error, undefined, res.error);
  assert.notEqual(calls[0].p_rows[0].id, 'PSI-squat');
  assert.match(calls[0].p_rows[0].id, /^PSI-/);
  assert.equal(res.spec.items[0].costPrice, 15);

  const calls2 = [];
  const db2 = fakeDb({ products: [{ id: 'PRD2' }] }, { rpc: itemsRpc0405(calls2) });
  const viewer = await createProductSpec(db2, {
    productId: 'PRD2', user: ADMIN, now: NOW,
    input: { content: {}, items: [{ itemKey: 'cap', costPrice: 15 }] },
  });
  assert.equal(viewer.error, undefined, viewer.error);
  assert.equal('costPrice' in calls2[0].p_rows[0], false);
  assert.equal(viewer.spec.items[0].costPrice, null);
  // แถวตั้งต้น 17 แถวไม่พกสองคีย์ใหม่ (ไม่มีอะไรให้ล้าง)
  const calls3 = [];
  await createProductSpec(fakeDb({ products: [{ id: 'PRD3' }] }, { rpc: itemsRpc0405(calls3) }), {
    productId: 'PRD3', user: ADMIN, now: NOW, canEditItemCost: true, input: { content: {} },
  });
  assert.equal(calls3[0].p_rows.length, 17);
  assert.equal(calls3[0].p_rows.some((row) => 'costPrice' in row || 'imageAttachmentId' in row), false);
});

test('store: รูปของแถวยังมีแถวชี้อยู่ไหม — ด่านของ DELETE ไฟล์แนบ · อ่านพัง = error ไม่ใช่ "ไม่มีใครชี้"', async () => {
  const db = fakeDb({ product_spec_items: [storedItem('I1', { imageAttachmentId: IMG1 }), storedItem('I2')] });
  assert.deepEqual(await isSpecItemImageReferenced(db, IMG1), { referenced: true });
  assert.deepEqual(await isSpecItemImageReferenced(db, IMG2), { referenced: false });
  const broken = fakeDb({}, { fail: () => ({ message: 'column product_spec_items.imageAttachmentId does not exist' }) });
  assert.match((await isSpecItemImageReferenced(broken, IMG1)).error, /does not exist/);
});

test('🔴 ภาพนิ่งของเอกสารไม่มีราคาทุน/รูปของแถว แม้แถวที่เก็บอยู่จะมี — ใช้ในระบบเท่านั้น (กระดาษใบนี้ลูกค้าเซ็น)', async () => {
  const db = fakeDb({
    product_specs: [{ id: 'PSP1', productId: 'PRD1', texture: 'เจล', pricingTier: 'ราคาต้นทุน 987654.32', certifications: [] }],
    product_spec_items: [
      storedItem('I1', { itemKey: 'cap', itemLabel: 'ฝา', detail: 'เงิน', preparedByS: true, costPrice: 987654.32, imageAttachmentId: IMG1 }),
      storedItem('I2', { sortOrder: 1, itemLabel: 'ถุงผ้า', costPrice: 0, imageAttachmentId: null }),
    ],
    products: [{ id: 'PRD1', fgCode: 'FG-1', productDescription: 'สเปรย์', categoryCode: '01-002' }],
    product_types: [{ mainCategoryCode: '01', typeCode: '002', nameTh: 'สเปรย์', nameEn: 'SPRAY' }],
    // รูปของแถว checklist ต้องไม่ไปโผล่เป็นภาพประกอบของกระดาษ (คนละ docType โดยตั้งใจ)
    attachments: [rowImage(IMG1, { metadata: { sortOrder: 0, caption: 'รูปของแถว' } })],
  });
  const res = await buildDocumentSnapshot(db, { productId: 'PRD1', order: null, line: null, dealOwner: null, now: NOW });
  assert.equal(res.error, undefined, res.error);
  const KEYS = ['detail', 'itemKey', 'itemLabel', 'note', 'preparedByCustomer', 'preparedByS', 'sortOrder'];
  for (const row of res.snapshot.items) assert.deepEqual(Object.keys(row).sort(), KEYS);
  assert.equal(res.snapshot.items.length, 2);
  assert.doesNotMatch(JSON.stringify(res.snapshot), /987654|costPrice|imageAttachmentId|pricingTier/);
  assert.deepEqual(res.snapshot.illustrations, []);
  assert.deepEqual(res.illustrationIds, []);
});
