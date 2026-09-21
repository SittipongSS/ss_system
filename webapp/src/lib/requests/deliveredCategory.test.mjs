// ม-148 · พัฒนากลิ่น "ส่งเป็นอะไร" (มติผู้ใช้ 2026-09-22)
//
// ล็อกกติกา:
//   1) หัวน้ำหอม = 02-020 ตัวเดียว · หมวดอื่นใน 01/02 = สินค้า (มีสูตร · ราคา FB)
//   2) SDS 02-001 ส่งเป็นสินค้าไม่ได้ — ส่งเป็นหัวน้ำหอม แล้วทำสูตรทางพัฒนาสูตร
//   3) เครื่อง/อุปกรณ์ในกลุ่ม 01/02 ไม่อยู่ในตัวเลือก · กลุ่ม 03+ ไม่ได้
//   4) ค่าตั้งต้นจาก PDR 1.11 เฉพาะใบที่ขอหมวดเดียว
//   5) ส่งเป็นสินค้า → ส่งงานสร้างสูตร → แถวผูกสูตร → ราคา FB (ต่อสายกับ rowPriceTarget)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELIVERED_FRAGRANCE_CODE, DELIVERY_EXCLUDED_CATEGORIES, defaultDeliveredCategory, deliveredAsOf,
  deliveredCategoryError, deliveryProductCategories, isDeliveredAsProduct, scentFPriceNotice,
} from './deliveredCategory.js';
import { deliveryItemRow, normalizeDeliveryRows } from './delivery.js';
import { rowPriceTarget } from './rowPriceTarget.js';
import { reworkSlotFrom } from './rework.js';

const T = (main, type, extra = {}) => ({ mainCategoryCode: main, typeCode: type, isActive: true, ...extra });
const TYPES = [
  T('01', '002', { nameEn: 'BODY PERFUME' }),
  T('01', '003', { nameEn: 'SCENT CANDLE' }),
  T('01', '037', { nameEn: 'GIFT SET' }),
  T('01', '099', { isActive: false }),
  T('02', '001', { nameEn: 'SDS' }),
  T('02', '020', { nameEn: 'FRAGRANCE OIL' }),
  T('02', '024'),
  T('03', '001', { nameEn: 'SCENT DESIGN' }),
];

test('หัวน้ำหอมคือ 02-020 ตัวเดียว — หมวดอื่นคือสินค้า · ว่าง = ยังไม่เลือก', () => {
  assert.equal(DELIVERED_FRAGRANCE_CODE, '02-020');
  assert.equal(isDeliveredAsProduct('02-020'), false);
  assert.equal(isDeliveredAsProduct('01-002'), true);
  assert.equal(isDeliveredAsProduct(''), false);
  assert.equal(isDeliveredAsProduct(null), false);
});

test('แผ่นเลือกสองทาง: กด "สินค้า" แล้วยังไม่เลือกหมวด ต้องค้างที่สินค้า ไม่เด้งกลับว่าง', () => {
  assert.equal(deliveredAsOf('02-020'), 'fragrance');
  assert.equal(deliveredAsOf('01-002'), 'product');
  assert.equal(deliveredAsOf(''), '');
  assert.equal(deliveredAsOf('', { productPending: true }), 'product');
});

test('ตัวเลือกหมวดสินค้า = 01/02 ที่ใช้งาน ตัดหัวน้ำหอม SDS เครื่อง/อุปกรณ์ และกลุ่ม 03', () => {
  const codes = deliveryProductCategories(TYPES).map((t) => `${t.mainCategoryCode}-${t.typeCode}`);
  assert.deepEqual(codes, ['01-002', '01-003']);
  // หมวดที่ถูกปิดใช้ทีหลังแต่เลือกไว้แล้ว ต้องยังอยู่ในลิสต์ (ไม่งั้นช่องว่างเปล่าทั้งที่มีค่า)
  const kept = deliveryProductCategories(TYPES, '01-099').map((t) => `${t.mainCategoryCode}-${t.typeCode}`);
  assert.ok(kept.includes('01-099'));
  for (const code of ['02-001', '02-024', '01-037']) assert.ok(DELIVERY_EXCLUDED_CATEGORIES.includes(code));
});

