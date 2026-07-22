// เทียบใบขอราคาที่ส่งมากับของเดิม — จุดสำคัญคือ "ห้ามทำงานของฝ่ายอื่นหาย"
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockingChangeError,
  blockingTierError,
  normalizeCostingItems,
  normalizeTierQuantities,
  planItemChanges,
  planTierChanges,
  pricedTierCount,
  quotedComponentCount,
} from './costingReconcile.js';

const existing = [
  { id: 'i1', categoryCode: '01-006', productLabel: 'A', components: [], tiers: [] },
  { id: 'i2', categoryCode: '01-013', productLabel: 'B', components: [], tiers: [] },
];

test('planItemChanges: แถวไม่มี id = ของใหม่, หายจาก payload = ถูกลบ', () => {
  const plan = planItemChanges(existing, [
    { id: 'i1', categoryCode: '01-006', productLabel: 'A แก้ชื่อ' },
    { categoryCode: '01-013', productLabel: 'C ใหม่' },
  ]);
  assert.equal(plan.created.length, 1);
  assert.equal(plan.created[0].raw.productLabel, 'C ใหม่');
  assert.equal(plan.created[0].sortOrder, 2);
  assert.equal(plan.updated.length, 1);
  assert.equal(plan.updated[0].current.id, 'i1');
  assert.equal(plan.updated[0].categoryChanged, false);
  assert.deepEqual(plan.removed.map((i) => i.id), ['i2']);
});

test('planItemChanges: เปลี่ยนประเภทสินค้าถูกทำเครื่องหมายไว้ (ต้องกางบรรทัดใหม่)', () => {
  const plan = planItemChanges(existing, [{ id: 'i1', categoryCode: '01-009', productLabel: 'A' }]);
  assert.equal(plan.updated[0].categoryChanged, true);
});

test('planItemChanges: id ที่ไม่มีอยู่จริง ถือเป็นแถวใหม่ ไม่ใช่ error เงียบ', () => {
  const plan = planItemChanges(existing, [{ id: 'ไม่มีจริง', categoryCode: '01-006', productLabel: 'X' }]);
  assert.equal(plan.created.length, 1);
  assert.equal(plan.removed.length, 2);
});

test('นับงานที่ทำไปแล้ว: บรรทัดที่ตอบราคา และชั้นที่อนุมัติราคา', () => {
  const item = {
    components: [{ priceStatus: 'quoted' }, { priceStatus: 'pending' }, { priceStatus: 'quoted' }],
    tiers: [{ approvedUnitPrice: 100 }, { approvedUnitPrice: null }],
  };
  assert.equal(quotedComponentCount(item), 2);
  assert.equal(pricedTierCount(item), 1);
  assert.equal(quotedComponentCount(null), 0);
  assert.equal(pricedTierCount(undefined), 0);
});

test('บล็อกการลบรายการที่ฝ่ายอื่นตอบราคาแล้ว พร้อมบอกชื่อรายการ', () => {
  const err = blockingChangeError({
    removed: [{
      productLabel: 'Reed Diffuser 100ml',
      components: [{ priceStatus: 'quoted' }, { priceStatus: 'quoted' }],
      tiers: [],
    }],
  });
  assert.match(err, /Reed Diffuser 100ml/);
  assert.match(err, /2 บรรทัด/);
});

test('บล็อกการลบรายการที่ผู้บริหารอนุมัติราคาแล้ว', () => {
  const err = blockingChangeError({
    removed: [{ productLabel: 'B', components: [], tiers: [{ approvedUnitPrice: 90 }] }],
  });
  assert.match(err, /ผู้บริหารอนุมัติแล้ว/);
});

test('บล็อกการเปลี่ยนประเภทสินค้าที่มีราคาแล้ว (กางใหม่จะทำราคาหาย)', () => {
  const err = blockingChangeError({
    updated: [{
      current: { productLabel: 'A', components: [{ priceStatus: 'quoted' }], tiers: [] },
      categoryChanged: true,
    }],
  });
  assert.match(err, /เปลี่ยนประเภทสินค้า/);
  assert.match(err, /"A"/);
});

