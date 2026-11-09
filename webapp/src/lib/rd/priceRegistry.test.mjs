// มติเจ้าของ 09/11/2026 · หน้า "ราคา + Ingredient List" (เดิม "รอใส่ราคา")
//   *"อยากดึงกลิ่นและสูตร ที่มาจากคำร้องและถูกคอนเฟิร์ม มาว่าอันไหนยังไม่ใส่ราคา และ ingredient"*
//   *"สองแท็บ และอยาก แยก แท็บ กลิ่น กับ สูตร"* · *"จัดกลุ่ม เรียง กรอง ค้นหา ได้เหมือนตารางอื่นๆ ในระบบ"*
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REGISTRY_PRICE_STATES, confirmedRegistrySources, priceRegistryRows, priceRegistryTotals, registryPriceState,
} from './priceRegistry.js';
import {
  DEFAULT_PRICE_VIEWS, PRICE_TABS, defaultPriceView, filterPriceRows, priceFilterOptions, priceSearchText, priceViewOf,
  priceViewState,
} from './priceBoardView.js';

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// แถวที่ลูกค้าคอนเฟิร์มแล้ว — เท่าที่ `rowStage` ต้องใช้
const item = (over = {}) => ({
  id: 'IT-1', requestId: 'RQ-1', lineKind: 'product_dev', label: 'EDP กลิ่น A → PF1', sortOrder: 0,
  ackAt: '2026-09-01', readyAt: '2026-09-02', pickedUpAt: '2026-09-03', sentAt: '2026-09-04',
  outcome: 'confirmed', outcomeAt: '2026-09-23', answerStatus: 'done',
  producedScentId: 'SC-1', producedFormulaId: 'FML-1',
  ...over,
});
const request = (over = {}) => ({
  id: 'RQ-1', docNo: 'RQ-FD-26090093', dept: 'RD', status: 'closed', items: [item()], ...over,
});
const scent = (over = {}) => ({ id: 'SC-1', code: 'SC-001', name: 'กลิ่น A', status: 'active', customerId: 'CUS-1', customerName: 'บริษัท ก', customerTradeName: 'Amber', ...over });
const formula = (over = {}) => ({
  id: 'FML-1', code: 'PF1', name: 'สูตร A', status: 'active', scentId: 'SC-1', categoryCode: '02-005',
  customerId: 'CUS-1', customerName: 'บริษัท ก', ingredientList: null, ...over,
});
const price = (over = {}) => ({ materialId: 'M', state: 'ready', unitPrice: 1200, validThrough: '2027-01-01', revisionNo: 1, revisionId: 'R', ...over });

test('🔴 ที่มา = ตัวที่แถวคำร้อง RD **ผลิต** และลูกค้าคอนเฟิร์ม · ใบทุกสถานะยกเว้นร่าง/ยกเลิก · ไม่ใช่ของที่ขอให้ทำต่อ', () => {
  const sources = confirmedRegistrySources([
    request(), // ใบปิดแล้ว — ต้องนับ (ของที่ขาดส่วนใหญ่อยู่ในใบที่ปิดแล้ว)
    request({ id: 'RQ-2', status: 'acknowledged', items: [item({ id: 'IT-2', requestId: 'RQ-2', answerStatus: 'pending', producedFormulaId: 'FML-2', producedScentId: null, outcomeAt: '2026-09-01' })] }),
    request({ id: 'RQ-3', status: 'cancelled', items: [item({ id: 'IT-3', requestId: 'RQ-3', producedFormulaId: 'FML-3' })] }),
    request({ id: 'RQ-4', status: 'draft', items: [item({ id: 'IT-4', requestId: 'RQ-4', producedFormulaId: 'FML-4' })] }),
    request({ id: 'RQ-5', dept: 'PC', items: [item({ id: 'IT-5', requestId: 'RQ-5', producedFormulaId: 'FML-5' })] }),
    request({
      id: 'RQ-6', status: 'answered',
      items: [
        item({ id: 'IT-6a', requestId: 'RQ-6', outcome: 'revise', producedFormulaId: 'FML-6a' }),      // ลูกค้าขอแก้
        item({ id: 'IT-6b', requestId: 'RQ-6', outcome: null, producedFormulaId: 'FML-6b' }),          // ยังรอลูกค้าตอบ
        item({ id: 'IT-6c', requestId: 'RQ-6', answerStatus: 'declined', producedFormulaId: 'FML-6c' }), // ฝ่ายปฏิเสธไปแล้ว
        // ขอให้ทำต่อจากสูตรเดิม (`formulaId`) แต่ยังไม่ผลิตอะไร — ไม่ใช่ของที่ได้
        item({ id: 'IT-6d', requestId: 'RQ-6', formulaId: 'FML-OLD', producedFormulaId: null, producedScentId: null }),
      ],
    }),
  ]);
  assert.deepEqual([...sources.formulas.keys()].sort(), ['FML-1', 'FML-2']);
  assert.deepEqual([...sources.scents.keys()], ['SC-1']);
  const src1 = sources.formulas.get('FML-1')[0];
  assert.equal(src1.docNo, 'RQ-FD-26090093');
  assert.equal(src1.requestStatus, 'closed');
  assert.equal(src1.stage, 'done');
  assert.equal(src1.label, 'EDP กลิ่น A', 'ป้ายพัฒนาสูตรตัดหาง "→ รหัส" (ตัวเดียวกับแท็บแรก)');
});

