// ── เลขแพ็คของบรรทัดใบเสนอราคา: ตัวอ่านค่า · หมวดที่ต้องกรอก · กฎของเซิร์ฟเวอร์ (mig 0407 · docs/qt-pack-column.md) ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LINE_PACK_TEXT, LinePackError, PACK_LINE_CATEGORY, PACK_LINE_UNIT, PACK_QTY_INVALID, PACK_QTY_MAX, PACK_QTY_MIN,
  QUOTE_PACK_INPUT_OPEN, lineCategoryCode, lineMoneyRuleMessage, linePackGateMessage, linePackIssues, linePackMessage,
  lineScreenRows, lineTakesPacks, lineUnitsTotal, packFactorOf, packLineUnit, packQtyValue, withPackColumn,
} from './linePacks.js';
import * as serviceOrders from './serviceOrders.js';
import { SALE_UNITS } from '../master/units.js';

const FIXTURES = JSON.parse(readFileSync(new URL('./quoteLinePackFixtures.json', import.meta.url), 'utf8'));
const SOURCE = readFileSync(new URL('./linePacks.js', import.meta.url), 'utf8');

const SDS = 'FG-278-02-001-0757'; // หมวด 02-001
const PERFUME = 'FG-336-01-009-1290'; // หมวดอื่น

/* ── ค่าคงที่ที่ต้องตรงกับที่อื่น (ไฟล์นี้ import ไฟล์เหล่านั้นไม่ได้ — เขียนค่าตรง ๆ แล้วให้เทสต์ยึด) ───────────── */

