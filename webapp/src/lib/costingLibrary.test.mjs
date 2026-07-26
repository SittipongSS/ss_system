// เชื่อมใบขอราคาผลิต ↔ ทะเบียนวัสดุ (0157–0159) — logic ล้วน
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  componentFillFromRevision,
  componentLibraryStatus,
  componentSnapshotExpired,
  libraryPricingBlocker,
  suggestedTierForComponent,
  suggestedTierQty,
} from './costingLibrary.js';

// ราคาอยู่ที่ชั้นจำนวน (0157) ไม่ได้อยู่บนตัว revision แล้ว
const materials = [
  {
    id: 'm1', kind: 'PM', label: 'ขวดแก้ว 50ml', customerId: null, status: 'active',
    revisions: [{
      id: 'r1', revisionNo: 1, materialId: 'm1', unitBasis: 'per_piece',
      quotedAt: '2026-05-01T00:00:00Z',
      tiers: [
        { id: 'r1t1', qty: 1000, pricePerUnit: 10 },
        { id: 'r1t2', qty: 3000, pricePerUnit: 8 },
      ],
    }],
  },
  // เซลเสนอเข้ามา ยังไม่มีใครรับ — ใช้ในใบไม่ได้
  { id: 'm2', kind: 'PM', label: 'ฝาไม้', customerId: null, status: 'draft', revisions: [] },
  // รับเข้าทะเบียนแล้วแต่ยังไม่มีใครใส่ราคา
  { id: 'm3', kind: 'PM', label: 'กล่องนอก', customerId: null, status: 'active', revisions: [] },
];
const today = '2026-07-15'; // ก่อน r1 หมดอายุ (2026-07-30)

const line = (patch = {}) => ({
  id: 'c1', kind: 'PM', sourceDept: 'PC', label: 'ขวด', unitBasis: 'per_piece', ...patch,
});

test('สถานะบรรทัดยึด materialId ไม่ใช่ชื่อ: internal/unlinked/missing/draft/no_price/ready', () => {
  const at = { todayIso: today };
  assert.equal(componentLibraryStatus(line({ sourceDept: null }), materials, at).status, 'internal');
  // ชื่อตรงเป๊ะแต่ไม่ได้ผูก id = ยังไม่ผูก (ของเดิมเดาให้เอง — นั่นคือบั๊ก 4)
  assert.equal(componentLibraryStatus(line({ label: 'ขวดแก้ว 50ml' }), materials, at).status, 'unlinked');
  assert.equal(componentLibraryStatus(line({ materialId: 'm1' }), materials, at).status, 'ready');
  assert.equal(componentLibraryStatus(line({ materialId: 'm2' }), materials, at).status, 'draft');
  assert.equal(componentLibraryStatus(line({ materialId: 'm3' }), materials, at).status, 'no_price');
  assert.equal(componentLibraryStatus(line({ materialId: 'ไม่มีตัวนี้' }), materials, at).status, 'missing');
  assert.equal(
    componentLibraryStatus(line({ materialId: 'm1' }), materials, { todayIso: '2026-08-01' }).status,
    'expired',
  );
});

test('ชั้นที่เลือกต่ำกว่าชั้นต่ำสุดที่มี ต้องติดธง ไม่ใช่เงียบ ๆ ใช้ชั้นอื่น', () => {
  const at = { todayIso: today };
  assert.equal(componentLibraryStatus(line({ materialId: 'm1', priceTierQty: 3000 }), materials, at).tierBelow, false);
  const below = componentLibraryStatus(line({ materialId: 'm1', priceTierQty: 500 }), materials, at);
  assert.equal(below.tierBelow, true);
  assert.equal(below.tier.qty, 1000);
});

test('ค่าที่เขียนลงบรรทัด: snapshot ราคาค่าเดียวของชั้นที่เลือก + ตัวชี้ทะเบียน', () => {
  const rev = materials[0].revisions[0];
  assert.deepEqual(componentFillFromRevision(rev, { tierQty: 3000 }), {
    pricePerUnit: 8, pricePerKg: null,
    materialId: 'm1', materialRevisionId: 'r1',
    priceTierQty: 3000, priceStatus: 'quoted',
  });
  // ไม่ระบุชั้น = ชั้นต่ำสุด
  assert.equal(componentFillFromRevision(rev).pricePerUnit, 10);
  assert.equal(componentFillFromRevision(rev).priceTierQty, null);
  // per_kg ลงช่อง pricePerKg
  const revKg = {
    id: 'r2', materialId: 'm9', unitBasis: 'per_kg',
    tiers: [{ id: 'r2t0', qty: null, pricePerKg: 1200 }],
  };
  assert.equal(componentFillFromRevision(revKg).pricePerKg, 1200);
  assert.equal(componentFillFromRevision(revKg).pricePerUnit, null);
  // ไม่มีชั้นราคา → null (ไม่เขียนอะไร)
  assert.equal(componentFillFromRevision({ unitBasis: 'per_kg', tiers: [] }), null);
});