test('ตัวเดียวคอนเฟิร์มหลายใบ = แถวเดียว · ที่มาเรียงคอนเฟิร์มก่อนขึ้นก่อน · วันแรก/วันล่าสุดติดแถว', () => {
  const sources = confirmedRegistrySources([
    request({ id: 'RQ-B', docNo: 'RQ-B', items: [item({ id: 'B', requestId: 'RQ-B', outcomeAt: '2026-10-05' })] }),
    request({ id: 'RQ-A', docNo: 'RQ-A', items: [item({ id: 'A', requestId: 'RQ-A', outcomeAt: '2026-09-10' })] }),
  ]);
  const { formulas } = priceRegistryRows({ sources, scents: [scent()], formulas: [formula()] });
  assert.equal(formulas.length, 1);
  assert.deepEqual(formulas[0].sources.map((s) => s.docNo), ['RQ-A', 'RQ-B']);
  assert.equal(formulas[0].firstConfirmedAt, '2026-09-10');
  assert.equal(formulas[0].lastConfirmedAt, '2026-10-05');
});

test('🔴 ช่องราคา: กลิ่น = F · สูตร = F (กลิ่นของสูตร) + B + FB · สูตรหัวน้ำหอม 02-020 = F อย่างเดียว (ตัวเดียวกับ API ราคาสูตร)', () => {
  const sources = confirmedRegistrySources([request({
    items: [
      item(),
      item({ id: 'IT-2', producedFormulaId: 'FML-OIL', producedScentId: null }),
    ],
  })]);
  const prices = new Map([['RM_F:SC-1', price({ unitPrice: 900 })], ['RM_FB:FML-1', price({ state: 'expired' })]]);
  const { scents, formulas } = priceRegistryRows({
    sources, prices,
    scents: [scent()],
    formulas: [formula(), formula({ id: 'FML-OIL', code: 'OIL', categoryCode: '02-020' })],
  });
  assert.deepEqual(scents[0].slots.map((s) => s.key), ['F']);
  assert.equal(scents[0].priceState, 'ready');
  const byId = new Map(formulas.map((f) => [f.id, f]));
  assert.deepEqual(byId.get('FML-1').current.map((c) => [c.key, c.price?.unitPrice ?? null]), [['F', 900], ['B', null], ['FB', 1200]]);
  // F ของกลิ่นพร้อมใช้ ⇒ สูตรมีราคาแล้ว (ใส่อย่างน้อยหนึ่งช่อง · ม-148)
  assert.equal(byId.get('FML-1').priceState, 'ready');
  assert.equal(byId.get('FML-1').current[0].source.code, 'SC-001', 'ช่อง F ของสูตรลงที่กลิ่นของสูตร');
  assert.deepEqual(byId.get('FML-OIL').slots.map((s) => s.key), ['F']);
  // หัวน้ำหอมไม่ต้องมี Ingredient List
  assert.equal(byId.get('FML-OIL').ingredientState, 'none');
});

