import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterProducts, isProductTaxable, productCategoryCode, productCategoryLabel, productExciseBadge, productFilterFacets,
  productShowsRetailPrice, productStatCounts,
} from './productFilter.js';
import { isProductExciseTaxable } from '../tax/taxableProducts.js';

const TYPES = [
  { mainCategoryCode: '01', mainCategoryName: 'ODM', typeCode: '002', nameTh: 'น้ำหอมสำหรับผิวกาย', nameEn: 'BODY PERFUME', isExcise: true },
  { mainCategoryCode: '03', mainCategoryName: 'OEM', typeCode: '001', nameTh: 'วัตถุดิบ', nameEn: 'RAW', isExcise: false },
];
const P = (over) => ({ fgCode: 'FG-1', productDescription: 'ก', isActive: true, ...over });

test('เลิกใช้ถูกตัดออก จนกว่าจะติ๊ก "รวมสินค้าที่เลิกใช้"', () => {
  const rows = [P({ fgCode: 'A' }), P({ fgCode: 'B', isActive: false })];
  assert.deepEqual(filterProducts(rows).map((r) => r.fgCode), ['A']);
  assert.deepEqual(filterProducts(rows, { showInactive: true }).map((r) => r.fgCode), ['A', 'B']);
});

test('สถานะอนุมัติ: NULL ของแถวเก่านับเป็น approved', () => {
  const rows = [P({ fgCode: 'A' }), P({ fgCode: 'B', approvalStatus: 'pending' })];
  assert.deepEqual(filterProducts(rows, { statuses: ['approved'] }).map((r) => r.fgCode), ['A']);
  assert.deepEqual(filterProducts(rows, { statuses: ['pending'] }).map((r) => r.fgCode), ['B']);
});

// มิติ "ขึ้นทะเบียน" มีความหมายเฉพาะหมวดสรรพสามิต — เลือกแล้วหมวดอื่นหายทั้งหมด
test('ตัวกรองขึ้นทะเบียนตัดสินค้าหมวดอื่นทิ้งทั้งหมด', () => {
  const rows = [
    P({ fgCode: 'A', categoryCode: '01-002', registrationStatus: 'none' }),
    P({ fgCode: 'B', categoryCode: '01-002', registrationStatus: 'approved' }),
    P({ fgCode: 'C', categoryCode: '03-001' }), // ไม่ใช่หมวดสรรพสามิต
  ];
  const out = filterProducts(rows, { registrations: ['none'], productTypes: TYPES });
  assert.deepEqual(out.map((r) => r.fgCode), ['A']);
});

test('ค้นได้ทั้งรหัส ชื่อสองภาษา แบรนด์ และชื่อหมวด', () => {
  const rows = [
    P({ fgCode: 'FG-108', productDescription: 'น้ำหอม', productDescriptionEn: 'Perfume', brandName: 'Artepola', categoryCode: '01-002' }),
    P({ fgCode: 'FG-999', productDescription: 'อื่น', categoryCode: '03-001' }),
  ];
  const hits = (q) => filterProducts(rows, { search: q, productTypes: TYPES }).map((r) => r.fgCode);
  assert.deepEqual(hits('108'), ['FG-108']);
  assert.deepEqual(hits('perfume'), ['FG-108']);      // ไม่สนตัวพิมพ์
  assert.deepEqual(hits('ARTEPOLA'), ['FG-108']);
  assert.deepEqual(hits('BODY PERFUME'), ['FG-108']); // ชื่อหมวด
  assert.deepEqual(hits('  '), ['FG-108', 'FG-999']); // ช่องว่างล้วน = ไม่กรอง
});

test('ไม่ส่ง productTypes มา = ค้นชื่อหมวดไม่เจอ (กับดักที่ต้องรู้)', () => {
  const rows = [P({ fgCode: 'FG-108', categoryCode: '01-002' })];
  assert.deepEqual(filterProducts(rows, { search: 'BODY PERFUME' }), []);
  assert.equal(productCategoryLabel(rows[0], []), null);
  assert.deepEqual(productCategoryLabel(rows[0], TYPES), { main: 'ODM', sub: 'BODY PERFUME · น้ำหอมสำหรับผิวกาย' });
});

