// ── สินค้า "ค่าภาษีสรรพสามิต" (04-003) + บรรทัดของใบเสนอราคาค่าสรรพสามิต (แผนรื้อสรรพสามิต PR2 · หมวด 3.3–3.4) ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXCISE_CHARGE_CATEGORY_CODE, EXCISE_CHARGE_LINE_KIND, buildExciseQuotationLines, exciseChargeFgCode,
  isExciseChargeProduct,
} from './exciseCharge.js';
import { ensureExciseChargeProduct } from './exciseChargeProduct.js';
import { resolveSoFiling } from './soFiling.js';
import { exciseChargeLinesAdded, enforceMasterPrices } from '../sales/quoteLines.js';
import { isProductCategorySelectable } from '../master/productCategory.js';
import { quoteLineNet } from '../salesPlanning.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── 1. รหัสสินค้า: ท่อนรหัสลูกค้าตามแบบที่ลูกค้ารายนั้นใช้อยู่ (มติ D5) ───────────────────────────
test('รหัส 04-003: สินค้ากลุ่ม 04 ของลูกค้าก่อน → FG ต้นทาง → รูปมาตรฐาน 4 หลัก', () => {
  assert.equal(exciseChargeFgCode({ arCode: 'AR-108', group04Codes: ['FG-108-04-008'], sourceFgCodes: ['FG-0108-01-002-0001'] }), 'FG-108-04-003');
  assert.equal(exciseChargeFgCode({ arCode: 'AR-108', sourceFgCodes: ['FG-0108-01-002-00012'] }), 'FG-0108-04-003');
  assert.equal(exciseChargeFgCode({ arCode: 'AR-108', sourceFgCodes: ['FG-108-01-002-0001'] }), 'FG-108-04-003');
  assert.equal(exciseChargeFgCode({ arCode: 'AR-108' }), 'FG-0108-04-003');
  assert.equal(exciseChargeFgCode({ arCode: 'AR-1058', group04Codes: ['FG-1058-04-001'] }), 'FG-1058-04-003');
  // รหัสของลูกค้ารายอื่นที่ติดมา (FG ข้ามใบลูกค้าของนิติบุคคลเดียวกัน) ไม่ใช่แบบของลูกค้ารายนี้ — ข้ามไป
  assert.equal(exciseChargeFgCode({ arCode: 'AR-108', sourceFgCodes: ['FG-0109-01-002-0001'] }), 'FG-0108-04-003');
  assert.equal(exciseChargeFgCode({ arCode: 'CUS-ไม่ใช่ AR' }), null);
});

test('isExciseChargeProduct: หมวดของแถวก่อน · หมวดว่างอ่านจากรหัส', () => {
  assert.equal(isExciseChargeProduct({ categoryCode: '04-003' }), true);
  assert.equal(isExciseChargeProduct({ fgCode: 'FG-108-04-003' }), true);
  assert.equal(isExciseChargeProduct({ categoryCode: '04-008', fgCode: 'FG-108-04-008' }), false);
  assert.equal(isExciseChargeProduct(null), false);
});

// ── 2. ตัวสร้างบรรทัด ────────────────────────────────────────────────────────────────────
const productTypes = [{ mainCategoryCode: '01', typeCode: '002', isExcise: true }];
const salesOrder = { id: 'SO-1', status: 'approved', customerId: 'C-1' };
const fg = { id: 'P-1', fgCode: 'FG-0108-01-002-00001', exciseTax: 8.044, localTax: 0.8044, retailPriceIncVat: 107.5, saleUnit: 'ขวด' };
const fgNoPrice = { id: 'P-2', fgCode: 'FG-0108-01-002-00002', exciseTax: 0, localTax: 0 };
const charge = { id: 'PRD-X', fgCode: 'FG-0108-04-003', categoryCode: '04-003', customerId: 'C-1' };
const soLines = [
  { id: 'L-1', productId: 'P-1', fgCode: fg.fgCode, qty: 12, packQty: 2, unit: 'ขวด', description: 'น้ำหอม A', metadata: { descriptionEn: 'Perfume A' } },
  { id: 'L-2', productId: 'P-2', fgCode: fgNoPrice.fgCode, qty: 5, unit: 'ชิ้น', description: 'น้ำหอม B' },
];