test('สถานะราคา: ไม่ผูกวัสดุ/ยังไม่มีราคา/วัสดุร่าง = ยังไม่มี · มีแต่หมดอายุ = หมดอายุ (นับว่ามีราคา) · ไม่มีช่อง = ใส่ไม่ได้', () => {
  assert.equal(registryPriceState([{ price: null }]), 'missing');
  assert.equal(registryPriceState([{ price: { state: 'no_price', unitPrice: null } }]), 'missing');
  assert.equal(registryPriceState([{ price: { state: 'draft', unitPrice: 50 } }]), 'missing');
  assert.equal(registryPriceState([{ price: { state: 'expired', unitPrice: 50 } }, { price: null }]), 'expired');
  assert.equal(registryPriceState([{ price: { state: 'expired', unitPrice: 50 } }, { price: { state: 'ready', unitPrice: 9 } }]), 'ready');
  assert.equal(registryPriceState([], { hasSlots: false }), 'blocked');
  for (const key of ['missing', 'expired', 'ready', 'blocked']) assert.ok(REGISTRY_PRICE_STATES[key].label);
});

test('🔴 Ingredient List = ตัวตัดสินเดียวกับขั้นในคำร้อง · ครบ = ราคา (หมดอายุก็นับ) + Ingredient List ถ้าต้องมี', () => {
  const sources = confirmedRegistrySources([request({
    items: [
      item({ id: 'a', producedFormulaId: 'F-A', producedScentId: null }),
      item({ id: 'b', producedFormulaId: 'F-B', producedScentId: null }),
      item({ id: 'c', producedFormulaId: 'F-C', producedScentId: null }),
    ],
  })]);
  const prices = new Map([['RM_FB:F-B', price({ state: 'expired' })], ['RM_FB:F-C', price()]]);
  const { formulas } = priceRegistryRows({
    sources, prices, scents: [],
    formulas: [
      formula({ id: 'F-A', scentId: null }),                                       // ขาดทั้งคู่
      formula({ id: 'F-B', scentId: null, ingredientList: 'Aqua, Alcohol' }),       // ราคาหมดอายุ + มี Ingredient = ครบ
      formula({ id: 'F-C', scentId: null, categoryCode: '' }),                      // ไม่มีหมวด = ถือว่าต้องมี (ม-158)
    ],
  });
  const byId = new Map(formulas.map((f) => [f.id, f]));
  assert.deepEqual(
    ['F-A', 'F-B', 'F-C'].map((id) => [byId.get(id).needsPrice, byId.get(id).needsIngredient, byId.get(id).complete]),
    [[true, true, false], [false, false, true], [false, true, false]],
  );
  assert.equal(byId.get('F-B').ingredientState, 'ready');
  assert.equal(byId.get('F-B').ingredient.current, 'Aqua, Alcohol', 'โมดัลเติมค่าเดิมให้');
  assert.deepEqual(priceRegistryTotals(formulas), {
    all: 3, incomplete: 2, complete: 1, missingPrice: 1, expiredPrice: 1, missingIngredient: 2,
  });
});

test('ตัวที่ยังไม่รับเข้าทะเบียน = ไม่มีช่อง + เหตุเดียวกับ API ราคา · ตัวที่ถูกลบไปแล้วไม่ขึ้น · AR อ่านสดจากทะเบียนลูกค้า', () => {
  const sources = confirmedRegistrySources([request({
    items: [item(), item({ id: 'x', producedFormulaId: 'GONE', producedScentId: 'GONE-S' })],
  })]);
  const { scents, formulas } = priceRegistryRows({
    sources,
    scents: [scent({ status: 'draft' })],
    formulas: [formula({ status: 'draft' })],
    arById: new Map([['CUS-1', 'AR-001']]),
  });
  assert.equal(scents.length, 1);
  assert.equal(formulas.length, 1);
  assert.equal(scents[0].priceState, 'blocked');
  assert.match(scents[0].priceBlocker, /ต้องรับเข้าทะเบียนก่อน/);
  assert.match(formulas[0].priceBlocker, /ต้องรับเข้าทะเบียนก่อน/);
  assert.equal(formulas[0].customerArCode, 'AR-001');
  // ชื่อที่ลูกค้าเรียกอยู่ที่กลิ่นที่เดียว (มติ 04/11) — สูตรอ่านจากกลิ่นของมัน
  assert.equal(formulas[0].customerTradeName, 'Amber');
});