test('หมวดถอดจาก fgCode ได้เมื่อแถวเก่าไม่มี categoryCode', () => {
  const legacy = P({ fgCode: 'FG-108-01-002-2009' });
  assert.equal(productCategoryLabel(legacy, TYPES)?.main, 'ODM');
});

/* ── ตรวจตัวเลข M21a (20/10): เลขบนตัวเลือก = แถวหลังติ๊ก ภายใต้ตัวกรองอื่นที่ติดอยู่ ─────────────────────── */
const subsets = (values) => values.reduce((acc, v) => acc.concat(acc.map((s) => [...s, v])), [[]]);
const FACET_ROWS = [
  // ต้องเสียภาษี (หมวด 01-002) ไม่มีราคา × ใช้อยู่/เลิกใช้ × สถานะ
  P({ fgCode: 'A1', categoryCode: '01-002', approvalStatus: 'approved', registrationStatus: 'none', brandName: 'ร้อน' }),
  P({ fgCode: 'A2', categoryCode: '01-002', approvalStatus: 'pending', registrationStatus: 'none' }),
  P({ fgCode: 'A3', categoryCode: '01-002', approvalStatus: 'approved', isActive: false, registrationStatus: 'approved', brandName: 'ร้อน' }),
  P({ fgCode: 'A4', categoryCode: '01-002', approvalStatus: 'pending', isActive: false, registrationStatus: 'none' }),
  // มีราคาแล้ว
  P({ fgCode: 'B1', categoryCode: '01-002', approvalStatus: 'approved', retailPriceIncVat: 590, registrationStatus: 'approved' }),
  P({ fgCode: 'B2', categoryCode: '01-002', approvalStatus: 'rejected', isActive: false, retailPriceIncVat: 590, registrationStatus: 'none' }),
  // หมวดไม่เสียภาษี — ไม่นับว่าขาดราคา (ยกเว้นธงรายตัวบังคับ)
  P({ fgCode: 'C1', categoryCode: '03-001', approvalStatus: 'approved', brandName: 'ร้อน' }),
  P({ fgCode: 'C2', categoryCode: '03-001', approvalStatus: 'pending', isActive: false }),
  P({ fgCode: 'C3', categoryCode: '03-001', approvalStatus: 'approved', isExciseTaxable: true }),
  // ธงรายตัวยกเว้นแม้หมวดเสียภาษี
  P({ fgCode: 'D1', categoryCode: '01-002', approvalStatus: 'approved', isExciseTaxable: false }),
];

test('🔴 M21a: ทุกคำค้น × สถานะ × ทะเบียน × ติ๊กค้าง — "ขาดราคาขายปลีก (n)" = แถวหลังติ๊ก · "รวมที่เลิกใช้ (n)" = แถวที่เพิ่มขึ้น', () => {
  let checked = 0;
  for (const search of ['', 'ร้อน', 'A', 'ไม่มี']) {
    for (const statuses of subsets(['pending', 'approved', 'rejected'])) {
      for (const registrations of [[], ['none'], ['approved', 'none']]) {
        for (const showInactive of [false, true]) {
          for (const missingRetailPrice of [false, true]) {
            const state = { search, statuses, registrations, showInactive, missingRetailPrice, productTypes: TYPES };
            const facets = productFilterFacets(FACET_ROWS, state);
            const afterMissing = filterProducts(FACET_ROWS, { ...state, missingRetailPrice: true });
            assert.equal(facets.missingPrice, afterMissing.length, JSON.stringify(state));
            const off = filterProducts(FACET_ROWS, { ...state, showInactive: false });
            const on = filterProducts(FACET_ROWS, { ...state, showInactive: true });
            assert.equal(facets.inactive, on.length - off.length, JSON.stringify(state));
            // ติ๊ก "รวม" ไม่ทำให้แถวเดิมหาย — เพิ่มอย่างเดียว
            assert.ok(off.every((r) => on.includes(r)));
            assert.ok(facets.inactive >= 0);
            checked += 1;
          }
        }
      }
    }
  }
  assert.ok(checked > 300);
  // ตัวอย่างในผลตรวจ: ทะเบียนเปล่า — ทั้งกองขาดราคา 5 ตัว (A1–A4 · C3) ซึ่งตัวเดิมโชว์ "(5)" แต่ใบเลิกใช้ซ่อน ⇒ ติ๊กแล้วได้ 3
  assert.equal(filterProducts(FACET_ROWS, { showInactive: true, missingRetailPrice: true, productTypes: TYPES }).length, 5);
  const plain = productFilterFacets(FACET_ROWS, { productTypes: TYPES });
  assert.equal(plain.missingPrice, 3);
  assert.equal(plain.inactive, 4);
  // กรอง "รออนุมัติ" อยู่: ใบเลิกใช้ที่รออนุมัติขึ้นอยู่แล้ว (H3) ⇒ ติ๊กรวมไม่เพิ่มแถว
  assert.equal(productFilterFacets(FACET_ROWS, { statuses: ['pending'], productTypes: TYPES }).inactive, 0);
});