test('buildExciseQuotationLines: บรรทัดละ FG ต้นทาง · จำนวน = หน่วยรวม · ราคา = ภาษี/ชิ้น ปัดครั้งเดียว · ยอดตามกฎเงินของบรรทัด', () => {
  const filing = resolveSoFiling({ salesOrder, productTypes, products: [fg, fgNoPrice], lines: soLines });
  const lines = buildExciseQuotationLines({ filing, chargeProduct: charge, sourceLines: soLines, products: [fg, fgNoPrice] });
  assert.equal(lines.length, 2, 'บรรทัดที่ภาษีเป็น 0 (ไม่มีฐานภาษี) ยังอยู่ ให้ผู้ออกใบเห็นว่าขาดอะไร');
  const [first, second] = lines;
  assert.equal(first.productId, 'PRD-X');
  assert.equal(first.fgCode, 'FG-0108-04-003');
  assert.equal(first.qty, 24, '2 แพ็ค × 12 = 24 หน่วย');
  assert.equal(first.unitPrice, 8.85, '8.044 + 0.8044 → ปัดครั้งเดียว 8.85');
  assert.equal(first.unit, 'ขวด');
  assert.equal(first.lineTotal, 212.4);
  assert.equal(first.lineTotal, quoteLineNet({ qty: first.qty, unitPrice: first.unitPrice }).lineTotal, 'ตรงกับกฎเงินของบรรทัด (CHECK 0407)');
  assert.equal('packQty' in first, false, 'ไม่มีเลขแพ็ค (ทริกเกอร์ 0410 ดูเฉพาะ 02-001)');
  assert.equal(first.source, EXCISE_CHARGE_LINE_KIND);
  assert.equal(first.metadata.lineKind, EXCISE_CHARGE_LINE_KIND);
  assert.equal(first.metadata.sourceSalesOrderLineId, 'L-1');
  assert.equal(first.metadata.sourceFgCode, fg.fgCode);
  assert.equal(first.metadata.excisePerUnit + first.metadata.localPerUnit, 8.85);
  assert.equal(first.metadata.retailPriceIncVat, 107.5);
  // มติ 29/10: คำอธิบาย = รหัส FG ต้นทาง + ชื่อ (ชื่อสินค้า 04-003 อยู่บรรทัดแรกของรายการแล้ว)
  assert.equal(first.description, 'FG-0108-01-002-00001 น้ำหอม A');
  assert.equal(first.metadata.descriptionEn, 'FG-0108-01-002-00001 Perfume A');
  assert.equal(second.unitPrice, 0);
  assert.equal(second.metadata.taxBaseMissing, true);
  assert.throws(() => buildExciseQuotationLines({ filing, chargeProduct: null }), /04-003/);
});

/* 🐞 ใบทดลอง QT-26100568-0 (29/10): รหัส FG บนบรรทัด SO เก่ามีแท็บท้ายรหัส ('FG-108-01-002-0738\t\t') ⇒ ตามไปถึงคำอธิบาย
   บรรทัดใบค่าสรรพสามิตและ metadata.sourceFgCode · ตัดที่ตัวคิดของ SO (soFiling) ตัวเดียว ทุกปลายทางได้รหัสสะอาด */
test('รหัส FG ที่มีแท็บ/ช่องว่างท้ายรหัส ไม่ตามไปถึงคำอธิบายบรรทัดและ sourceFgCode', () => {
  const dirty = soLines.map((line, index) => (index === 0 ? { ...line, fgCode: `${line.fgCode}\t\t` } : line));
  const filing = resolveSoFiling({ salesOrder, productTypes, products: [fg, fgNoPrice], lines: dirty });
  assert.equal(filing.lines[0].fgCode, fg.fgCode);
  const [first] = buildExciseQuotationLines({ filing, chargeProduct: charge, sourceLines: dirty, products: [fg, fgNoPrice] });
  assert.equal(first.description, `${fg.fgCode} น้ำหอม A`);
  assert.equal(first.metadata.sourceFgCode, fg.fgCode);
  assert.doesNotMatch(first.description, /\t/);
});

