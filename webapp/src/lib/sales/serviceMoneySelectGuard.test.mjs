// ── ยามต้นทางของตัวตัดสินด่านเงิน (mig 0392 · PR-A · D13 · แผน §2.5 ข้อ 9) ───────────────────────────────
//
// 🔴 ตัวตัดสิน "ใบมีรอบบริการ" (`orderHasServiceRounds` → `effectiveServiceFgCode`) คือสวิตช์ของด่านเงิน
//    "ใบบริการต้องมีช่วงครอบก่อนบัญชีรับรองงวด" (#1683) · ตั้งแต่ 0392 มันอ่านสองช่องเพิ่ม:
//      บรรทัด `"serviceFgCode"` (แพ็คเกจที่ฝ่ายขายเลือกให้บรรทัดพิมพ์เอง) · ใบ `"serviceTermsOpenedAt"` (ตราเปิดงาน)
//    select ต้นทางที่ลืมสองช่องนี้ **ไม่ error** — ตัวตัดสินได้ undefined แล้วตอบ "ไม่ใช่ใบบริการ" เงียบ ๆ
//    ⇒ ใบแพ็คเกจพิมพ์เองที่ประทับแล้วหลุดด่านเงินในจอ/route นั้น (fail-open) ทั้งที่จออื่นกั้น
// ⭐ ยามนี้ผูกกับ **select ที่ป้อนตัวตัดสินจริง** (ติดป้าย `/* money-decider feed */` บรรทัดบน) ไม่ใช่ทุก select ของไฟล์
//    (`installments/route.js` มี select 'id, "orderNumber"' ที่ไม่เกี่ยว) และบังคับให้ **ทุกผู้เรียก** ถูกจัดชั้น:
//    ผู้เรียกใหม่ = แดงจนกว่าจะมีคนตัดสินว่ามันป้อนตัวตัดสินจากไหน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function sourceFiles(dir = SRC) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.m?js$/.test(entry.name) && !entry.name.includes('.test.')) out.push(relative(SRC, full).split(sep).join('/'));
  }
  return out;
}
const FILES = sourceFiles();

const MARKER = '/* money-decider feed */';

/* select ที่ป้อนตัวตัดสิน — ชนิดของแต่ละป้ายตามลำดับในไฟล์
   'orders'       = แถวใบ (`sales_orders`) ต้องพก "serviceTermsOpenedAt" หรือ `*`
   'lines'        = บรรทัด (`sales_order_lines`) ต้องพก "serviceFgCode" หรือ `*`
   'orders+lines' = ใบ + บรรทัดฝังในคำสั่งเดียว (`*, lines:sales_order_lines(*)`)
   `calls` = ไฟล์นี้เรียก `orderHasServiceRounds(` เอง (false = ป้อนผู้เรียกฝั่งจอผ่าน response) */
const FEEDERS = new Map([
  ['app/api/sales-planning/sales-orders/[id]/route.js', {
    markers: ['orders+lines'], calls: false,
    why: 'loadOrder — หน้าใบ + แผงงวด (CLIENT_CALLERS) อ่านก้อนนี้',
  }],
  ['app/api/sales-planning/sales-orders/[id]/installments/route.js', {
    markers: ['orders', 'lines'], calls: true,
    why: 'loadOrderForUser — ด่านรับรอง/แจ้ง/ช่วงครอบของงวดทุกคำสั่ง',
  }],
  ['app/api/finance/payments/route.js', {
    markers: ['orders', 'lines'], calls: true,
    why: 'ทะเบียนการชำระของบัญชี — ตัวกรอง/คอลัมน์ "ใบมีรอบบริการ"',
  }],
  ['app/api/sales-planning/sales-orders/route.js', {
    markers: ['orders', 'lines'], calls: true,
    why: 'ทะเบียนใบสั่งขาย — ใบบริการ (สรุปงานบริการ · สัญญา · รอบที่ขาย)',
  }],
]);

/* จอที่เรียกตัวตัดสินด้วยก้อนที่ loadOrder ส่งมา (`*` + lines `*`) — ไม่มี select ของตัวเอง */
const CLIENT_CALLERS = new Map([
  ['app/sales-planning/sales-orders/[id]/page.js', 'หน้าใบ — order จาก GET /api/sales-planning/sales-orders/[id] (loadOrder)'],
  ['components/salesPlanning/SalesOrderPaymentPanel.js', 'แผงงวดบนหน้าใบ — order ที่หน้าใบส่งมา (loadOrder)'],
]);

