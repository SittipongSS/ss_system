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
  masterPriceUncertain,
  manualLineCategoryEdit,
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

/* รีวิวเงิน 09/10 (งวด PR-3 ช่อง "แพ็ค/เดือน"): masterPriceDrift เงียบเมื่อไม่รู้ราคาทะเบียน — ถูกสำหรับ "คำเตือนข้างช่องราคา"
   แต่ผิดสำหรับประโยคที่ **ยืนยันยอด** ก่อนกดบันทึก (เซิร์ฟเวอร์คิดราคาใหม่จากทะเบียนเสมอ) ⇒ ตัวนี้ตอบคำถามอีกข้อ:
   "จอสัญญาได้ไหมว่าบรรทัดนี้จะถูกบันทึกด้วยราคาที่เห็น" — ไม่รู้ = สัญญาไม่ได้ */
test('masterPriceUncertain: ราคาขยับ หรือจอไม่รู้ราคาทะเบียน = สัญญายอดไม่ได้ · ราคาตรง / ทะเบียนยังไม่ตั้งราคา / บรรทัดไม่ผูกสินค้า = สัญญาได้', () => {
  const line = { productId: 'P1', unitPrice: 215 };
  assert.equal(masterPriceUncertain({ id: 'P1', costPrice: 195 }, line), true, 'ราคาขยับที่จอเห็น');
  assert.equal(masterPriceUncertain(undefined, line), true, 'สินค้าไม่อยู่ในลิสต์ของหน้า (รออนุมัติหลังถูกแก้ / พักใช้)');
  assert.equal(masterPriceUncertain(null, line), true);
  assert.equal(masterPriceUncertain({ id: 'P1' }, line), true, 'บทบาทที่ไม่เห็นคอลัมน์ราคา');
  assert.equal(masterPriceUncertain({ id: 'P1', costPrice: 215 }, line), false, 'ราคาตรงกัน');
  assert.equal(masterPriceUncertain({ id: 'P1', costPrice: '215' }, { productId: 'P1', unitPrice: '215' }), false);
  // ทะเบียนยังไม่ตั้งราคา (รู้แน่ว่า 0/ว่าง): enforceMasterPrices คงราคาเดิมของบรรทัด ⇒ ยอดเป็นไปตามที่จอเห็น
  assert.equal(masterPriceUncertain({ id: 'P1', costPrice: 0 }, line), false);
  assert.equal(masterPriceUncertain({ id: 'P1', costPrice: null }, line), false);
  // บรรทัดที่ไม่ผูกสินค้า: ราคาที่พิมพ์คือราคาที่บันทึก
  assert.equal(masterPriceUncertain(undefined, { productId: null, unitPrice: 215 }), false);
  assert.equal(masterPriceUncertain({ id: 'P1', costPrice: 195 }, { unitPrice: 215 }), false);
  assert.equal(masterPriceUncertain(undefined, undefined), false);
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

/* ⭐ บรรทัด "เพิ่มรายการเอง" เลือกหมวดสินค้าได้ (มติผู้ใช้ 2026-09-27) — เก็บคีย์เดียวกับหมวดของบรรทัด FG
   ⇒ ตาราง/ใบพิมพ์/SO อ่านได้เลย · ต้องรอดทางบันทึก (normalize → enforceMasterPrices) ไม่โดนล้าง */
test('manualLineCategoryEdit: เลือก = เก็บรหัส+ชื่อสองภาษา · ไม่ระบุ = ลบทั้งชุด · ไม่แตะคีย์อื่น', () => {
  const row = { mainCategoryCode: '02', typeCode: '001', nameTh: 'บริการเครื่องพ่น', nameEn: 'Scent service' };
  const picked = manualLineCategoryEdit({ note: 'ส่งทุกเดือน' }, row);
  assert.deepEqual(picked, {
    note: 'ส่งทุกเดือน', categoryCode: '02-001', categoryName: 'บริการเครื่องพ่น', categoryNameEn: 'Scent service',
  });
  assert.deepEqual(manualLineCategoryEdit(picked, null), { note: 'ส่งทุกเดือน' });
  // มีภาษาเดียว = ถอยไปอีกภาษา · ชื่อว่างทั้งคู่ (prod มีจริง) = ถอยไปรหัส ไม่ใช่ป้ายว่าง
  assert.equal(manualLineCategoryEdit({}, { ...row, nameEn: '' }).categoryNameEn, 'บริการเครื่องพ่น');
  assert.equal(manualLineCategoryEdit({}, { ...row, nameTh: '', nameEn: '' }).categoryName, '02-001');
});

test('หมวดของบรรทัดเพิ่มเองรอดทางบันทึก · บรรทัดเปลี่ยนเป็น FG = หมวดตามสินค้า ไม่ติดรหัสเดิม', async () => {
  const metadata = manualLineCategoryEdit({}, { mainCategoryCode: '02', typeCode: '001', nameTh: 'บริการ', nameEn: 'Service' });
  const [saved] = await enforceMasterPrices(fakeSupabase({}), normalizeManualLines([
    { description: 'ค่าติดตั้ง', qty: 1, unitPrice: 500, metadata },
  ]));
  assert.equal(saved.metadata.categoryName, 'บริการ');
  assert.equal(saved.metadata.categoryCode, '02-001');
  const asFg = quoteLineFromProduct(saved, { ...SDS, categoryName: 'น้ำหอม', categoryNameEn: 'Perfume' });
  assert.equal(asFg.metadata.categoryName, 'น้ำหอม');
  assert.equal(asFg.metadata.categoryCode, undefined);
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════
   เลขแพ็คของบรรทัด ("แพ็ค/เดือน" · หมวด 02-001 · mig 0407 · docs/qt-pack-column.md)
   ⭐ กฎ: เซิร์ฟเวอร์ไม่แก้เลขแพ็คเอง — รับตามที่ส่งมา หรือปฏิเสธพร้อมเลขรายการ
   ⭐ งวด PR-3 (มติเจ้าของ 08/10 ข้อ A2–A4): สวิตช์จริงเปิดแล้ว — ค่าตั้งต้นของตัว normalize = พกเลขแพ็คที่ใช้ได้ ปฏิเสธค่าที่ใช้ไม่ได้
     · `packInputOpen: false` ในเทสต์ = ช่องสำหรับเทสต์ รันกิ่ง "ปิด" = **คำตอบของรุ่น PR-1 / PR-2 (รุ่นที่ถอยกลับไปได้)**
     · `packInputOpen: true` (OPEN) ที่เทสต์เดิมส่งไว้ = ค่าตั้งต้นของวันนี้ — คงไว้ให้เห็นว่าเทสต์นั้นหมายถึงกิ่งไหน
   ═══════════════════════════════════════════════════════════════════════════════════════════════════ */
import { manualLineCategoryPatch, seedLinesFromProject } from './quoteLines.js';
import { LINE_PACK_TEXT, LinePackError, QUOTE_PACK_INPUT_OPEN, linePackIssues, linePackMessage } from './linePacks.js';
import { quoteLineNet } from '../salesPlanning.js';
import { emptyHistoricalZone } from './historicalIntakeForm.js';

const OPEN = { packInputOpen: true };
const CLOSED = { packInputOpen: false };
const SDS_FG = 'FG-278-02-001-0757';
const packRow = (over = {}) => ({ productId: 'P1', fgCode: SDS_FG, description: 'ระบบกระจายกลิ่น SDS', qty: 12, unitPrice: 3500, ...over });
const KEYS_TODAY = ['id', 'productId', 'fgCode', 'description', 'qty', 'unit', 'unitPrice', 'discountType', 'discountValue',
  'discountAmount', 'lineTotal', 'source', 'sortOrder', 'metadata'];
const thrownBy = (fn) => {
  try { fn(); } catch (error) { return error; }
  return null;
};

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 · แผน IMPL_PLAN_PR3 §4 แถว 3 + §12 C2): ลูปเดิมอยู่ครบทุกค่า
   แต่ขอกิ่ง "ปิด" ด้วย `{ packInputOpen: false }` เอง — ค่าตั้งต้นวันนี้คือเปิด · กิ่งปิด = คำตอบของรุ่น PR-1 / PR-2 (รุ่นที่ถอยกลับไปได้) */
test('แพ็ค 🔴 กิ่งปิด = คำตอบของรุ่น PR-1 / PR-2 (รุ่นที่ถอยกลับไปได้): บรรทัดที่ส่งเลขแพ็คมาถูกปฏิเสธพร้อมเลขรายการ — ค่าที่ถูกต้องด้วย · ไม่ตัดทิ้งแล้วบันทึกต่อ', () => {
  assert.equal(QUOTE_PACK_INPUT_OPEN, true, 'สวิตช์จริงเปิดแล้ว (งวด PR-3) — กิ่งปิดต้องขอเอง');
  for (const packQty of [2, '2', 1, 0, 'abc', 1.5, 10000, true]) {
    const error = thrownBy(() => normalizeManualLines([packRow(), packRow({ packQty }), packRow()], CLOSED));
    assert.ok(error instanceof LinePackError, `packQty=${JSON.stringify(packQty)} ต้องโยน LinePackError`);
    assert.equal(error.status, 400);
    assert.deepEqual(error.issues, [{ index: 1, row: 2, code: 'closed' }]);
    assert.equal(error.message, `รายการ 2: ${LINE_PACK_TEXT.closed}`);
  }
  // หลายบรรทัด = บอกครบทุกบรรทัดในข้อความเดียว
  const many = thrownBy(() => normalizeManualLines([packRow({ packQty: 2 }), packRow(), packRow({ packQty: '3' })], CLOSED));
  assert.equal(many.message, `รายการ 1, 3: ${LINE_PACK_TEXT.closed}`);
});

test('แพ็ค ⭐ ค่าตั้งต้น (สวิตช์จริง = เปิด · งวด PR-3): ค่าที่ใช้ได้ถูกพกตามที่ส่งมา · ค่าที่ใช้ไม่ได้ (0 · 1.5 · 10000 · ข้อความ) ถูกปฏิเสธด้วย invalid พร้อมเลขรายการ — ไม่มีคำตอบ "ปิด" อีกแล้ว', () => {
  // ค่าที่ใช้ได้: ไม่ต้องส่งตัวเลือกอะไร — ทาง PATCH / ออก Rev. ของ route เรียกแบบนี้
  const carried = normalizeManualLines([packRow({ packQty: 2 }), packRow({ packQty: '2' }), packRow({ packQty: 1 }), packRow({ packQty: ' 9999 ', qty: 1 }), packRow()]);
  assert.deepEqual(carried.map((l) => l.packQty), [2, 2, 1, 9999, undefined]);
  assert.deepEqual(carried.map((l) => l.lineTotal), [84000, 84000, 42000, 34996500, 42000]);
  assert.deepEqual(carried.map((l) => l.unit), ['เดือน', 'เดือน', 'เดือน', 'เดือน', 'ชิ้น']);
  assert.deepEqual(carried, normalizeManualLines([packRow({ packQty: 2 }), packRow({ packQty: '2' }), packRow({ packQty: 1 }), packRow({ packQty: ' 9999 ', qty: 1 }), packRow()], OPEN)
    .map((line, i) => ({ ...line, id: carried[i].id })), 'ค่าตั้งต้น = packInputOpen: true');
  // ค่าที่ใช้ไม่ได้: invalid (ไม่ใช่ closed) — ไม่ปัด ไม่แปลง ไม่เก็บ NULL แทน
  for (const packQty of [0, '0', 'abc', 1.5, '1.5', -2, 10000, '10000', '02', true, {}, [2]]) {
    const error = thrownBy(() => normalizeManualLines([packRow({ packQty: 2 }), packRow({ packQty }), packRow()]));
    assert.ok(error instanceof LinePackError, `packQty=${JSON.stringify(packQty)}`);
    assert.deepEqual([error.status, error.issues], [400, [{ index: 1, row: 2, code: 'invalid' }]]);
    assert.equal(error.message, `รายการ 2: ${LINE_PACK_TEXT.invalid}`);
  }
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 · แผน §4 แถว 4): ข้อยืนยันเดิม (บรรทัดที่กำลังจะถูกตัดก็ถูกตรวจก่อน) อยู่ครบ
   ในกิ่งปิดที่ขอเอง + เพิ่มกิ่งเปิด: ค่าที่ใช้ไม่ได้บนบรรทัดจำนวน 0 ยังถูกปฏิเสธก่อนตัด · ค่าที่ใช้ได้ไปกับบรรทัดของมัน (ทั้งบรรทัดไม่ถูกบันทึก — ไม่มีอะไรหด) */
test('แพ็ค 🔴 บรรทัดที่กำลังจะถูกตัดทิ้ง (จำนวน 0) ก็ถูกตรวจก่อน: กิ่งปิด (รุ่น PR-1 / PR-2) ปฏิเสธทุกค่า · กิ่งเปิดปฏิเสธค่าที่ใช้ไม่ได้ · ค่าที่ใช้ได้ไปกับบรรทัดของมัน', () => {
  const closed = thrownBy(() => normalizeManualLines([packRow(), packRow({ qty: 0, packQty: 2 })], CLOSED));
  assert.ok(closed instanceof LinePackError);
  assert.deepEqual(closed.issues, [{ index: 1, row: 2, code: 'closed' }]);
  // ไม่มีเลขแพ็ค: บรรทัดจำนวน 0 ถูกตัดเหมือนเดิม ไม่โยน (ทั้งสองกิ่ง)
  assert.equal(normalizeManualLines([packRow(), packRow({ qty: 0 })], CLOSED).length, 1);
  assert.equal(normalizeManualLines([packRow(), packRow({ qty: 0 })]).length, 1);
  // กิ่งเปิด (ค่าตั้งต้น): ค่าที่ใช้ไม่ได้บนบรรทัดจำนวน 0 = ปฏิเสธก่อนตัด — เลขรายการตามลำดับที่ส่งมา
  for (const packQty of [0, 1.5, 10000, 'abc']) {
    const open = thrownBy(() => normalizeManualLines([packRow({ packQty: 2 }), packRow({ qty: 0, packQty })]));
    assert.ok(open instanceof LinePackError, `packQty=${JSON.stringify(packQty)}`);
    assert.deepEqual(open.issues, [{ index: 1, row: 2, code: 'invalid' }]);
  }
  // กิ่งเปิด: ค่าที่ใช้ได้บนบรรทัดจำนวน 0 — บรรทัดนั้นไม่ถูกบันทึกทั้งบรรทัด (กติกาเดิม "จำนวน 0 = ไม่บันทึก") บรรทัดอื่นไม่ถูกแตะ
  const kept = normalizeManualLines([packRow({ packQty: 2 }), packRow({ qty: 0, packQty: 3 }), packRow({ packQty: 1 })]);
  assert.deepEqual(kept.map((l) => [l.packQty, l.qty, l.lineTotal, l.sortOrder]), [[2, 12, 84000, 0], [1, 12, 42000, 2]]);
});

/* ── เลขรายการในข้อความของด่าน = แถวที่คนเห็นบนจอ (งวด PR-3 · แผน §1 D2) ────────────────────────────────
   ตัว normalize ตั้ง `sortOrder` = ตำแหน่งในลิสต์ที่จอส่งมา **ก่อน** ตัดบรรทัดจำนวน 0 — ด่านบนบรรทัดชุดสุดท้ายนับจากค่านี้ */
test('แพ็ค ⭐ จอส่ง [แพ็ค 2, จำนวน 0, ไม่มีแพ็ค]: ด่านบนบรรทัดที่เหลือบอก "รายการ 3" (แถวบนจอ) — เดิมบอก "รายการ 2"', () => {
  const body = [packRow({ packQty: '2' }), packRow({ qty: 0 }), packRow()];
  const lines = normalizeManualLines(body);
  assert.deepEqual(lines.map((l) => l.sortOrder), [0, 2], 'sortOrder = ตำแหน่งที่ส่งมา (ช่องว่าง = บรรทัดจำนวน 0 ที่ถูกตัด)');
  assert.equal(linePackMessage(linePackIssues(lines, { numbering: 'submitted' })), `รายการ 3: ${LINE_PACK_TEXT.required}`);
  assert.equal(linePackMessage(linePackIssues(lines)), `รายการ 2: ${LINE_PACK_TEXT.required}`, 'ไม่ส่ง numbering = นับตำแหน่งในอาร์เรย์ (พฤติกรรมของงวด PR-1 — ผู้เรียกของงวดนี้ส่ง numbering ทุกจุดที่บรรทัดมาจากจอ)');
  // ตัว normalize เองบอกเลขตามลำดับที่ส่งมาอยู่แล้ว (ตรวจก่อนตัด)
  const thrown = thrownBy(() => normalizeManualLines([packRow({ packQty: '2' }), packRow({ qty: 0 }), packRow({ packQty: 0 })]));
  assert.equal(thrown.message, `รายการ 3: ${LINE_PACK_TEXT.invalid}`);
});

test('แพ็ค ⭐ คีย์ packQty ที่ไม่มีค่า (null จาก select * หลังรัน 0407 · ว่าง · undefined) ผ่านตัว normalize ทั้งสองกิ่ง และผลลัพธ์ไม่มีคีย์นี้', () => {
  // จอส่งบรรทัดที่ API คืนมากลับไปทั้งก้อน ⇒ ทุกบรรทัดมี packQty: null — ตัว normalize ไม่ปฏิเสธค่านี้ ("หมวด 02-001 ต้องกรอก" เป็นงานของด่าน linePackIssues)
  for (const options of [undefined, OPEN, CLOSED]) {
    for (const packQty of [null, undefined, '', '   ']) {
      const [line, plain] = normalizeManualLines([packRow({ packQty }), packRow()], options);
      assert.deepEqual(Object.keys(line), KEYS_TODAY, `packQty=${JSON.stringify(packQty)}`);
      assert.equal('packQty' in line, false);
      const { id: _a, ...rest } = line;
      const { id: _b, ...expected } = plain;
      assert.deepEqual(rest, { ...expected, sortOrder: 0 }, 'เท่ากับบรรทัดที่ไม่มีคีย์ทุกช่อง');
      assert.equal(line.lineTotal, 42000);
      assert.equal(line.unit, 'ชิ้น', 'หน่วยไม่ถูกเปลี่ยนเป็นเดือน');
    }
  }
});

test('แพ็ค (ช่องเปิดในเทสต์): พกเลขแพ็ค 1 และ 2 · สตริง "2" เก็บเป็นตัวเลข · ยอด = แพ็ค × จำนวน × ราคา − ส่วนลด · หน่วย = เดือน', () => {
  const lines = normalizeManualLines([
    packRow({ packQty: 1, unit: 'แพ็คเกจ' }),
    packRow({ packQty: 2, unit: 'แพ็คเกจ', discountType: 'amount', discountValue: 14400 }),
    packRow({ packQty: '2', unit: 'กิโลกรัม' }),
    packRow({ packQty: ' 43 ', qty: 4, unitPrice: 2900 }),
    packRow({ unit: 'แพ็คเกจ' }),
    packRow({ packQty: null, unit: 'แพ็คเกจ' }),
  ], OPEN);
  assert.deepEqual(lines.map((l) => l.packQty), [1, 2, 2, 43, undefined, undefined]);
  assert.deepEqual(lines.map((l) => typeof l.packQty), ['number', 'number', 'number', 'number', 'undefined', 'undefined']);
  assert.deepEqual(lines.map((l) => l.lineTotal), [42000, 69600, 84000, 498800, 42000, 42000]);
  assert.deepEqual(lines.map((l) => l.discountAmount), [0, 14400, 0, 0, 0, 0], 'ส่วนลดเป็นบาทไม่คูณจำนวนแพ็ค');
  assert.deepEqual(lines.map((l) => l.unit), ['เดือน', 'เดือน', 'เดือน', 'เดือน', 'แพ็คเกจ', 'แพ็คเกจ']);
  assert.deepEqual(lines.map((l) => l.qty), [12, 12, 12, 4, 12, 12], 'จำนวนไม่ถูกคูณเข้าไป — ตัวคูณอยู่ที่เลขแพ็ค');
  // คีย์: ชุดเดิม + packQty ต่อท้าย เฉพาะบรรทัดที่มีเลขแพ็ค
  assert.deepEqual(Object.keys(lines[0]), [...KEYS_TODAY, 'packQty']);
  assert.deepEqual(Object.keys(lines[4]), KEYS_TODAY);
  assert.deepEqual(Object.keys(lines[5]), KEYS_TODAY);
});

test('แพ็ค (ช่องเปิดในเทสต์): ค่าที่ใช้ไม่ได้ถูกปฏิเสธพร้อมเลขรายการ — ไม่ปัด ไม่แปลง ไม่เก็บ NULL แทน', () => {
  for (const packQty of [0, '0', 'abc', 1.5, '1.5', -2, 10000, '02', true]) {
    const error = thrownBy(() => normalizeManualLines([packRow({ packQty: 2 }), packRow({ packQty })], OPEN));
    assert.ok(error instanceof LinePackError, `packQty=${JSON.stringify(packQty)}`);
    assert.deepEqual(error.issues, [{ index: 1, row: 2, code: 'invalid' }]);
    assert.equal(error.message, `รายการ 2: ${LINE_PACK_TEXT.invalid}`);
  }
});

test('แพ็ค: normalize ซ้ำสองรอบได้ผลเดิม (ทางออก Rev. เรียกสองครั้ง) — เลขแพ็ค ยอด หน่วย ไม่ขยับ · กิ่งปิด (รุ่น PR-1 / PR-2) ปฏิเสธรอบสอง ไม่ตัดทิ้ง', () => {
  const once = normalizeManualLines([
    packRow({ packQty: 1, unit: 'แพ็คเกจ' }),
    packRow({ packQty: 2, unit: 'แพ็คเกจ', discountType: 'percent', discountValue: 5 }),
    packRow({ unit: 'แพ็คเกจ' }),
  ], OPEN);
  const twice = normalizeManualLines(once, OPEN);
  const strip = (rows) => rows.map(({ id, ...rest }) => rest);
  assert.deepEqual(strip(twice), strip(once));
  assert.deepEqual(twice.map((l) => [l.packQty, l.lineTotal, l.unit]), [[1, 42000, 'เดือน'], [2, 79800, 'เดือน'], [undefined, 42000, 'แพ็คเกจ']]);
  /* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 · แผน §4 แถว 5): เดิม "รอบสองที่ไม่ส่งตัวเลือก = ปฏิเสธ" เพราะค่าตั้งต้นคือปิด
     วันนี้ค่าตั้งต้นคือเปิด ⇒ รอบสองที่ไม่ส่งตัวเลือกได้ผลเดิมทุกช่อง (ทางออก Rev. ของ route เรียกสองครั้งแบบไม่มีตัวเลือก)
     · ข้อยืนยันเดิมอยู่ในกิ่งปิดที่ขอเอง: รอบสองของรุ่น PR-1 / PR-2 ปฏิเสธ ไม่ใช่ตัดทิ้ง */
  assert.deepEqual(strip(normalizeManualLines(once)), strip(once), 'รอบสองแบบไม่มีตัวเลือก (ทางจริงของ route) = ผลเดิม');
  assert.deepEqual(strip(normalizeManualLines(normalizeManualLines(once))), strip(once));
  const closedSecond = thrownBy(() => normalizeManualLines(once, CLOSED));
  assert.ok(closedSecond instanceof LinePackError);
  assert.equal(closedSecond.message, `รายการ 1, 2: ${LINE_PACK_TEXT.closed}`);
});

test('แพ็ค: ราคาทะเบียนขยับบนบรรทัดที่มีเลขแพ็ค → ยอดใหม่ = แพ็ค × จำนวน × ราคาใหม่ − ส่วนลด (เลขแพ็ค 1 และ 2) · หน่วยยังเป็นเดือน', async () => {
  const master = [
    { id: 'P1', fgCode: SDS_FG, productDescription: 'ระบบกระจายกลิ่น SDS', saleUnit: 'แพ็คเกจ', costPrice: 4000 },
    { id: 'P2', fgCode: SDS_FG, productDescription: 'ระบบกระจายกลิ่น SDS', saleUnit: 'แพ็คเกจ', costPrice: 4000 },
    { id: 'P3', fgCode: 'FG-336-01-009-1290', productDescription: 'น้ำหอม', saleUnit: 'ชิ้น', costPrice: 100 },
  ];
  const stored = normalizeManualLines([
    packRow({ productId: 'P1', packQty: 2, discountType: 'amount', discountValue: 14400 }),
    packRow({ productId: 'P2', packQty: 1 }),
    packRow({ productId: 'P3', fgCode: 'FG-336-01-009-1290', qty: 3, unitPrice: 90 }),
  ], OPEN);
  assert.deepEqual(stored.map((l) => l.lineTotal), [69600, 42000, 270]);
  const lines = await enforceMasterPrices(fakeSupabase(master), stored, stored);
  assert.deepEqual(lines.map((l) => l.unitPrice), [4000, 4000, 100]);
  assert.deepEqual(lines.map((l) => l.lineTotal), [81600, 48000, 300], '2 × 12 × 4,000 − 14,400 · 1 × 12 × 4,000 · 3 × 100');
  assert.deepEqual(lines.map((l) => l.discountAmount), [14400, 0, 0]);
  assert.deepEqual(lines.map((l) => l.packQty), [2, 1, undefined], 'ตัว sync ราคาไม่ตั้ง ไม่ล้าง ไม่แก้เลขแพ็ค');
  assert.deepEqual(lines.map((l) => l.unit), ['เดือน', 'เดือน', 'ชิ้น'], 'หน่วยขายของทะเบียน (แพ็คเกจ) ไม่ทับบรรทัดที่มีเลขแพ็ค');
  assert.equal('packQty' in lines[2], false);
  // ยอดของแต่ละบรรทัด = สูตรกลางของบรรทัดนั้นเอง
  for (const line of lines) assert.equal(line.lineTotal, quoteLineNet(line).lineTotal);
});

test('แพ็ค: ทะเบียนไม่เปลี่ยน = คืนอ็อบเจกต์เดิม (ไม่คิดยอดใหม่) · สินค้าถูกลบจากทะเบียน = คงเลขแพ็ค หน่วย และยอดเดิม', async () => {
  const master = [{ id: 'P1', fgCode: SDS_FG, productDescription: 'ระบบกระจายกลิ่น SDS', saleUnit: 'แพ็คเกจ', costPrice: 3500 }];
  const [first] = await enforceMasterPrices(fakeSupabase(master), normalizeManualLines([packRow({ packQty: 2 })], OPEN));
  assert.deepEqual([first.packQty, first.unit, first.lineTotal], [2, 'เดือน', 84000]);
  // รอบสอง: ทุกอย่างตรงทะเบียนแล้ว (หน่วยที่เทียบคือ "เดือน" ของบรรทัด ไม่ใช่ "แพ็คเกจ" ของทะเบียน) ⇒ ตัวเดิม
  const [again] = await enforceMasterPrices(fakeSupabase(master), [first], [first]);
  assert.equal(again, first);
  // สินค้าหายจากทะเบียน: ถอยไปค่าที่บันทึกไว้ในใบ — เลขแพ็คและหน่วยอยู่ครบ ยอดยังคูณแพ็ค
  const [orphan] = await enforceMasterPrices(fakeSupabase([]), [{ ...first, unitPrice: 9999 }], [first]);
  assert.deepEqual([orphan.packQty, orphan.unit, orphan.unitPrice, orphan.lineTotal], [2, 'เดือน', 3500, 84000]);
});

test('แพ็ค: บรรทัดที่ไม่มีเลขแพ็คยังได้หน่วยขายของทะเบียนตามเดิม (กติกา 2026-07-23 ไม่เปลี่ยน)', async () => {
  const master = [{ id: 'P1', fgCode: SDS_FG, productDescription: 'ระบบกระจายกลิ่น SDS', saleUnit: 'แพ็คเกจ', costPrice: 3500 }];
  for (const packQty of [undefined, null]) {
    const [line] = await enforceMasterPrices(fakeSupabase(master), [{ ...fgLine({ fgCode: SDS_FG, unit: 'เดือน' }), packQty }]);
    assert.equal(line.unit, 'แพ็คเกจ');
    assert.equal(line.lineTotal, 7000, 'จำนวน 2 × 3,500');
  }
});

test('แพ็ค: เปิดใบ (refreshFgLinesForDisplay) — บรรทัดที่มีเลขแพ็คคงหน่วยเดือน · บรรทัดอื่นได้หน่วยขายของทะเบียนตามเดิม', async () => {
  const master = [{ id: 'P1', fgCode: SDS_FG, productDescription: 'ระบบกระจายกลิ่น SDS', saleUnit: 'แพ็คเกจ' }];
  const draft = {
    status: 'draft',
    lines: [
      { productId: 'P1', fgCode: SDS_FG, description: 'เก่า', unit: 'เดือน', packQty: 2, qty: 12, lineTotal: 84000 },
      { productId: 'P1', fgCode: SDS_FG, description: 'เก่า', unit: 'เดือน', packQty: null, qty: 24, lineTotal: 84000 },
      { productId: 'P1', fgCode: SDS_FG, description: 'เก่า', unit: 'ชิ้น', qty: 24 },
    ],
  };
  await refreshFgLinesForDisplay(fakeSupabase(master), [draft]);
  assert.deepEqual(draft.lines.map((l) => l.unit), ['เดือน', 'แพ็คเกจ', 'แพ็คเกจ']);
  assert.deepEqual(draft.lines.map((l) => l.packQty), [2, null, undefined], 'เลขแพ็คและคีย์ของบรรทัดไม่ถูกแตะ');
  assert.deepEqual(draft.lines.map((l) => l.lineTotal), [84000, 84000, undefined], 'ยอดไม่ถูกคิดใหม่ตอนเปิดใบ');
});

test('แพ็ค: บรรทัดที่ตั้งต้นจากโครงการคิดยอดด้วยสูตรกลาง (quoteLineNet) — ปัดสตางค์ ไม่มีเลขแพ็ค · จำนวนเต็มได้ค่าเดิม', async () => {
  const projectRows = [
    { id: 'PP-1', productId: 'P1', orderQty: '12', product: { id: 'P1', fgCode: SDS_FG, productDescription: 'ระบบกระจายกลิ่น SDS', saleUnit: 'แพ็คเกจ', costPrice: 3500 } },
    { id: 'PP-2', productId: 'P2', orderQty: '1.5', product: { id: 'P2', fgCode: 'FG-336-01-009-1290', productDescription: 'น้ำหอม', saleUnit: 'ชิ้น', costPrice: 33.33 } },
    { id: 'PP-3', productId: 'P3', productionQty: '3', product: { id: 'P3', fgCode: 'FG-336-01-009-1291', productDescription: 'น้ำหอม 2', saleUnit: null, costPrice: 1.005 } },
  ];
  const supabase = {
    from: (table) => {
      if (table === 'project_products') return { select: () => ({ eq: async () => ({ data: projectRows, error: null }) }) };
      if (table === 'product_types') return { select: async () => ({ data: [], error: null }) };
      throw new Error(`unexpected table: ${table}`);
    },
  };
  const lines = await seedLinesFromProject(supabase, { projectId: 'PJ-1' });
  assert.deepEqual(lines.map((l) => l.lineTotal), [42000, 50, 3.01], 'ปัดสตางค์แล้ว (เดิมเก็บผลคูณดิบ 49.995 / 3.0149999999999997)');
  for (const line of lines) {
    assert.deepEqual([line.discountAmount, line.lineTotal], [0, quoteLineNet({ qty: line.qty, unitPrice: line.unitPrice }).lineTotal]);
    assert.equal('packQty' in line, false, 'ระบบไม่เดาเลขแพ็คให้ — คนออกใบกรอกเอง');
  }
  assert.deepEqual(lines.map((l) => l.unit), ['แพ็คเกจ', 'ชิ้น', 'ชิ้น'], 'หน่วยขายของทะเบียนตามเดิม');
  assert.equal(lines[0].lineTotal, 12 * 3500, 'บรรทัดจำนวนเต็ม × ราคา 2 ตำแหน่ง ได้ค่าเดียวกับที่เคยเก็บ');
  // บรรทัดที่ตั้งต้นแล้วผ่านตัว normalize ได้ทั้งสองกิ่ง (ไม่มีเลขแพ็ค) และ normalize ซ้ำได้ยอดเดิม
  assert.deepEqual(normalizeManualLines(lines).map((l) => l.lineTotal), [42000, 50, 3.01]);
  assert.deepEqual(normalizeManualLines(lines, CLOSED).map((l) => l.lineTotal), [42000, 50, 3.01]);
  // ด่านของบรรทัดที่เซิร์ฟเวอร์สร้างเอง: ไม่บังคับตอนสร้าง (requireOnCategory: false) — แต่บันทึก/ยื่นครั้งถัดไปต้องกรอก (ค่าตั้งต้น)
  assert.deepEqual(linePackIssues(lines, { requireOnCategory: false, numbering: 'submitted' }), []);
  assert.equal(linePackMessage(linePackIssues(lines, { numbering: 'submitted' })), `รายการ 1: ${LINE_PACK_TEXT.required}`);
});

/* ═══ ตัวล้างเลขแพ็คสองตัวของจอ (งวด PR-3 · มติเจ้าของ 08/10 · แผน §2.5 + §12 C8) ═══════════════════════════════════
   เลขแพ็คมีได้เฉพาะหมวด 02-001 — คนเปลี่ยนสินค้า/หมวดออกจากหมวดนั้น เลขถูกล้าง **ต่อหน้าคนที่เปลี่ยน** (ยอดบนจอขยับทันที)
   🔴 จอเท่านั้นที่เรียกสองตัวนี้ (ยามผู้เรียกอยู่ที่ linePackWritePaths.test.mjs) — เซิร์ฟเวอร์ปฏิเสธด้วย not_allowed ไม่ล้างให้ */
const CANDLE = { id: 'P-CANDLE', fgCode: 'FG-278-01-003-0763', productDescription: 'เทียนหอม', saleUnit: 'ชิ้น', costPrice: 250, categoryName: 'เทียนหอม', categoryNameEn: 'Candle' };
const SDS_B = { id: 'P-SDS-B', fgCode: 'FG-306-02-001-1078', productDescription: 'แพ็คเกจ SDS ขนาดเล็ก', saleUnit: 'แพ็คเกจ', costPrice: 1200, categoryName: 'บริการ', categoryNameEn: 'Service' };

test('quoteLineFromProduct ⭐ เปลี่ยนสินค้าออกจากหมวด 02-001: เลขแพ็คที่บรรทัดถืออยู่ถูกล้างเป็น null — ยอด = จำนวน × ราคา · หน่วยของทะเบียน (เดิมเลข 2 ค้างเป็นตัวคูณที่มองไม่เห็น)', () => {
  for (const packQty of [2, '2', 1, ' 43 ']) {
    const line = { productId: 'P-SDS', fgCode: SDS.fgCode, description: 'x', qty: 12, unit: 'เดือน', unitPrice: 3500, packQty, metadata: {} };
    const next = quoteLineFromProduct(line, CANDLE);
    assert.equal(next.packQty, null, `packQty=${JSON.stringify(packQty)}`);
    assert.equal('packQty' in next, true, 'คีย์ยังอยู่ ค่าเป็น null (จอวาดเป็นขีด · คำขอส่ง null = ไม่มีเลขแพ็ค)');
    assert.deepEqual([next.productId, next.fgCode, next.unit, next.unitPrice, next.qty], ['P-CANDLE', CANDLE.fgCode, 'ชิ้น', 250, 12]);
    assert.equal(quoteLineNet(next).lineTotal, 3000, '12 × 250 — ไม่ใช่ 2 × 12 × 250');
    assert.equal(line.packQty, packQty, 'ไม่แก้ของเดิม');
  }
  // ค่าที่ใช้ไม่ได้ก็ถูกล้างเมื่อออกจากหมวด (ไม่ค้างเป็นข้อผิดพลาดบนบรรทัดที่ไม่มีช่องให้แก้)
  for (const packQty of [0, 'abc', 1.5, '10000']) {
    assert.equal(quoteLineFromProduct({ productId: 'P-SDS', fgCode: SDS.fgCode, qty: 1, packQty }, CANDLE).packQty, null, `packQty=${JSON.stringify(packQty)}`);
  }
  // สินค้าตัวใหม่ไม่มีรหัส FG (ถอดหมวดไม่ได้) = ไม่ใช่หมวด 02-001 ⇒ ล้างเหมือนกัน
  assert.equal(quoteLineFromProduct({ productId: 'P-SDS', fgCode: SDS.fgCode, qty: 1, packQty: 2 }, { id: 'P-X' }).packQty, null);
});

test('quoteLineFromProduct: 02-001 → 02-001 เลขแพ็คอยู่ตามเดิม (ราคา/หน่วยตามสินค้าใหม่) · เปลี่ยน **เข้า** 02-001 ไม่เติมอะไรให้ — ไม่มีค่าตั้งต้น', () => {
  const kept = quoteLineFromProduct({ productId: 'P-SDS', fgCode: SDS.fgCode, qty: 12, unitPrice: 3500, packQty: '2' }, SDS_B);
  assert.equal(kept.packQty, '2', 'ค่าเดิมทุกตัวอักษร (ข้อความที่คนพิมพ์ ไม่ถูกแปลงเป็นตัวเลข)');
  assert.deepEqual([kept.productId, kept.unitPrice, kept.unit], ['P-SDS-B', 1200, 'แพ็คเกจ']);
  assert.equal(quoteLineNet(kept).lineTotal, 28800, '2 × 12 × 1,200');
  assert.equal(quoteLineFromProduct({ productId: 'P-SDS', fgCode: SDS.fgCode, qty: 12, packQty: 1 }, SDS_B).packQty, 1);
  // เข้าหมวด 02-001 จากหมวดอื่น / จากบรรทัดเปล่า: ไม่มีคีย์เพิ่ม — ช่องกรอกขึ้นมาว่าง ๆ ให้คนกรอกเอง
  for (const from of [{ productId: 'P-CANDLE', fgCode: CANDLE.fgCode, qty: 3 }, { _lineKind: 'product', qty: 1 }, {}]) {
    const next = quoteLineFromProduct(from, SDS);
    assert.equal('packQty' in next, false, JSON.stringify(from));
  }
});

test('quoteLineFromProduct 🔴 บรรทัดที่ไม่ได้ถือเลขแพ็ค (ไม่มีคีย์ · null · ว่าง · ช่องว่างล้วน) ได้ผลเดิมทุกคีย์ — ไม่เติมคีย์ packQty และไม่เขียนทับค่าว่างที่มีอยู่', () => {
  const base = { key: 'k', productId: 'P-SDS', fgCode: SDS.fgCode, qty: 12, unitPrice: 3500, metadata: { keep: 1 } };
  const without = quoteLineFromProduct(base, CANDLE);
  assert.equal('packQty' in without, false);
  // ผลของบรรทัดที่ไม่มีคีย์ = ค่าที่ตรึงไว้ทั้งก้อน (ลอกจากพฤติกรรมก่อนงวด PR-3 — โค้ด 5bf2c430)
  assert.deepEqual(without, {
    key: 'k', productId: 'P-CANDLE', fgCode: 'FG-278-01-003-0763', qty: 12, unitPrice: 250, unit: 'ชิ้น',
    description: fgLineDescription(CANDLE),
    metadata: { keep: 1, descriptionTh: 'เทียนหอม', descriptionEn: 'เทียนหอม', productBrand: '', categoryName: 'เทียนหอม', categoryNameEn: 'Candle' },
  });
  for (const packQty of [null, undefined, '', '   ']) {
    const next = quoteLineFromProduct({ ...base, packQty }, CANDLE);
    assert.equal('packQty' in next, true);
    assert.equal(next.packQty, packQty, `packQty=${JSON.stringify(packQty)} ต้องไม่ถูกแตะ`);
    const { packQty: _pack, ...rest } = next;
    assert.deepEqual(rest, without, 'ช่องอื่นเท่ากับบรรทัดที่ไม่มีคีย์ทุกช่อง');
  }
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-5 · มติเจ้าของ 23/09 "ต้องไม่ควรแตกต่างจาก form ใบเสนอราคา" + 08/10 ข้อ A1–A2 · ข้อวินิจฉัย 7 ·
   แผน IMPL_PLAN_PR5 §5 แถว G14): เดิมแถวโซนของฟอร์มใบสั่งขายย้อนหลัง **ไม่มีคีย์ `packQty`** และเลือกแพ็คเกจแล้วก็ยังไม่มี — วันนี้แถวถือคีย์นี้เอง
   ตั้งแต่เกิด (เริ่มที่ '' — ช่องเลขแพ็คของตารางใบเสนอราคา ไม่มีค่าตั้งต้น) · ไม่ได้คลายด่าน: ทุกข้อเดิมยังยึดอยู่ในรูปที่เข้มเท่าเดิมหรือกว่า —
   ผลของ `quoteLineFromProduct` ยังเท่ากับค่าที่ตรึงไว้ทุกคีย์ (คีย์ของแถวหลังเลือกแพ็คเกจ = คีย์ของแถวเปล่า + metadata) · ตัวนี้ **ไม่เติมและไม่เขียนทับ**
   เลขแพ็ค (ช่องว่างยังว่าง · เลขที่พิมพ์ไว้อยู่ต่อเมื่อเปลี่ยนแพ็คเกจ 02-001 → 02-001) · `packsPerRound` ยังไม่ใช่ตัวคูณและไม่ถูกอ่าน */
test('quoteLineFromProduct 🔴 แถวโซนของใบสั่งขายย้อนหลัง (งวด PR-5): แถวถือ `packQty` เอง เริ่มที่ว่าง — เลือกแพ็คเกจแล้วยังว่าง · เลขที่พิมพ์ไว้อยู่ต่อ (02-001 → 02-001) · `packsPerRound` ไม่ใช่ตัวคูณและไม่ถูกอ่าน', () => {
  const row = emptyHistoricalZone({ siteId: 'S1', zoneId: 'Z1' });
  assert.equal('packQty' in row, true, 'แถวของฟอร์มย้อนหลังถือคีย์ packQty ตั้งแต่เกิด');
  assert.equal(row.packQty, '', 'เริ่มว่าง — ไม่มีค่าตั้งต้น (ไม่ใช่ 1 · ไม่ใช่ null)');
  assert.equal(row.packsPerRound, '', 'แพ็คต่อรอบของโซนเริ่มว่าง (คนละช่องกับเลขแพ็คของบรรทัด)');
  const expectedOf = (source, product) => {
    const { note: _n, noteEn: _ne, noteAuto: _na, categoryName: _c, categoryNameEn: _ce, categoryCode: _cc, ...keptMeta } = source.metadata || {};
    return {
      ...source,
      productId: product.id,
      fgCode: product.fgCode,
      description: fgLineDescription(product),
      metadata: {
        ...keptMeta, descriptionTh: fgLineDescription(product), descriptionEn: fgLineDescription(product), productBrand: fgLineBrand(product),
        categoryName: product.categoryName, categoryNameEn: product.categoryNameEn,
        ...(product.docNote ? { note: product.docNote, noteEn: product.docNoteEn, noteAuto: true } : {}),
      },
      unit: product.saleUnit,
      unitPrice: product.costPrice,
    };
  };
  // ช่องเลขแพ็คยังว่าง: ทั้งเลือกแพ็คเกจ (หมวด 02-001) และ — ถ้าทะเบียนมีของหมวดอื่นหลุดมา — สินค้าหมวดอื่น: ผลเท่าค่าที่ตรึงไว้ ช่องยังว่าง
  for (const perRound of ['', '1', '2', '43', 2]) {
    for (const product of [SDS, SDS_B, CANDLE]) {
      const source = { ...row, packsPerRound: perRound, qty: '12', rounds: '12' };
      const next = quoteLineFromProduct(source, product);
      assert.deepEqual(next, expectedOf(source, product), `packsPerRound=${JSON.stringify(perRound)} · ${product.id}`);
      assert.equal(next.packQty, '', 'ช่องเลขแพ็คไม่ถูกเติมให้ (ไม่มีค่าตั้งต้น) และไม่ถูกเขียนทับ');
      assert.equal(next.packsPerRound, perRound, 'packsPerRound ไม่ถูกแตะ');
      // ยอดของแถวไม่ถูกคูณด้วย packsPerRound (สูตรเงินอ่าน packQty อย่างเดียว · ช่องว่าง = คูณ 1 ในสูตรกลาง — จอของฟอร์มนี้ขึ้นขีดด้วยด่านของตัวเอง)
      assert.equal(quoteLineNet(next).lineTotal, 12 * product.costPrice);
    }
  }
  // เลขแพ็คที่พิมพ์ไว้: เปลี่ยนแพ็คเกจ 02-001 → 02-001 เลขอยู่ตามเดิมทุกตัวอักษร (ข้อความที่คนพิมพ์ ไม่ถูกแปลงเป็นตัวเลข) และคูณยอด
  for (const typed of ['2', ' 43 ', '1']) {
    const source = { ...quoteLineFromProduct(row, SDS), packQty: typed, packsPerRound: '7', qty: '12', rounds: '12' };
    const next = quoteLineFromProduct(source, SDS_B);
    assert.deepEqual(next, expectedOf(source, SDS_B), `packQty=${JSON.stringify(typed)}`);
    assert.equal(next.packQty, typed);
    assert.equal(next.packsPerRound, '7');
    assert.equal(quoteLineNet(next).lineTotal, Number(typed) * 12 * SDS_B.costPrice, 'เลขแพ็ค × จำนวน × ราคา — packsPerRound 7 ไม่เข้าสูตร');
  }
  // กติกาเดิมของตัวล้าง (งวด PR-3) ใช้กับแถวนี้เหมือนทุกบรรทัด: เลขที่ถืออยู่ถูกล้างเมื่อเปลี่ยนเป็นสินค้านอกหมวด 02-001
  // (ช่องเลือกของฟอร์มใบย้อนหลังเสนอเฉพาะหมวด 02-001 จึงไม่มีทางเกิดจากจอ — ยึดไว้ว่าถ้าเกิด เลขไม่ค้างเป็นตัวคูณที่มองไม่เห็น)
  assert.equal(quoteLineFromProduct({ ...quoteLineFromProduct(row, SDS), packQty: '2', qty: '12' }, CANDLE).packQty, null);
  // คีย์ของแถวหลังเลือกแพ็คเกจ = คีย์ของแถวเปล่า + metadata (ชื่อ/แบรนด์/หมวดของสินค้า) เท่านั้น — ไม่มีคีย์อื่นงอก
  assert.deepEqual(Object.keys(quoteLineFromProduct(row, SDS)).sort(), [...Object.keys(row), 'metadata'].sort());
  assert.equal(quoteLineFromProduct(row, SDS).packQty, '');
});

test('manualLineCategoryPatch ⭐ เปลี่ยนหมวดของบรรทัดพิมพ์เองออกจาก 02-001 (หรือเป็น "ไม่ระบุ"): metadata ชุดใหม่ + เลขแพ็คถูกล้างเป็น null · ยอดขยับตาม', () => {
  const SERVICE = { mainCategoryCode: '02', typeCode: '001', nameTh: 'บริการเครื่องพ่น', nameEn: 'Scent service' };
  const OTHER = { mainCategoryCode: '02', typeCode: '010', nameTh: 'ค่าติดตั้ง', nameEn: 'Installation' };
  const line = { description: 'ค่าบริการรายเดือน', qty: 6, unit: 'เดือน', unitPrice: 1200, packQty: '3', metadata: manualLineCategoryEdit({ note: 'ส่งทุกเดือน' }, SERVICE) };
  assert.equal(quoteLineNet(line).lineTotal, 21600);
  for (const [label, row] of [['หมวดอื่น', OTHER], ['ไม่ระบุ', null]]) {
    const patch = manualLineCategoryPatch(line, row);
    assert.deepEqual(Object.keys(patch), ['metadata', 'packQty'], label);
    assert.equal(patch.packQty, null, label);
    assert.deepEqual(patch.metadata, manualLineCategoryEdit(line.metadata, row), `${label}: metadata = ผลของ manualLineCategoryEdit ตัวเดิม`);
    assert.equal(quoteLineNet({ ...line, ...patch }).lineTotal, 7200, `${label}: 6 × 1,200 — ตัวคูณ 3 หายไปต่อหน้าคนที่เปลี่ยน`);
  }
  assert.equal(line.packQty, '3', 'ไม่แก้ของเดิม');
  // ค่าที่ใช้ไม่ได้ก็ถูกล้างเมื่อออกจากหมวด
  for (const packQty of [0, 'abc', 1.5]) assert.equal(manualLineCategoryPatch({ ...line, packQty }, OTHER).packQty, null, `packQty=${JSON.stringify(packQty)}`);
});

test('manualLineCategoryPatch: อยู่ในหมวด 02-001 ต่อ / เปลี่ยน **เข้า** 02-001 = ไม่แตะเลขแพ็ค · บรรทัดที่ไม่ได้ถือค่า = `{ metadata }` อย่างเดียว (ไม่เติมคีย์ให้ใคร)', () => {
  const SERVICE = { mainCategoryCode: '02', typeCode: '001', nameTh: 'บริการเครื่องพ่น', nameEn: 'Scent service' };
  const OTHER = { mainCategoryCode: '02', typeCode: '010', nameTh: 'ค่าติดตั้ง', nameEn: 'Installation' };
  const only = (patch, metadata) => { assert.deepEqual(Object.keys(patch), ['metadata']); assert.deepEqual(patch.metadata, metadata); };
  // 02-001 → 02-001 (เลือกหมวดเดิมซ้ำ): เลขอยู่ตามเดิม
  const inService = { description: 'x', qty: 6, unitPrice: 1200, packQty: '3', metadata: manualLineCategoryEdit({}, SERVICE) };
  only(manualLineCategoryPatch(inService, SERVICE), manualLineCategoryEdit(inService.metadata, SERVICE));
  // เข้าหมวด 02-001: ไม่มีค่าตั้งต้น — ช่องกรอกขึ้นมาว่าง ๆ
  for (const from of [{ description: 'x', metadata: {} }, { description: 'x', metadata: manualLineCategoryEdit({}, OTHER) }, { description: 'x' }]) {
    only(manualLineCategoryPatch(from, SERVICE), manualLineCategoryEdit(from.metadata, SERVICE));
  }
  // บรรทัดที่ไม่ได้ถือค่า ออกจากหมวด: ไม่มีคีย์ packQty ในแพตช์ (ค่าว่างที่มีอยู่ไม่ถูกเขียนทับ)
  for (const packQty of [undefined, null, '', '  ']) {
    const line = { description: 'x', qty: 1, unitPrice: 1, metadata: manualLineCategoryEdit({}, SERVICE), ...(packQty === undefined ? {} : { packQty }) };
    only(manualLineCategoryPatch(line, OTHER), manualLineCategoryEdit(line.metadata, OTHER));
    only(manualLineCategoryPatch(line, null), manualLineCategoryEdit(line.metadata, null));
  }
  // บรรทัดที่ถือเลขแพ็คโดยไม่มีหมวด (ค่าค้างจากที่อื่น) แล้วเลือกหมวดอื่น = ล้าง · เลือก 02-001 = อยู่
  assert.equal(manualLineCategoryPatch({ description: 'x', packQty: 2, metadata: {} }, OTHER).packQty, null);
  only(manualLineCategoryPatch({ description: 'x', packQty: 2, metadata: {} }, SERVICE), manualLineCategoryEdit({}, SERVICE));
  only(manualLineCategoryPatch(null, SERVICE), manualLineCategoryEdit(undefined, SERVICE));
});