test('ใบยื่นจาก SO ตัดบรรทัดค่าภาษีสรรพสามิตทิ้ง — ไม่ยื่นภาษีซ้อนภาษี แม้หมวดถูกติ๊กสรรพสามิตผิด', () => {
  const ticked = [...productTypes, { mainCategoryCode: '04', typeCode: '003', isExcise: true }];
  const result = resolveSoFiling({
    salesOrder, productTypes: ticked, products: [fg, { ...charge, exciseTax: 1, localTax: 0.1, isExciseTaxable: true }],
    lines: [soLines[0], { id: 'L-9', productId: 'PRD-X', fgCode: charge.fgCode, qty: 24 }],
  });
  assert.deepEqual(result.lines.map((l) => l.salesOrderLineId), ['L-1']);
});

// ── 3. ตัวสร้างสินค้า (ฝั่ง server · supabase ปลอม) ────────────────────────────────────────────
function fakeDb({ existing = null, group04 = [], sameCode = null, insertError = null, afterRace = null } = {}) {
  const calls = { inserts: [] };
  let raced = false;
  const db = {
    calls,
    from(table) {
      assert.equal(table, 'products');
      const q = { filters: [] };
      const b = {
        select() { return b; },
        eq(col, val) { q.filters.push(['eq', col, val]); return b; },
        like(col, val) { q.filters.push(['like', col, val]); return b; },
        order() { return b; },
        limit: async () => {
          if (q.filters.some(([op]) => op === 'like')) return { data: group04.map((fgCode) => ({ fgCode })), error: null };
          if (raced && afterRace) return { data: [afterRace], error: null };
          return { data: existing ? [existing] : [], error: null };
        },
        maybeSingle: async () => ({ data: sameCode, error: null }),
        insert(row) {
          calls.inserts.push(row);
          return { select: () => ({ single: async () => {
            if (insertError) { raced = true; return { data: null, error: insertError }; }
            return { data: { ...row }, error: null };
          } }) };
        },
      };
      return b;
    },
  };
  return db;
}
const customer = { id: 'C-1', arCode: 'AR-108', name: 'บริษัท ทดสอบ จำกัด' };
const user = { id: 'U-1', name: 'SA หนึ่ง', team: 'KA' };
const writers = () => {
  const log = { audit: [], history: [] };
  return { log, audit: async (e) => { log.audit.push(e); }, priceHistory: async (e) => { log.history.push(e); } };
};

test('ensureExciseChargeProduct: มีแล้ว = ใช้ตัวเดิม ไม่สร้างซ้ำ ไม่เขียน audit', async () => {
  const w = writers();
  const db = fakeDb({ existing: charge });
  const result = await ensureExciseChargeProduct(db, { customer, user, ...w });
  assert.deepEqual(result, { product: charge, created: false });
  assert.equal(db.calls.inserts.length, 0);
  assert.equal(w.log.audit.length, 0);
});

test('ensureExciseChargeProduct: ไม่มี = สร้างอนุมัติแล้ว · ไม่เสียภาษี (ระบุชัด) · ไม่มีราคา · รหัสตามแบบของลูกค้า · ลง audit + ประวัติราคา', async () => {
  const w = writers();
  const db = fakeDb({ group04: ['FG-108-04-008'] });
  const result = await ensureExciseChargeProduct(db, { customer, sourceFgCodes: [fg.fgCode], user, ...w });
  assert.equal(result.created, true);
  const row = db.calls.inserts[0];
  assert.equal(row.fgCode, 'FG-108-04-003');
  assert.equal(row.categoryCode, EXCISE_CHARGE_CATEGORY_CODE);
  assert.equal(row.customerId, 'C-1');
  assert.equal(row.approvalStatus, 'approved');
  assert.equal(row.isActive, true);
  assert.equal(row.isExciseTaxable, false, 'ค่าตั้งต้นของคอลัมน์เป็น TRUE — ต้องระบุ false ชัด');
  assert.equal(row.exciseTax, 0);
  assert.equal(row.costPrice, null);
  assert.equal(row.retailPriceIncVat, null);
  assert.equal(row.ownerId, null, 'ownerId เป็น uuid — ไม่ประทับเจ้าของจากคนกด');
  assert.equal(w.log.audit.length, 1);
  assert.equal(w.log.audit[0].action, 'create');
  assert.equal(w.log.history.length, 1);
});