/* ── มุมมอง: ค้นหา · กรอง · จัดกลุ่ม · เรียง ─────────────────────────────────────────────────────── */
const registryRows = () => {
  const sources = confirmedRegistrySources([
    request({ id: 'R1', docNo: 'RQ-FD-1', items: [item({ id: 'i1', requestId: 'R1', producedFormulaId: 'F1', producedScentId: null, outcomeAt: '2026-09-01' })] }),
    request({ id: 'R2', docNo: 'RQ-FD-2', items: [item({ id: 'i2', requestId: 'R2', producedFormulaId: 'F2', producedScentId: null, outcomeAt: '2026-09-20' })] }),
    request({ id: 'R3', docNo: 'RQ-FD-3', items: [item({ id: 'i3', requestId: 'R3', producedFormulaId: 'F3', producedScentId: null, outcomeAt: '2026-10-01' })] }),
  ]);
  return priceRegistryRows({
    sources, scents: [],
    prices: new Map([['RM_FB:F2', price()], ['RM_FB:F3', price()]]),
    formulas: [
      formula({ id: 'F1', code: 'PF-1', scentId: null, categoryCode: '01-001', customerId: 'C1', customerName: 'ลูกค้า 1' }),
      formula({ id: 'F2', code: 'PF-2', scentId: null, categoryCode: '02-005', customerId: 'C2', customerName: 'ลูกค้า 2' }),
      formula({ id: 'F3', code: 'PF-3', scentId: null, categoryCode: '02-005', customerId: 'C2', customerName: 'ลูกค้า 2', ingredientList: 'Aqua, Glycerin' }),
    ],
  }).formulas;
};

test('🔴 แท็บทะเบียนเปิดมาเห็นเฉพาะ "ยังไม่ครบ" · ครบแล้ว/ทั้งหมด กดดูได้ · ตัวเลือกตัวกรองมาจากทุกแถว (ค่าที่เลือกไม่หายตอนสลับ)', () => {
  const rows = registryRows();
  const view = defaultPriceView('formulas');
  assert.equal(view.progress, 'todo');
  assert.deepEqual(priceViewOf('formulas', rows, view).rows.map((r) => r.id), ['F1', 'F2']);
  assert.deepEqual(priceViewOf('formulas', rows, { ...view, progress: 'done' }).rows.map((r) => r.id), ['F3']);
  assert.equal(priceViewOf('formulas', rows, { ...view, progress: 'all' }).rows.length, 3);
  const options = priceFilterOptions('formulas', rows);
  assert.deepEqual(options.ingredients.map((o) => o.value), ['missing', 'ready'], 'สถานะเรียงตายตัว ของที่ต้องทำก่อน');
  assert.deepEqual(options.prices.map((o) => o.value), ['missing', 'ready']);
  assert.deepEqual(options.customers.map((o) => o.value), ['C1', 'C2']);
});

test('ค้นหา: ตาเห็นบนแถว = ค้นเจอ — เลขที่คำร้อง · หมวด · ชื่อสารใน Ingredient List · ลูกค้า', () => {
  const rows = registryRows();
  const all = { ...defaultPriceView('formulas'), progress: 'all' };
  const opts = { categoryLabel: (code) => (code === '01-001' ? 'Body Lotion · โลชั่น' : '') };
  assert.deepEqual(filterPriceRows('formulas', rows, { ...all, q: 'rq-fd-2' }, opts).map((r) => r.id), ['F2']);
  assert.deepEqual(filterPriceRows('formulas', rows, { ...all, q: 'โลชั่น' }, opts).map((r) => r.id), ['F1']);
  assert.deepEqual(filterPriceRows('formulas', rows, { ...all, q: 'glycerin' }, opts).map((r) => r.id), ['F3']);
  assert.match(priceSearchText('formulas', rows[0], opts), /ลูกค้า 1/);
  assert.deepEqual(filterPriceRows('formulas', rows, { ...all, filters: { categories: ['02-005'] } }).map((r) => r.id), ['F2', 'F3']);
  assert.deepEqual(filterPriceRows('formulas', rows, { ...all, filters: { prices: ['missing'] } }).map((r) => r.id), ['F1']);
});