test('ด่านหมวดที่ส่ง — บังคับเลือก · กลุ่ม 01/02 เท่านั้น · SDS บอกทางที่ถูก', () => {
  assert.match(deliveredCategoryError('', TYPES), /ต้องเลือก/);
  assert.equal(deliveredCategoryError('02-020', TYPES), null);
  assert.equal(deliveredCategoryError('01-002', TYPES), null);
  assert.match(deliveredCategoryError('03-001', TYPES), /01 และ 02/);
  assert.match(deliveredCategoryError('02-001', TYPES), /ส่งเป็นหัวน้ำหอม/);
  assert.match(deliveredCategoryError('01-037', TYPES), /เครื่อง\/อุปกรณ์/);
  assert.match(deliveredCategoryError('01-099', TYPES), /ปิดใช้งาน/);
  assert.match(deliveredCategoryError('01-777', TYPES), /ไม่พบหมวด/);
  assert.match(deliveredCategoryError('1-2', TYPES), /ไม่ถูกต้อง/);
  // ทะเบียนหมวดโหลดไม่ได้ = ตรวจได้แค่รูปแบบ/กลุ่ม (server ส่งทะเบียนมาเสมอ)
  assert.equal(deliveredCategoryError('01-777', []), null);
});

test('ค่าตั้งต้นจาก PDR 1.11 — ขอหมวดเดียวเท่านั้น · SDS = หัวน้ำหอม', () => {
  assert.equal(defaultDeliveredCategory(['01-002'], TYPES), '01-002'); // SB-26080011
  assert.equal(defaultDeliveredCategory(['02-020'], TYPES), '02-020');
  assert.equal(defaultDeliveredCategory(['02-001'], TYPES), '02-020'); // SDS
  assert.equal(defaultDeliveredCategory(['01-002', '01-003'], TYPES), '');
  assert.equal(defaultDeliveredCategory(['01-037'], TYPES), ''); // ชุดของขวัญ — ไม่เดา
  assert.equal(defaultDeliveredCategory([], TYPES), '');
  assert.equal(defaultDeliveredCategory(null, TYPES), '');
});

// ── ต่อสายทั้งเส้น: ฟอร์ม → ด่าน → แถว → ชนิดราคา ─────────────────────────
const product = (extra = {}) => ({
  scent: { name: 'Secret Valley #2', code: 'PF0020402' },
  categoryCode: '01-002',
  formula: { name: 'Secret Valley #2 EDP', code: 'PF0020402-P1', formulaDate: '2026-09-22' },
  readyAt: '2026-09-22',
  ...extra,
});

test('⭐ ส่งเป็นสินค้า: ต้องกรอกสูตร (ชื่อ + รหัส) — ด่านเดียวกับสายพัฒนาสูตร', () => {
  const noFormula = normalizeDeliveryRows([product({ formula: {} })], { productTypes: TYPES });
  assert.match(noFormula.error, /ชื่อสูตร/);
  const noCode = normalizeDeliveryRows([product({ formula: { name: 'x' } })], { productTypes: TYPES });
  assert.match(noCode.error, /รหัสสูตร/);
});

test('⭐ ส่งเป็นสินค้า → แถวผูกกลิ่น + สูตร → ราคาเป็น FB บนสูตร (บั๊ก SB-26080011)', () => {
  const { rows, error } = normalizeDeliveryRows([product()], { productTypes: TYPES });
  assert.equal(error, null);
  assert.equal(rows[0].categoryCode, '01-002');
  assert.equal(rows[0].formula.code, 'PF0020402-P1');
  const item = deliveryItemRow(rows[0], {
    requestId: 'DR-1', sortOrder: 1, scentId: 'SCT-NEW', formulaId: 'FML-NEW', ackAt: '2026-09-01',
  });
  assert.equal(item.lineKind, 'scent_dev');
  assert.equal(item.categoryCode, '01-002');
  assert.equal(item.producedScentId, 'SCT-NEW');
  assert.equal(item.producedFormulaId, 'FML-NEW');
  assert.equal(item.producedFormulaAction, 'create');
  // ⚠️ `scentId` ยังว่าง — กลิ่นเป็น *ผลลัพธ์* ของแถว ไม่ใช่ของที่อ้าง (delivery.js)
  assert.equal(item.scentId, undefined);
  assert.equal(rowPriceTarget(item).kind, 'RM_FB');
});

test('ส่งเป็นหัวน้ำหอม → ไม่มีสูตร (ก้อน formula ที่ค้างในฟอร์มถูกทิ้ง) → ราคา F บนกลิ่น', () => {
  const { rows, error } = normalizeDeliveryRows([product({ categoryCode: '02-020' })], { productTypes: TYPES });
  assert.equal(error, null);
  assert.equal(rows[0].formula, null);
  const item = deliveryItemRow(rows[0], { requestId: 'DR-1', sortOrder: 1, scentId: 'SCT-NEW', ackAt: null });
  assert.equal(item.categoryCode, '02-020');
  assert.equal(item.producedFormulaId, null);
  assert.equal(item.producedFormulaAction, null);
  assert.equal(rowPriceTarget(item).kind, 'RM_F');
});

