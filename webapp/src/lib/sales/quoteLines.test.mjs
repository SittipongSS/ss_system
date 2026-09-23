import test from 'node:test';
import assert from 'node:assert/strict';
import {
  customerMismatchMessage,
  customerMismatchedLines,
  enforceMasterPrices,
  fgLineBrand,
  fgLineCategoryMeta,
  fillMissingLineCategories,
  fgLineDescription,
  masterPriceDrift,
  masterPriceState,
  normalizeManualLines,
  quoteLineFromProduct,
  refreshFgLinesForDisplay,
} from './quoteLines.js';
import { quoteLineMoney } from '../salesPlanning.js';

/* stub supabase: คืนราคา master ตาม map ที่กำหนด
   `customers` เข้ามาด้วยตั้งแต่ 2026-09-07 — ด่าน "FG ของลูกค้ารายอื่น" ต้องถาม
   ทะเบียนลูกค้าว่าเป็นนิติบุคคลเดียวกันไหม (customerTaxSiblings) · ไม่ส่ง customers
   มา = ทุกใบไม่มีเลข ⇒ ไม่มีใบพี่น้อง = พฤติกรรมก่อนหน้าเป๊ะ */
/* `types` = ทะเบียนหมวดสินค้า (มติ 2026-09-22 ชื่อหมวดติดไปกับบรรทัด) · ไม่ส่ง = ทะเบียนว่าง
   ⇒ ไม่มีบรรทัดไหนได้ชื่อหมวด = พฤติกรรมก่อนหน้าเป๊ะ · ส่ง `null` = อ่านทะเบียนไม่ได้ */
