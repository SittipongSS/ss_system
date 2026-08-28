// ทะเบียนวัสดุ (mig 0143 + 0157) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  DEFAULT_PRICE_TTL_DAYS,
  MATERIAL_KINDS,
  canQuoteMaterial,
  findMaterialByIdentity,
  isRevisionExpired,
  latestRevision,
  materialIdentityKey,
  materialPriceState,
  normalizeMaterialInput,
  normalizeQuotedPrice,
  normalizeTiers,
  revisionPriceRange,
  revisionTiers,
  revisionUnitPrice,
  revisionValidUntil,
  sourceDeptForMaterialKind,
  tierForQty,
  unitBasisForMaterialKind,
} from './materialPrices.js';

// ราคาอยู่ที่ชั้น (0157) — helper ประกอบรุ่นให้อ่านง่ายในเทสต์
const piece = (...tiers) => ({
  unitBasis: 'per_piece',
  tiers: tiers.map(([qty, price], i) => ({ id: `t${i}`, qty, pricePerUnit: price })),
});
const kg = (price, qty = null) => ({
  unitBasis: 'per_kg',
  tiers: [{ id: 't0', qty, pricePerKg: price }],
});

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
  assert.equal(revisionUnitPrice(kg(1200)), 1200);
  assert.equal(revisionUnitPrice(piece([null, 8])), 8);
  assert.equal(revisionUnitPrice({ unitBasis: 'per_kg', tiers: [] }), null);
  assert.equal(revisionUnitPrice(null), null);
  assert.equal(revisionUnitPrice(piece([null, 0])), 0, 'ราคา 0 คือ "ฟรี" ไม่ใช่ "ไม่รู้"');
  // ราคาอยู่ผิดช่องกับหน่วยของรุ่น = ไม่นับ (กันอ่านข้ามหน่วยแล้วเพี้ยนเงียบ)
  assert.equal(revisionUnitPrice({ unitBasis: 'per_kg', tiers: [{ pricePerUnit: 8 }] }), null);
});

test('ชั้นจำนวน: เรียงจากน้อยไปมาก ชั้นไม่แบ่งชั้นมาก่อน', () => {
  const rev = piece([5000, 6], [1000, 9], [3000, 7]);
  assert.deepEqual(revisionTiers(rev).map((t) => t.qty), [1000, 3000, 5000]);
  assert.deepEqual(revisionTiers(piece([1000, 9], [null, 12])).map((t) => t.qty), [null, 1000]);
  assert.deepEqual(revisionTiers(null), []);
});

test('เลือกชั้นตามจำนวน: ชั้นสูงสุดที่ยังไม่เกินจำนวนที่สั่ง', () => {
  const rev = piece([1000, 9], [3000, 7], [5000, 6]);
  assert.equal(revisionUnitPrice(rev, 1000), 9);
  assert.equal(revisionUnitPrice(rev, 2999), 9, 'ยังไม่ถึงชั้น 3000');
  assert.equal(revisionUnitPrice(rev, 3000), 7);
  assert.equal(revisionUnitPrice(rev, 99999), 6, 'เกินชั้นสูงสุด = ใช้ชั้นสูงสุด');
  // ไม่ระบุจำนวน = ชั้นตั้งต้น (ต่ำสุด) ไม่ใช่ราคาถูกที่สุด
  assert.equal(revisionUnitPrice(rev), 9);

  // สั่งน้อยกว่าชั้นต่ำสุดที่มี → ต้องบอกว่า below ไม่ใช่เงียบ ๆ ให้ราคาล็อตใหญ่
  const below = tierForQty(rev, 500);
  assert.equal(below.below, true);
  assert.equal(below.tier.qty, 1000);
  assert.equal(tierForQty(rev, 1000).below, false);
});

test('ช่วงราคาของรุ่น (ไว้แสดงในตาราง)', () => {
  assert.deepEqual(revisionPriceRange(piece([1000, 9], [5000, 6])), { min: 6, max: 9, count: 2 });
  assert.deepEqual(revisionPriceRange(kg(1200)), { min: 1200, max: 1200, count: 1 });
  assert.equal(revisionPriceRange({ unitBasis: 'per_kg', tiers: [] }), null);
});

