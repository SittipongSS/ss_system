// ── เลขแพ็คของบรรทัด: ตัวช่วยของ "ตัวอ่าน" (งวด PR-2 · docs/qt-pack-column.md) ───────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PACK_COLUMN_LABEL, PACK_WORD, hasPackColumn, lineHasPacks, linePackFormulaText, linePackQty, linePackQtyText,
  lineUnitsUnit,
} from './linePackView.js';
import { LINE_PACK_TEXT, PACK_LINE_UNIT, lineUnitsTotal, packFactorOf, packLineUnit } from './linePacks.js';
import { SERVICE_SETUP_LINE_TEXT } from './serviceSetup.js';
import { documentFontCovers } from '../documents/documentFontRanges.js';

const SOURCE = readFileSync(new URL('./linePackView.js', import.meta.url), 'utf8');
const MIG_0392 = readFileSync(new URL('../../../supabase/migrations/0392_so_service_setup.sql', import.meta.url), 'utf8');

/* ค่าที่ "ไม่ใช่เลขแพ็ค" — ว่างสามแบบ + ค่าที่เก็บไม่ได้ทุกรูป (ชุดเดียวกับที่แผนกำหนด + ของ linePacks.test) */
const NOT_A_PACK = [null, undefined, '', '  ', 0, '0', '02', 1.5, '1.5', 'abc', 10000, '10000', true, false, -2, NaN, {}, [], [2]];
/* ค่าที่เป็นเลขแพ็ค → ตัวเลขที่ต้องได้ */
const PACKS = [[1, 1], ['2', 2], [' 2 ', 2], [9999, 9999], ['9999', 9999], [43, 43]];

/* ── คำที่ต้องตรงกับที่อื่น ──────────────────────────────────────────────────────────────────────────── */

test('หัวคอลัมน์ = “แพ็ค/เดือน” (มติ A2) — คำเดียวกับที่ข้อความของเซิร์ฟเวอร์เรียกช่องนี้', () => {
  assert.equal(PACK_COLUMN_LABEL, 'แพ็ค/เดือน');
  for (const key of ['closed', 'invalid', 'required', 'notAllowed']) {
    assert.ok(LINE_PACK_TEXT[key].includes(`“${PACK_COLUMN_LABEL}”`), `ข้อความ ${key} ต้องเรียกช่องด้วยชื่อเดียวกับหัวคอลัมน์`);
  }
});

test('คำว่า “แพ็ค” = คำของตารางงานบริการ (serviceSetup) และคำที่ 0392 เขียนลง service_zone_terms.unit', () => {
  assert.equal(PACK_WORD, 'แพ็ค');
  assert.equal(PACK_WORD, SERVICE_SETUP_LINE_TEXT.packUnit);
  // 0392: INSERT INTO service_zone_terms (… "packageQty", unit, …) SELECT … a."packsPerRound", 'แพ็ค', …
  const literal = MIG_0392.match(/a\."packsPerRound",\s*\n\s*'([^']+)',/);
  assert.ok(literal, 'หาแถวที่ 0392 เขียนหน่วยของเงื่อนไขบริการไม่เจอ — เทสต์นี้ต้องอ่านของจริง');
  assert.equal(literal[1], PACK_WORD);
  assert.ok(PACK_COLUMN_LABEL.startsWith(`${PACK_WORD}/`) && PACK_COLUMN_LABEL.endsWith(`/${PACK_LINE_UNIT}`),
    'หัวคอลัมน์ประกอบจากคำสองคำนี้');
});

