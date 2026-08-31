import test from 'node:test';
import assert from 'node:assert/strict';
import {
  customerMismatchMessage,
  customerMismatchedLines,
  enforceMasterPrices,
  fgLineBrand,
  fgLineDescription,
  masterPriceState,
  normalizeManualLines,
  refreshFgLinesForDisplay,
} from './quoteLines.js';

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

// ราคาขายในใบ = ราคาผลิต (costPrice) ทั้งระบบ (มติ 2026-07-19);
// retailPriceIncVat มีไว้คำนวณสรรพสามิตเท่านั้น — ห้ามหลุดมาเป็นราคาใบ
test('FG line price is overridden by factory price (client + retail ignored)', async () => {
  const lines = await enforceMasterPrices(fakeSupabase([{ id: 'P1', costPrice: 150, retailPriceIncVat: 999 }]), [fgLine()]);
  assert.equal(lines[0].unitPrice, 150);
  assert.equal(lines[0].lineTotal, 300); // qty 2 × 150 คิดยอดใหม่
});

test('line discount is recomputed from the enforced price', async () => {
  const line = fgLine({ discountType: 'percent', discountValue: 10 });
  const lines = await enforceMasterPrices(fakeSupabase([{ id: 'P1', costPrice: 100 }]), [line]);
  assert.equal(lines[0].unitPrice, 100);
  assert.equal(lines[0].discountAmount, 20); // 10% ของ 2×100
  assert.equal(lines[0].lineTotal, 180);
});

test('manual lines (no productId) pass through untouched', async () => {
  const manual = normalizeManualLines([{ description: 'ค่าบริการ', qty: 1, unitPrice: 500 }]);
  const lines = await enforceMasterPrices(fakeSupabase([]), manual);
  assert.equal(lines[0].unitPrice, 500);
});

test('FG line identity is refreshed from master without duplicating brand in description', async () => {
  const master = [{
    id: 'P1', fgCode: 'FG-001', brandName: 'แบรนด์เอ', brandNameEn: 'BRAND A', productDescription: 'น้ำหอมส้ม',
    volume: 50, volumeUnit: 'ml', costPrice: 150,
  }];
  const lines = await enforceMasterPrices(fakeSupabase(master), [fgLine({ description: 'ชื่อเก่า' })]);
  assert.equal(lines[0].description, 'น้ำหอมส้ม · 50 ml');
  assert.equal(lines[0].fgCode, 'FG-001');
  assert.equal(lines[0].metadata.productBrand, 'BRAND A');
});

test('master with no factory price keeps previously saved price — never zeroes the quote', async () => {
  // บั๊กจริง 2026-07-15: master ยังไม่ตั้งราคา → ราคาในใบโดนทับเป็น 0 → ยอดใบเป็น 0
  // (ตอนนั้นกด Won ไม่ได้เลย; ตั้งแต่มติ 2026-08-03 ยอด 0 ปิด Won ได้ ใบจึงยิ่งต้อง
  // ไม่ถูกทับเป็น 0 เงียบ ๆ เพราะจะกลายเป็นดีลมูลค่า 0 โดยไม่มีใครทัก)
  for (const costPrice of [0, null, undefined]) {
    const master = [{ id: 'P1', fgCode: 'FG-001', productDescription: 'น้ำหอมส้ม', costPrice }];
    const prev = [{ productId: 'P1', unitPrice: 150 }];
    const lines = await enforceMasterPrices(fakeSupabase(master), [fgLine()], prev);
    assert.equal(lines[0].unitPrice, 150, `costPrice ${costPrice} must keep saved price`);
    assert.equal(lines[0].lineTotal, 300);
    assert.equal(lines[0].description, 'น้ำหอมส้ม'); // คำอธิบายยัง refresh จาก master
  }
});

