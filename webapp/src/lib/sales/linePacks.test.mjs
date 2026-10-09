// ── เลขแพ็คของบรรทัดใบเสนอราคา: ตัวอ่านค่า · หมวดที่ต้องกรอก · กฎของเซิร์ฟเวอร์ (mig 0407 · docs/qt-pack-column.md) ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LINE_PACK_TEXT, LinePackError, PACK_LINE_CATEGORY, PACK_LINE_UNIT, PACK_QTY_INVALID, PACK_QTY_MAX, PACK_QTY_MIN,
  QUOTE_PACK_INPUT_OPEN, lineCategoryCode, lineMoneyRuleMessage, linePackIssues, linePackMessage, lineTakesPacks,
  lineUnitsTotal, packFactorOf, packLineUnit, packQtyValue, withPackColumn,
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

test('🔴 ช่องกรอกยังปิด (งวด PR-1 / PR-2) — เปิดได้ที่บรรทัดเดียว และต้องมาพร้อมช่องกรอก + ด่านบังคับกรอกของงวด PR-3', () => {
  assert.equal(QUOTE_PACK_INPUT_OPEN, false);
  // อ่านจากข้อความต้นฉบับด้วย: ค่าต้องเป็นค่าคงที่ตรง ๆ ไม่ใช่ env / นิพจน์ ที่เปิดเองได้บน production
  assert.match(SOURCE, /^export const QUOTE_PACK_INPUT_OPEN = false;$/m);
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

test('linePackIssues ช่องปิด: ทุกค่าที่ไม่ว่างถูกปฏิเสธ (ค่าที่ถูกต้องด้วย) · null / undefined / ว่าง / ไม่มีคีย์ ไม่ถูกทักเลย', () => {
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
  assert.deepEqual(linePackIssues(lines), closed, 'ค่าตั้งต้นของตัวเลือก = สวิตช์จริง (ปิด)');
  assert.deepEqual(linePackIssues(lines.slice(0, 5)), []);
  // ช่องปิดไม่ดูหมวด: บรรทัดหมวด 02-001 ที่ไม่มีเลขแพ็คไม่ถูกบังคับ
  assert.deepEqual(linePackIssues([{ fgCode: SDS }, { fgCode: SDS, packQty: null }], { open: false, requireOnCategory: true }), []);
  for (const notLines of [null, undefined, 'x', {}]) assert.deepEqual(linePackIssues(notLines), []);
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
  assert.deepEqual(
    { closed: LINE_PACK_TEXT.closed, invalid: LINE_PACK_TEXT.invalid, required: LINE_PACK_TEXT.required, notAllowed: LINE_PACK_TEXT.notAllowed, moneyRule: LINE_PACK_TEXT.moneyRule },
    {
      closed: 'ยังไม่เปิดให้กรอก “แพ็ค/เดือน” — ลบตัวเลขในช่องนั้นออกแล้วบันทึกอีกครั้ง',
      invalid: '“แพ็ค/เดือน” ต้องเป็นจำนวนเต็ม 1–9,999',
      required: 'รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ',
      notAllowed: '“แพ็ค/เดือน” ใช้ได้เฉพาะรายการหมวด 02-001 — ลบตัวเลขในช่องนั้นออกก่อนบันทึก',
      moneyRule: 'ยอดของรายการไม่ตรงกับสูตร แพ็ค × จำนวน × ราคา — ยังไม่ได้บันทึก แจ้งผู้ดูแลระบบ',
    },
  );
  assert.equal(LINE_PACK_TEXT.rows([2, 3]), 'รายการ 2, 3');
  assert.ok(LINE_PACK_TEXT.required.includes(PACK_LINE_CATEGORY) && LINE_PACK_TEXT.notAllowed.includes(PACK_LINE_CATEGORY));
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