test('ensureExciseChargeProduct: ออกใบพร้อมกัน (23505) = อ่านซ้ำแล้วใช้ตัวที่ชนะ · รหัสชนลูกค้าอื่น = 409 · AR ผิดรูป = 400', async () => {
  const raced = await ensureExciseChargeProduct(
    fakeDb({ insertError: { code: '23505', message: 'dup' }, afterRace: charge }), { customer, user, ...writers() },
  );
  assert.deepEqual(raced, { product: charge, created: false });
  const clash = await ensureExciseChargeProduct(
    fakeDb({ sameCode: { ...charge, customerId: 'C-OTHER' } }), { customer, user, ...writers() },
  );
  assert.equal(clash.status, 409);
  const mine = await ensureExciseChargeProduct(
    fakeDb({ sameCode: { ...charge, categoryCode: null } }), { customer, user, ...writers() },
  );
  assert.equal(mine.created, false, 'รหัสเดียวกันของลูกค้ารายนี้ (หมวดว่าง) = ตัวเดิม');
  const bad = await ensureExciseChargeProduct(fakeDb(), { customer: { id: 'C-2', arCode: 'XX' }, ...writers() });
  assert.equal(bad.status, 400);
});

// ── 4. ใบขายใส่สินค้า 04-003 ไม่ได้ · ใบค่าสรรพสามิตไม่ถูกทับราคา ───────────────────────────────
/* ทะเบียนลูกค้าว่าง (ตัวหาใบลูกค้าพี่น้องของ FG ข้ามลูกค้า) — ทุกเมธอดคืนตัวเอง · await ได้ผลว่าง */
const emptyQuery = () => {
  const q = new Proxy({}, {
    get: (_t, key) => (key === 'then'
      ? (resolve) => resolve({ data: [], error: null })
      : () => q),
  });
  return q;
};
const productDb = (rows) => ({
  from: (table) => {
    if (table === 'customers') return emptyQuery();
    if (table !== 'products') throw new Error(`ตารางที่ไม่ได้ประกาศ: ${table}`);
    /* `in()` ใช้ได้ทั้งแบบ await ตรง (enforceMasterPrices) และแบบไล่หน้า `.order().range()` (exciseChargeLinesAdded) */
    return {
      select: () => ({
        in: (_c, ids) => {
          const result = { data: rows.filter((r) => ids.includes(r.id)), error: null };
          const page = { order: () => page, range: async () => result, then: (resolve) => resolve(result) };
          return page;
        },
      }),
    };
  },
});

test('exciseChargeLinesAdded: จับเฉพาะบรรทัดที่เพิ่งใส่ · ใบค่าสรรพสามิตไม่ตรวจ', async () => {
  const db = productDb([charge, { id: 'P-1', fgCode: fg.fgCode, categoryCode: '01-002' }]);
  const lines = [{ productId: 'PRD-X' }, { productId: 'P-1' }];
  assert.deepEqual((await exciseChargeLinesAdded(db, lines)).map((p) => p.id), ['PRD-X']);
  assert.deepEqual(await exciseChargeLinesAdded(db, lines, { previousLines: [{ productId: 'PRD-X' }] }), []);
  assert.deepEqual(await exciseChargeLinesAdded(db, lines, { origin: 'excise' }), []);
  assert.deepEqual(await exciseChargeLinesAdded(db, [{ description: 'พิมพ์เอง' }]), []);
});

test('enforceMasterPrices: ใบค่าสรรพสามิตไม่ทับราคา/คำอธิบายของบรรทัด 04-003 ของลูกค้าเจ้าของใบ · ใบขายทับตามเดิม', async () => {
  const db = productDb([{ ...charge, productDescription: 'ค่าภาษีสรรพสามิต', costPrice: 999, saleUnit: 'ชิ้น' }]);
  const line = { productId: 'PRD-X', fgCode: charge.fgCode, qty: 24, unitPrice: 8.85, unit: 'ขวด', description: 'ค่าภาษีสรรพสามิต 8.8% — FG A', lineTotal: 212.4, metadata: {} };
  const kept = await enforceMasterPrices(db, [line], [], { customerId: 'C-1', origin: 'excise' });
  assert.equal(kept[0], line);
  const otherCustomer = await enforceMasterPrices(db, [line], [], { customerId: 'C-9', origin: 'excise' });
  assert.equal(otherCustomer[0].unitPrice, 999, 'สินค้า 04-003 ของลูกค้าอื่น = ไม่ใช่ข้อยกเว้น');
  const pipeline = await enforceMasterPrices(db, [line], [], { customerId: 'C-1' });
  assert.equal(pipeline[0].unitPrice, 999);
});