test('รหัสสูตรซ้ำจับที่ด่าน — เทียบกับทะเบียน **สูตร** (ทะเบียนกลิ่นใช้รหัสเดียวกันได้)', () => {
  const clash = normalizeDeliveryRows([product()], {
    productTypes: TYPES, existingFormulaCodes: ['pf0020402-p1'],
  });
  assert.match(clash.error, /ถูกใช้ไปแล้วในทะเบียนสูตร/);
  // RD ใช้รหัส PF เดียวกันทั้งกลิ่นและสูตรได้จริง (scents_code_uk กับ formulas_code_uk แยกกัน)
  const sameAsScent = normalizeDeliveryRows([product({
    formula: { name: 'x', code: 'PF0020402' },
  })], { productTypes: TYPES });
  assert.equal(sameAsScent.error, null);
  const twice = normalizeDeliveryRows([
    product(),
    product({ scent: { name: 'อีกตัว', code: 'PF0020403' } }),
  ], { productTypes: TYPES });
  assert.match(twice.error, /รหัสสูตร .* ซ้ำกับรายการก่อนหน้า/);
});

test('ไม่เลือก "ส่งเป็น" = ส่งไม่ได้ · ป้ายในข้อความตามแท็บที่จอส่งมา', () => {
  const { error } = normalizeDeliveryRows([product({ categoryCode: '' })], {
    productTypes: TYPES, labelOf: () => 'Secret Valley #2',
  });
  assert.match(error, /^Secret Valley #2: ต้องเลือกว่าส่งเป็น/);
});

test('⭐ รอบแก้: หมวดตั้งต้นจากรอบก่อน · สูตรต้นทางมาจากแถวต้นทาง ไม่ใช่จาก client', () => {
  const items = [
    { id: 'A', lineKind: 'scent_dev', producedScentId: 'SCT-A', producedFormulaId: 'FML-A',
      categoryCode: '01-002', outcome: 'revise', label: 'รอบ 1' },
    { id: 'B', lineKind: 'scent_dev', derivedFromItemId: 'A', categoryCode: '01-002', ackAt: '2026-09-01' },
  ];
  const slot = reworkSlotFrom(items[1], items);
  assert.equal(slot.categoryCode, '01-002');
  assert.equal(slot.parentFormulaId, 'FML-A');
  const { rows, error } = normalizeDeliveryRows([product({
    targetItemId: 'B',
    formula: { name: 'รอบ 2', code: 'PF-R2', derivedFromFormulaId: 'FML-ของคนอื่น' },
  })], { productTypes: TYPES, items });
  assert.equal(error, null);
  assert.equal(rows[0].formula.derivedFromFormulaId, 'FML-A');
  // รอบก่อนส่งเป็นหัวน้ำหอม = ไม่มีสูตรต้นทาง (ไม่ใช่ค่าที่ client เลือกมา)
  const fromOil = [{ ...items[0], producedFormulaId: null, categoryCode: '02-020' }, items[1]];
  const again = normalizeDeliveryRows([product({
    targetItemId: 'B', formula: { name: 'รอบ 2', code: 'PF-R2', derivedFromFormulaId: 'FML-X' },
  })], { productTypes: TYPES, items: fromOil });
  assert.equal(again.rows[0].formula.derivedFromFormulaId, null);
});

test('คำเตือนปุ่มใส่ราคา F บนทะเบียนกลิ่น — ส่งเป็นสินค้า / มีสูตรใช้อยู่ / ไม่มีอะไร', () => {
  assert.match(
    scentFPriceNotice({ deliveredCategoryCode: '01-002', formulas: [{ code: 'PF-1', status: 'developing' }] }),
    /ส่งให้ลูกค้าเป็นสินค้าหมวด 01-002 \(สูตร PF-1\)/,
  );
  assert.match(
    scentFPriceNotice({ deliveredCategoryCode: null, formulas: [{ code: 'PF-9', status: 'active' }] }),
    /มีสูตรใช้อยู่ 1 ตัว/,
  );
  assert.equal(scentFPriceNotice({ deliveredCategoryCode: '02-020', formulas: [] }), null);
  assert.equal(scentFPriceNotice({ formulas: [{ code: 'OLD', status: 'archived' }] }), null);
  assert.equal(scentFPriceNotice(null), null);
});
