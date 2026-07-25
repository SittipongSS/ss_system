// คลังราคาวัสดุ (mig 0143) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRICE_TTL_DAYS,
  MATERIAL_KINDS,
  bestPriceFor,
  canQuoteMaterial,
  isRevisionExpired,
  latestRevision,
  normalizeMaterialRequestItems,
  normalizeQuotedPrice,
  revisionUnitPrice,
  revisionValidUntil,
  sourceDeptForMaterialKind,
  unitBasisForMaterialKind,
} from './materialPrices.js';

test('ชนิดวัสดุ → หน่วย + ฝ่าย', () => {
  assert.equal(unitBasisForMaterialKind('RM_F'), 'per_kg');
  assert.equal(unitBasisForMaterialKind('RM_FB'), 'per_kg');
  assert.equal(unitBasisForMaterialKind('PM'), 'per_piece');
  assert.equal(sourceDeptForMaterialKind('RM_F'), 'RD');
  assert.equal(sourceDeptForMaterialKind('PM'), 'PC');
  // ไม่มี labor — ค่าดำเนินการไม่ใช่วัสดุ
  assert.ok(!MATERIAL_KINDS.includes('labor'));
});

test('ราคาต่อหน่วยของรุ่น: null เมื่อไม่มีข้อมูล ไม่ใช่ 0', () => {
  assert.equal(revisionUnitPrice({ unitBasis: 'per_kg', pricePerKg: 1200 }), 1200);
  assert.equal(revisionUnitPrice({ unitBasis: 'per_piece', pricePerUnit: 8 }), 8);
  assert.equal(revisionUnitPrice({ unitBasis: 'per_kg', pricePerKg: null }), null);
  assert.equal(revisionUnitPrice(null), null);
  assert.equal(revisionUnitPrice({ unitBasis: 'per_piece', pricePerUnit: 0 }), 0);
});

test('รุ่นล่าสุด = revisionNo มากสุด', () => {
  const revs = [{ revisionNo: 1 }, { revisionNo: 3 }, { revisionNo: 2 }];
  assert.equal(latestRevision(revs).revisionNo, 3);
  assert.equal(latestRevision([]), null);
});

test('อายุราคา: validUntil ถ้ามี ไม่งั้น quotedAt + TTL', () => {
  assert.equal(revisionValidUntil({ validUntil: '2026-08-01' }), '2026-08-01');
  // quotedAt 2026-05-01 + 90 วัน = 2026-07-30
  assert.equal(
    revisionValidUntil({ quotedAt: '2026-05-01T00:00:00Z' }, 90),
    '2026-07-30',
  );
  assert.equal(revisionValidUntil(null), null);
  assert.equal(DEFAULT_PRICE_TTL_DAYS, 90);
});

test('เกินอายุ: เทียบวันนี้กับวันหมดอายุ', () => {
  const rev = { quotedAt: '2026-05-01T00:00:00Z' }; // หมดอายุ 2026-07-30
  assert.equal(isRevisionExpired(rev, '2026-07-15', 90), false);
  assert.equal(isRevisionExpired(rev, '2026-07-30', 90), false); // วันสุดท้ายยังใช้ได้
  assert.equal(isRevisionExpired(rev, '2026-07-31', 90), true);
  // ไม่มีข้อมูลพอ = ถือว่าต้องยืนยัน (ปลอดภัยไว้ก่อน)
  assert.equal(isRevisionExpired({}, '2026-07-15'), true);
});