test('ไม่บล็อกเมื่อยังไม่มีใครตอบราคา — ลบ/เปลี่ยนประเภทได้ตามปกติ', () => {
  assert.equal(blockingChangeError({
    removed: [{ productLabel: 'A', components: [{ priceStatus: 'pending' }], tiers: [{ approvedUnitPrice: null }] }],
    updated: [{
      current: { productLabel: 'B', components: [{ priceStatus: 'pending' }], tiers: [] },
      categoryChanged: true,
    }],
  }), null);
  assert.equal(blockingChangeError({}), null);
});

test('ชั้นจำนวน: MOQ ถูกเติมให้เสมอ และเรียงน้อยไปมากแบบไม่ซ้ำ', () => {
  const plan = planTierChanges([{ id: 't1', qty: 500 }], [3000, 500], 1000);
  assert.deepEqual(plan.wanted, [500, 1000, 3000]);
  assert.deepEqual(plan.toAdd, [1000, 3000]);
  assert.equal(plan.toRemove.length, 0);
});

test('ชั้นจำนวน: ชั้นที่หายจากรายการใหม่ถูกจัดเป็นของที่ต้องลบ', () => {
  const plan = planTierChanges(
    [{ id: 't1', qty: 500 }, { id: 't2', qty: 2000 }],
    [500], 1000,
  );
  assert.deepEqual(plan.toRemove.map((t) => t.id), ['t2']);
  assert.deepEqual(plan.toAdd, [1000]);
});

test('บล็อกการลบชั้นจำนวนที่อนุมัติราคาแล้ว', () => {
  const err = blockingTierError('สินค้า A', [
    { qty: 3000, approvedUnitPrice: 88 },
    { qty: 5000, approvedUnitPrice: null },
  ]);
  assert.match(err, /3,000/);
  assert.match(err, /สินค้า A/);
  // ชั้นที่ยังไม่มีราคา ลบได้
  assert.equal(blockingTierError('A', [{ qty: 5000, approvedUnitPrice: null }]), null);
});

test('normalizeCostingItems: ตัดช่องว่าง ตรวจประเภท และปฏิเสธใบว่าง', () => {
  const { items, error } = normalizeCostingItems([
    { categoryCode: '01-006', productLabel: '  Reed   100ml ', fragranceName: ' กลิ่นA ' },
  ]);
  assert.equal(error, null);
  assert.equal(items[0].productLabel, 'Reed 100ml');
  assert.equal(items[0].fragranceName, 'กลิ่นA');
  assert.equal(items[0].id, null);

  assert.match(normalizeCostingItems([]).error, /อย่างน้อย 1 รายการ/);
  assert.match(normalizeCostingItems([{ categoryCode: '01-006', productLabel: ' ' }]).error, /ต้องระบุชื่อสินค้า/);
  assert.match(normalizeCostingItems([{ categoryCode: 'xx', productLabel: 'A' }]).error, /ต้องเลือกประเภทสินค้า/);
  const many = Array.from({ length: 31 }, () => ({ categoryCode: '01-006', productLabel: 'A' }));
  assert.match(normalizeCostingItems(many).error, /มากเกินไป/);
});

test('normalizeTierQuantities: รับตัวเลขมีจุลภาค ตัดค่าที่ใช้ไม่ได้ และจำกัดจำนวนชั้น', () => {
  assert.deepEqual(normalizeTierQuantities(['3,000', '500', '500', '0', 'abc']).quantities, [500, 3000]);
  assert.deepEqual(normalizeTierQuantities([]).quantities, []);
  assert.deepEqual(normalizeTierQuantities(null).quantities, []);
  const many = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  assert.match(normalizeTierQuantities(many).error, /มากเกินไป/);
});