test('หมวดที่ต้องกรอก = หมวดแพ็คเกจบริการของใบสั่งขาย · ช่วง 1–9999 · หน่วย = หน่วยรอบของใบสั่งขาย และเป็นหน่วยขายที่มีจริง', () => {
  assert.equal(PACK_LINE_CATEGORY, serviceOrders.SERVICE_ROUND_CATEGORY);
  assert.equal(PACK_LINE_CATEGORY, '02-001');
  assert.deepEqual([PACK_QTY_MIN, PACK_QTY_MAX], [1, 9999]);
  // SERVICE_ROUNDS_UNIT มีตั้งแต่ #1887 — ฐานที่เก่ากว่านั้นยังไม่มี export นี้ จึงถอยไปค่าตรง ๆ ให้ข้อยืนยันยังเป็นของจริง
  assert.equal(PACK_LINE_UNIT, serviceOrders.SERVICE_ROUNDS_UNIT ?? 'เดือน');
  assert.ok(SALE_UNITS.includes(PACK_LINE_UNIT), 'หน่วยของบรรทัดที่มีเลขแพ็คต้องอยู่ในลิสต์หน่วยขาย (ใบพิมพ์แปลคำจากลิสต์นี้)');
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 ข้อ A2–A4 · แผน IMPL_PLAN_PR3 §4 แถว 1 + §12 C2):
   เดิมเทสต์นี้ยึด "สวิตช์ปิด" — วันนี้ช่องกรอก ด่านบังคับกรอก และสวิตช์ขึ้นพร้อมกัน จึงยึด "เปิด และห้ามกลับ" แทน (ไม่ได้ลบข้อยืนยันเดิม:
   ค่ายังต้องเป็นค่าคงที่ตรง ๆ) · กิ่ง "ปิด" ยังถูกทดสอบครบด้วยตัวเลือกที่ระบุเอง (เทสต์ถัด ๆ ไป) ในฐานะคำตอบของรุ่น PR-1 / PR-2 */
test('🔴 ช่องกรอกเปิดแล้ว (งวด PR-3) — ค่าคงที่ตรง ๆ = true · ประตูทางเดียว: คอมเมนต์ที่ค่าคงที่บอกว่าห้ามตั้งกลับ และทางฉุกเฉินคือรุ่น PR-2', () => {
  assert.equal(QUOTE_PACK_INPUT_OPEN, true);
  // อ่านจากข้อความต้นฉบับด้วย: ค่าต้องเป็นค่าคงที่ตรง ๆ ไม่ใช่ env / นิพจน์ ที่ปิดเองได้บน production
  assert.match(SOURCE, /^export const QUOTE_PACK_INPUT_OPEN = true;$/m);
  assert.equal((SOURCE.match(/QUOTE_PACK_INPUT_OPEN\s*=(?!=)/g) || []).length, 1, 'กำหนดค่าให้ชื่อนี้ได้ที่เดียว (บรรทัดประกาศ)');
  assert.doesNotMatch(SOURCE, /QUOTE_PACK_INPUT_OPEN\s*=(?!=)(?!\s*true;)/, 'และค่านั้นคือ true');
  assert.doesNotMatch(SOURCE, /process\.env/);
  /* ประโยคหลักของประตูทางเดียวต้องอยู่ **ติดกับค่าคงที่** (คอมเมนต์ก้อนสุดท้ายก่อนบรรทัดประกาศ): คนที่คิดจะแก้ค่านี้ต้องอ่านเจอก่อน
     — ในโค้ดตั้งแต่งวด PR-3 ค่า false ทำให้เซิร์ฟเวอร์บอกคนขายให้ลบเลขแพ็คเอง และจอมีช่องให้ลบได้จริง (ยอดหดเป็นแถวที่ฐานรับ) */
  const before = SOURCE.slice(0, SOURCE.indexOf('export const QUOTE_PACK_INPUT_OPEN'));
  const comment = before.slice(before.lastIndexOf('/*'));
  assert.ok(comment.trimEnd().endsWith('*/'), 'คอมเมนต์ของสวิตช์ต้องอยู่ติดบรรทัดประกาศ');
  assert.match(comment, /ประตูทางเดียว: ห้ามตั้งค่านี้กลับเป็น false ตราบที่ยังมีบรรทัดที่มีเลขแพ็ค — ทางฉุกเฉินคือ deploy รุ่น PR-2 กลับ ไม่ใช่สวิตช์นี้/);
  assert.match(comment, /ถอนฟีเจอร์ = แก้โค้ด/);
  // ไม่มีข้อความไหนในไฟล์บอกว่าตั้งกลับได้ (เดิมคอมเมนต์เขียนเหตุไว้อีกแบบ: "ใบนั้นจะแก้/ออก Rev. ไม่ได้อีก")
  assert.doesNotMatch(SOURCE, /สวิตช์ฉุกเฉิน/);
});

test('🪤 linePacks.js เป็นใบของกราฟ import — เรียกได้แค่ categoryOf (salesPlanning.js เรียกไฟล์นี้ · วนไม่ได้)', () => {
  const imports = [...SOURCE.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['@/lib/master/categoryOf']);
  assert.doesNotMatch(SOURCE, /\bimport\s*\(/, 'ห้าม dynamic import');
  assert.doesNotMatch(SOURCE, /\brequire\s*\(/);
});

/* ── packQtyValue / packFactorOf ─────────────────────────────────────────────────────────────────────── */

test('packQtyValue / packFactorOf: ทุกแถว typing ของชุดตัวอย่าง (ว่าง = null · ใช้ไม่ได้ = INVALID · ไม่แปลงค่าให้เอง)', () => {
  assert.equal(FIXTURES.typing.length, 19);
  for (const row of FIXTURES.typing) {
    const expected = row.value === 'invalid' ? PACK_QTY_INVALID : row.value;
    assert.equal(packQtyValue(row.raw), expected, `packQtyValue(${JSON.stringify(row.raw)})`);
    assert.equal(packFactorOf(row.raw), row.factor, `packFactorOf(${JSON.stringify(row.raw)})`);
  }
});

test('packQtyValue: ค่าที่ชุดตัวอย่างไม่มี — undefined ว่าง · NaN / Infinity / ลบ / อ็อบเจกต์ / อาร์เรย์ / สตริงแปลกรูป ใช้ไม่ได้', () => {
  assert.equal(packQtyValue(undefined), null);
  assert.equal(packQtyValue('\t\n'), null);
  for (const raw of [NaN, Infinity, -1, -0.5, 0.999, 9999.5, {}, [], [2], false, '1e3', '2.0', '+2', '2 แพ็ค', '٢', '１', 2n, () => 2]) {
    assert.equal(packQtyValue(raw), PACK_QTY_INVALID, `ต้องใช้ไม่ได้: ${String(raw)}`);
    assert.equal(packFactorOf(raw), 1, 'ค่าที่ใช้ไม่ได้ไม่คูณอะไร — ไม่มีวันเป็น 0 หรือเศษส่วน');
  }
  assert.equal(packQtyValue('0001'), PACK_QTY_INVALID, 'ขึ้นต้นด้วย 0 ไม่รับ');
  assert.equal(packQtyValue(' 9999 '), 9999);
  assert.equal(typeof packQtyValue('43'), 'number', 'สตริงที่ใช้ได้คืนเป็นตัวเลข');
});

/* ── หมวดของบรรทัด (มติ A3: ดูหมวดอย่างเดียว) ──────────────────────────────────────────────────────── */

test('lineTakesPacks ⭐ มติ A3: FG หมวด 02-001 ต้องกรอกทุกตัว — หน่วยกิโลกรัม/ชิ้นก็ต้องกรอก · หมวดอื่นไม่ต้อง', () => {
  for (const unit of ['แพ็คเกจ', 'กิโลกรัม', 'ชิ้น', 'เดือน', null]) {
    assert.equal(lineTakesPacks({ productId: 'P1', fgCode: SDS, unit }), true, `หน่วย ${unit}`);
    assert.equal(lineTakesPacks({ productId: 'P1', fgCode: SDS }, { fgCode: SDS, saleUnit: unit }), true, `หน่วยขายของทะเบียน ${unit}`);
  }
  assert.equal(lineTakesPacks({ productId: 'P9', fgCode: PERFUME, unit: 'เดือน' }), false, 'หน่วยเดือนไม่ได้ทำให้หมวดอื่นต้องกรอก');
  assert.equal(lineTakesPacks({ fgCode: SDS }), true, 'ผูกด้วยรหัส FG อย่างเดียวก็นับ');
  assert.doesNotMatch(SOURCE.slice(SOURCE.indexOf('export function lineTakesPacks'), SOURCE.indexOf('export function packLineUnit')),
    /unit|saleUnit/i, 'ตัวตัดสินต้องไม่อ่านหน่วย');
});

test('lineCategoryCode: รหัส FG ของสินค้าชนะรหัสบนบรรทัด · สินค้าถูกลบ = ถอดจากรหัสบนบรรทัด · บรรทัดพิมพ์เอง = หมวดที่เลือกไว้', () => {
  // แถวสินค้าชนะ (รหัส FG ของสินค้าถูกแก้ในทะเบียนหลังบันทึกใบ)
  assert.equal(lineCategoryCode({ productId: 'P1', fgCode: PERFUME }, { fgCode: SDS }), '02-001');
  assert.equal(lineTakesPacks({ productId: 'P1', fgCode: SDS }, { fgCode: PERFUME }), false);
  // สินค้าหายจากทะเบียน (ไม่มีแถว) หรือแถวไม่มีรหัส
  assert.equal(lineCategoryCode({ productId: 'P1', fgCode: SDS }, null), '02-001');
  assert.equal(lineCategoryCode({ productId: 'P1', fgCode: SDS }, { fgCode: null }), '02-001');
  assert.equal(lineCategoryCode({ productId: 'P1', fgCode: null }, null), null);
  // บรรทัดพิมพ์เอง (ไม่มี productId / fgCode) = หมวดที่คนออกใบเลือก (manualLineCategoryEdit)
  assert.equal(lineTakesPacks({ description: 'ค่าบริการ', metadata: { categoryCode: '02-001' } }), true);
  assert.equal(lineTakesPacks({ description: 'ค่าบริการ', metadata: { categoryCode: '02-010' } }), false);
  assert.equal(lineTakesPacks({ description: 'ค่าบริการ', metadata: {} }), false);
  assert.equal(lineTakesPacks({ description: 'ค่าบริการ' }), false);
  // บรรทัดที่ผูกสินค้าไม่อ่านหมวดใน metadata (ของบรรทัดพิมพ์เองเท่านั้น — withCategoryMeta ล้างทิ้งตอนผูกสินค้า)
  assert.equal(lineTakesPacks({ productId: 'P9', fgCode: PERFUME, metadata: { categoryCode: '02-001' } }), false);
  assert.equal(lineCategoryCode(null), null);
  assert.equal(lineTakesPacks(undefined), false);
});

/* ── หน่วย · จำนวนหน่วย ────────────────────────────────────────────────────────────────────────────── */

test('packLineUnit: มีเลขแพ็คที่ใช้ได้ = "เดือน" ไม่ว่าทะเบียนตั้งหน่วยอะไร · ไม่มี/ใช้ไม่ได้ = หน่วยของทะเบียนตามเดิม', () => {
  assert.equal(packLineUnit({ packQty: 2 }, 'แพ็คเกจ'), 'เดือน');
  assert.equal(packLineUnit({ packQty: 1 }, 'กิโลกรัม'), 'เดือน', 'เลขแพ็ค 1 ก็เป็นบรรทัดที่แยกแพ็คแล้ว');
  assert.equal(packLineUnit({ packQty: '43' }, undefined), 'เดือน');
  for (const packQty of [null, undefined, '', '  ', 0, 'abc', 1.5, 10000]) {
    assert.equal(packLineUnit({ packQty }, 'แพ็คเกจ'), 'แพ็คเกจ', `packQty=${String(packQty)}`);
  }
  assert.equal(packLineUnit({}, 'ชิ้น'), 'ชิ้น');
  assert.equal(packLineUnit(null, 'ชิ้น'), 'ชิ้น');
  assert.equal(packLineUnit({ packQty: null }, undefined), undefined, 'ไม่เติมหน่วยให้เอง');
});

test('lineUnitsTotal: ตัวคูณแพ็ค × จำนวน — "24" แบบเดิม = "2 × 12" แบบใหม่ · จำนวนไม่ใช่ตัวเลข = 0', () => {
  assert.equal(lineUnitsTotal({ qty: 24 }), 24);
  assert.equal(lineUnitsTotal({ packQty: 2, qty: 12 }), 24);
  assert.equal(lineUnitsTotal({ packQty: 43, qty: 4 }), 172);
  assert.equal(lineUnitsTotal({ packQty: null, qty: '12' }), 12);
  assert.equal(lineUnitsTotal({ packQty: 'abc', qty: 5 }), 5, 'ค่าที่ใช้ไม่ได้ไม่คูณ');
  assert.equal(lineUnitsTotal({ packQty: 2, qty: 'x' }), 0);
  assert.equal(lineUnitsTotal({ packQty: 2 }), 0);
  assert.equal(lineUnitsTotal(null), 0);
});

/* ── กฎของเซิร์ฟเวอร์ ───────────────────────────────────────────────────────────────────────────────── */

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 · แผน §4 แถว 2 + §12 C2): ตารางของกิ่ง "ปิด" อยู่ครบทุกแถว แต่ต้องขอด้วย
   `{ open: false }` เอง — ค่าตั้งต้นคือสวิตช์จริงซึ่งเปิดแล้ว · กิ่งนี้คือ **คำตอบของรุ่น PR-1 / PR-2 (รุ่นที่ถอยกลับไปได้)** ไม่ใช่สถานะที่ตั้งได้ในโค้ดรุ่นนี้ */
test('linePackIssues กิ่งปิด = คำตอบของรุ่น PR-1 / PR-2 (รุ่นที่ถอยกลับไปได้): ทุกค่าที่ไม่ว่างถูกปฏิเสธ (ค่าที่ถูกต้องด้วย) · null / undefined / ว่าง / ไม่มีคีย์ ไม่ถูกทักเลย', () => {
  const lines = [
    { fgCode: SDS }, // 1 ไม่มีคีย์
    { fgCode: SDS, packQty: null }, // 2 สิ่งที่ select * คืนหลังรัน 0407
    { fgCode: SDS, packQty: undefined }, // 3
    { fgCode: SDS, packQty: '' }, // 4
    { fgCode: SDS, packQty: '   ' }, // 5
    { fgCode: SDS, packQty: 2 }, // 6 ถูกต้อง — ก็ยังปฏิเสธ
    { fgCode: SDS, packQty: '2' }, // 7
    { fgCode: SDS, packQty: 1 }, // 8
    { fgCode: PERFUME, packQty: 0 }, // 9 ใช้ไม่ได้
    { description: 'พิมพ์เอง', packQty: 'abc' }, // 10
  ];
  const closed = [6, 7, 8, 9, 10].map((row) => ({ index: row - 1, row, code: 'closed' }));
  assert.deepEqual(linePackIssues(lines, { open: false }), closed);
  assert.deepEqual(linePackIssues(lines.slice(0, 5), { open: false }), []);
  // กิ่งปิดไม่ดูหมวด: บรรทัดหมวด 02-001 ที่ไม่มีเลขแพ็คไม่ถูกบังคับ
  assert.deepEqual(linePackIssues([{ fgCode: SDS }, { fgCode: SDS, packQty: null }], { open: false, requireOnCategory: true }), []);
  for (const notLines of [null, undefined, 'x', {}]) {
    assert.deepEqual(linePackIssues(notLines), []);
    assert.deepEqual(linePackIssues(notLines, { open: false }), []);
  }
  /* ค่าตั้งต้นของตัวเลือก = สวิตช์จริง (เปิด): ลิสต์เดียวกันได้คำตอบของกิ่งเปิด — ห้าแถวหมวด 02-001 ที่ช่องว่างต้องกรอก ·
     แถวที่มีเลขถูกต้องบนหมวด 02-001 ผ่าน · ค่าผิดรูปเป็น invalid (ไม่ใช่ closed อีกแล้ว) */
  assert.deepEqual(linePackIssues(lines).map((issue) => [issue.row, issue.code]), [
    [1, 'required'], [2, 'required'], [3, 'required'], [4, 'required'], [5, 'required'], [9, 'invalid'], [10, 'invalid'],
  ]);
  assert.deepEqual(linePackIssues(lines), linePackIssues(lines, { open: true }), 'ค่าตั้งต้น = เปิด');
  assert.ok(!linePackIssues(lines).some((issue) => issue.code === 'closed'));
});

test('linePackIssues ช่องเปิด: ใช้ไม่ได้ = invalid · มีเลขบนหมวดอื่น = not_allowed · หมวด 02-001 ไม่มีเลข = required (ปิดข้อนี้ได้ตอนออก Rev./ตั้งต้นจากโครงการ)', () => {
  const lines = [
    { fgCode: SDS, packQty: 2 }, // 1 ผ่าน
    { fgCode: SDS, packQty: '9999' }, // 2 ผ่าน
    { fgCode: SDS, packQty: 0 }, // 3 invalid
    { fgCode: PERFUME, packQty: 'abc' }, // 4 invalid (ค่าผิดรูปมาก่อนเรื่องหมวด)
    { fgCode: PERFUME, packQty: 2 }, // 5 not_allowed
    { description: 'พิมพ์เอง', packQty: 1 }, // 6 not_allowed (ไม่มีหมวด)
    { fgCode: SDS }, // 7 required
    { fgCode: SDS, packQty: null }, // 8 required
    { description: 'พิมพ์เองหมวดบริการ', metadata: { categoryCode: '02-001' }, packQty: '' }, // 9 required
    { fgCode: PERFUME }, // 10 ผ่าน
    { description: 'พิมพ์เองหมวดบริการ', metadata: { categoryCode: '02-001' }, packQty: 3 }, // 11 ผ่าน
  ];
  assert.deepEqual(linePackIssues(lines, { open: true }).map((i) => [i.row, i.code]), [
    [3, 'invalid'], [4, 'invalid'], [5, 'not_allowed'], [6, 'not_allowed'], [7, 'required'], [8, 'required'], [9, 'required'],
  ]);
  assert.deepEqual(linePackIssues(lines, { open: true, requireOnCategory: false }).map((i) => [i.row, i.code]), [
    [3, 'invalid'], [4, 'invalid'], [5, 'not_allowed'], [6, 'not_allowed'],
  ], 'requireOnCategory: false ปิดเฉพาะข้อ "ต้องกรอก" — ค่าผิดรูป/ผิดหมวดยังถูกปฏิเสธ');
  for (const issue of linePackIssues(lines, { open: true })) assert.equal(issue.index, issue.row - 1);
});

test('linePackIssues ช่องเปิด: หมวดอ่านจากแถวสินค้าเมื่อส่ง productById มา (Map หรืออ็อบเจกต์) — รหัส FG ของสินค้าชนะรหัสบนบรรทัด', () => {
  const lines = [{ productId: 'P1', fgCode: PERFUME, packQty: 2 }, { productId: 'P2', fgCode: SDS, packQty: 2 }, { productId: 'P3', fgCode: SDS }];
  const products = { P1: { id: 'P1', fgCode: SDS }, P2: { id: 'P2', fgCode: PERFUME } }; // P3 ถูกลบจากทะเบียน
  const expected = [[2, 'not_allowed'], [3, 'required']];
  assert.deepEqual(linePackIssues(lines, { open: true, productById: products }).map((i) => [i.row, i.code]), expected);
  assert.deepEqual(linePackIssues(lines, { open: true, productById: new Map(Object.entries(products)) }).map((i) => [i.row, i.code]), expected);
  // ไม่ส่ง = ถอดจากรหัสบนบรรทัด
  assert.deepEqual(linePackIssues(lines, { open: true }).map((i) => [i.row, i.code]), [[1, 'not_allowed'], [3, 'required']]);
});

test('linePackMessage: หนึ่งประโยคต่อหนึ่งชนิด แต่ละประโยคบอกเลขรายการของตัวเอง · ไม่มีปัญหา = ข้อความว่าง', () => {
  assert.equal(linePackMessage([]), '');
  assert.equal(linePackMessage(null), '');
  assert.equal(linePackMessage(undefined), '');
  assert.equal(
    linePackMessage([{ index: 1, row: 2, code: 'closed' }, { index: 2, row: 3, code: 'closed' }]),
    'รายการ 2, 3: ยังไม่เปิดให้กรอก “แพ็ค/เดือน” — ลบตัวเลขในช่องนั้นออกแล้วบันทึกอีกครั้ง',
  );
  const mixed = linePackMessage([
    { index: 6, row: 7, code: 'required' }, { index: 2, row: 3, code: 'invalid' }, { index: 4, row: 5, code: 'not_allowed' },
    { index: 7, row: 8, code: 'required' },
  ]);
  assert.equal(mixed, [
    'รายการ 3: “แพ็ค/เดือน” ต้องเป็นจำนวนเต็ม 1–9,999',
    'รายการ 5: “แพ็ค/เดือน” ใช้ได้เฉพาะรายการหมวด 02-001 — ลบตัวเลขในช่องนั้นออกก่อนบันทึก',
    'รายการ 7, 8: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ',
  ].join(' · '));
});

test('LINE_PACK_TEXT: ข้อความทั้งก้อนของกฎนี้ (แก้คำ = รัน check:thaiwrap ใหม่) · แช่แข็ง · หมวดในข้อความมาจากค่าคงที่', () => {
  assert.ok(Object.isFrozen(LINE_PACK_TEXT));
  const { rows, ...texts } = LINE_PACK_TEXT;
  assert.equal(typeof rows, 'function');
  // ทั้งก้อน: ห้าคีย์ของงวด PR-1 (ไม่ขยับสักตัวอักษร) + สี่คีย์ของด่านยื่น / อนุมัติ / ส่ง (งวด PR-3 · แผน §12 C3)
  assert.deepEqual(texts, {
    closed: 'ยังไม่เปิดให้กรอก “แพ็ค/เดือน” — ลบตัวเลขในช่องนั้นออกแล้วบันทึกอีกครั้ง',
    invalid: '“แพ็ค/เดือน” ต้องเป็นจำนวนเต็ม 1–9,999',
    required: 'รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ',
    notAllowed: '“แพ็ค/เดือน” ใช้ได้เฉพาะรายการหมวด 02-001 — ลบตัวเลขในช่องนั้นออกก่อนบันทึก',
    moneyRule: 'ยอดของรายการไม่ตรงกับสูตร แพ็ค × จำนวน × ราคา — ยังไม่ได้บันทึก แจ้งผู้ดูแลระบบ',
    beforeSubmit: 'กด “แก้ไขข้อมูล” แล้วกรอกให้ครบก่อนยื่นอนุมัติ',
    beforeApprove: 'กด “ตีกลับให้แก้ไข” ให้ผู้จัดทำกรอกให้ครบก่อน',
    beforeApproveOwn: 'กด “ดึงกลับมาแก้ไข” แล้วกรอกให้ครบก่อนยื่นใหม่',
    beforeSend: 'ออก Rev. แล้วกรอกในฉบับใหม่ก่อนส่งลูกค้า',
  });
  assert.equal(LINE_PACK_TEXT.rows([2, 3]), 'รายการ 2, 3');
  assert.ok(LINE_PACK_TEXT.required.includes(PACK_LINE_CATEGORY) && LINE_PACK_TEXT.notAllowed.includes(PACK_LINE_CATEGORY));
  // ค่าคงที่ระดับบนสุด เขียนเป็นข้อความตรง ๆ ในไฟล์ (กฎโปรเจกต์: ข้อความไทยอยู่ในก้อนข้อความ ไม่ประกอบกลางโค้ด)
  for (const key of ['beforeSubmit', 'beforeApprove', 'beforeApproveOwn', 'beforeSend']) {
    assert.ok(SOURCE.includes(`  ${key}: '${LINE_PACK_TEXT[key]}',`), `${key} ต้องเป็นข้อความตรง ๆ ในก้อน LINE_PACK_TEXT`);
  }
});

/* ── เลขรายการที่คนเห็นบนจอ (งวด PR-3 · แผน §1 D2) ──────────────────────────────────────────────────────
   🐞 ก่อนงวดนี้: จอส่ง [แพ็ค 2, จำนวน 0, ไม่มีแพ็ค] → บรรทัดจำนวน 0 ถูกตัด → ด่านบอก "รายการ 2" ทั้งที่บนจอคือแถวที่ 3 */

test('lineScreenRows: ค่าตั้งต้น = ตำแหน่ง + 1 · submitted = sortOrder + 1 (ลำดับที่จอส่งมา) · stored = ลำดับที่หน้าใบเรียง (sortOrder น้อยไปมาก เท่ากัน = ตามอาร์เรย์)', () => {
  const gaps = [{ sortOrder: 0 }, { sortOrder: 2 }, { sortOrder: 5 }];
  assert.deepEqual(lineScreenRows(gaps), [1, 2, 3]);
  assert.deepEqual(lineScreenRows(gaps, null), [1, 2, 3]);
  assert.deepEqual(lineScreenRows(gaps, 'submitted'), [1, 3, 6], 'ช่องว่างของ sortOrder = บรรทัดจำนวน 0 ที่ถูกตัด — เลขบนจอยังนับมันอยู่');
  assert.deepEqual(lineScreenRows(gaps, 'stored'), [1, 2, 3], 'ใบที่โหลดกลับมา: จอเรียงแล้วนับ 1, 2, 3 — ไม่ใช่ sortOrder + 1');
  // stored: อาร์เรย์ไม่ได้เรียงมา (ฐานไม่รับประกันลำดับของแถวที่ฝัง) — เลขรายการตามลำดับที่จอจะเรียง
  const shuffled = [{ id: 'c', sortOrder: 5 }, { id: 'a', sortOrder: 0 }, { id: 'b', sortOrder: 2 }];
  assert.deepEqual(lineScreenRows(shuffled, 'stored'), [3, 1, 2]);
  assert.deepEqual(lineScreenRows(shuffled), [1, 2, 3]);
  // stored: เท่ากัน = ตามลำดับในอาร์เรย์ (การเรียงของจอเป็นแบบคงลำดับ) · ไม่มี sortOrder = 0 เหมือนที่จอใช้ (`sortOrder ?? 0`)
  assert.deepEqual(lineScreenRows([{ sortOrder: 1 }, { sortOrder: 0 }, { sortOrder: 1 }, { sortOrder: 0 }], 'stored'), [3, 1, 4, 2]);
  assert.deepEqual(lineScreenRows([{ sortOrder: 3 }, {}, { sortOrder: null }, { sortOrder: 1 }], 'stored'), [4, 1, 2, 3]);
  assert.deepEqual(lineScreenRows([{ sortOrder: 'x' }, { sortOrder: 0 }], 'stored'), [1, 2], 'ค่าที่อ่านเป็นตัวเลขไม่ได้ = 0');
  // submitted: sortOrder ที่ใช้ไม่ได้ (ไม่มี · ไม่ใช่จำนวนเต็ม · ติดลบ · ข้อความ) ถอยไปตำแหน่ง + 1 — ไม่มีวันได้เลข 0 / NaN
  assert.deepEqual(lineScreenRows([{}, { sortOrder: 1.5 }, { sortOrder: -1 }, { sortOrder: '3' }, null, { sortOrder: 9 }], 'submitted'), [1, 2, 3, 4, 5, 10]);
  for (const mode of [null, 'submitted', 'stored']) {
    for (const notLines of [null, undefined, 'x', {}]) assert.deepEqual(lineScreenRows(notLines, mode), [], `${mode}: ${String(notLines)}`);
    assert.deepEqual(lineScreenRows([], mode), []);
    for (const row of lineScreenRows([{ sortOrder: 4 }, {}, { sortOrder: 0 }], mode)) assert.ok(Number.isInteger(row) && row >= 1);
  }
  // โหมดที่ไม่รู้จัก = ค่าตั้งต้น (ตำแหน่ง + 1)
  assert.deepEqual(lineScreenRows(gaps, 'whatever'), [1, 2, 3]);
  // ไม่แก้ของเดิม
  const frozen = Object.freeze([Object.freeze({ sortOrder: 2 }), Object.freeze({ sortOrder: 0 })]);
  assert.deepEqual(lineScreenRows(frozen, 'stored'), [2, 1]);
});

test('linePackIssues + numbering: `row` = เลขบนจอ · `index` ยังเป็นตำแหน่งในอาร์เรย์เสมอ — [แพ็ค 2, (จำนวน 0 ถูกตัด), ไม่มีแพ็ค] ได้ "รายการ 3" ไม่ใช่ 2', () => {
  // รูปที่ตัว normalize คืนเมื่อจอส่งสามแถวแล้วแถวกลางจำนวน 0: เหลือสองบรรทัด sortOrder 0 และ 2
  const kept = [{ fgCode: SDS, packQty: 2, sortOrder: 0 }, { fgCode: SDS, sortOrder: 2 }];
  assert.deepEqual(linePackIssues(kept), [{ index: 1, row: 2, code: 'required' }], 'ค่าตั้งต้น (ไม่ส่ง numbering) = ตำแหน่ง + 1 เหมือนงวด PR-1');
  assert.deepEqual(linePackIssues(kept, { numbering: 'submitted' }), [{ index: 1, row: 3, code: 'required' }]);
  assert.equal(linePackMessage(linePackIssues(kept, { numbering: 'submitted' })), `รายการ 3: ${LINE_PACK_TEXT.required}`);
  // บรรทัดที่เก็บไว้ sortOrder 0, 2, 5 (อาร์เรย์สลับลำดับ) → รายการ 1–3 ตามที่หน้าใบเรียง
  const storedLines = [{ fgCode: SDS, sortOrder: 5 }, { fgCode: PERFUME, packQty: 2, sortOrder: 0 }, { fgCode: SDS, sortOrder: 2 }];
  assert.deepEqual(linePackIssues(storedLines, { numbering: 'stored' }), [
    { index: 0, row: 3, code: 'required' }, { index: 1, row: 1, code: 'not_allowed' }, { index: 2, row: 2, code: 'required' },
  ]);
  assert.equal(linePackMessage(linePackIssues(storedLines, { numbering: 'stored' })),
    `รายการ 1: ${LINE_PACK_TEXT.notAllowed} · รายการ 2, 3: ${LINE_PACK_TEXT.required}`, 'เลขรายการในประโยคเรียงน้อยไปมาก แม้อาร์เรย์ไม่ได้เรียง');
  // numbering ไม่เปลี่ยนว่าบรรทัดไหนผิดหรือผิดอะไร — เปลี่ยนแค่เลขที่บอก
  for (const numbering of [null, 'submitted', 'stored']) {
    assert.deepEqual(linePackIssues(storedLines, { numbering }).map((issue) => [issue.index, issue.code]), [[0, 'required'], [1, 'not_allowed'], [2, 'required']], String(numbering));
    assert.deepEqual(linePackIssues(storedLines, { numbering, requireOnCategory: false }).map((issue) => issue.code), ['not_allowed']);
    assert.deepEqual(linePackIssues(storedLines, { numbering, open: false }).map((issue) => [issue.index, issue.code]), [[1, 'closed']]);
  }
});

test('linePackMessage: เลขรายการในหนึ่งประโยคเรียงน้อยไปมาก ไม่ว่ารายการปัญหาจะมาลำดับไหน', () => {
  const message = linePackMessage([
    { index: 0, row: 12, code: 'required' }, { index: 1, row: 3, code: 'required' }, { index: 2, row: 7, code: 'required' },
    { index: 3, row: 9, code: 'invalid' }, { index: 4, row: 2, code: 'invalid' },
  ]);
  assert.equal(message, `รายการ 2, 9: ${LINE_PACK_TEXT.invalid} · รายการ 3, 7, 12: ${LINE_PACK_TEXT.required}`);
});

/* ── ข้อความของด่านยื่น / อนุมัติ / ส่ง (งวด PR-3 · แผน §3.5 + §12 C3) ───────────────────────────────── */

test('linePackGateMessage: สี่ action — ข้อความของด่าน + " — " + สิ่งที่คนนั้นต้องกด · ไม่มีปัญหา = ข้อความว่าง · action อื่น = โยน (ไม่มีข้อความเปล่าที่ไม่บอกทางออก)', () => {
  const issues = [{ index: 0, row: 1, code: 'required' }];
  assert.equal(linePackGateMessage(issues, 'submit'), 'รายการ 1: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ — กด “แก้ไขข้อมูล” แล้วกรอกให้ครบก่อนยื่นอนุมัติ');
  assert.equal(linePackGateMessage(issues, 'approve'), 'รายการ 1: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ — กด “ตีกลับให้แก้ไข” ให้ผู้จัดทำกรอกให้ครบก่อน');
  assert.equal(linePackGateMessage(issues, 'approveOwn'), 'รายการ 1: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ — กด “ดึงกลับมาแก้ไข” แล้วกรอกให้ครบก่อนยื่นใหม่');
  assert.equal(linePackGateMessage([{ index: 1, row: 2, code: 'required' }, { index: 2, row: 3, code: 'required' }], 'send'),
    'รายการ 2, 3: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ — ออก Rev. แล้วกรอกในฉบับใหม่ก่อนส่งลูกค้า');
  const ACTIONS = { submit: 'beforeSubmit', approve: 'beforeApprove', approveOwn: 'beforeApproveOwn', send: 'beforeSend' };
  const mixed = [{ index: 4, row: 5, code: 'not_allowed' }, { index: 0, row: 1, code: 'required' }];
  for (const [action, key] of Object.entries(ACTIONS)) {
    // ท้ายข้อความ = คีย์ของ action นั้นเท่านั้น (สลับกัน = ชี้ปุ่มที่คนนั้นไม่มี) · หัวข้อความ = linePackMessage ทั้งก้อน (เลขรายการอยู่ครบ)
    assert.equal(linePackGateMessage(mixed, action), `${linePackMessage(mixed)} — ${LINE_PACK_TEXT[key]}`, action);
    assert.match(linePackGateMessage(mixed, action), /^รายการ 5: .* · รายการ 1: /, action);
    for (const none of [[], null, undefined]) assert.equal(linePackGateMessage(none, action), '', `${action}: ไม่มีปัญหา`);
  }
  assert.equal(new Set(Object.values(ACTIONS).map((key) => LINE_PACK_TEXT[key])).size, 4, 'สี่ข้อความไม่ซ้ำกัน');
  for (const bad of [undefined, null, '', 'save', 'Submit', 'approve ', 'reject', 'toString', 'constructor', '__proto__', 0]) {
    assert.throws(() => linePackGateMessage(issues, bad), /unknown action/, `action=${String(bad)}`);
    assert.throws(() => linePackGateMessage([], bad), /unknown action/, `action=${String(bad)} (ไม่มีปัญหาก็โยน — ผู้เรียกเขียนผิด)`);
  }
});

test('🔴 ชื่อปุ่มในข้อความของด่านตรงกับป้ายของปุ่มจริงบนหน้าใบทุกตัวอักษร — เปลี่ยนชื่อปุ่ม = เทสต์นี้แดง ไม่ใช่ข้อความที่ชี้ปุ่มที่ไม่มี (แผน §12 C3)', () => {
  const src = (relative) => readFileSync(new URL(relative, new URL('../../', import.meta.url)), 'utf8');
  const quoted = (text) => [...text.matchAll(/“([^”]+)”/g)].map((match) => match[1]);
  const page = src('app/sales-planning/quotations/[id]/page.js');
  const buttons = src('components/ui/ActionButtons.js');
  // ยื่นอนุมัติ → ปุ่ม "แก้ไขข้อมูล" ของหน้าใบ (id: "edit")
  assert.deepEqual(quoted(LINE_PACK_TEXT.beforeSubmit), ['แก้ไขข้อมูล']);
  assert.match(page, /id: "edit",\s*kind: "edit",\s*label: "แก้ไขข้อมูล",/);
  // ผู้อนุมัติที่ไม่ใช่คนยื่น → ปุ่ม "ตีกลับให้แก้ไข" ของหน้าใบ (id: "reject" · โชว์เมื่อ canRejectSubmission)
  assert.deepEqual(quoted(LINE_PACK_TEXT.beforeApprove), ['ตีกลับให้แก้ไข']);
  assert.match(page, /id: "reject",\s*kind: "reject",\s*label: "ตีกลับให้แก้ไข",\s*variant: "outline",\s*visible: canRejectSubmission && !editMode,/);
  // ผู้อนุมัติที่เป็นคนยื่นเอง → ปุ่ม "ดึงกลับมาแก้ไข" (kind withdraw ไม่มี label ของตัวเอง — ป้ายมาจากตาราง KINDS · โชว์เมื่อ canWithdrawSubmission)
  assert.deepEqual(quoted(LINE_PACK_TEXT.beforeApproveOwn), ['ดึงกลับมาแก้ไข']);
  assert.match(buttons, /withdraw: \{ tone: "neutral", Icon: Undo2, label: "ดึงกลับมาแก้ไข" \},/);
  assert.match(page, /id: "withdraw",\s*kind: "withdraw",\s*variant: "outline",\s*visible: canWithdrawSubmission && !editMode,/);
  // ส่งลูกค้า → ปุ่ม "ออก Rev." (kind revise — ป้ายจากตาราง KINDS)
  assert.match(buttons, /revise: \{ tone: "neutral", Icon: Copy, label: "ออก Rev\." \},/);
  assert.ok(LINE_PACK_TEXT.beforeSend.startsWith('ออก Rev. '), 'ข้อความของด่านส่งขึ้นต้นด้วยป้ายของปุ่ม');
  assert.match(page, /id: "revise",\s*kind: "revise",\s*variant: "outline",\s*visible: canReviseDocument && !editMode,/);
  /* เหตุที่ต้องมีสองข้อความของผู้อนุมัติ: คนยื่นตีกลับใบตัวเองไม่ได้ (canRejectQuotationSubmission ตัดคนยื่นออก) และดึงกลับได้เฉพาะคนยื่น */
  const workflow = src('lib/sales/quotationWorkflow.js');
  const bodyOf = (name) => {
    const from = workflow.indexOf(`export function ${name}(`);
    assert.ok(from >= 0, `หา ${name} ไม่เจอ`);
    return workflow.slice(from, workflow.indexOf('\n}\n', from));
  };
  assert.match(bodyOf('canRejectQuotationSubmission'), /&& !isQuotationSubmitter\(quotation, userId\)/);
  assert.match(bodyOf('canWithdrawQuotationSubmission'), /&& isQuotationSubmitter\(quotation, userId\);/);
});

test('LinePackError: Error ที่พก status 400 · รายการปัญหา · ข้อความที่บอกเลขรายการ', () => {
  const issues = [{ index: 0, row: 1, code: 'closed' }];
  const error = new LinePackError(issues);
  assert.ok(error instanceof Error && error instanceof LinePackError);
  assert.equal(error.name, 'LinePackError');
  assert.equal(error.status, 400);
  assert.deepEqual(error.issues, issues);
  assert.equal(error.message, linePackMessage(issues));
  assert.match(error.message, /^รายการ 1: /);
  assert.deepEqual(new LinePackError(null).issues, []);
});

/* ── แถวสำหรับ INSERT ตรง ๆ ─────────────────────────────────────────────────────────────────────────── */

test('withPackColumn: ไม่มีแถวไหนมีค่า = ถอดคีย์จากทุกแถว (คำขอไม่เอ่ยชื่อคอลัมน์) · มีแถวไหนมีค่า = ทุกแถวมีคีย์ รูปเดียวกัน', () => {
  const plain = [{ id: 'a', qty: 1 }, { id: 'b', qty: 2, packQty: null }, { id: 'c', qty: 3, packQty: undefined }];
  assert.deepEqual(withPackColumn(plain), [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }, { id: 'c', qty: 3 }]);
  for (const row of withPackColumn(plain)) assert.equal('packQty' in row, false);

  const mixed = [{ id: 'a', qty: 12, packQty: 2 }, { id: 'b', qty: 2 }, { id: 'c', qty: 3, packQty: null }, { id: 'd', qty: 4, packQty: 1 }];
  const out = withPackColumn(mixed);
  assert.deepEqual(out, [
    { id: 'a', qty: 12, packQty: 2 }, { id: 'b', qty: 2, packQty: null }, { id: 'c', qty: 3, packQty: null }, { id: 'd', qty: 4, packQty: 1 },
  ]);
  assert.deepEqual(out.map((row) => Object.keys(row)), out.map(() => ['id', 'qty', 'packQty']), 'ทุกแถวคีย์ชุดเดียวกัน ลำดับเดียวกัน');
  assert.deepEqual(withPackColumn([]), []);
  assert.deepEqual(withPackColumn(null), []);
});

test('withPackColumn 🔴 ไม่ตัดสินและไม่ทิ้งค่า: ค่าที่มันไม่เข้าใจ ("abc" · 0 · "2") ถูกส่งต่อตามเดิม — ฐานเป็นคนปฏิเสธ ไม่ใช่หายเงียบ', () => {
  for (const odd of ['abc', 0, '2', 1.5, false]) {
    const out = withPackColumn([{ id: 'a', packQty: odd }, { id: 'b' }]);
    assert.deepEqual(out, [{ id: 'a', packQty: odd }, { id: 'b', packQty: null }], `ค่า ${String(odd)}`);
  }
});

test('withPackColumn: คืนอ็อบเจกต์ใหม่เสมอ ไม่แก้ของเดิม', () => {
  const rows = [Object.freeze({ id: 'a', packQty: 2 }), Object.freeze({ id: 'b' }), Object.freeze({ id: 'c', packQty: null })];
  const snapshot = JSON.stringify(rows);
  const out = withPackColumn(Object.freeze(rows));
  assert.equal(JSON.stringify(rows), snapshot);
  out.forEach((row, i) => assert.notEqual(row, rows[i]));
  const none = [Object.freeze({ id: 'a', packQty: null })];
  assert.notEqual(withPackColumn(none)[0], none[0]);
  assert.deepEqual(none, [{ id: 'a', packQty: null }]);
});

/* ── error ของ CHECK 0407 ───────────────────────────────────────────────────────────────────────────── */

test('lineMoneyRuleMessage: 23514 ของ CHECK สี่ตัวของ 0407 = ข้อความไทย · error อื่น = null (ผู้เรียกถอยไปข้อความเดิม)', () => {
  const violation = (constraint, table = 'quotation_lines') => ({
    code: '23514', message: `new row for relation "${table}" violates check constraint "${constraint}"`,
  });
  for (const name of ['quotation_lines_line_money_rule', 'sales_order_lines_line_money_rule', 'quotation_lines_pack_qty_range', 'sales_order_lines_pack_qty_range']) {
    assert.equal(lineMoneyRuleMessage(violation(name)), LINE_PACK_TEXT.moneyRule, name);
  }
  assert.equal(lineMoneyRuleMessage(violation('quotation_lines_qty_check')), null, 'CHECK ตัวอื่นไม่ใช่ของกฎนี้');
  assert.equal(lineMoneyRuleMessage({ code: '23505', message: 'duplicate key … quotation_lines_line_money_rule' }), null);
  assert.equal(lineMoneyRuleMessage({ code: '23514' }), null);
  assert.equal(lineMoneyRuleMessage({ message: 'quotation_lines_line_money_rule' }), null);
  for (const nothing of [null, undefined, {}, 'x']) assert.equal(lineMoneyRuleMessage(nothing), null);
});

/* ── ยามในฐานของ mig 0410 (งวด PR-G) — ฝั่ง JS ของสองเรื่องที่ trigger อาศัย ─────────────────────────────────────── */

/* ข้อความ MESSAGE สามแบบของ 0410 ตามตัวอักษร (rewrite · revision · ห้ามล้าง) — อ่านจากไฟล์ migration ไม่พิมพ์ซ้ำ ('' → ') */
const GUARD_SQL = readFileSync(new URL('../../../supabase/migrations/0410_quotation_line_pack_guard.sql', import.meta.url), 'utf8');
const GUARD_MESSAGES = [...GUARD_SQL.matchAll(/'(ไม่ได้บันทึก:(?:[^']|'')*)'/g)].map((m) => m[1].replaceAll("''", "'"));
const GUARD_CASES = JSON.parse(readFileSync(new URL('./quoteLinePackGuardCases.json', import.meta.url), 'utf8'));