test('master with no factory price and no saved price → 0 (client can never set FG prices)', async () => {
  const master = [{ id: 'P1', fgCode: 'FG-001', productDescription: 'น้ำหอมส้ม', costPrice: 0 }];
  const lines = await enforceMasterPrices(fakeSupabase(master), [fgLine()]); // client ส่ง 999 มา
  assert.equal(lines[0].unitPrice, 0); // ห้ามใช้ค่าจาก client — ต้องไปตั้งราคาที่ฐานข้อมูล
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
  const master = [{ id: 'P1', fgCode: 'FG-001', brandName: 'แบรนด์เอ', brandNameEn: 'BRAND A', productDescription: 'น้ำหอมส้ม', volume: 50, volumeUnit: 'ml' }];
  const mkQuote = (status) => ({ status, lines: [{ productId: 'P1', description: 'ชื่อเก่า', fgCode: 'FG-001' }] });
  const draft = mkQuote('draft');
  const accepted = mkQuote('accepted');
  const closed = mkQuote('closed');
  await refreshFgLinesForDisplay(fakeSupabase(master), [draft, accepted, closed]);
  assert.equal(draft.lines[0].description, 'น้ำหอมส้ม · 50 ml');
  assert.equal(draft.lines[0].metadata.productBrand, 'BRAND A');
  assert.equal(accepted.lines[0].description, 'ชื่อเก่า'); // หลักฐาน ณ วันปิด
  assert.equal(accepted.lines[0].metadata, undefined);
  assert.equal(closed.lines[0].description, 'ชื่อเก่า');
});

test('FG identity separates preferred brand from product name and volume', () => {
  assert.equal(
    fgLineDescription({ brandName: 'แบรนด์เอ', productDescription: 'น้ำหอมส้ม', volume: 50, volumeUnit: 'ml' }),
    'น้ำหอมส้ม · 50 ml',
  );
  assert.equal(
    fgLineDescription({ brandNameEn: 'Brand B', productDescriptionEn: 'Citrus' }),
    'Citrus',
  );
  assert.equal(fgLineBrand({ brandName: 'แบรนด์บี', brandNameEn: 'Brand B' }), 'Brand B');
  // ไม่มีข้อมูลเลย → fallback productLabel (fgCode/สินค้า)
  assert.equal(fgLineDescription({ fgCode: 'FG-9' }), 'FG-9');
  assert.equal(fgLineDescription({}), 'สินค้า');
});

// ── หน่วยขาย ────────────────────────────────────────────────────────────────

test('บรรทัดที่พิมพ์เองเก็บหน่วยที่ผู้ใช้เลือก (ไม่มี master ให้ผูก)', () => {
  const [line] = normalizeManualLines([{ description: 'ค่าออกแบบ', qty: 1, unitPrice: 5000, unit: 'งาน' }]);
  assert.equal(line.unit, 'งาน');
});

test('หน่วยที่ไม่ได้ระบุ/ยาวผิดปกติจาก client ถูกกันไว้ที่ server', () => {
  assert.equal(normalizeManualLines([{ description: 'ค่าบริการ', qty: 1 }])[0].unit, 'ชิ้น');
  assert.equal(normalizeManualLines([{ description: 'ค่าบริการ', qty: 1, unit: '   ' }])[0].unit, 'ชิ้น');
  // คอลัมน์หน่วยบนเอกสาร A4 แคบ — ค่ายาวผิดปกติต้องไม่ดันตารางเสียรูป
  assert.equal(normalizeManualLines([{ description: 'ค่าบริการ', qty: 1, unit: 'ก'.repeat(90) }])[0].unit.length, 20);
});

test('บรรทัดที่ผูกสินค้ายังถูกทับด้วยหน่วยจาก master เสมอ (กติกาเดิม 2026-07-23)', async () => {
  // ผู้ใช้/client ส่งหน่วยอะไรมาก็ไม่มีผลกับบรรทัด FG — ผูกกับฐานข้อมูลสินค้าเหมือนราคา
  const lines = await enforceMasterPrices(
    fakeSupabase([{ id: 'P1', costPrice: 100, saleUnit: 'ขวด' }]),
    [fgLine({ unit: 'งาน' })],
  );
  assert.equal(lines[0].unit, 'ขวด');
});

test('ส่วนลด % เกิน 100 ถูกตัดเหลือ 100 ตั้งแต่ตอนบันทึก — ป้ายบนเอกสารจะได้ไม่ขัดกับยอด', () => {
  const [line] = normalizeManualLines([{
    description: 'ค่าบริการ', qty: 2, unitPrice: 500, discountType: 'percent', discountValue: 150,
  }]);
  assert.equal(line.discountValue, 100, 'เก็บค่าที่ตัดแล้ว ไม่ใช่ค่าดิบ 150');
  assert.equal(line.discountAmount, 1000);
  assert.equal(line.lineTotal, 0, 'ยอดไม่ติดลบ');
});