test('M20b: StatCards สินค้า — ทั้งหมด/อนุมัติแล้ว = แถวหลังตั้งตัวกรอง · ต้องเสียภาษี ใช้กฎเดียวของระบบบนชุดเดียวกับ "ทั้งหมด"', () => {
  const stats = productStatCounts(FACET_ROWS, TYPES);
  assert.equal(stats.total, filterProducts(FACET_ROWS, { productTypes: TYPES }).length);
  assert.equal(stats.approved, filterProducts(FACET_ROWS, { statuses: ['approved'], productTypes: TYPES }).length);
  assert.equal(stats.rejected, filterProducts(FACET_ROWS, { statuses: ['rejected'], productTypes: TYPES }).length);
  assert.equal(stats.pending, filterProducts(FACET_ROWS, { statuses: ['pending'], productTypes: TYPES }).length);
  const defaults = filterProducts(FACET_ROWS, { productTypes: TYPES });
  assert.equal(stats.taxable, defaults.filter((p) => isProductExciseTaxable(p, TYPES)).length);
  // A1 A2 B1 (หมวดเสียภาษี) + C3 (ธงบังคับ) · ไม่นับ C1 (หมวดไม่เสีย) · D1 (ธงยกเว้น) · ใบเลิกใช้
  assert.equal(stats.taxable, 4);
  // ตัวเดิม `isExciseTaxable !== false` ให้ 5 บนชุดเดียวกัน (โป่งด้วย C1)
  assert.equal(defaults.filter((p) => p.isExciseTaxable !== false).length, 5);
});