test('🔴 กฎหมวดของ 0410 = lineTakesPacks(line, null) ทุกกรณีของ quoteLinePackGuardCases.json (คู่แฝด JS ↔ SQL — ฝั่ง SQL พิสูจน์บน PGlite · ยาม quotationPackGuardMigration ยึดว่าไฟล์ถือนิพจน์นี้)', () => {
  assert.ok(GUARD_CASES.cases.length >= 20);
  for (const row of GUARD_CASES.cases) {
    assert.equal(lineTakesPacks(row.line, null), row.takesPacks,
      `${row.id} (${row.note}): ฝั่ง JS ตอบไม่ตรงกับ trigger ของ 0410 — แก้ lineCategoryCode / categoryOf แล้วกรณีนี้พลิก = ยามในฐานไม่ตรงกับด่านของเซิร์ฟเวอร์ ⇒ ต้องมี migration ใหม่ของ trigger`);
    assert.equal(lineCategoryCode(row.line, null) === PACK_LINE_CATEGORY, row.takesPacks);
  }
  assert.ok(GUARD_CASES.cases.some((c) => c.takesPacks) && GUARD_CASES.cases.some((c) => !c.takesPacks), 'มีทั้งสองคำตอบ');
  /* trigger ไม่อ่านทะเบียนสินค้า — ด่านของเซิร์ฟเวอร์ก็เรียกแบบไม่ส่งสินค้า (product = null) จึงเป็นกฎเดียวกัน */
  const recoded = GUARD_CASES.cases.find((c) => c.id === 'registry02-line03');
  assert.equal(lineTakesPacks(recoded.line, null), false);
  assert.equal(lineTakesPacks(recoded.line, { fgCode: SDS }), true, 'ส่งสินค้าเข้าไป = คนละคำตอบ — ด่านที่ฐานเห็นต้องเป็นแบบไม่ส่ง');
});

test('🔴 lineMoneyRuleMessage ปล่อยข้อความของ 0410 ผ่าน (null) ทั้ง P0001 และแม้ได้รหัส 23514 — route จึงโชว์ข้อความไทยของฐานตรงตัว ไม่ถูกแปลงเป็นข้อความกฎเงิน', () => {
  assert.equal(GUARD_MESSAGES.length, 3, 'ข้อความสามแบบของ 0410');
  for (const message of GUARD_MESSAGES) {
    assert.match(message, /\[quotation_line_pack_(lost|cleared)\]$/);
    assert.equal(lineMoneyRuleMessage({ code: 'P0001', message }), null);
    assert.equal(lineMoneyRuleMessage({ code: '23514', message }), null, 'ข้อความไม่มีชื่อ CHECK ของ 0407 — ไม่ถูกตีความเป็นกฎเงิน');
    assert.notEqual(message, LINE_PACK_TEXT.moneyRule);
  }
});