test('ส่วนลดแบบจำนวนเงินไม่โดนเพดาน 100 (คนละหน่วยกับ %)', () => {
  const [line] = normalizeManualLines([{
    description: 'ค่าบริการ', qty: 1, unitPrice: 5000, discountType: 'amount', discountValue: 1500,
  }]);
  assert.equal(line.discountValue, 1500);
  assert.equal(line.lineTotal, 3500);
});

// ── คำเตือน "ยังไม่ตั้งราคาในฐานข้อมูล" บนบรรทัดใบเสนอราคา ───────────────
// เคสจริง 2026-08-13: สร้างใบ → ไปแก้ข้อมูลสินค้า (สถานะอนุมัติรีเซ็ตเป็น pending)
// → กลับมาแก้ใบ แล้วขึ้นเตือนว่ายังไม่ได้ตั้งราคา ทั้งที่ราคาผลิตอยู่ครบ
test('สินค้าที่หลุดจากลิสต์ (รออนุมัติ/พักใช้) = unknown ไม่ใช่ยังไม่ตั้งราคา', () => {
  assert.equal(masterPriceState(undefined), 'unknown');
  assert.equal(masterPriceState(null), 'unknown');
});

test('บทบาทที่ถูกตัดคอลัมน์ costPrice ทิ้ง (redactProductMargin) = unknown', () => {
  assert.equal(masterPriceState({ id: 'P1', fgCode: 'FG-001' }), 'unknown');
});

test('รู้ราคาแน่ค่อยตัดสิน: มีราคา = priced / 0 หรือว่าง = unpriced', () => {
  assert.equal(masterPriceState({ id: 'P1', costPrice: 3000 }), 'priced');
  assert.equal(masterPriceState({ id: 'P1', costPrice: '3000' }), 'priced');
  assert.equal(masterPriceState({ id: 'P1', costPrice: 0 }), 'unpriced');
  assert.equal(masterPriceState({ id: 'P1', costPrice: null }), 'unpriced');
  assert.equal(masterPriceState({ id: 'P1', costPrice: '' }), 'unpriced');
});

// ── FG ต้องเป็นของลูกค้าที่ออกใบให้ (มติผู้ใช้ 2026-08-17) ───────────────────
// กรองดรอปดาวน์อย่างเดียวไม่พอ — ยิง API ตรงก็ยังใส่ FG ของลูกค้ารายอื่นได้
const mismatchLine = (productId) => normalizeManualLines([{
  productId, fgCode: `FG-${productId}`, description: 'x', qty: 1, unitPrice: 0,
}])[0];

test('บรรทัด FG ของลูกค้ารายอื่น = ถูกจับได้ พร้อมชื่อเจ้าของ', async () => {
  const sb = fakeSupabase([{ id: 'P1', fgCode: 'FG-P1', customerId: 'C-อื่น', customerName: 'ลูกค้าบี' }]);
  const bad = await customerMismatchedLines(sb, [mismatchLine('P1')], { customerId: 'C-เรา' });
  assert.equal(bad.length, 1);
  assert.equal(bad[0].fgCode, 'FG-P1');
  assert.match(customerMismatchMessage(bad), /ลูกค้าบี/);
});

test('บรรทัด FG ของลูกค้ารายนี้เอง = ผ่าน', async () => {
  const sb = fakeSupabase([{ id: 'P1', fgCode: 'FG-P1', customerId: 'C-เรา' }]);
  assert.deepEqual(await customerMismatchedLines(sb, [mismatchLine('P1')], { customerId: 'C-เรา' }), []);
});

// ⭐ ใบเก่าที่มีของข้ามลูกค้าค้างอยู่ต้อง **ยังบันทึกได้** — ไม่งั้นมาแก้แค่หมายเหตุ
// ก็ติดด่าน กลายเป็นใบที่แตะอะไรไม่ได้เลย
test('สินค้าที่ใบถืออยู่ก่อนแล้ว = ไม่โดนด่านย้อนหลัง', async () => {
  const sb = fakeSupabase([{ id: 'P1', fgCode: 'FG-P1', customerId: 'C-อื่น', customerName: 'ลูกค้าบี' }]);
  const bad = await customerMismatchedLines(sb, [mismatchLine('P1')], {
    customerId: 'C-เรา',
    previousLines: [{ productId: 'P1' }],
  });
  assert.deepEqual(bad, []);
});