test('ด่านซอร์ส M21a/M20b: หน้าสินค้าเอาเลขตัวเลือกจาก productFilterFacets · แถบตัวเลขจาก productStatCounts', () => {
  const page = readFileSync(new URL('../../app/database/products/page.js', import.meta.url), 'utf8');
  assert.match(page, /const filteredProducts = filterProducts\(products, filterState\);/);
  assert.match(page, /const facets = productFilterFacets\(products, filterState\);/);
  assert.match(page, /label: `ขาดราคาขายปลีก \(\$\{facets\.missingPrice\}\)`/);
  assert.match(page, /label: `รวมสินค้าที่เลิกใช้ \(\$\{facets\.inactive\}\)`/);
  assert.match(page, /\.\.\.\(missingPriceInRegistry > 0 \|\| missingPrice \?/, 'ตัวเลือกยังขึ้นขณะติ๊กค้างอยู่');
  assert.match(page, /\.\.\.\(inactiveInRegistry \|\| showInactive \?/);
  assert.match(page, /productStatCounts\(products, productTypes\)/);
  assert.doesNotMatch(page, /isExciseTaxable !== false\)\.length/, '"ต้องเสียภาษี" ต้องใช้ isProductExciseTaxable');
});

/* ── L16b (ตรวจตัวเลข 26/10): การ์ด "ต้องเสียสรรพสามิต" กดได้ · ตัวกรองคู่กัน · ป้ายบนแถวถามตัวเดียวกัน ─────────── */
test('🔴 L16b: กดการ์ด (ตั้ง taxable + ล้างตัวกรองอื่นทั้งหมด) = แถวเท่าเลขบนการ์ด · รวมใบที่ RA บังคับ · ไม่รวมใบที่ RA ยกเว้น', () => {
  // แถวเก่าไม่มี categoryCode — หมวดถอดจาก fgCode (ตัวเดียวกับการ์ด)
  const rows = [...FACET_ROWS, P({ fgCode: 'FG-108-01-002-2009', approvalStatus: 'approved' })];
  const stats = productStatCounts(rows, TYPES);
  const afterCard = filterProducts(rows, { taxable: true, productTypes: TYPES });
  assert.equal(afterCard.length, stats.taxable);
  const codes = afterCard.map((r) => r.fgCode);
  assert.ok(codes.includes('C3'), 'RA บังคับในหมวดที่ไม่เสียภาษี = นับและอยู่ในรายการ');
  assert.ok(!codes.includes('D1'), 'RA ยกเว้นในหมวดเสียภาษี = ไม่นับและไม่อยู่ในรายการ');
  assert.ok(codes.includes('FG-108-01-002-2009'), 'แถวเก่าถอดหมวดจาก fgCode');
  assert.equal(stats.taxable, 5);
  // ทุกแถวในรายการคือแถวที่จอติดป้าย "ภาษีสรรพสามิต" (ตัวตัดสินเดียวกัน)
  assert.ok(afterCard.every((r) => isProductTaxable(r, TYPES)));
  assert.ok(!filterProducts(rows, { productTypes: TYPES }).filter((r) => !afterCard.includes(r)).some((r) => isProductTaxable(r, TYPES)));
});

test('🔴 L16b: "ต้องเสียสรรพสามิต (n)" บนตัวเลือก = แถวหลังติ๊ก ทุกคำค้น × สถานะ × ทะเบียน × ติ๊กค้าง', () => {
  let checked = 0;
  for (const search of ['', 'ร้อน', 'C', 'ไม่มี']) {
    for (const statuses of subsets(['pending', 'approved', 'rejected'])) {
      for (const registrations of [[], ['none']]) {
        for (const showInactive of [false, true]) {
          for (const missingRetailPrice of [false, true]) {
            for (const taxable of [false, true]) {
              const state = { search, statuses, registrations, showInactive, missingRetailPrice, taxable, productTypes: TYPES };
              const facets = productFilterFacets(FACET_ROWS, state);
              assert.equal(facets.taxable, filterProducts(FACET_ROWS, { ...state, taxable: true }).length, JSON.stringify(state));
              checked += 1;
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 300);
});

test('🔴 L16b ด่านซอร์ส: การ์ดกดได้และตั้งตัวกรองทั้งชุด · ตัวกรอง/ส่งออก/ป้ายบนแถวถาม isProductTaxable', () => {
  const page = readFileSync(new URL('../../app/database/products/page.js', import.meta.url), 'utf8');
  const live = page.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(live, /missingRetailPrice: missingPrice, taxable: taxableOnly,/);
  assert.match(live, /label: "ต้องเสียสรรพสามิต", value: counts\.taxable, tone: "info",\s*onClick: onTaxableCard, pressed: taxableCardPressed,/);
  assert.doesNotMatch(live, /label: "ต้องเสียภาษี"/, 'ชื่อการ์ดต้องบอกชนิดภาษี');
  // กดการ์ด = ล้างคำค้น/สถานะ/ทะเบียน/เลิกใช้/ขาดราคา แล้วติ๊ก taxable — ตารางจึงได้ชุดเดียวกับเลข
  assert.match(live, /setSearch\(""\); setStatusFilter\(EMPTY\); setRegFilter\(EMPTY\); setShowInactive\(false\); setMissingPrice\(false\);\s*setTaxableOnly\(true\);/);
  assert.match(live, /const taxableCardPressed = taxableOnly && !q && !statusFilter\.length && !regFilter\.length && !showInactive && !missingPrice;/);
  assert.match(live, /label: `ต้องเสียสรรพสามิต \(\$\{facets\.taxable\}\)`/);
  assert.match(live, /\(taxableOnly \? 1 : 0\)/, 'นับเข้าเลขบนปุ่มตัวกรอง');
  assert.match(live, /setTaxableOnly\(false\); \}\}/, 'ล้างทั้งหมดต้องล้างตัวนี้ด้วย');
  assert.match(live, /if \(taxableOnly\) params\.set\("taxable", "1"\);/);
  // ป้ายบนแถว (สองมุมมอง) ถามตัวเดียวกับการ์ด — ไม่ใช่ธงหมวดล้วนอีก
  assert.equal((live.match(/const taxable = isProductTaxable\(p, productTypes\);/g) || []).length, 2);
  assert.doesNotMatch(live, /isExciseCat && <span className="status-pill warning/);
  assert.doesNotMatch(live, /const isExciseCat = flags\.isExcise;/);
  const route = readFileSync(new URL('../../app/api/products/export/route.js', import.meta.url), 'utf8');
  assert.match(route, /taxable: url\.searchParams\.get\('taxable'\) === '1',/);
  // การ์ดที่มี onClick เป็นปุ่มจริงพร้อม aria-pressed
  const cards = readFileSync(new URL('../../components/database/StatCards.js', import.meta.url), 'utf8');
  assert.match(cards, /const Card = clickable \? "button" : "div";/);
  assert.match(cards, /type: "button", onClick: it\.onClick, "aria-pressed": !!it\.pressed/);
});

/* ── L16c (ตรวจตัวเลข 26/10): กฎเก่า `isExciseTaxable !== false` ห้ามเหลือบนจอของโมดูลฐานข้อมูล ───────────────
   กฎนั้นนับสินค้าธงว่างในหมวดที่ไม่เสียภาษีเป็น "ต้องเสีย" และพลาดสินค้าที่ RA บังคับ ⇒ หน้าลูกค้าโชว์การ์ดภาระภาษี 0.00 ·
   หน้าสินค้าไม่เตือนขาดราคาขายปลีก ทั้งที่ตัวกรองของทะเบียนนับใบนั้น */
test('🔴 L16c ด่านซอร์ส: จอใต้ app/database ไม่ใช้กฎ isExciseTaxable !== false · สองหน้ารายละเอียดถามตัวกลาง', async () => {
  const { readdirSync } = await import('node:fs');
  const root = new URL('../../app/database/', import.meta.url);
  const pages = readdirSync(root, { recursive: true }).filter((f) => /(^|[\\/])page\.js$/.test(String(f)));
  assert.ok(pages.length >= 5, 'ต้องเจอหน้าของโมดูลฐานข้อมูล');
  const code = (rel) => readFileSync(new URL(rel, root), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const rel of pages) {
    assert.doesNotMatch(code(String(rel).replace(/\\/g, '/')), /isExciseTaxable\s*!==\s*false/, `${rel}: ใช้ isProductExciseTaxable / isMissingRetailPrice`);
  }
  assert.match(code('customers/[id]/page.js'), /hasTaxObligation = totalTaxAccrued > 0 \|\| products\.some\(\(p\) => isProductTaxable\(p, productTypes\)\);/);
  assert.match(code('products/[id]/page.js'), /const needsRetailPrice = isMissingRetailPrice\(/);
});

test('L16c: ตัวตัดสินกลางที่สองหน้าใช้ — RA บังคับในหมวดอื่น = ต้องเสีย/ขาดราคา · ธงว่างในหมวดไม่เสีย = ไม่ต้องเสีย', async () => {
  const { isMissingRetailPrice } = await import('../tax/taxableProducts.js');
  const forced = { categoryCode: '03-001', isExciseTaxable: true, retailPriceIncVat: null };
  const legacyBlank = { categoryCode: '03-001', isExciseTaxable: null };
  const exempt = { categoryCode: '01-002', isExciseTaxable: false, retailPriceIncVat: null };
  assert.equal(isProductExciseTaxable(forced, TYPES), true);
  assert.equal(isMissingRetailPrice(forced, TYPES), true, 'หน้าสินค้าต้องเตือน (เดิมไม่เตือน)');
  assert.equal(isProductExciseTaxable(legacyBlank, TYPES), false, 'หน้าลูกค้าไม่ต้องโชว์การ์ดภาระภาษี (เดิมโชว์ 0.00)');
  assert.equal(legacyBlank.isExciseTaxable !== false, true, 'กฎเก่าตอบผิดบนแถวนี้');
  assert.equal(isMissingRetailPrice(exempt, TYPES), false);
});

/* ── L16c ต่อ (รีวิว 26/10): คำเตือน "ยังไม่มีราคาขายปลีก" ต้องมีแถวราคาให้เห็นคู่กันเสมอ ─────────────────────────
   สินค้าที่ RA บังคับเสียภาษีในหมวด 03-001 (ไม่ใช่กลุ่ม 01 · ไม่ได้ติ๊กสรรพสามิต) เคยถูกเตือนให้เติมราคา
   แต่หน้ารายละเอียดซ่อนแถวราคา = สั่งกรอกช่องที่จอซ่อนไว้ (ทางตัน) */
test('🔴 L16c: ทุกใบที่ถูกเตือนขาดราคาขายปลีก หน้ารายละเอียดโชว์แถวราคา — รวมของที่ RA บังคับในหมวดอื่น', async () => {
  const { isMissingRetailPrice } = await import('../tax/taxableProducts.js');
  const forced = P({ fgCode: 'FG-AAA-03-001-0001', categoryCode: '03-001', isExciseTaxable: true, retailPriceIncVat: null });
  assert.equal(isMissingRetailPrice(forced, TYPES), true, 'แบนเนอร์ขึ้น');
  assert.equal(productShowsRetailPrice(forced, TYPES), true, 'แถวราคาขายปลีกต้องโผล่ (เดิมซ่อน)');
  // กวาดทั้งชุด: เซตที่ถูกเตือน ⊂ เซตที่เห็นแถวราคา
  const rows = [
    forced,
    P({ fgCode: 'FG-AAA-03-001-0002', categoryCode: '03-001', isExciseTaxable: null }),              // ไม่เกี่ยวภาษี
    P({ fgCode: 'FG-AAA-03-001-0003', categoryCode: '03-001', isExciseTaxable: false, retailPriceIncVat: 50 }), // ราคาค้าง
    P({ fgCode: 'FG-AAA-01-002-0001', categoryCode: '01-002', isExciseTaxable: null }),              // หมวดเสียภาษี ขาดราคา
    P({ fgCode: 'FG-AAA-01-002-0002', categoryCode: '01-002', isExciseTaxable: false }),             // RA ยกเว้น
    P({ fgCode: 'FG-1', categoryCode: '03-001', isExciseTaxable: true, retailPriceIncVat: 0 }),       // แถวเก่า fgCode ไม่มีหมวด
  ];
  for (const r of rows.filter((x) => isMissingRetailPrice(x, TYPES))) {
    assert.equal(productShowsRetailPrice(r, TYPES), true, `${r.fgCode}: เตือนแล้วต้องเห็นแถวราคา`);
  }
  // ของที่ไม่เกี่ยวภาษี ไม่ใช่กลุ่ม 01 และไม่มีราคาค้าง — ยังซ่อนเหมือนเดิม (ไม่ขยายแถวเกินจำเป็น)
  assert.equal(productShowsRetailPrice(rows[1], TYPES), false);
  assert.equal(productShowsRetailPrice(rows[2], TYPES), true, 'ราคาค้างโชว์เสมอ (กติกาเดิม)');
});

test('🔴 L16b/L16c: ป้ายภาษีของสินค้า (หน้าลูกค้า/หัวหน้าสินค้า) = กติกาเดียวกับแถวในทะเบียน + การ์ดภาระภาษี', async () => {
  const { categoryFlags } = await import('./categoryOf.js');
  const rows = [
    P({ fgCode: 'A', categoryCode: '01-002', isExciseTaxable: null }),  // หมวดเสียภาษี ธงว่าง → ต้องเสีย
    P({ fgCode: 'B', categoryCode: '01-002', isExciseTaxable: false }), // RA ยกเว้น → ยกเว้น (เดิมหน้าลูกค้าขึ้น "ภาษีสรรพสามิต")
    P({ fgCode: 'C', categoryCode: '03-001', isExciseTaxable: true }),  // RA บังคับในหมวดอื่น → ต้องเสีย (เดิมไม่มีป้าย)
    P({ fgCode: 'D', categoryCode: '03-001', isExciseTaxable: null }),  // ไม่เกี่ยว → ไม่มีป้าย
    P({ fgCode: 'E', categoryCode: '03-001', isExciseTaxable: false }), // หมวดไม่เสียอยู่แล้ว → ไม่มีป้าย (ไม่ใช่ "ยกเว้น")
    P({ fgCode: 'FG-AAA-01-002-0009', isExciseTaxable: null }),         // แถวเก่าไม่มี categoryCode → ถอดจาก fgCode
  ];
  assert.deepEqual(rows.map((r) => productExciseBadge(r, TYPES)), ['taxable', 'exempt', 'taxable', null, null, 'taxable']);
  // ตรงกับตัวตัดสินในทะเบียนสินค้าทุกแถว: taxable = isProductTaxable · exempt = หมวดเสียภาษี && ธง false
  for (const r of rows) {
    // ตัวเดียวกับ products/page.js: `categoryFlags(p.categoryCode || categoryOf(p.fgCode), productTypes)`
    const flags = categoryFlags(productCategoryCode(r), TYPES);
    const registry = isProductTaxable(r, TYPES) ? 'taxable' : (flags.isExcise && r.isExciseTaxable === false ? 'exempt' : null);
    assert.equal(productExciseBadge(r, TYPES), registry, r.fgCode);
  }
  // ป้าย "ภาษีสรรพสามิต" บนหน้าลูกค้า = ชุดที่ทำให้การ์ด "ภาระภาษีสรรพสามิต" ขึ้น (ไม่มีภาษีสะสม)
  const taxableRows = rows.filter((r) => productExciseBadge(r, TYPES) === 'taxable');
  assert.deepEqual(taxableRows.map((r) => r.fgCode), rows.filter((r) => isProductTaxable(r, TYPES)).map((r) => r.fgCode));
});

test('🔴 L16b/L16c ด่านซอร์ส: ป้าย "ภาษีสรรพสามิต" ของสินค้าในจอฐานข้อมูลไม่ตัดสินจากธงหมวดล้วน', async () => {
  const { readdirSync } = await import('node:fs');
  const root = new URL('../../app/database/', import.meta.url);
  const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const code = (rel) => strip(readFileSync(new URL(rel, root), 'utf8'));
  const pages = readdirSync(root, { recursive: true }).map((f) => String(f).replace(/\\/g, '/')).filter((f) => /(^|\/)page\.js$/.test(f));
  // ยกเว้นหน้าหมวดสินค้า — ป้ายที่นั่นบอกธงของ **หมวด** (row.isExcise) ไม่ใช่ของสินค้า
  for (const rel of pages.filter((f) => f !== 'product-categories/page.js')) {
    assert.doesNotMatch(code(rel), />ภาษีสรรพสามิต</, `${rel}: ป้ายตายตัวไม่มีทาง "ยกเว้น" — ใช้ productExciseBadge / isProductTaxable`);
    assert.doesNotMatch(code(rel), /label="ภาษีสรรพสามิต"/, `${rel}: ป้ายตายตัว`);
  }
  const customer = code('customers/[id]/page.js');
  assert.equal((customer.match(/const exciseBadge = productExciseBadge\(p, productTypes\);/g) || []).length, 2, 'การ์ด + ตาราง');
  assert.equal((customer.match(/exciseBadge === "taxable" \? "ภาษีสรรพสามิต" : "ยกเว้นสรรพสามิต"/g) || []).length, 2);
  assert.doesNotMatch(customer, /isExciseCategory\(/, 'หน้าลูกค้าไม่ตัดสินภาษีจากหมวดล้วนอีก');
  const product = code('products/[id]/page.js');
  assert.match(product, /const showRetailPrice = productShowsRetailPrice\(product, productTypes\);/);
  assert.match(product, /const exciseBadge = productExciseBadge\(product, productTypes\);/);
  assert.match(product, /label=\{exciseBadge === "taxable" \? "ภาษีสรรพสามิต" : "ยกเว้นสรรพสามิต"\}/);
  assert.match(product, /ราคาขายปลีก\{isTaxable \? " \(ฐานคำนวณสรรพสามิต\)" : ""\}/);
});

test('🔴 L16c: ฟอร์มแก้สินค้าโผล่ช่องราคาขายปลีกให้ของที่ต้องเสียภาษี (คู่ของแบนเนอร์ขาดราคา)', () => {
  const form = readFileSync(new URL('../../components/database/ProductForm.js', import.meta.url), 'utf8');
  assert.match(form, /const showRetail = inRetailCategory \|\| hasRetailValue \|\| taxable;/);
  const modal = readFileSync(new URL('../../components/EditProductModal.js', import.meta.url), 'utf8');
  assert.match(modal, /taxable=\{product\.isExciseTaxable === true\}/);
});