test('🪤 linePackView.js import ได้สามตัวเท่านั้น — format · master/units · linePacks (ห้ามวนกลับไฟล์ที่เรียกมัน)', () => {
  const imports = [...SOURCE.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['@/lib/format', '@/lib/master/units', '@/lib/sales/linePacks']);
  assert.doesNotMatch(SOURCE, /\bimport\s*\(/, 'ห้าม dynamic import');
  assert.doesNotMatch(SOURCE, /\brequire\s*\(/);
  // โค้ด (ตัดคอมเมนต์ออกแล้ว) ต้องไม่เอ่ยชื่อไฟล์ที่ห้ามเรียก — คอมเมนต์หัวไฟล์เอ่ยได้
  const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(code.includes('export function hasPackColumn'), 'ตัวตัดคอมเมนต์ต้องเหลือโค้ดไว้');
  assert.doesNotMatch(code, /salesPlanning|quoteLines|serviceOrders|serviceSetup/);
});

/* ── linePackQty / lineHasPacks / hasPackColumn ────────────────────────────────────────────────────── */

test('linePackQty / lineHasPacks: จำนวนเต็ม 1–9999 เป็นตัวเลข · ว่างและค่าที่เก็บไม่ได้ = null (ไม่โชว์ · ไม่คูณ)', () => {
  for (const [raw, value] of PACKS) {
    assert.equal(linePackQty({ packQty: raw }), value, `linePackQty(${JSON.stringify(raw)})`);
    assert.equal(typeof linePackQty({ packQty: raw }), 'number');
    assert.equal(lineHasPacks({ packQty: raw }), true);
  }
  for (const raw of NOT_A_PACK) {
    assert.equal(linePackQty({ packQty: raw }), null, `ต้องไม่ใช่เลขแพ็ค: ${String(raw)}`);
    assert.equal(lineHasPacks({ packQty: raw }), false);
  }
  for (const line of [null, undefined, {}, 'x', 5]) {
    assert.equal(linePackQty(line), null);
    assert.equal(lineHasPacks(line), false);
  }
});

test('ตัวอ่านกับสูตรเงินเห็นตรงกัน: โชว์คอลัมน์ ⇔ ตัวคูณไม่ใช่ 1 หรือเป็นเลขแพ็ค 1 จริง · ค่าที่เก็บไม่ได้คูณ 1 และไม่โชว์', () => {
  for (const raw of NOT_A_PACK) {
    assert.equal(packFactorOf(raw), 1);
    assert.equal(lineUnitsTotal({ packQty: raw, qty: 12 }), 12, `ค่าที่ไม่ใช่เลขแพ็คไม่คูณ: ${String(raw)}`);
    assert.equal(linePackQty({ packQty: raw }), null);
  }
  for (const [raw, value] of PACKS) {
    assert.equal(packFactorOf(raw), linePackQty({ packQty: raw }));
    assert.equal(lineUnitsTotal({ packQty: raw, qty: 12 }), value * 12);
  }
});

test('hasPackColumn: ตัดสินทั้งตาราง — มีอย่างน้อยหนึ่งบรรทัดที่มีเลขแพ็ค · ไม่ใช่อาร์เรย์และอาร์เรย์ว่าง = false', () => {
  for (const lines of [null, undefined, '', 'x', 0, {}, { length: 1, 0: { packQty: 2 } }, []]) {
    assert.equal(hasPackColumn(lines), false, `ต้อง false: ${JSON.stringify(lines)}`);
  }
  assert.equal(hasPackColumn([{ qty: 1 }, { qty: 2, packQty: null }]), false);
  assert.equal(hasPackColumn(NOT_A_PACK.map((packQty) => ({ qty: 12, packQty }))), false, 'ค่าที่เก็บไม่ได้ทั้งแถวไม่เปิดคอลัมน์');
  assert.equal(hasPackColumn([null, undefined, { qty: 1 }]), false);
  assert.equal(hasPackColumn([{ qty: 1 }, { qty: 12, packQty: 2 }]), true);
  assert.equal(hasPackColumn([{ qty: 12, packQty: '2' }]), true);
  assert.equal(hasPackColumn([{ qty: 12, packQty: 1 }]), true, 'เลขแพ็ค 1 ก็เป็นเลขแพ็ค — คอลัมน์ต้องขึ้น');
});

/* ── หน่วย ──────────────────────────────────────────────────────────────────────────────────────────── */

test('lineUnitsUnit: บรรทัดที่มีเลขแพ็ค = “แพ็ค” · นอกนั้นคืนหน่วยที่ส่งมาตามเดิม (null / undefined / ว่าง ไม่ถูกแตะ)', () => {
  assert.equal(lineUnitsUnit({ packQty: 2 }, 'เดือน'), 'แพ็ค');
  assert.equal(lineUnitsUnit({ packQty: '2' }, 'กิโลกรัม'), 'แพ็ค');
  assert.equal(lineUnitsUnit({ packQty: 2 }, null), 'แพ็ค');
  for (const unit of ['แพ็คเกจ', 'เดือน', 'ชิ้น', '', null, undefined]) {
    assert.equal(lineUnitsUnit({ qty: 12 }, unit), unit);
    assert.equal(lineUnitsUnit({ qty: 12, packQty: null }, unit), unit);
    assert.equal(lineUnitsUnit({ qty: 12, packQty: 'abc' }, unit), unit);
    assert.equal(lineUnitsUnit(null, unit), unit);
  }
  // คู่กับ packLineUnit ของ PR-1: หน่วยข้างช่องจำนวน = เดือน · หน่วยของยอดหน่วยรวม = แพ็ค
  assert.equal(packLineUnit({ packQty: 2 }, 'แพ็คเกจ'), 'เดือน');
});

/* ── ข้อความ ────────────────────────────────────────────────────────────────────────────────────────── */

test('linePackFormulaText: “2 × 12 × 3,500.00” — ราคา 2 ตำแหน่งเสมอ · ตัวคั่นหลักพัน · เครื่องหมาย × (U+00D7) มีช่องว่างสองข้าง', () => {
  assert.equal(linePackFormulaText({ packQty: 2, qty: 12, unitPrice: 3500 }), '2 × 12 × 3,500.00');
  assert.equal(linePackFormulaText({ packQty: '9999', qty: '120', unitPrice: '207000' }), '9,999 × 120 × 207,000.00');
  assert.equal(linePackFormulaText({ packQty: 1, qty: 1, unitPrice: 0.5 }), '1 × 1 × 0.50');
  assert.equal(linePackFormulaText({ packQty: 43, qty: 4, unitPrice: 1234.567 }), '43 × 4 × 1,234.57');
  assert.equal(linePackFormulaText({ packQty: 2, qty: 1.5, unitPrice: 100 }), '2 × 1.5 × 100.00', 'จำนวนทศนิยมโชว์ตามจริง');
  assert.equal(linePackFormulaText({ packQty: 2 }), '2 × 0 × 0.00', 'จำนวน/ราคาไม่มี = 0 ไม่ใช่ NaN');
  assert.equal(linePackFormulaText({ packQty: 2, qty: 'abc', unitPrice: null }), '2 × 0 × 0.00');
  assert.equal('2 × 12'.codePointAt(2), 0xd7);
});

test('linePackQtyText: “2 แพ็ค × 12 เดือน” · อังกฤษ “2 Pack × 12 Month” · ภาษาอื่น = ไทย', () => {
  assert.equal(linePackQtyText({ packQty: 2, qty: 12 }), '2 แพ็ค × 12 เดือน');
  assert.equal(linePackQtyText({ packQty: 2, qty: 12 }, 'th'), '2 แพ็ค × 12 เดือน');
  assert.equal(linePackQtyText({ packQty: 2, qty: 12 }, 'en'), '2 Pack × 12 Month');
  assert.equal(linePackQtyText({ packQty: '9999', qty: 1200 }, 'en'), '9,999 Pack × 1,200 Month');
  assert.equal(linePackQtyText({ packQty: 9999, qty: 1200 }), '9,999 แพ็ค × 1,200 เดือน');
  assert.equal(linePackQtyText({ packQty: 2, qty: 12 }, undefined), '2 แพ็ค × 12 เดือน');
  assert.equal(linePackQtyText({ packQty: 2, qty: 12 }, 'jp'), '2 แพ็ค × 12 เดือน');
  assert.equal(linePackQtyText({ packQty: 2 }), '2 แพ็ค × 0 เดือน');
  assert.doesNotMatch(linePackQtyText({ packQty: 2, qty: 12 }, 'en'), /[฀-๿]/, 'ฉบับอังกฤษต้องไม่มีอักษรไทย');
  // หน่วยของบรรทัดไม่ถูกอ่าน: บรรทัดที่มีเลขแพ็ค จำนวน = จำนวนเดือนเสมอ (มติ A1 · A3)
  assert.equal(linePackQtyText({ packQty: 2, qty: 12, unit: 'กิโลกรัม' }), '2 แพ็ค × 12 เดือน');
});

test('🔴 บรรทัดที่ไม่มีเลขแพ็ค: ตัวช่วยข้อความคืน null เสมอ — ผู้เรียกใช้นิพจน์เดิมของตัวเอง (ข้อความเดิมไม่ถูกแตะ)', () => {
  for (const raw of NOT_A_PACK) {
    const line = { packQty: raw, qty: 12, unitPrice: 3500, unit: 'เดือน' };
    assert.equal(linePackFormulaText(line), null, `สูตร: ${String(raw)}`);
    assert.equal(linePackQtyText(line), null, `วลีจำนวน: ${String(raw)}`);
    assert.equal(linePackQtyText(line, 'en'), null);
  }
  for (const line of [null, undefined, {}, { qty: 12, unitPrice: 3500 }]) {
    assert.equal(linePackFormulaText(line), null);
    assert.equal(linePackQtyText(line), null);
    assert.equal(linePackQtyText(line, 'en'), null);
  }
});

test('ทุกอักขระที่ตัวช่วยพิมพ์มีในฟอนต์เอกสารที่ฝัง (ใบ FM-SA-04 ตรึง HTML — glyph ที่ขาดแก้ย้อนหลังไม่ได้)', () => {
  const samples = [
    linePackQtyText({ packQty: 9999, qty: 1234567.89 }),
    linePackQtyText({ packQty: 9999, qty: 1234567.89 }, 'en'),
    linePackFormulaText({ packQty: 9999, qty: 1234567.89, unitPrice: 9876543.21 }),
    PACK_COLUMN_LABEL,
    PACK_WORD,
  ];
  for (const text of samples) {
    for (const char of text) {
      if (/\s/.test(char)) continue;
      assert.ok(documentFontCovers(char.codePointAt(0)), `ฟอนต์เอกสารไม่มี “${char}” (U+${char.codePointAt(0).toString(16)}) ใน “${text}”`);
    }
  }
  assert.ok(documentFontCovers(0xd7), 'เครื่องหมายคูณ ×');
});
