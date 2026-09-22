// 🐞 ราคาทุกตัวบนทะเบียนกลิ่น/สูตรขึ้น "หมดอายุ" (2026-09-22) — `attachRegistryPrice` ส่ง `rev` (object) เป็น
// `todayIso` ให้ `materialPriceState` ⇒ String(object) = "[object Ob" เรียงเหนือทุกวันที่ ⇒ expired เสมอ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachRegistryPrice } from './scentFormulaAdmin.js';

// fake supabase ของสามตารางที่ loadMaterials อ่าน — คืนชุดตายตัว ไม่กรอง (แถวเดียวต่อเทสต์)
function fakeSupabase({ material, revision, tier }) {
  const result = (table) => {
    if (table === 'material_prices') return [material];
    if (table === 'material_price_revisions') return [revision];
    if (table === 'material_price_revision_tiers') return [tier];
    return [];
  };
  return {
    from(table) {
      const c = {
        select: () => c, eq: () => c, in: () => c, is: () => c,
        order: () => c,
        then: (resolve) => resolve({ data: result(table), error: null }),
      };
      return c;
    },
  };
}

const scent = { id: 'SCT-1', name: 'Rose' };
const material = { id: 'MAT-1', kind: 'RM_F', label: 'Rose', scentId: 'SCT-1', status: 'active' };
const tier = { revisionId: 'REV-1', qty: null, pricePerKg: 2800, pricePerUnit: null };

test('ราคาที่เพิ่งใส่ (ยังไม่ถึงวันยืนราคา) = ready ไม่ใช่ expired', async () => {
  const supabase = fakeSupabase({
    material, tier,
    revision: { id: 'REV-1', materialId: 'MAT-1', revisionNo: 1, unitBasis: 'per_kg', quotedAt: '2026-09-20T03:00:00Z', validUntil: '2026-12-31' },
  });
  const [row] = await attachRegistryPrice(supabase, [scent], { column: 'scentId', kind: 'RM_F', today: '2026-09-22' });
  assert.equal(row.price.state, 'ready');
  assert.equal(row.price.unitPrice, 2800);
});

test('ไม่มีวันยืนราคา = อายุมาตรฐานนับจากวันใส่ (ยังไม่เกิน) = ready', async () => {
  const supabase = fakeSupabase({
    material, tier,
    revision: { id: 'REV-1', materialId: 'MAT-1', revisionNo: 1, unitBasis: 'per_kg', quotedAt: '2026-09-20T03:00:00Z', validUntil: null },
  });
  const [row] = await attachRegistryPrice(supabase, [scent], { column: 'scentId', kind: 'RM_F', today: '2026-09-22' });
  assert.equal(row.price.state, 'ready');
});

test('เลยวันยืนราคาแล้ว = expired (ตัดสินจากวันที่จริง ไม่ใช่เสมอไป)', async () => {
  const supabase = fakeSupabase({
    material, tier,
    revision: { id: 'REV-1', materialId: 'MAT-1', revisionNo: 1, unitBasis: 'per_kg', quotedAt: '2026-01-01T03:00:00Z', validUntil: '2026-06-30' },
  });
  const [row] = await attachRegistryPrice(supabase, [scent], { column: 'scentId', kind: 'RM_F', today: '2026-09-22' });
  assert.equal(row.price.state, 'expired');
});

test('ไม่ส่ง today = วันนี้ตามนาฬิกาไทย (businessDate) — ห้ามส่ง rev เป็นวันที่อีก', () => {
  const src = readFileSync('src/lib/master/scentFormulaAdmin.js', 'utf8');
  assert.match(src, /today = businessDate\(\)/);
  assert.match(src, /materialPriceState\(m, today\)/);
  assert.ok(!/materialPriceState\(m, rev\)/.test(src));
});