// ── 5. ทางสร้าง/เลือกด้วยมือปิดครบ ────────────────────────────────────────────────────────────
test('หมวด 04-003 ไม่ขึ้นในตัวเลือกหมวด ยกเว้นค่าที่เลือกอยู่แล้ว', () => {
  const row = { mainCategoryCode: '04', typeCode: '003', isActive: true };
  assert.equal(isProductCategorySelectable(row, ''), false);
  assert.equal(isProductCategorySelectable(row, '04-008'), false);
  assert.equal(isProductCategorySelectable(row, '04-003'), true);
  assert.equal(isProductCategorySelectable({ mainCategoryCode: '04', typeCode: '008', isActive: true }, ''), true);
});

test('route สินค้า: POST ปฏิเสธ 04-003 · PATCH ปฏิเสธย้ายเข้า/ออก/เปลี่ยนรหัส-เจ้าของ · ตัวเลือกของจอขายตัด 04-003', () => {
  const post = code('../../app/api/products/route.js');
  assert.match(post, /if \(isExciseChargeProduct\(\{ categoryCode, fgCode: body\.fgCode \}\)\) \{\s*return Response\.json\(\{ error: EXCISE_CHARGE_MANUAL_MESSAGE \}, \{ status: 400 \}\);/);
  assert.match(post, /p\.categoryCode !== EXCISE_CHARGE_CATEGORY_CODE/);
  const patch = code('../../app/api/products/[id]/route.js');
  assert.match(patch, /chargeBefore !== chargeAfter\s*\|\| updated\.fgCode !== product\.fgCode\s*\|\| updated\.customerId !== product\.customerId/);
});

test('ทุกทางที่บันทึกบรรทัดใบเสนอราคาเรียกด่าน 04-003 และส่ง origin เข้า enforceMasterPrices', () => {
  const patch = code('../../app/api/sales-planning/quotations/[id]/route.js');
  assert.match(patch, /exciseChargeLinesAdded\(supabase, newLines, \{\s*previousLines: before\.lines \|\| \[\], origin: before\.origin,/);
  assert.match(patch, /customerId: before\.customerId, origin: before\.origin,/);
  const revise = code('../../app/api/sales-planning/quotations/[id]/revise/route.js');
  assert.match(revise, /exciseChargeLinesAdded\(supabase, revLines, \{\s*previousLines: quote\.lines \|\| \[\], origin: quote\.origin,/);
  assert.match(revise, /customerId: quote\.customerId, origin: quote\.origin,/);
  const create = code('../sales/createQuotationDraft.js');
  assert.match(create, /exciseChargeLinesAdded\(supabase, manualLines\)/);
  assert.match(create, /exciseChargeLinesAdded\(supabase, lines\)/);
});

/* 🐞 PR2 แก้ H2 ที่ตัวตัดสินแล้ว แต่ตัวโหลดทะเบียนสามตัวไม่ได้ select `isExciseTaxable` ⇒ คำตัดสินของ RA ไม่เคยถึงตัวตัดสินจริง
   (ค่า undefined = เสียภาษีตามปกติ) · พบตอนทำ PR3 (28/10) — ทุกตัวโหลดที่ป้อน resolveSoFiling ต้องพกช่องนี้ */
test('🔴 ตัวโหลดทะเบียนที่ป้อนใบยื่นจาก SO พก isExciseTaxable (คำตัดสินของ RA ต้องถึงตัวตัดสิน)', () => {
  for (const path of [
    './soFilingItems.js',
    '../../app/api/tax/orders/from-sales-order/route.js',
    '../sales/handoffQueueData.js',
  ]) {
    const src = code(path);
    const selects = [...src.matchAll(/from\(\s*["']excise_registrations["']\s*\)\s*\.select\(([^)]*)\)/g)].map((m) => m[1]);
    assert.ok(selects.length > 0, `${path}: หา select ของทะเบียนไม่เจอ`);
    for (const select of selects) assert.match(select, /isExciseTaxable|\*/, `${path}: ${select}`);
  }
});