test('snapshot บนบรรทัดเกินอายุ ดูจากรุ่นที่บรรทัดตรึงไว้ ไม่ใช่รุ่นล่าสุด', () => {
  const quoted = line({ materialId: 'm1', materialRevisionId: 'r1', priceStatus: 'quoted', pricePerUnit: 10 });
  assert.equal(componentSnapshotExpired(quoted, materials, today), false);
  assert.equal(componentSnapshotExpired(quoted, materials, '2026-08-01'), true);
  // ยังไม่มีราคาบนบรรทัด = ไม่มีอะไรให้หมดอายุ
  assert.equal(componentSnapshotExpired(line({ materialId: 'm1' }), materials, '2026-08-01'), false);
});

test('ด่านส่งผู้บริหาร: ยังไม่ผูกวัสดุ / วัสดุร่าง / ไม่มีราคา / เคสค้าง / กรัมว่าง', () => {
  const at = { todayIso: today };
  const items = (component) => [{ productLabel: 'A', components: [{ required: true, ...component }] }];

  assert.match(libraryPricingBlocker(items(line()), materials, at), /ยังไม่ได้เลือกวัสดุ/);
  assert.match(libraryPricingBlocker(items(line({ materialId: 'm2' })), materials, at), /ยังเป็นร่าง/);
  assert.match(libraryPricingBlocker(items(line({ materialId: 'm3' })), materials, at), /ยังไม่มีราคาในทะเบียน/);
  assert.match(libraryPricingBlocker(items(line({ materialId: 'ลบไปแล้ว' })), materials, at), /เก็บเข้ากรุ/);
  // ผูกแล้วมีราคาในทะเบียน แต่ยังไม่ได้ดึงลงบรรทัด
  assert.match(libraryPricingBlocker(items(line({ materialId: 'm1' })), materials, at), /ยังไม่ได้ดึงราคา/);
  // ราคาที่ตรึงไว้เกินอายุ
  assert.match(
    libraryPricingBlocker(
      items(line({ materialId: 'm1', materialRevisionId: 'r1', priceStatus: 'quoted', pricePerUnit: 10 })),
      materials, { todayIso: '2026-08-01' },
    ),
    /เกินอายุ/,
  );
  // มีเคสขอราคาค้างอยู่
  assert.match(
    libraryPricingBlocker(items(line({ materialId: 'm1' })), materials,
      { ...at, pendingAskComponentIds: new Set(['c1']) }),
    /มีเคสขอราคาค้างอยู่/,
  );
  // per_kg ที่ไม่มีกรัม บล็อกแม้ราคาครบ (บั๊ก 3)
  assert.match(
    libraryPricingBlocker(items({
      id: 'c2', kind: 'RM_F', sourceDept: 'RD', label: 'หัวน้ำหอม', unitBasis: 'per_kg',
      materialId: 'm1', priceStatus: 'quoted', pricePerKg: 1200,
    }), materials, at),
    /ยังไม่ได้ระบุกรัม/,
  );
});

test('ด่านส่งผู้บริหาร: ผ่านเมื่อทุกบรรทัดมีราคาพร้อม', () => {
  const at = { todayIso: today };
  assert.equal(
    libraryPricingBlocker([{
      productLabel: 'A',
      components: [
        line({ materialId: 'm1', materialRevisionId: 'r1', required: true, priceStatus: 'quoted', pricePerUnit: 10 }),
        { kind: 'labor', sourceDept: null, label: 'ค่าบรรจุ', required: true },   // ภายใน ข้าม
        line({ id: 'c9', label: 'ไม่บังคับ', required: false }),                   // ไม่บังคับ ข้าม
      ],
    }], materials, at),
    null,
  );
});

test('คำแนะนำชั้นราคา: 3 SKU × 1000 = 3000 → แนะนำชั้น 3000 (แนะนำ ไม่บังคับ)', () => {
  const request = { moq: 1000, items: [{}, {}, {}] };
  assert.equal(suggestedTierQty(request), 3000);
  assert.equal(suggestedTierForComponent(materials[0], 3000), 3000);
  // ใบเล็กกว่าชั้นต่ำสุด = ไม่แนะนำอะไร ปล่อยให้เซลตัดสิน
  assert.equal(suggestedTierForComponent(materials[0], 500), null);
  // วัสดุที่ไม่มีชั้น (ราคาเดียว) ไม่มีอะไรให้แนะนำ
  assert.equal(suggestedTierForComponent(materials[2], 3000), null);
  assert.equal(suggestedTierQty({ moq: 0, items: [{}] }), null);
  assert.equal(suggestedTierQty({ moq: 1000, items: [] }), 1000, 'ใบยังไม่มีสินค้า = อย่างน้อย 1 SKU');
});
