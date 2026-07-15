import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceMasterPrices, fgLineDescription, normalizeManualLines, refreshFgLinesForDisplay } from './quoteLines.js';

// stub supabase: คืนราคา master ตาม map ที่กำหนด
const fakeSupabase = (products) => ({
  from: (table) => {
    assert.equal(table, 'products');
    return {
      select: () => ({
        in: async (col, ids) => ({
          data: products.filter((p) => ids.includes(p.id)),
          error: null,
        }),
      }),
    };
  },
});

const fgLine = (over = {}) => normalizeManualLines([{
  productId: 'P1', fgCode: 'FG-001', description: 'สินค้า A', qty: 2, unitPrice: 999,
  discountType: null, discountValue: 0, ...over,
}])[0];

test('FG line price is overridden by master price (client value ignored)', async () => {
  const lines = await enforceMasterPrices(fakeSupabase([{ id: 'P1', retailPriceIncVat: 150 }]), [fgLine()]);
  assert.equal(lines[0].unitPrice, 150);
  assert.equal(lines[0].lineTotal, 300); // qty 2 × 150 คิดยอดใหม่
});

test('line discount is recomputed from the enforced price', async () => {
  const line = fgLine({ discountType: 'percent', discountValue: 10 });
  const lines = await enforceMasterPrices(fakeSupabase([{ id: 'P1', retailPriceIncVat: 100 }]), [line]);
  assert.equal(lines[0].unitPrice, 100);
  assert.equal(lines[0].discountAmount, 20); // 10% ของ 2×100
  assert.equal(lines[0].lineTotal, 180);
});

test('manual lines (no productId) pass through untouched', async () => {
  const manual = normalizeManualLines([{ description: 'ค่าบริการ', qty: 1, unitPrice: 500 }]);
  const lines = await enforceMasterPrices(fakeSupabase([]), manual);
  assert.equal(lines[0].unitPrice, 500);
});

test('FG line description/code are refreshed from master (brand · name · volume)', async () => {
  const master = [{
    id: 'P1', fgCode: 'FG-001', brandName: 'แบรนด์เอ', productDescription: 'น้ำหอมส้ม',
    volume: 50, volumeUnit: 'ml', retailPriceIncVat: 150,
  }];
  const lines = await enforceMasterPrices(fakeSupabase(master), [fgLine({ description: 'ชื่อเก่า' })]);
  assert.equal(lines[0].description, 'แบรนด์เอ · น้ำหอมส้ม · 50 ml');
  assert.equal(lines[0].fgCode, 'FG-001');
});

test('product missing from master falls back to previously saved price/description', async () => {
  const prev = [{ productId: 'P1', unitPrice: 120, description: 'คำอธิบายเดิม', fgCode: 'FG-OLD' }];
  const lines = await enforceMasterPrices(fakeSupabase([]), [fgLine()], prev);
  assert.equal(lines[0].unitPrice, 120);
  assert.equal(lines[0].description, 'คำอธิบายเดิม');
  assert.equal(lines[0].fgCode, 'FG-OLD');
});

test('product missing from master and no previous line keeps client price', async () => {
  const lines = await enforceMasterPrices(fakeSupabase([]), [fgLine()]);
  assert.equal(lines[0].unitPrice, 999);
});

test('no FG lines → no products query needed', async () => {
  const neverCalled = { from: () => { throw new Error('must not query'); } };
  const manual = normalizeManualLines([{ description: 'ค่าออกแบบ', qty: 1, unitPrice: 1000 }]);
  const lines = await enforceMasterPrices(neverCalled, manual);
  assert.equal(lines[0].unitPrice, 1000);
});

test('refreshFgLinesForDisplay updates editable quotes only, final quotes stay frozen', async () => {
  const master = [{ id: 'P1', fgCode: 'FG-001', brandName: 'แบรนด์เอ', productDescription: 'น้ำหอมส้ม', volume: 50, volumeUnit: 'ml' }];
  const mkQuote = (status) => ({ status, lines: [{ productId: 'P1', description: 'ชื่อเก่า', fgCode: 'FG-001' }] });
  const draft = mkQuote('draft');
  const accepted = mkQuote('accepted');
  const closed = mkQuote('closed');
  await refreshFgLinesForDisplay(fakeSupabase(master), [draft, accepted, closed]);
  assert.equal(draft.lines[0].description, 'แบรนด์เอ · น้ำหอมส้ม · 50 ml');
  assert.equal(accepted.lines[0].description, 'ชื่อเก่า'); // หลักฐาน ณ วันปิด
  assert.equal(closed.lines[0].description, 'ชื่อเก่า');
});

test('fgLineDescription composes brand · name · volume', () => {
  assert.equal(
    fgLineDescription({ brandName: 'แบรนด์เอ', productDescription: 'น้ำหอมส้ม', volume: 50, volumeUnit: 'ml' }),
    'แบรนด์เอ · น้ำหอมส้ม · 50 ml',
  );
  // แบรนด์ EN-only + ไม่มีปริมาตร
  assert.equal(
    fgLineDescription({ brandNameEn: 'Brand B', productDescriptionEn: 'Citrus' }),
    'Brand B · Citrus',
  );
  // ไม่มีข้อมูลเลย → fallback productLabel (fgCode/สินค้า)
  assert.equal(fgLineDescription({ fgCode: 'FG-9' }), 'FG-9');
  assert.equal(fgLineDescription({}), 'สินค้า');
});