const fakeSupabase = (products, customers = [], types = []) => ({
  from: (table) => {
    assert.ok(['products', 'customers', 'product_types'].includes(table), `unexpected table: ${table}`);
    if (table === 'product_types') {
      return {
        select: async () => (types
          ? { data: types, error: null }
          : { data: null, error: { message: 'product_types down' } }),
      };
    }
    if (table === 'customers') {
      const rows = customers;
      const result = { data: rows, error: null };
      const chain = {
        eq: (col, value) => ({
          maybeSingle: async () => ({ data: rows.find((c) => c[col] === value) || null, error: null }),
        }),
        or: () => chain,
        order: () => chain,
        in: async () => result,
        // fetchAllResult ไล่ทีละหน้าด้วย .range() — หน้าเดียวจบเพราะ stub คืนไม่เต็มหน้า
        range: async () => result,
      };
      return { select: () => chain };
    }
    // `.in()` ตรง ๆ (await ได้ทันที) หรือห่อ fetchAllInChunks (ต่อ `.order().range()`)
    return {
      select: () => ({
        in: (col, ids) => {
          const result = { data: products.filter((p) => ids.includes(p.id)), error: null };
          const chain = Promise.resolve(result);
          chain.order = () => chain;
          chain.range = async () => result;
          return chain;
        },
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

/* ⭐ มติผู้ใช้ 2026-09-07: เลขประจำตัวผู้เสียภาษีเดียวกัน = ลูกค้าคนเดียวกัน
   บริษัทเดียวเปิดใบลูกค้าไว้หลายใบตามสาขา FG จึงอยู่ใต้ใบใดใบหนึ่ง */
const TAX = '0105561194100';
const siblingCustomers = [
  { id: 'C-เรา', arCode: 'AR-636', name: 'บริษัทเดียวกัน สาขา 2', taxId: TAX, branchCode: '00002', isActive: true, approvalStatus: 'approved' },
  { id: 'C-สาขาอื่น', arCode: 'AR-148', name: 'บริษัทเดียวกัน สนญ.', taxId: TAX, branchCode: '00000', isActive: true, approvalStatus: 'approved' },
];

test('บรรทัด FG ของใบลูกค้าอื่นที่เลขผู้เสียภาษีเดียวกัน = ผ่าน', async () => {
  const sb = fakeSupabase(
    [{ id: 'P1', fgCode: 'FG-P1', customerId: 'C-สาขาอื่น', customerName: 'บริษัทเดียวกัน สนญ.' }],
    siblingCustomers,
  );
  assert.deepEqual(await customerMismatchedLines(sb, [mismatchLine('P1')], { customerId: 'C-เรา' }), []);
});

// 🪤 ใบที่ยังไม่อนุมัติ/ถูกตีกลับ ต้องไม่เข้ากลุ่ม — ไม่งั้นเปิดใบลูกค้าใหม่ (ลงเป็น
// pending เอง ไม่ต้องมีคนอนุมัติ) ใส่เลขบริษัทเป้าหมาย แล้วดูดทะเบียน FG เขาได้
test('ใบพี่น้องที่ยังไม่อนุมัติ = ไม่นับเป็นนิติบุคคลเดียวกัน', async () => {
  const sb = fakeSupabase(
    [{ id: 'P1', fgCode: 'FG-P1', customerId: 'C-สาขาอื่น', customerName: 'บริษัทเดียวกัน สนญ.' }],
    [siblingCustomers[0], { ...siblingCustomers[1], approvalStatus: 'rejected' }],
  );
  const bad = await customerMismatchedLines(sb, [mismatchLine('P1')], { customerId: 'C-เรา' });
  assert.equal(bad.length, 1);
});

// 🪤 เลขขยะที่ผ่านด่านฟอร์มมาได้ ('N/A' · เลขซ้ำตัวเดียว) ต้องไม่จับกลุ่ม
// ไม่งั้นบริษัทคนละรายที่กรอกเหมือนกันจะสลับทะเบียน FG กัน
for (const junk of ['N/A', '000000000000', '', null]) {
  test(`เลขที่จับกลุ่มไม่ได้ (${junk ?? 'null'}) = ไม่มีใบพี่น้อง`, async () => {
    const sb = fakeSupabase(
      [{ id: 'P1', fgCode: 'FG-P1', customerId: 'C-สาขาอื่น', customerName: 'ลูกค้าบี' }],
      [
        { id: 'C-เรา', arCode: 'AR-1', name: 'เรา', taxId: junk, branchCode: '00000', isActive: true, approvalStatus: 'approved' },
        { id: 'C-สาขาอื่น', arCode: 'AR-2', name: 'ลูกค้าบี', taxId: junk, branchCode: '00001', isActive: true, approvalStatus: 'approved' },
      ],
    );
    const bad = await customerMismatchedLines(sb, [mismatchLine('P1')], { customerId: 'C-เรา' });
    assert.equal(bad.length, 1);
  });
}

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


/* ราคาใน master ขยับหลังบันทึกใบครั้งล่าสุด — จอต้องบอกว่าราคาใหม่คือเท่าไร
   (บรรทัดเปลี่ยนจริงตอนกดบันทึก ไม่ใช่ตอนเปิดหน้า — ดู refreshFgLinesForDisplay) */
test('masterPriceDrift reports the new master price when the line is stale', () => {
  assert.equal(masterPriceDrift({ id: 'P1', costPrice: 195 }, { productId: 'P1', unitPrice: 215 }), 195);
});

test('masterPriceDrift stays quiet when the line already matches master', () => {
  assert.equal(masterPriceDrift({ id: 'P1', costPrice: 195 }, { productId: 'P1', unitPrice: 195 }), null);
  // ราคาที่ยังเป็นสตริงจากช่องกรอก (MoneyInput) ต้องนับว่าตรง ไม่ใช่ขึ้นเตือนค้าง
  assert.equal(masterPriceDrift({ id: 'P1', costPrice: 195 }, { productId: 'P1', unitPrice: '195' }), null);
});

// สินค้าหลุดจากลิสต์ (รออนุมัติ/พักใช้) หรือบทบาทถูกตัด costPrice ทิ้ง = ไม่รู้ราคา
// ห้ามเดาว่าเป็น 0 แล้วขึ้นเตือน (เหตุผลเต็มที่ masterPriceState)
test('masterPriceDrift stays quiet when the master price is unknown or unset', () => {
  assert.equal(masterPriceDrift(undefined, { productId: 'P1', unitPrice: 215 }), null);
  assert.equal(masterPriceDrift({ id: 'P1' }, { productId: 'P1', unitPrice: 215 }), null);
  assert.equal(masterPriceDrift({ id: 'P1', costPrice: 0 }, { productId: 'P1', unitPrice: 215 }), null);
});

test('masterPriceDrift ignores manual lines that are not bound to a product', () => {
  assert.equal(masterPriceDrift({ id: 'P1', costPrice: 195 }, { productId: null, unitPrice: 1000 }), null);
});

// ── ชื่อหมวดสินค้าบนบรรทัด FG (มติผู้ใช้ 2026-09-22) ─────────────────────────

const TYPES = [
  { mainCategoryCode: '01', typeCode: '002', nameTh: 'น้ำหอม', nameEn: 'Perfume' },
  { mainCategoryCode: '02', typeCode: '010', nameTh: 'เทียนหอม', nameEn: 'Candle' },
];

test('บันทึกใบ: ชื่อหมวดตรึงลง metadata จาก master (รหัสหมวดที่บันทึกไว้ก่อนรหัส FG)', async () => {
  const master = [{ id: 'P1', fgCode: 'FG-AAA-02-010-0001', categoryCode: '01-002', costPrice: 100 }];
  const [line] = await enforceMasterPrices(fakeSupabase(master, [], TYPES), [fgLine()]);
  assert.equal(line.metadata.categoryName, 'น้ำหอม');
  assert.equal(line.metadata.categoryNameEn, 'Perfume');
});

test('บันทึกใบ: สินค้าย้ายไปหมวดที่ไม่มีชื่อ = ชื่อหมวดเก่าถูกล้าง ไม่ค้าง', async () => {
  const master = [{ id: 'P1', fgCode: 'FG-001', categoryCode: '09-999', costPrice: 100 }];
  const stale = fgLine({ metadata: { categoryName: 'น้ำหอม', categoryNameEn: 'Perfume' } });
  const [line] = await enforceMasterPrices(fakeSupabase(master, [], TYPES), [stale]);
  assert.equal('categoryName' in line.metadata, false);
  assert.equal('categoryNameEn' in line.metadata, false);
});

test('บันทึกใบ: อ่านทะเบียนหมวดไม่ได้ = คงชื่อที่ตรึงไว้ ไม่ล้าง และบันทึกไม่ล้ม', async () => {
  const master = [{ id: 'P1', fgCode: 'FG-AAA-02-010-0001', costPrice: 100 }];
  const kept = fgLine({ metadata: { categoryName: 'น้ำหอม', categoryNameEn: 'Perfume' } });
  const [line] = await enforceMasterPrices(fakeSupabase(master, [], null), [kept]);
  assert.equal(line.metadata.categoryName, 'น้ำหอม');
  assert.equal(line.unitPrice, 100);
});

test('บันทึกใบ: สินค้าถูกลบจาก master = คงชื่อหมวดของบรรทัดที่บันทึกไว้', async () => {
  const prev = [fgLine({ metadata: { categoryName: 'เทียนหอม', categoryNameEn: 'Candle' } })];
  const [line] = await enforceMasterPrices(fakeSupabase([], [], TYPES), [fgLine()], prev);
  assert.equal(line.metadata.categoryName, 'เทียนหอม');
  assert.equal(line.metadata.categoryNameEn, 'Candle');
});

test('เปิดใบ: ใบ final เติมแค่ชื่อหมวดที่ยังไม่มี — คำอธิบายที่ตรึงไว้ไม่ขยับ', async () => {
  const master = [{ id: 'P1', fgCode: 'FG-AAA-01-002-0001', productDescription: 'ชื่อใหม่' }];
  const accepted = { status: 'accepted', lines: [{ productId: 'P1', description: 'ชื่อเก่า', fgCode: 'FG-AAA-01-002-0001' }] };
  const frozen = { status: 'closed', lines: [{ productId: 'P1', description: 'ชื่อเก่า', metadata: { categoryName: 'หมวดตอนปิด' } }] };
  await refreshFgLinesForDisplay(fakeSupabase(master, [], TYPES), [accepted, frozen]);
  assert.equal(accepted.lines[0].description, 'ชื่อเก่า');
  assert.equal(accepted.lines[0].metadata.categoryName, 'น้ำหอม');
  assert.equal(frozen.lines[0].metadata.categoryName, 'หมวดตอนปิด');
});

test('เติมชื่อหมวด: บรรทัดที่ไม่ผูกสินค้าถอดหมวดจากรหัส FG · บรรทัดพิมพ์เองไม่แตะ', async () => {
  const lines = [
    { productId: null, fgCode: 'FG-OLD-02-010-0009', description: 'ของเก่า' },
    { productId: null, fgCode: null, description: 'ค่าออกแบบ' },
  ];
  const out = await fillMissingLineCategories(fakeSupabase([], [], TYPES), lines);
  assert.equal(out[0].metadata.categoryName, 'เทียนหอม');
  assert.equal(out[1], lines[1]);
  assert.equal(lines[0].metadata, undefined, 'ไม่แก้อาร์เรย์เดิม');
});

test('เติมชื่อหมวด: ไม่มีอะไรต้องเติม = ไม่ยิง query เลย', async () => {
  const neverCalled = { from: () => { throw new Error('must not query'); } };
  const lines = [{ productId: 'P1', fgCode: 'FG-1', metadata: { categoryName: 'น้ำหอม' } }, { description: 'พิมพ์เอง' }];
  assert.equal(await fillMissingLineCategories(neverCalled, lines), lines);
});

test('fgLineCategoryMeta ไม่รู้ชื่อ = {} (spread แล้วไม่ทับของเดิมด้วยค่าว่าง)', () => {
  assert.deepEqual(fgLineCategoryMeta({}), {});
  assert.deepEqual(fgLineCategoryMeta({ categoryName: 'น้ำหอม' }), { categoryName: 'น้ำหอม', categoryNameEn: 'น้ำหอม' });
});

/* ── บรรทัดหลังเลือกสินค้า (มติเจ้าของ 23/09 — ช่องเลือกสินค้าของใบเสนอราคากับบรรทัดโซนของใบย้อนหลังใช้ตัวเดียวกัน) ── */
const SDS = {
  id: 'P-SDS', fgCode: 'FG-SNS-02-001-0020', productDescription: 'แพ็คเกจ SDS รายเดือน', brandName: 'Scent & Sense',
  volume: 30, volumeUnit: 'วัน', saleUnit: 'แพ็คเกจ', costPrice: 3500, categoryName: 'บริการ', categoryNameEn: 'Service',
  docNote: 'รวมเติมน้ำหอมทุกเดือน', docNoteEn: 'Monthly refill included',
};

test('quoteLineFromProduct: รหัส · คำอธิบาย · หน่วยขาย · ราคาผลิต · ชื่อสองภาษา/แบรนด์/หมวด · หมายเหตุประจำสินค้า — ช่องอื่นคงเดิม', () => {
  const prev = { key: 'zone-1', zoneId: 'Z-1', qty: 12, discountType: 'percent', discountValue: 5, rounds: '12', metadata: { keep: 1 } };
  const line = quoteLineFromProduct(prev, SDS);
  assert.equal(line.productId, 'P-SDS');
  assert.equal(line.fgCode, 'FG-SNS-02-001-0020');
  assert.equal(line.description, fgLineDescription(SDS));
  assert.equal(line.unit, 'แพ็คเกจ');
  assert.equal(line.unitPrice, 3500);
  assert.deepEqual([line.key, line.zoneId, line.qty, line.discountType, line.discountValue, line.rounds],
    ['zone-1', 'Z-1', 12, 'percent', 5, '12'], 'จำนวน/ส่วนลด/โซน/รอบไม่ถูกแตะ');
  assert.equal(line.metadata.keep, 1);
  assert.equal(line.metadata.productBrand, fgLineBrand(SDS));
  assert.equal(line.metadata.categoryName, 'บริการ');
  assert.deepEqual([line.metadata.note, line.metadata.noteEn, line.metadata.noteAuto], ['รวมเติมน้ำหอมทุกเดือน', 'Monthly refill included', true]);
  assert.ok(line.metadata.descriptionTh && line.metadata.descriptionEn);
  assert.notEqual(line, prev, 'คืนบรรทัดใหม่');
  assert.equal(prev.productId, undefined, 'ไม่แก้ของเดิม');
  // เงินของบรรทัดคิดต่อได้ทันทีด้วยสูตรใบเสนอราคา
  assert.equal(quoteLineMoney(line).lineTotal, 39900);
});

test('quoteLineFromProduct: หน่วยว่าง = "ชิ้น" · ราคาว่าง = 0 · หมายเหตุที่พิมพ์เองไม่ถูกทับ · ชื่อหมวดตัวเก่าไม่ค้าง · ไม่มีสินค้า = คืนของเดิม', () => {
  const bare = quoteLineFromProduct({}, { id: 'P-X', fgCode: 'FG-X' });
  assert.equal(bare.unit, 'ชิ้น');
  assert.equal(bare.unitPrice, 0);
  assert.equal(bare.metadata.categoryName, undefined);
  const typed = quoteLineFromProduct({ metadata: { note: 'ลูกค้าขอส่งช่วงเช้า', categoryName: 'หมวดเก่า', categoryNameEn: 'Old' } }, SDS);
  assert.equal(typed.metadata.note, 'ลูกค้าขอส่งช่วงเช้า');
  assert.equal(typed.metadata.noteAuto, undefined);
  assert.equal(typed.metadata.categoryName, 'บริการ');
  const swapped = quoteLineFromProduct(
    { metadata: { note: 'หมายเหตุของตัวเก่า', noteEn: 'old', noteAuto: true, categoryName: 'หมวดเก่า' } },
    { id: 'P-Y', fgCode: 'FG-Y' },
  );
  assert.equal(swapped.metadata.note, undefined, 'หมายเหตุที่ระบบเติมตามสินค้าตัวใหม่ (ตัวใหม่ไม่มี = หาย)');
  assert.equal(swapped.metadata.categoryName, undefined, 'ชื่อหมวดตัวเก่าไม่ค้าง');
  const same = { productId: 'P-SDS', qty: 3 };
  assert.equal(quoteLineFromProduct(same, null), same);
});

test('normalizeManualLines คิดเงินผ่าน quoteLineMoney — ตัวเดียวกับใบสั่งขายย้อนหลัง', () => {
  const rows = [
    { description: 'a', qty: 12, unitPrice: 3500, discountType: 'percent', discountValue: 150 },
    { description: 'b', qty: 3, unitPrice: 33.33, discountType: 'amount', discountValue: 100.555 },
    { description: 'c', qty: 2, unitPrice: 10, discountType: 'weird', discountValue: 4 },
  ];
  const lines = normalizeManualLines(rows);
  lines.forEach((line, i) => {
    const m = quoteLineMoney(rows[i]);
    assert.deepEqual([line.discountType, line.discountValue, line.discountAmount, line.lineTotal],
      [m.discountType, m.discountValue, m.discountAmount, m.lineTotal]);
  });
});