test('เคสที่ตัดสินไม่ได้ปล่อยผ่าน: ใบไม่มีลูกค้า · บรรทัดพิมพ์เอง · สินค้าไม่มีเจ้าของ', async () => {
  const sb = fakeSupabase([{ id: 'P1', fgCode: 'FG-P1', customerId: null }]);
  // ใบไม่มีลูกค้า → เทียบกับอะไรไม่ได้
  assert.deepEqual(await customerMismatchedLines(sb, [mismatchLine('P1')], { customerId: '' }), []);
  // สินค้าทะเบียนเก่าที่ customerId ว่าง
  assert.deepEqual(await customerMismatchedLines(sb, [mismatchLine('P1')], { customerId: 'C-เรา' }), []);
  // บรรทัดพิมพ์เอง (ไม่มี productId) ไม่ผูกลูกค้า — ไม่ยิง query ด้วยซ้ำ
  const manual = normalizeManualLines([{ description: 'ค่าบริการ', qty: 1, unitPrice: 500 }]);
  assert.deepEqual(await customerMismatchedLines(null, manual, { customerId: 'C-เรา' }), []);
});

// ── จำนวนรอบบริการต่อบรรทัด (mig 0326 · มติผู้ใช้ 2026-08-27) ────────────────
// ต้นทางที่คนพิมพ์คือใบเสนอราคา (บรรทัด SO เป็น snapshot ที่แก้ไม่ได้ทั้งระบบ)
const svcLine = (over = {}) => normalizeManualLines([{
  productId: 'P9', fgCode: 'FG-374-02-001-1418', description: 'แพ็คเกจบริการ',
  qty: 1, unitPrice: 4900, ...over,
}])[0];

test('รอบบริการรับเฉพาะจำนวนเต็มบวก — ค่าที่เหลือกลายเป็น "ยังไม่ระบุ"', () => {
  assert.equal(svcLine({ serviceRounds: 12 }).serviceRounds, 12);
  assert.equal(svcLine({ serviceRounds: '12' }).serviceRounds, 12);
  assert.equal(svcLine({ serviceRounds: '' }).serviceRounds, null);
  assert.equal(svcLine({ serviceRounds: null }).serviceRounds, null);
  assert.equal(svcLine({}).serviceRounds, null);
  // DB มี CHECK ห้าม <= 0 — ปล่อยผ่านมาถึงจะกลายเป็น 500 ดิบแทนช่องว่างที่คนแก้เองได้
  assert.equal(svcLine({ serviceRounds: 0 }).serviceRounds, null);
  assert.equal(svcLine({ serviceRounds: -3 }).serviceRounds, null);
  assert.equal(svcLine({ serviceRounds: 1.5 }).serviceRounds, null);
});

test('บรรทัดที่ไม่ใช่หมวดบริการถูกล้างรอบทิ้ง ไม่ใช่เก็บค่าที่ client ส่งมา', () => {
  // เปลี่ยนสินค้าบนบรรทัดเดิมจากแพ็คเกจบริการเป็นขวดน้ำหอม = ตัวเลขรอบต้องไม่ค้าง
  assert.equal(svcLine({ fgCode: 'FG-374-01-002-1418', serviceRounds: 12 }).serviceRounds, null);
  assert.equal(normalizeManualLines([{ description: 'ค่าขนส่ง', qty: 1, unitPrice: 500, serviceRounds: 6 }])[0].serviceRounds, null);
});

test('enforceMasterPrices: สินค้าถูกย้ายออกจากหมวดบริการ รอบหลุดตาม fgCode ใหม่', async () => {
  const line = svcLine({ serviceRounds: 12 });
  const moved = await enforceMasterPrices(
    fakeSupabase([{ id: 'P9', fgCode: 'FG-374-01-002-1418', costPrice: 4900, productDescription: 'น้ำหอม' }]),
    [line],
  );
  assert.equal(moved[0].serviceRounds, null);
  // ยังอยู่ในหมวดเดิม = ตัวเลขต้องรอด (กันเขียนกฎแรงเกินจนล้างทุกกรณี)
  const kept = await enforceMasterPrices(
    fakeSupabase([{ id: 'P9', fgCode: 'FG-374-02-001-1418', costPrice: 5900, productDescription: 'แพ็คเกจ' }]),
    [svcLine({ serviceRounds: 12 })],
  );
  assert.equal(kept[0].serviceRounds, 12);
});
