import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterProducts, productCategoryLabel, productFilterFacets, productStatCounts } from './productFilter.js';
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