/* ผู้เรียกตัวตัดสินรายบรรทัดด้วย **วัตถุสินค้า** (ไม่มีใบ ⇒ ผลเหมือนก่อน 0392 ทุกตัว — D13) */
const PRODUCT_CALLERS = new Map([
  ['lib/sales/historicalOrderPlan.js', 'ฟอร์มคีย์ใบย้อนหลัง — ตรวจว่าสินค้าที่เลือกเป็นแพ็คเกจ'],
  ['components/salesPlanning/historicalWizard/WizardZonesStep.js', 'ตัวเลือกแพ็คเกจของวิซาร์ดใบย้อนหลัง (products)'],
  ['components/salesPlanning/QuotationLineItems.js', 'ช่องจำนวนรอบบนตารางรายการ — บรรทัดของใบเสนอราคา/ใบสั่งขายที่จอถืออยู่'],
]);
/* ไลบรารีที่ส่ง `order` ต่อให้ตัวตัดสินรายบรรทัด — ผู้เรียกของมันถูกคุมที่ต้นทางของ order อีกชั้น */
const LIB_CALLERS = new Map([
  ['lib/sales/serviceRoundsEntry.js', 'lineTakesServiceRounds(line, order) — ช่องจำนวนรอบ (ใบที่ประทับแล้วถามชนิดบรรทัด)'],
  ['lib/sales/serviceSetup.js', 'serviceReopenPrompt (mig 0396) — ข้อ ④ ของโมดัลเปิดแก้: สวิตช์ด่านช่วงครอบพลิกไหม (ประทับ vs ล้างตรา) · '
    + 'order/บรรทัดจาก loadServiceSetupContext (ใบ `*` ผ่าน loadScoped · บรรทัดพก "serviceFgCode") · ไม่ตัดสินด่านเงินเอง แค่ข้อความ'],
]);