test('bestPriceFor: ราคาทับรายลูกค้าก่อน ไม่มีค่อยราคากลาง', () => {
  const materials = [
    {
      id: 'm1', kind: 'PM', label: 'ขวดแก้ว 50ml', customerId: null, isHidden: false,
      revisions: [{ revisionNo: 1, unitBasis: 'per_piece', pricePerUnit: 10 }],
    },
    {
      id: 'm2', kind: 'PM', label: 'ขวดแก้ว 50ml', customerId: 'AR-1', isHidden: false,
      revisions: [{ revisionNo: 1, unitBasis: 'per_piece', pricePerUnit: 8 }],
    },
  ];
  // ลูกค้า AR-1 → ได้ราคาทับ (8)
  assert.equal(bestPriceFor(materials, { kind: 'PM', label: 'ขวดแก้ว 50ml', customerId: 'AR-1' }).material.id, 'm2');
  // ลูกค้าอื่น → ราคากลาง (10)
  assert.equal(bestPriceFor(materials, { kind: 'PM', label: 'ขวดแก้ว 50ml', customerId: 'AR-9' }).material.id, 'm1');
  // ไม่ระบุลูกค้า → ราคากลาง
  assert.equal(bestPriceFor(materials, { kind: 'PM', label: 'ขวดแก้ว 50ml' }).material.id, 'm1');
  // เทียบชื่อไม่สนตัวพิมพ์/ช่องว่างหน้าหลัง
  assert.ok(bestPriceFor(materials, { kind: 'PM', label: '  ขวดแก้ว 50ml  ' }));
  // ไม่เจอ
  assert.equal(bestPriceFor(materials, { kind: 'PM', label: 'ไม่มีของนี้' }), null);
  // ซ่อนแล้วไม่นับ
  assert.equal(bestPriceFor([{ ...materials[0], isHidden: true }], { kind: 'PM', label: 'ขวดแก้ว 50ml' }), null);
});

test('สิทธิ์ตอบราคาวัสดุ: เฉพาะฝ่ายเจ้าของ (RD=RM, PC=PM)', () => {
  const rd = { role: 'rd', department: 'RD' };
  const pc = { role: 'staff', department: 'PC' };
  assert.equal(canQuoteMaterial(rd, 'RM_F'), true);
  assert.equal(canQuoteMaterial(rd, 'PM'), false, 'RD ตอบราคา PM ไม่ได้');
  assert.equal(canQuoteMaterial(pc, 'PM'), true);
  assert.equal(canQuoteMaterial(pc, 'RM_FB'), false);
  // ส่งเป็นชื่อฝ่ายตรง ๆ ก็ได้
  assert.equal(canQuoteMaterial(rd, 'RD'), true);
  // ฝ่ายขาย/ผู้บริหารตอบแทนไม่ได้; admin ได้
  assert.equal(canQuoteMaterial({ role: 'ae', team: 'KA' }, 'PM'), false);
  assert.equal(canQuoteMaterial({ role: 'executive' }, 'RM_F'), false);
  assert.equal(canQuoteMaterial({ role: 'admin' }, 'PM'), true);
});

test('normalize บรรทัดคำถาม: ตัดช่องว่าง ผูกฝ่ายตามชนิด กันชื่อซ้ำ', () => {
  const { items, error } = normalizeMaterialRequestItems([
    { kind: 'PM', label: '  ขวดแก้ว   50ml ' },
    { kind: 'RM_F', label: 'หัวน้ำหอม A' },
  ]);
  assert.equal(error, null);
  assert.equal(items[0].label, 'ขวดแก้ว 50ml');
  assert.equal(items[0].sourceDept, 'PC');
  assert.equal(items[1].sourceDept, 'RD');
  assert.equal(items[0].sortOrder, 1);

  assert.match(normalizeMaterialRequestItems([]).error, /อย่างน้อย 1 รายการ/);
  assert.match(normalizeMaterialRequestItems([{ kind: 'labor', label: 'x' }]).error, /ชนิดวัสดุไม่ถูกต้อง/);
  assert.match(normalizeMaterialRequestItems([{ kind: 'PM', label: ' ' }]).error, /ต้องระบุชื่อวัสดุ/);
  assert.match(
    normalizeMaterialRequestItems([{ kind: 'PM', label: 'ขวด' }, { kind: 'PM', label: 'ขวด ' }]).error,
    /ชื่อวัสดุซ้ำ/,
  );
});

test('normalize ราคาที่ตอบ: ปฏิเสธว่าง/ติดลบ, ยอมรับ 0', () => {
  assert.equal(normalizeQuotedPrice('PM', '12.5').value, 12.5);
  assert.equal(normalizeQuotedPrice('PM', 0).value, 0);
  assert.match(normalizeQuotedPrice('PM', '').error, /ต้องระบุราคา/);
  assert.match(normalizeQuotedPrice('PM', null).error, /ต้องระบุราคา/);
  assert.match(normalizeQuotedPrice('PM', '-5').error, /ไม่ติดลบ/);
  assert.match(normalizeQuotedPrice('PM', 'abc').error, /ไม่ติดลบ/);
});
