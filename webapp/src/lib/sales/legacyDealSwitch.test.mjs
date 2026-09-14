// สวิตช์ "ดีลเก่าจากระบบเดิม" — ไม่มียอด ไม่นับ Actual ไม่เข้า FC (มติผู้ใช้ 2026-09-14)
//
// 🐞 ที่มา: 2026-08-08 → 2026-09-14 ฟอร์มสัญญาว่ายอดที่พิมพ์เข้า Actual ทันที · POST เขียน
// wonValue + actualSource='legacy' · แต่ trigger 0110 (นิยามล่าสุด 0353) เขียนทับจาก SO อนุมัติ
// ตั้งแต่ INSERT ⇒ ยอด 15 ใบ 1,956,850 ไม่เคยนับ แต่ค้างใน projectValue เป็น FC
// เทสต์ JS ที่ปั้นข้อมูล actualSource 'legacy' ผ่านมาตลอด เพราะไม่มีใครเทียบกับฐาน
//
// ยามชุดนี้ล็อก:
//   ① ด่านกลาง (lib/sales/legacyDealSwitch) — ตีกลับยอด/แถวมูลค่า/วันอนาคต · ถอดคีย์ของระบบ · อ่านบันทึก
//   ② route สร้าง/แก้ดีลเรียกด่านกลาง ไม่ประทับ Actual เอง
//   ③ คำบนฟอร์มเลิกสัญญา Actual
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_CLOSED_NOTE_KEYS,
  LEGACY_WON_FUTURE_DATE_ERROR,
  LEGACY_WON_VALUE_ERROR,
  SERVER_ONLY_DEAL_METADATA_KEYS,
  legacyClosedNoteOf,
  legacyWonCreateError,
  stripServerOnlyDealMetadata,
} from './legacyDealSwitch.js';
import { dealActualFromSalesOrders } from './salesOrderWorkflow.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:"'`])\/\/.*$/, '$1'))
  .join('\n');

const POST_ROUTE = 'src/app/api/sales-planning/deals/route.js';
const PATCH_ROUTE = 'src/app/api/sales-planning/deals/[id]/route.js';
const FORM = 'src/components/salesPlanning/DealFormFields.js';
const MODAL = 'src/components/salesPlanning/DealCreateModal.js';
const VALUE_LINES = 'src/components/salesPlanning/DealValueLines.js';
const DEALS_PAGE = 'src/app/sales-planning/deals/page.js';
const DEAL_DETAIL = 'src/app/sales-planning/deals/[id]/page.js';

const TODAY = '2026-09-14';
const legacyWon = (over = {}) => ({
  stage: 'won', metadata: { legacy: true }, valueItems: [], projectValue: '', expectedCloseDate: '2026-05-15', ...over,
});

/* ── ① ด่านกลาง ──────────────────────────────────────────────────────────── */

test('ดีลเก่าที่สร้างเป็น Won ต้องไม่มีมูลค่า — ส่งยอดหรือแถวมา = ตีกลับ ไม่ทิ้งเงียบ', () => {
  const opts = { stage: 'won', today: TODAY };
  assert.equal(legacyWonCreateError(legacyWon(), opts), null);
  assert.equal(legacyWonCreateError(legacyWon({ projectValue: 0, valueItems: undefined }), opts), null);
  assert.equal(legacyWonCreateError(legacyWon({ projectValue: 30000 }), opts), LEGACY_WON_VALUE_ERROR);
  assert.equal(legacyWonCreateError(legacyWon({ projectValue: '-5' }), opts), LEGACY_WON_VALUE_ERROR);
  assert.equal(
    legacyWonCreateError(legacyWon({ valueItems: [{ categoryCode: '01-002', qty: 1, unitPrice: 30000 }] }), opts),
    LEGACY_WON_VALUE_ERROR,
  );
  // แถวราคา 0 ก็ไม่รับ — โหมดนี้ไม่มีตารางมูลค่าให้กรอกเลย
  assert.equal(
    legacyWonCreateError(legacyWon({ valueItems: [{ categoryCode: '01-002', qty: 1, unitPrice: 0 }] }), opts),
    LEGACY_WON_VALUE_ERROR,
  );
  assert.match(LEGACY_WON_VALUE_ERROR, /ไม่นับเป็นยอดขาย \(Actual\) และไม่เข้า FC/);
  assert.match(LEGACY_WON_VALUE_ERROR, /ใบสั่งขายที่อนุมัติแล้วเท่านั้น/);
});

test('ด่านใช้เฉพาะดีลเก่าที่สร้างเป็น Won — ขั้นอื่นและดีลปกติเดินทางเดิม', () => {
  // สวิตช์ + ขั้นอื่น = ดีลปกติที่มีมูลค่าคาดการณ์ได้
  assert.equal(legacyWonCreateError(legacyWon({ stage: 'qualified', projectValue: 30000 }), { stage: 'qualified', today: TODAY }), null);
  // Won ที่ไม่มีธง — route ตีกลับด้วยด่านเดิม (ต้องปิด Won ผ่านใบเสนอราคา) ไม่ใช่ด่านนี้
  assert.equal(legacyWonCreateError({ projectValue: 30000, metadata: {} }, { stage: 'won', today: TODAY }), null);
  assert.equal(legacyWonCreateError(undefined, { stage: 'won', today: TODAY }), null);
});

test('วันที่ปิดในระบบเดิมเลยวันนี้ไม่ได้ (ของจริง DL-26080133 = 2026-12-31)', () => {
  const opts = { stage: 'won', today: TODAY };
  assert.equal(legacyWonCreateError(legacyWon({ expectedCloseDate: '2026-12-31' }), opts), LEGACY_WON_FUTURE_DATE_ERROR);
  assert.equal(legacyWonCreateError(legacyWon({ expectedCloseDate: TODAY }), opts), null);
  assert.equal(legacyWonCreateError(legacyWon({ expectedCloseDate: '2026-09-15T00:00:00Z' }), opts), LEGACY_WON_FUTURE_DATE_ERROR);
  // ยอดผิดชนะวันผิด — ข้อความเรื่องมูลค่าสำคัญกว่า
  assert.equal(legacyWonCreateError(legacyWon({ expectedCloseDate: '2026-12-31', projectValue: 1 }), opts), LEGACY_WON_VALUE_ERROR);
});

test('ถอดคีย์ของระบบจาก metadata ที่ client ส่งมา — ไม่แตะค่าอื่นและไม่แก้ object ต้นทาง', () => {
  assert.deepEqual(SERVER_ONLY_DEAL_METADATA_KEYS, ['actualSource', 'legacyClosedValue', 'legacyClosedDate']);
  assert.deepEqual(LEGACY_CLOSED_NOTE_KEYS, ['legacyClosedValue', 'legacyClosedDate']);
  const input = { legacy: true, brand: 'X', actualSource: 'legacy', legacyClosedValue: 1, legacyClosedDate: '2026-01-01' };
  assert.deepEqual(stripServerOnlyDealMetadata(input), { legacy: true, brand: 'X' });
  assert.equal(input.legacyClosedValue, 1, 'ห้ามแก้ object ของผู้เรียก');
  for (const bad of [null, undefined, [], 'x', 5]) assert.deepEqual(stripServerOnlyDealMetadata(bad), {});
});

test('บันทึกยอดปิดในระบบเดิมบนหน้าดีล — อ่านอย่างเดียว · บอกว่ายอดยังอยู่ใน FC หรือไม่', () => {
  assert.equal(legacyClosedNoteOf(null), null);
  assert.equal(legacyClosedNoteOf({ metadata: {} }), null);
  for (const value of [0, -1, 'abc', null]) {
    assert.equal(legacyClosedNoteOf({ metadata: { legacyClosedValue: value } }), null);
  }
  // บล็อก A (ล้าง FC แล้ว)
  assert.deepEqual(
    legacyClosedNoteOf({ projectValue: 0, metadata: { legacyClosedValue: 204000, legacyClosedDate: '2026-05-15' } }),
    { value: 204000, date: '2026-05-15', stillInForecast: false },
  );
  // บล็อก B (รอเจ้าของยืนยัน — ยอด FC ยังอยู่)
  assert.equal(legacyClosedNoteOf({ projectValue: 600000, metadata: { legacyClosedValue: 600000 } }).stillInForecast, true);
  assert.equal(legacyClosedNoteOf({ metadata: { legacyClosedValue: 5, legacyClosedDate: '15/05/2026' } }).date, null);
});

test('Actual ไม่มีที่มาแบบ legacy อีก — มาจาก SO อนุมัติเท่านั้น', () => {
  assert.equal(dealActualFromSalesOrders({ wonValue: 5, metadata: { actualSource: 'legacy' } }), 0);
  assert.equal(dealActualFromSalesOrders({ wonValue: 5, metadata: { actualSource: 'sale_order' } }), 5);
  assert.doesNotMatch(stripComments(read('src/lib/sales/salesOrderWorkflow.js')), /'legacy'/);
});

/* ── ② route ─────────────────────────────────────────────────────────────── */

test('POST สร้างดีล: ไม่ประทับ Actual เอง · เรียกด่านกลางก่อนเตรียมแถวมูลค่า · ถอดคีย์ของระบบ', () => {
  const src = stripComments(read(POST_ROUTE));
  // ทั้งคำ ไม่ใช่แค่รูปบรรทัดที่ลบไป — `wonValue: projectValue` / `row.wonValue = …` ก็คือบั๊กเดิม
  // (หลังตัดคอมเมนต์ route นี้ไม่มีสองคำนี้เลย)
  assert.doesNotMatch(src, /\bactualSource\b/, 'ห้ามประทับ actualSource จากฟอร์ม — เป็นของ trigger');
  assert.doesNotMatch(src, /['"`]legacy['"`]/);
  assert.doesNotMatch(src, /\bwonValue\b/, 'wonValue เป็นของ trigger (คิดจาก SO อนุมัติ)');
  assert.match(src, /legacyWonCreateError\(body, \{ stage, today: businessDate\(\) \}\)/);
  const gate = src.indexOf('legacyWonCreateError(body');
  const items = src.indexOf('prepareDealValueItems(body');
  assert.ok(gate > 0 && items > 0 && gate < items,
    'ด่านดีลเก่าต้องมาก่อน prepareDealValueItems — ไม่งั้นคำขอที่ส่งแถวมาได้ error รายแถวแทนข้อความของด่าน');
  assert.match(src, /confirmedAt: stage === 'won' \? \(body\.expectedCloseDate \|\| null\) : null/,
    'วันที่ปิดในระบบเดิมมีตัวอ่าน (wonMonthOf) — อย่าลบเพราะคิดว่าเป็นเรื่องยอด');
  assert.match(src, /\.\.\.stripServerOnlyDealMetadata\(body\.metadata\)/);
  assert.doesNotMatch(src, /\.\.\.\(body\.metadata \|\| \{\}\)/);
});