test('normalize ชั้นราคา: ชั้นเดียวไม่ต้องมีจำนวน หลายชั้นต้องมีทุกชั้น', () => {
  assert.deepEqual(normalizeTiers([{ qty: '', price: '12.5' }]).tiers, [{ qty: null, price: 12.5 }]);
  // เรียงให้เองเสมอ ไม่ต้องพึ่งลำดับที่ผู้ใช้กรอก
  assert.deepEqual(
    normalizeTiers([{ qty: 5000, price: 6 }, { qty: 1000, price: 9 }]).tiers,
    [{ qty: 1000, price: 9 }, { qty: 5000, price: 6 }],
  );
  assert.match(normalizeTiers([]).error, /อย่างน้อย 1 ชั้น/);
  assert.match(normalizeTiers([{ price: '' }]).error, /ต้องระบุราคา/);
  assert.match(normalizeTiers([{ qty: 0, price: 5 }]).error, /มากกว่า 0/);
  assert.match(
    normalizeTiers([{ qty: 1000, price: 9 }, { qty: '', price: 8 }]).error,
    /ต้องระบุจำนวนเมื่อมีมากกว่า 1 ชั้น/,
  );
  assert.match(
    normalizeTiers([{ qty: 1000, price: 9 }, { qty: 1000, price: 8 }]).error,
    /จำนวนซ้ำ/,
  );
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

test('ตัวตนวัสดุ: RM แยกด้วยสูตร ไม่ใช่ชื่อ', () => {
  const base = { kind: 'RM_F', label: 'หัวน้ำหอม Lavender', customerId: null };
  // ⚠️ นี่คือหัวใจของบั๊ก "ราคา F สองสูตรทับกัน": ชื่อเหมือนกันเป๊ะแต่คนละสูตร
  // mig 0181: ตัวตนยึด formulaId ของทะเบียน ไม่ใช่รหัสที่พิมพ์เอง (text)
  assert.notEqual(
    materialIdentityKey({ ...base, formulaId: 'FML-01' }),
    materialIdentityKey({ ...base, formulaId: 'FML-02' }),
  );
  // ⚠️ รหัสสูตรที่พิมพ์เองต้อง **ไม่มีผลกับตัวตนอีกแล้ว** — ไม่งั้นจะกลับไปเป็น
  // "จับคู่ด้วยข้อความ" ซึ่งเป็นบั๊กที่ mig 0181 มาแก้พอดี
  assert.equal(
    materialIdentityKey({ ...base, formulaId: 'FML-01', formulaCode: 'พิมพ์อะไรก็ได้' }),
    materialIdentityKey({ ...base, formulaId: 'FML-01' }),
  );
  // ชื่อต่างที่ช่องว่าง/ตัวพิมพ์ = ตัวเดียวกัน (ต้องตรงกับ unique index ใน DB)
  assert.equal(
    materialIdentityKey({ kind: 'PM', label: '  ขวดแก้ว   50ML ' }),
    materialIdentityKey({ kind: 'PM', label: 'ขวดแก้ว 50ml' }),
  );
  // ราคากลาง vs ทับรายลูกค้า = คนละตัว
  assert.notEqual(
    materialIdentityKey({ kind: 'PM', label: 'ขวด', customerId: null }),
    materialIdentityKey({ kind: 'PM', label: 'ขวด', customerId: 'AR-1' }),
  );

  const list = [{ kind: 'PM', label: 'ขวดแก้ว 50ml', customerId: null }];
  assert.ok(findMaterialByIdentity(list, { kind: 'PM', label: 'ขวดแก้ว 50ML' }));
  assert.equal(findMaterialByIdentity(list, { kind: 'PM', label: 'ฝา' }), null);
});

test('สถานะราคาของวัสดุ: ร่าง / ไม่มีราคา / เกินอายุ / พร้อมใช้', () => {
  const today = '2026-07-26';
  const fresh = { revisionNo: 2, validUntil: '2026-12-31', ...piece([null, 8]) };
  const stale = { revisionNo: 1, validUntil: '2026-01-01', ...piece([null, 9]) };

  assert.equal(materialPriceState({ status: 'draft', revisions: [fresh] }, today), 'draft',
    'ร่างต้องชนะทุกอย่าง — ยังไม่มีใครรับเข้าทะเบียน');
  assert.equal(materialPriceState({ status: 'archived', revisions: [fresh] }, today), 'archived');
  assert.equal(materialPriceState({ status: 'active', revisions: [] }, today), 'no_price');
  assert.equal(materialPriceState({ status: 'active', revisions: [stale] }, today), 'expired');
  assert.equal(materialPriceState({ status: 'active', revisions: [stale, fresh] }, today), 'ready',
    'ดูรุ่นล่าสุดเท่านั้น ไม่ใช่รุ่นแรก');
  assert.equal(materialPriceState(null, today), 'no_price');
});

test('normalize ข้อมูลวัสดุ: ผูกฝ่ายตามชนิด · PM ห้ามมีสูตร', () => {
  const { value, error } = normalizeMaterialInput({
    kind: 'RM_F', label: '  หัวน้ำหอม   A ', formulaId: ' FML-01 ',
  });
  assert.equal(error, null);
  assert.equal(value.label, 'หัวน้ำหอม A');
  assert.equal(value.sourceDept, 'RD');
  assert.equal(value.formulaId, 'FML-01');
  // ⚠️ ชื่อ/รหัสสูตรไม่ผ่าน normalize อีกแล้ว — เป็น snapshot ที่ server ดึงจาก
  // ทะเบียนเอง (formulaSnapshotFor) client พิมพ์ส่งมาเองไม่ได้
  assert.equal(value.formulaCode, undefined);
  assert.equal(value.formulaName, undefined);

  assert.equal(normalizeMaterialInput({ kind: 'PM', label: 'ขวด' }).value.sourceDept, 'PC');
  assert.match(normalizeMaterialInput({ kind: 'labor', label: 'x' }).error, /ชนิดวัสดุไม่ถูกต้อง/);
  assert.match(normalizeMaterialInput({ kind: 'PM', label: '  ' }).error, /ต้องระบุชื่อวัสดุ/);
  assert.match(
    normalizeMaterialInput({ kind: 'PM', label: 'ขวด', formulaId: 'FML-01' }).error,
    /ไม่ผูกกับสูตร/,
  );
});

test('สิทธิ์ตอบราคาวัสดุ: เฉพาะฝ่ายเจ้าของ (RD=RM, PC=PM)', () => {
  const rd = { role: 'rd', department: 'RD' };
  const pc = { role: 'pc', department: 'PC' };
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

test('normalize ราคาที่ตอบ: ปฏิเสธว่าง/ติดลบ, ยอมรับ 0', () => {
  assert.equal(normalizeQuotedPrice('PM', '12.5').value, 12.5);
  assert.equal(normalizeQuotedPrice('PM', 0).value, 0);
  assert.match(normalizeQuotedPrice('PM', '').error, /ต้องระบุราคา/);
  assert.match(normalizeQuotedPrice('PM', null).error, /ต้องระบุราคา/);
  assert.match(normalizeQuotedPrice('PM', '-5').error, /ไม่ติดลบ/);
  assert.match(normalizeQuotedPrice('PM', 'abc').error, /ไม่ติดลบ/);
});

// ── ตัวตนในโค้ดต้องตรงกับ unique index ใน DB ─────────────────────────────
// ⚠️ ถ้าสองอย่างนี้หลุดจากกัน ฝั่งแอปจะคิดว่าเป็นวัสดุคนละตัวแล้วยิง insert ไปชน
// constraint → ผู้ใช้เห็น error ดิบของ Postgres แทนข้อความที่อ่านรู้เรื่อง
// (เคยเขียนเตือนไว้ใน mig 0157/0171 แล้วแต่ไม่มีอะไรบังคับ — ใบนี้บังคับ)
test('materialIdentityKey ตรงกับคอลัมน์ใน material_prices_identity_uk', () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  // ใบล่าสุดที่ประกาศ index นี้ = นิยามที่ใช้จริงบน prod
  let definition = null;
  for (const f of files) {
    const sql = readFileSync(new URL(f, dir), 'utf8');
    const m = sql.match(/CREATE UNIQUE INDEX[^;]*material_prices_identity_uk[^;]*;/s);
    if (m) definition = m[0];
  }
  assert.ok(definition, 'หา material_prices_identity_uk ในไฟล์ migration ไม่เจอ');
  for (const col of ['kind', 'label', 'formulaId', 'customerId']) {
    assert.match(definition, new RegExp(col), `index ต้องมี ${col}`);
  }
  // ตัวที่ **ต้องไม่มี** แล้ว — ถ้าใครเผลอเอา formulaCode กลับเข้า index
  // แต่ลืมแก้โค้ด (หรือกลับกัน) เทสต์นี้จะจับได้
  assert.doesNotMatch(definition, /formulaCode/, 'ตัวตนเลิกใช้ formulaCode แล้ว (mig 0181)');
  const key = materialIdentityKey({ kind: 'RM_F', label: 'x', formulaId: 'F1', customerId: 'C1' });
  assert.equal(key, 'RM_F::x::F1::C1');
});