const ORDER_DECIDER = /\borderHasServiceRounds\(/;
const LINE_DECIDERS = /\b(?:lineIsServicePackage|hasServicePackageLine|effectiveServiceFgCode)\b/;
const DEFINER = 'lib/sales/serviceOrders.js';

/* ป้ายทุกตัวของไฟล์ → { table, select, index } — ป้ายต้องตามด้วย select ทันที (บรรทัดถัดไป) หรือ `.from('x').select(` */
function markedSelects(rel) {
  const raw = read(rel);
  const out = [];
  let at = raw.indexOf(MARKER);
  while (at >= 0) {
    const after = raw.slice(at + MARKER.length);
    const m = after.match(/^\s*\n\s*(?:\.from\(\s*'(\w+)'\s*\)\s*)?\.select\(\s*(['"`])([\s\S]*?)\2/);
    assert.ok(m, `${rel}: ป้าย "${MARKER}" ต้องอยู่บรรทัดเหนือ .select( (หรือ .from('x').select() ของคำสั่งที่ป้อนตัวตัดสิน`);
    let table = m[1];
    if (!table) {
      /* `.from('x')` ตัวสุดท้ายก่อนป้าย — ต้องเป็นคำสั่งเดียวกัน (ระหว่างนั้นไม่มี `;` นอกคอมเมนต์) */
      const froms = [...raw.slice(0, at).matchAll(/\.from\(\s*'(\w+)'\s*\)/g)];
      const last = froms[froms.length - 1];
      table = last && !stripComments(raw.slice(last.index, at)).includes(';') ? last[1] : null;
    }
    out.push({ table, select: m[3], index: at });
    at = raw.indexOf(MARKER, at + MARKER.length);
  }
  return out;
}

/* ชิ้นระดับบนของ select (ตัด embed `alias:table(...)` ออก) มี `*` เดี่ยว ๆ ไหม */
const topLevelStar = (select) => select.replace(/\w+:\w+(?:!\w+)*\([^()]*\)/g, '')
  .split(',').some((piece) => piece.trim() === '*');
const embedOf = (select, table) => {
  const m = select.match(new RegExp(`(?:\\w+:)?${table}(?:!\\w+)*\\(([^()]*)\\)`));
  return m ? m[1] : null;
};
const carries = (select, column) => topLevelStar(select) || select.includes(`"${column}"`) || new RegExp(`(^|[\\s,])${column}([\\s,]|$)`).test(select);

test('(a) select ที่ติดป้ายป้อนตัวตัดสินพกช่องของ 0392 — ใบ "serviceTermsOpenedAt" · บรรทัด "serviceFgCode" (หรือ *)', () => {
  const problems = [];
  for (const [rel, { markers }] of FEEDERS) {
    const found = markedSelects(rel);
    found.forEach(({ table, select }, i) => {
      const kind = markers[i];
      if (kind === 'orders') {
        if (table !== 'sales_orders') problems.push(`${rel} ป้ายที่ ${i + 1}: คาดใบ (sales_orders) เจอ ${table}`);
        else if (!carries(select, 'serviceTermsOpenedAt')) problems.push(`${rel} ป้ายที่ ${i + 1}: ใบขาด "serviceTermsOpenedAt"`);
      } else if (kind === 'lines') {
        if (table !== 'sales_order_lines') problems.push(`${rel} ป้ายที่ ${i + 1}: คาดบรรทัด (sales_order_lines) เจอ ${table}`);
        else if (!carries(select, 'serviceFgCode')) problems.push(`${rel} ป้ายที่ ${i + 1}: บรรทัดขาด "serviceFgCode"`);
      } else if (kind === 'orders+lines') {
        const inner = embedOf(select, 'sales_order_lines');
        if (table !== 'sales_orders' || !carries(select, 'serviceTermsOpenedAt')) problems.push(`${rel} ป้ายที่ ${i + 1}: ใบขาด "serviceTermsOpenedAt"`);
        if (inner === null) problems.push(`${rel} ป้ายที่ ${i + 1}: ไม่มีบรรทัดฝัง (sales_order_lines)`);
        else if (!carries(inner, 'serviceFgCode')) problems.push(`${rel} ป้ายที่ ${i + 1}: บรรทัดฝังขาด "serviceFgCode"`);
      }
    });
  }
  assert.deepEqual(problems, []);
});

test('(b) ผู้เรียก orderHasServiceRounds( ทุกไฟล์ถูกจัดชั้น — FEEDERS ∪ CLIENT_CALLERS พอดี', () => {
  const callers = FILES
    .filter((rel) => rel !== DEFINER && ORDER_DECIDER.test(stripComments(read(rel))))
    .sort();
  const expected = [
    ...[...FEEDERS].filter(([, v]) => v.calls).map(([rel]) => rel),
    ...CLIENT_CALLERS.keys(),
  ].sort();
  assert.deepEqual(callers, expected,
    'ผู้เรียกใหม่ของ orderHasServiceRounds ต้องจัดชั้น: select ต้นทางติดป้าย money-decider feed (FEEDERS) หรือเป็นจอที่อ่าน loadOrder (CLIENT_CALLERS)');
  for (const rel of [...FEEDERS].filter(([, v]) => !v.calls).map(([key]) => key)) {
    assert.equal(ORDER_DECIDER.test(stripComments(read(rel))), false, `${rel} ลงทะเบียนว่าไม่เรียกเอง — ถ้าเรียกแล้วให้แก้ calls`);
  }
});

test('(b) ผู้เรียกตัวตัดสินรายบรรทัด (lineIsServicePackage · hasServicePackageLine · effectiveServiceFgCode) ถูกจัดชั้นครบ', () => {
  const callers = FILES
    .filter((rel) => rel !== DEFINER && LINE_DECIDERS.test(stripComments(read(rel))))
    .sort();
  const expected = [...PRODUCT_CALLERS.keys(), ...LIB_CALLERS.keys()].sort();
  assert.deepEqual(callers, expected,
    'ผู้เรียกใหม่ต้องจัดชั้น: วัตถุสินค้า (PRODUCT_CALLERS · ไม่มีใบ = ผลเดิม) หรือไลบรารีที่ส่ง order ต่อ (LIB_CALLERS)');
});

test('(c) จำนวนป้ายต่อไฟล์ = ที่ลงทะเบียน · ไม่มีป้ายนอกทะเบียน', () => {
  for (const [rel, { markers }] of FEEDERS) {
    assert.equal(markedSelects(rel).length, markers.length, `${rel}: คาด ${markers.length} ป้าย`);
  }
  const stray = FILES.filter((rel) => !FEEDERS.has(rel) && read(rel).includes(MARKER));
  assert.deepEqual(stray, [], 'ป้าย money-decider feed นอกทะเบียน FEEDERS — ลงทะเบียนพร้อมชนิดของ select');
});

test('ตัวแกะของยามเอง: ป้ายต้องชิด select · `*` ระดับบน ≠ `*` ใน embed · หาตารางจาก .from ก่อนป้ายได้', () => {
  assert.equal(topLevelStar("*, lines:sales_order_lines(*)"), true);
  assert.equal(topLevelStar("id, lines:sales_order_lines(*)"), false);
  assert.equal(embedOf("*, lines:sales_order_lines(*)", 'sales_order_lines'), '*');
  assert.equal(carries('id, "salesOrderId", "fgCode"', 'serviceFgCode'), false);
  assert.equal(carries('id, fgCode, "serviceFgCode"', 'serviceFgCode'), true);
  assert.equal(carries('id, serviceTermsOpenedAt', 'serviceTermsOpenedAt'), true);
});