test('จัดกลุ่ม "สิ่งที่ขาด" เรียงตายตัว (ขาดทั้งคู่ → ขาดราคา → ขาด Ingredient → ครบ) · เรียงคอนเฟิร์มล่าสุด', () => {
  const rows = registryRows();
  const all = { ...defaultPriceView('formulas'), progress: 'all' };
  const { groups } = priceViewOf('formulas', rows, { ...all, groupBy: 'missing' });
  assert.deepEqual(groups.map((g) => [g.label, g.count]), [
    ['ขาดทั้งราคาและ Ingredient List', 1], ['ขาด Ingredient List', 1], ['ครบแล้ว', 1],
  ]);
  assert.deepEqual(priceViewOf('formulas', rows, { ...all, sortKey: 'confirmedLast', sortDir: 'desc' }).rows.map((r) => r.id), ['F3', 'F2', 'F1']);
  assert.deepEqual(priceViewOf('formulas', rows, all).rows.map((r) => r.id), ['F1', 'F2', 'F3'], 'ตั้งต้น = คอนเฟิร์มก่อนขึ้นก่อน');
  const byCustomer = priceViewOf('formulas', rows, { ...all, groupBy: 'customer' }).groups;
  assert.deepEqual(byCustomer.map((g) => [g.label, g.count]), [['ลูกค้า 1', 1], ['ลูกค้า 2', 2]]);
});

test('มุมมองที่จำไว้เพี้ยน/เวอร์ชันเก่า = ตกไปค่าตั้งต้นของแท็บ ไม่ throw · ค่าตั้งต้นครบทุกแท็บ', () => {
  const v = priceViewState('formulas', { sortKey: 'docNo', groupBy: 'request', progress: 'x', sortDir: 'up', q: 5, filters: null });
  assert.equal(v.sortKey, 'waiting', 'เรียงตามเลขที่คำร้องมีเฉพาะแท็บแรก');
  assert.equal(v.groupBy, 'none');
  assert.equal(v.progress, 'todo');
  assert.equal(v.sortDir, 'asc');
  assert.equal(v.q, '');
  assert.deepEqual(Object.keys(v.filters), ['customers', 'categories', 'prices', 'ingredients']);
  assert.deepEqual(Object.keys(DEFAULT_PRICE_VIEWS), PRICE_TABS.map((t) => t.key));
  assert.equal(DEFAULT_PRICE_VIEWS.requests.groupBy, 'request', 'แท็บแรกจัดกลุ่มตามใบเป็นค่าตั้งต้น (ม-153)');
});

/* ── ยามซอร์ส ─────────────────────────────────────────────────────────────────────────────────── */
test('🔴 เส้นทะเบียน: อ่านอย่างเดียว · ด่าน canAccessRd · ตัวโหลดคิวเดิมทุกสถานะ (lean) · ราคาผ่าน attachRegistryPrice', () => {
  const route = src('../../app/api/rd/price-board/registry/route.js');
  assert.doesNotMatch(route, /export const (POST|PATCH|PUT|DELETE)/);
  assert.match(route, /if \(!canAccessRd\(user\)\) return forbidden/);
  assert.match(route, /loadRequests\(supabase, \{ dept: DEPT, lean: true \}\)/, 'ไม่ส่ง status = ใบทุกสถานะ (ใบปิดแล้วคือที่มาส่วนใหญ่)');
  assert.match(route, /attachRegistryPrice\(supabase, rows, \{ column, kind \}\)/);
  assert.match(route, /priceRegistryRows\(\{ sources, scents, formulas, prices, arById \}\)/);
  // ลิสต์ id โตตามข้อมูล — ต้องซอยก้อน (กับดัก URL 16 KB)
  assert.equal((route.match(/fetchAllInChunks\(/g) || []).length, 3);
});

test('🔴 หน้าจอ: แท็บทะเบียนยิง endpoint ทะเบียน · ด่านปุ่มตัวเดียวกับหน้าทะเบียน/API · ชื่อหน้า + เมนูใหม่', () => {
  const page = src('../../app/rd/prices/page.js');
  assert.match(page, /title="ราคา \+ Ingredient List"/);
  assert.match(page, /canQuoteMaterial\(\{ \.\.\.me, department \}, "RM_FB"\)/);
  assert.match(page, /isFormulaRegistrar\(me\)/);
  assert.match(page, /`\/api\/master\/\$\{entityPricing\.kind === "formula" \? "formulas" : "scents"\}\/\$\{entityPricing\.id\}\/price`/);
  assert.match(page, /endpoint=\{entityIngredients \? `\/api\/master\/formulas\/\$\{entityIngredients\.id\}` : ""\}/);
  assert.match(page, /extraBody=\{\{ action: "ingredients" \}\}/);
  assert.match(page, /priceViewOf\(tab, tabRows, view, viewOpts\)/, 'ตัวเดียวกับเทสต์มุมมอง');
  const menu = src('../../config/menuRegistry.js');
  assert.match(menu, /href: '\/rd\/prices', name: 'ราคา \+ Ingredient List', shortName: 'ราคา'/);
});