test('PATCH ดีล: ถอดคีย์ของระบบจากค่าที่ส่งมาก่อน merge — บันทึกของ mig 0359 อยู่รอด', () => {
  const src = stripComments(read(PATCH_ROUTE));
  assert.match(src, /\{ \.\.\.\(before\.metadata \|\| \{\}\), \.\.\.stripServerOnlyDealMetadata\(body\.metadata\) \}/);
  assert.doesNotMatch(src, /\.\.\.body\.metadata\s*\}/);
});

test('คอมเมนต์ที่อ้างว่า trigger 0107/0108 ปล่อยยอดที่กรอกเองต้องไม่กลับมา', () => {
  for (const rel of [POST_ROUTE, 'src/lib/sales/salesOrderWorkflow.js', 'src/lib/sales/forecastSourceRepo.js']) {
    const raw = read(rel);
    assert.doesNotMatch(raw, /DB \(0107\/0108\)/, rel);
    assert.doesNotMatch(raw, /ของดีลย้ายระบบใหม่เป็น 'sale_order'/, rel);
    assert.doesNotMatch(raw, /ยอดสดชนะยอดย้าย/, rel);
  }
});

/* ── ③ ฟอร์ม ─────────────────────────────────────────────────────────────── */

function sourceFiles(rel, out = []) {
  for (const entry of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(child, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(child);
  }
  return out;
}

test('ไม่มีจอไหนสัญญาว่ายอดดีลเก่าเข้า Actual อีก', () => {
  const PROMISES = [
    'Actual) ทันที',
    'Won เก่าคิดเป็นยอดจริง',
    'มูลค่าที่ปิด',
    'ยอด Won เข้าเดือน',
    'ยอดปิดจริงจากระบบเดิม',
    'ถ้ามีใบสั่งขายมาผูกภายหลัง',
  ];
  for (const rel of [...sourceFiles('src/components'), ...sourceFiles('src/app')]) {
    const src = read(rel);
    for (const phrase of PROMISES) assert.ok(!src.includes(phrase), `${rel} ยังมี "${phrase}"`);
  }
  assert.doesNotMatch(stripComments(read('src/lib/sales/dealRequiredFields.js')), /มูลค่าที่ปิด/);
});

test('ฟอร์มดีลเก่า Won: ไม่มีตารางมูลค่า · บอกกติกาใหม่ · วันที่เป็นวันที่ปิดในระบบเดิม', () => {
  const form = read(FORM);
  assert.match(form, /\{legacyWon \? pairRows\(\[legacyValueNote\]\) : valueField\}/);
  assert.ok(form.includes('ไม่นับเป็นยอดขาย (Actual) และไม่เข้า FC'));
  assert.ok(form.includes('ยอดขายจริงมาจากใบสั่งขายที่อนุมัติแล้วเท่านั้น'));
  assert.ok(form.includes('วันที่ปิดในระบบเดิม'));
  assert.ok(form.includes('"ไม่มียอด"'), 'ใต้ขั้น Won ของดีลเก่าต้องไม่เขียน Actual');
  // วันที่สิ้นสุด: โหมดปกติยังบอกว่ารายงานวางแผนผลิตนับยอด (จริง) — โหมดดีลเก่า Won ต้องแยกกิ่งก่อนถึงคำนั้น
  // (ดีลยอด 0 ถูกข้ามที่ forecast-report ⇒ "รายงานวางแผนผลิตนับยอดดีลนี้" เป็นเท็จ)
  assert.match(form, /\{legacyWon\s*\?\s*"วันที่ลูกค้ารับของในระบบเดิม[^"]*ไม่มียอดในรายงานวางแผนผลิต"\s*:\s*form\.endDate/,
    'help ของวันที่สิ้นสุดในโหมดดีลเก่า Won ต้องไม่บอกว่ารายงานวางแผนผลิตนับยอด');
  const legacyEndHelp = form.indexOf('"วันที่ลูกค้ารับของในระบบเดิม');
  const countsPromise = form.indexOf('รายงานวางแผนผลิตนับยอดดีลนี้');
  assert.ok(legacyEndHelp > 0 && countsPromise > legacyEndHelp,
    'คำ "รายงานวางแผนผลิตนับยอดดีลนี้" ต้องอยู่หลังกิ่ง legacyWon เท่านั้น');
  // ตารางมูลค่าไม่มีช่องคำอธิบายเสริมแล้ว — ผู้เรียกเดียวของมันคือคำสัญญา Actual
  assert.doesNotMatch(stripComments(read(VALUE_LINES)), /\bhint\b/);
});

test('โมดัลสร้าง: ส่ง "ไม่มีมูลค่า" ชัด ๆ ในโหมดดีลเก่า Won และตรวจด่านเดียวกับ server', () => {
  const modal = stripComments(read(MODAL));
  assert.match(modal, /\.\.\.\(legacyWon \? \{ valueItems: \[\], projectValue: 0 \} : \{\}\)/);
  assert.match(modal, /legacyWonCreateError\(\{ \.\.\.payload, metadata \}, \{ stage: draft\.stage, today: businessDate\(\) \}\)/);
  assert.doesNotMatch(modal, /มูลค่าที่ปิด/);
  // โหมดดีลเก่ามีเฉพาะตอนสร้าง (probabilityMode="auto") — ฟอร์มแก้ส่ง legacyWon ไปก็เป็นโค้ดตาย
  for (const rel of [DEALS_PAGE, DEAL_DETAIL]) {
    assert.doesNotMatch(stripComments(read(rel)), /legacyWon/, rel);
  }
});

test('หน้าดีลโชว์บันทึกยอดปิดในระบบเดิม — ไม่ใช่ Actual และบอกตามจริงว่ายอดยังอยู่ใน FC หรือไม่', () => {
  const page = read(DEAL_DETAIL);
  assert.match(page, /legacyClosedNoteOf\(deal\)/);
  assert.ok(page.includes('ยอดปิดในระบบเดิม'));
  assert.ok(page.includes('ไม่นับเป็นยอดขาย (Actual) และไม่เข้า FC'));
  assert.match(page, /legacyNote\.stillInForecast/);
});
