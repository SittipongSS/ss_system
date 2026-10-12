// ── ยามของ QuoteLineCells — ตารางรายการของใบเสนอราคากับบรรทัดโซนของใบสั่งขายย้อนหลังต้องเป็นชุดเดียว ─────
//
// ⭐ มติเจ้าของ 23/09: "3500 x 1 ชุด x 12 เดือน · มันต้องไม่ควรแตกต่างจาก form ใบเสนอราคา เพื่อไม่ให้ USER สับสน"
//   🐞 ก่อนมตินี้ขั้น ② ของใบย้อนหลังถาม "แพ็ค" + ยอดที่พิมพ์เอง + ปุ่มลัด ราคา × แพ็ค × เดือน ⇒ 1 ชุด × 12 เดือน
//      ถูกคีย์สามแบบ (1 × 42,000 · 12 × 3,500 · ปุ่มเสนอ 504,000)
//   ⇒ สองฟอร์มวาดหัวคอลัมน์ ช่องกรอก ตัวล็อกราคา/หน่วย และยอดเงินจากไฟล์เดียว · ยามนี้ตรึงว่า **ยังเป็นไฟล์เดียว**
// ⭐ มติเจ้าของ 25/09: "ส่วนลด รายบรรทัด รายใบก็ควรครบ" — กล่องสรุปแบบแก้ได้ (หัก ส่วนลด ท้ายใบ + ภาษีมูลค่าเพิ่ม) ยกออกจาก
//   ใบเสนอราคามาเป็น `QuoteLineTotalsEditor` ตัวเดียว · ขั้น ② ของใบย้อนหลังใช้ตัวเดียวกัน ต่างกันแค่โหมดผ่าน props
//
// 🔴 ส่วนใหญ่เป็นยาม source (ชุดเทสต์ของรีโปนี้ไม่มีตัวเรนเดอร์ React) — ส่วนที่เป็นตัวเลขเรียกฟังก์ชันจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QUOTE_DISCOUNT_TYPES, QUOTE_VAT_OPTIONS, quoteLineMoney, quoteLineNet } from '../../lib/salesPlanning.js';
import {
  HISTORICAL_LINE_MESSAGES, emptyHistoricalZone, historicalTotalsView, historicalZoneLineAmount,
} from '../../lib/sales/historicalIntakeForm.js';
import { quoteLineFromProduct, quoteLineLocks } from '../../lib/sales/quoteLines.js';
import { DEFAULT_SALE_UNIT } from '../../lib/master/units.js';
import { SERVICE_ROUNDS_LABEL, SERVICE_ROUNDS_UNIT } from '../../lib/sales/serviceOrders.js';
import { packLineUnit } from '../../lib/sales/linePacks.js';
import { PACK_COLUMN_LABEL, hasPackColumn, lineHasPacks, linePackFormulaText } from '../../lib/sales/linePackView.js';
import { PACK_INPUT_TITLE, linePackEditView, quoteLinesPackView } from '../../lib/sales/linePackEdit.js';
import * as linePackEditModule from '../../lib/sales/linePackEdit.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ตัวอย่างในคอมเมนต์ต้องไม่ทำให้ยามผ่านเอง */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CELLS = 'components/salesPlanning/QuoteLineCells.js';
const LINE_ITEMS = 'components/salesPlanning/QuotationLineItems.js';
const ZONES = 'components/salesPlanning/historicalWizard/WizardZonesStep.js';

/* 🪤 ตัวปิดท้ายที่หาไม่เจอเคยเงียบแล้วตัดถึงท้ายไฟล์ ⇒ ยามดูทั้งไฟล์แทนก้อนเดียว · ส่ง `to` มาแล้วไม่เจอ = แดง */
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  if (!to) return text.slice(start);
  const end = text.indexOf(to, start + from.length);
  assert.ok(end >= 0, `หาตัวปิด "${to}" หลัง "${from}" ไม่เจอ — ยามจะกลายเป็นดูทั้งไฟล์`);
  return text.slice(start, end);
}

test('⭐ หัวคอลัมน์ของบรรทัด = ของใบเสนอราคา เรียงตามลำดับเดิม (รายการ · จำนวน · ราคา/หน่วย · ส่วนลดรายการ · จำนวนเงิน)', () => {
  const head = slice(code(CELLS), 'export function QuoteLineHeadCells', 'export function');
  const labels = [...head.matchAll(/<th\b[^>]*>([^<{]+)<\/th>/g)].map((m) => m[1].trim());
  assert.deepEqual(labels, ['รายการ', 'จำนวน', 'ราคา/หน่วย', 'ส่วนลดรายการ', 'จำนวนเงิน']);
});

test('⭐ สองฟอร์มวาดกล่อง หัว และเซลล์จาก QuoteLineCells — ไม่มีหัว/เซลล์เงินของตัวเอง', () => {
  const parts = [
    'QuoteLinesTable', 'QuoteLineIndexHead', 'QuoteLineHeadCells', 'QuoteLineActionsHead', 'QuoteLineIndexCell',
    'QuoteLineItemCell', 'QuoteLineProductPicker', 'QuoteLineFgInfo', 'QuoteLineMoneyCells', 'QuoteLineRemoveCell',
    'QuoteLinesEmptyRow',
  ];
  /* ตารางฝั่งอ่าน (QuotationReadOnlyLineItems) อยู่ไฟล์เดียวกันและมีหัว/เซลล์ของตัวเองโดยชอบ ⇒ ดูเฉพาะตัวแก้ไข */
  const editors = {
    [LINE_ITEMS]: slice(code(LINE_ITEMS), 'export default function QuotationLineItems', undefined),
    [ZONES]: code(ZONES),
  };
  for (const [file, src] of Object.entries(editors)) {
    for (const name of parts) assert.match(src, new RegExp(`<${name}\\b`), `${file} ต้องวาด ${name}`);
    /* เซลล์เงินของตัวเอง = คอลัมน์ที่สองฟอร์มเพี้ยนจากกันได้อีกครั้ง */
    assert.doesNotMatch(src, /data-label="(?:จำนวน|ราคา\/หน่วย|ส่วนลดรายการ|จำนวนเงิน)"/, file);
    assert.doesNotMatch(src, /<th\b[^>]*>(?:จำนวน|ราคา\/หน่วย|ส่วนลดรายการ|จำนวนเงิน)<\/th>/, file);
    assert.doesNotMatch(src, /<TableScroll\b/, `${file}: กล่องตารางต้องเป็น QuoteLinesTable ตัวเดียว`);
    assert.doesNotMatch(src, /quoteLineNet\(/, `${file}: ยอดบรรทัดคิดในเซลล์กลางที่เดียว`);
  }
});

/* 🪤 JSX รันใต้ Node ตรง ๆ ไม่ได้ ⇒ ชื่อที่ import ผิดจะไม่มีเทสต์ไหนเห็น (บทเรียน historicalRegisterUi §7)
   ⇒ เทียบรายชื่อที่สองฟอร์มขอ กับ export ที่มีจริงในไฟล์ */
test('⭐ ทุกชื่อที่ import จาก QuoteLineCells มี export อยู่จริง', () => {
  const cells = code(CELLS);
  const exported = new Set([...cells.matchAll(/export (?:function|const) ([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  let checked = 0;
  for (const file of [LINE_ITEMS, ZONES]) {
    const hit = code(file).match(/import\s+\{([^}]+)\}\s+from\s+"(?:\.\/|@\/components\/salesPlanning\/)QuoteLineCells"/);
    assert.ok(hit, `${file} ต้อง import จาก QuoteLineCells`);
    for (const raw of hit[1].split(',')) {
      const name = raw.trim();
      if (!name) continue;
      checked += 1;
      assert.ok(exported.has(name), `${file} → ${name} ไม่มีใน QuoteLineCells`);
    }
  }
  assert.ok(checked >= 12, `ยามต้องเจอชื่อจริง (เจอ ${checked})`);
});

test('⭐ ราคา/หน่วยล็อกเมื่อผูกสินค้า · หน่วยล็อกตามสินค้า · ลิงก์ "ยังไม่ตั้งราคา" · คำเตือนราคาขยับ', () => {
  const cells = code(CELLS);
  /* ตัวตัดสินการล็อกอยู่ที่ lib (quoteLineLocks — เทสต์พฤติกรรมอยู่ข้างล่าง) · เซลล์อ่านผลของมันตรง ๆ */
  assert.match(cells, /const \{ bound, unitLocked, priceLocked \} = quoteLineLocks\(line, \{ registryPriceOnly \}\);/);
  assert.match(cells, /<MoneyInput min="0" value=\{line\.unitPrice\} disabled=\{!editable \|\| priceLocked\} title=\{priceTitle\(bound, registryPriceOnly\)\}/);
  assert.match(cells, /\{unitLocked \|\| !editable\s*\n\s*\? \(line\.unit && <span className=\{styles\.unitNote\}>หน่วย: \{line\.unit\}<\/span>\)/);
  assert.match(cells, /masterPriceState\(product\) === "unpriced"/);
  assert.match(cells, /ยังไม่ตั้งราคาในฐานข้อมูล — ไปตั้งราคา →/);
  assert.match(cells, /ราคาในฐานข้อมูลตอนนี้ \{fmtMoney\(priceDrift\)\} — \{driftNote\}/);
  /* ช่องจำนวน = MoneyInput ตัวเดียวกับใบเสนอราคา (ไม่ใช่ช่อง number ของตัวเอง) */
  assert.match(cells, /<MoneyInput min="0" value=\{line\.qty\}/);
});

test('⭐ ส่วนลดรายการ: ไม่ลด / % / บาท = ชนิดที่บันทึกได้ (QUOTE_DISCOUNT_TYPES) · % ตัดที่ 100 · ไม่ลด = ช่องค่าปิด', () => {
  const cells = code(CELLS);
  const box = slice(cells, '<div className={styles.discountControls}>', '</div>');
  const options = [...box.matchAll(/<option value="([^"]*)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(options, [['', 'ไม่ลด'], ['percent', '%'], ['amount', 'บาท']]);
  assert.deepEqual(options.slice(1).map((o) => o[0]), [...QUOTE_DISCOUNT_TYPES]);
  assert.match(box, /discountValue: event\.target\.value \? line\.discountValue : 0/, 'เลือกไม่ลด = ค่าส่วนลดกลับเป็น 0');
  assert.match(box, /disabled=\{!editable \|\| !line\.discountType\}/);
  assert.match(box, /clampQuoteDiscount\(line\.discountType, value\)/);
});

/* ⭐ มติเจ้าของ 25/09: กล่องสรุปแบบแก้ได้ยกออกจาก QuotationLineItems มาเป็น `QuoteLineTotalsEditor` ตัวเดียว — ใบเสนอราคาและ
   ขั้น ② ของใบย้อนหลังวาดกล่องเดียวกัน · ต่างกันได้แค่ **โหมดผ่าน props** (กฎ AGENTS.md: ห้ามก๊อปฟอร์มเป็นสองชุด)
   🔴 ยามเดิม "VAT ของใบเสนอราคาอ่านป้ายจาก QUOTE_VAT_OPTIONS — ชุดเดียวกับแผ่น VAT ของใบย้อนหลัง" ถูกชี้ใหม่: แผ่น VAT ของขั้น ①
      ถูกถอด (VAT ย้ายมากล่องนี้) ⇒ ตัวเลือกต้องอยู่ใน QuoteLineCells ที่เดียว และสองฟอร์มต้องไม่มีกล่อง/ตัวเลือกของตัวเอง */
test('⭐ 25/09: กล่องสรุปแบบแก้ได้มีตัวเดียว (QuoteLineTotalsEditor) · ตัวเลือก VAT อ่านจาก QUOTE_VAT_OPTIONS ใน QuoteLineCells', () => {
  const editor = slice(code(CELLS), 'export function QuoteLineTotalsEditor', '\n}\n');
  assert.match(code(CELLS), /import \{ QUOTE_VAT_OPTIONS, quoteLineNet \} from "@\/lib\/salesPlanning"/);
  assert.match(editor, /QUOTE_VAT_OPTIONS\.map\(\(option\) => \(\s*\n\s*<option key=\{option\.value\} value=\{String\(option\.value\)\}>\{option\.label\}<\/option>/);
  assert.deepEqual(QUOTE_VAT_OPTIONS.map((o) => [o.value, o.label]), [[0, 'รวม VAT แล้ว'], [7, '+ VAT 7% ท้ายใบ']]);
  const editors = {
    [LINE_ITEMS]: slice(code(LINE_ITEMS), 'export default function QuotationLineItems', undefined),
    [ZONES]: code(ZONES),
  };
  for (const [file, src] of Object.entries(editors)) {
    assert.equal((src.match(/<QuoteLineTotalsEditor\b/g) || []).length, 1, `${file} ต้องวาดกล่องกลางหนึ่งกล่อง`);
    assert.doesNotMatch(src, /QUOTE_VAT_OPTIONS|styles\.totalsPanel|styles\.totalLine|>หัก ส่วนลด<|>ภาษีมูลค่าเพิ่ม</,
      `${file}: กล่อง/ตัวเลือกของตัวเอง = สองฟอร์มเพี้ยนจากกันอีกครั้ง`);
  }
  assert.doesNotMatch(code(LINE_ITEMS), /import Select |import MoneyInput /, 'ช่องของกล่องย้ายไป QuoteLineCells ทั้งหมด');

  /* ส่วนลดท้ายใบ: ชนิดชุดเดียวกับส่วนลดรายการ (QUOTE_DISCOUNT_TYPES) · % ตัดที่ 100 · ไม่ลด = ช่องค่าปิด */
  const discount = slice(editor, '<span>หัก ส่วนลด</span>', '</span>');
  const options = [...discount.matchAll(/<option value="([^"]*)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(options, [['', 'ไม่ลด'], ['percent', '%'], ['amount', 'บาท']]);
  assert.deepEqual(options.slice(1).map((o) => o[0]), [...QUOTE_DISCOUNT_TYPES]);
  assert.match(discount, /disabled=\{!editable \|\| !discountType\}/);
  assert.match(discount, /clampQuoteDiscount\(discountType, value\)/);
  /* ยังไม่รู้ยอด = ขีด (ไม่ใช่ 0.00) — ใบย้อนหลังที่ยังไม่เลือก VAT ส่ง null มา */
  for (const key of ['subtotal', 'discount', 'vat', 'total']) {
    assert.match(editor, new RegExp(`\\{naText\\(values\\.${key}\\)\\}`), `ช่อง ${key} ต้องพูดขีดเมื่อ null`);
  }
  /* 🪤 class ที่ไม่มีใน CSS module = undefined เงียบ ๆ (ไม่มี error) ⇒ ทุก class ที่กล่องใช้ต้องมีอยู่จริง */
  const css = read('components/salesPlanning/QuotationLineItems.module.css');
  for (const name of new Set([...editor.matchAll(/styles\.([A-Za-z]+)/g)].map((m) => m[1]))) {
    assert.match(css, new RegExp(`\\.${name}\\b`), `QuotationLineItems.module.css ไม่มี .${name}`);
  }
});

/* โหมดของกล่อง (props) — ใบเสนอราคา **เหมือนเดิมทุกตัวอักษร** · ใบย้อนหลัง: VAT ไม่มีค่าตั้งต้น (form-design-rules §2 —
   ใบเก่ามีทั้งแบบรวม VAT และบวก 7% เดาผิด = ยอดไม่ตรงเงินที่เก็บจริง) + ข้อความใต้ช่อง + จุดยึดของช่องที่ติดด่าน */
test('⭐ 25/09: โหมดของกล่องสรุปมาทาง props — ใบย้อนหลังส่ง vatPlaceholder · ใบเสนอราคาไม่ส่ง (ค่าว่าง = 0 และ payload เดิม)', () => {
  const editor = slice(code(CELLS), 'export function QuoteLineTotalsEditor', '\n}\n');
  assert.match(editor, /const vatValue = vatPlaceholder\s*\n\s*\? \(vatRate === null \|\| vatRate === undefined \|\| vatRate === "" \? "" : String\(vatRate\)\)\s*\n\s*: String\(vatRate \?\? 0\);/,
    'ไม่ส่ง vatPlaceholder = String(vatRate ?? 0) ของใบเสนอราคาเดิม · ส่ง = ค่าว่างขึ้นป้ายรอเลือก');
  assert.match(editor, /placeholder=\{vatPlaceholder \|\| undefined\}/);
  assert.match(editor, /aria-invalid=\{vatInvalid \? "true" : undefined\}/);
  assert.match(editor, /\{vatPlaceholder \? <b className=\{styles\.totalReq\} aria-hidden="true">\*<\/b> : null\}/,
    'ช่องบังคับของใบย้อนหลังมีดอกจัน · ใบเสนอราคาไม่มี');
  assert.match(editor, /<div className=\{styles\.totalLine\} id=\{discountId\}>/);
  assert.match(editor, /<div className=\{styles\.totalLine\} id=\{vatId\}>/);
  assert.match(editor, /\{discountNote \? <span className=\{styles\.totalNote\} data-tone="bad">\{discountNote\}<\/span> : null\}/);

  const quote = slice(slice(code(LINE_ITEMS), 'export default function QuotationLineItems', undefined), '<QuoteLineTotalsEditor', '/>');
  assert.doesNotMatch(quote, /vatPlaceholder|vatInvalid|vatNote|discountNote|vatId|discountId/, 'ใบเสนอราคาไม่มีโหมดของใบย้อนหลัง');
  assert.match(quote, /onDiscountChange=\{\(next\) => onDiscountChange\?\.\(\{ type: next\.type \|\| "", value: next\.type \? next\.value : 0 \}\)\}/,
    'ใบเสนอราคาคง payload เดิมก่อนยกกล่องออกมา: ไม่ลด = type "" + value 0');
  assert.match(quote, /onVatRateChange=\{onVatRateChange\}/);
  /* ห้าช่องของ values ชุดเดียวกับที่ historicalTotalsView คืนให้ขั้น ② */
  const keys = [...slice(quote, 'values={{', '}}').matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(keys, Object.keys(historicalTotalsView({ ok: true, subtotal: 0, vatAmount: 0, totalAmount: 0 }, 0).values));

  const zones = slice(code(ZONES), '<QuoteLineTotalsEditor', '/>');
  assert.match(zones, /values=\{totals\.values\}/);
  assert.match(zones, /vatPlaceholder="เลือก"/);
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 ข้อ A2 "บังคับใส่" + ข้อวินิจฉัย 5): ยอดของเซลล์ยังมาจาก quoteLineNet ตัวเดียว
   เพิ่มเหตุที่ "ยังไม่พูดยอด" อีกหนึ่งข้อ — ช่อง "แพ็ค/เดือน" ของบรรทัดที่ต้องกรอกยังว่าง (`packEdit?.pending`) · ไม่ได้คลายยาม: สูตรไม่เปลี่ยน */
test('⭐ จำนวนเงินของเซลล์ = quoteLineNet (สูตรเดียวกับ server) · ใบย้อนหลังพูดขีดเมื่อยังคิดไม่ได้ · ช่องแพ็คที่ต้องกรอกยังว่าง = ขีด', () => {
  const cells = code(CELLS);
  assert.match(cells, /\{amountPending \|\| packEdit\?\.pending \? NA : fmtMoney\(quoteLineNet\(line\)\.lineTotal\)\}/);
  assert.equal((cells.match(/quoteLineNet\(/g) || []).length, 1, 'เซลล์คิดยอดที่เดียว');
  assert.match(code(ZONES), /const amount = historicalZoneLineAmount\(row\);[\s\S]*amountPending=\{!amount\.known\}/,
    'ขั้น ② ต้องถามตัวตัดสินตัวเดียวกับยอดใบ (historicalMoneyView) ว่าแถวนี้พูดยอดได้หรือยัง');
  /* ตัวอย่างของเจ้าของ: 1 ชุด × 12 เดือน = จำนวน 12 (แพ็คเกจ) × 3,500 = 42,000 */
  assert.equal(quoteLineNet({ qty: 12, unitPrice: 3500 }).lineTotal, 42000);
  assert.deepEqual(historicalZoneLineAmount({ productId: 'P', qty: 12, unitPrice: 3500 }), { known: true, lineTotal: 42000 });
});

/* ⭐ เลขที่เซลล์พูด (quoteLineNet ของแถวบนจอ) = เลขที่ยอดไซต์/ยอดใบนับ (historicalZoneLineAmount) = เลขที่
   server บันทึก (quoteLineMoney ผ่าน historicalLinesMoney) — ทุกสตางค์ บนกริดเดียวกับที่ PGlite ของ 0379 ใช้ */
test('⭐ กริดความตรงกัน: เซลล์ · ยอดไซต์ · สูตรบันทึก ให้ยอดบรรทัดเดียวกันทุกสตางค์', () => {
  const discounts = [
    [null, 0], ['percent', 0], ['percent', 5], ['percent', 7.5], ['percent', 12.5], ['percent', 33.333], ['percent', 100],
    ['amount', 0.01], ['amount', 100.555], ['amount', 10_000_000],
  ];
  let checked = 0;
  for (let qty = 1; qty <= 24; qty += 1) {
    for (const unitPrice of [3500, 1200, 10.10, 1.005, 33.33]) {
      for (const [discountType, discountValue] of discounts) {
        const row = { productId: 'P', qty, unitPrice, discountType, discountValue };
        const cell = quoteLineNet(row).lineTotal;
        const site = historicalZoneLineAmount(row);
        const saved = quoteLineMoney(row).lineTotal;
        assert.equal(site.known, true);
        assert.equal(site.lineTotal, cell, JSON.stringify(row));
        assert.equal(saved, cell, JSON.stringify(row));
        checked += 1;
      }
    }
  }
  assert.equal(checked, 24 * 5 * 10);
});

test('⭐ ช่องจำนวนรอบบริการ = ช่องของการ์ดสัญญาบริการใบสั่งขาย (จำนวนเต็ม ≥ 1 · เว้นว่างได้ · หน่วย "เดือน" จากค่าคงที่)', () => {
  const rounds = slice(code(CELLS), 'export function QuoteLineServiceRounds', undefined);
  /* ⭐ PR-D (mig 0394 · r2 S12): ใบย้อนหลังบังคับรอบ ⇒ ดอกจันแบบเลือกได้ (`required`) — ป้ายคำเดียวกับไม่บังคับ (DD2) · ค่าตั้งต้นไม่บังคับ
     ⭐ มติเจ้าของ 29/09: ป้าย = "จำนวนรอบบริการ" จากค่าคงที่ `SERVICE_ROUNDS_LABEL` (serviceOrders.js) — ห้ามสะกดเองในคอมโพเนนต์ */
  assert.equal(SERVICE_ROUNDS_LABEL, 'จำนวนรอบบริการ');
  assert.match(rounds, /<span>\{SERVICE_ROUNDS_LABEL\}\{required \? <b className=\{styles\.roundsReq\} aria-hidden="true">\*<\/b> : null\}<\/span>/);
  assert.match(rounds, /aria-label=\{`\$\{SERVICE_ROUNDS_LABEL\} \$\{name\}`\}/);
  assert.doesNotMatch(rounds, /รอบบริการที่ขายไว้|ไปกี่รอบ/, 'คำเก่าห้ามกลับมา (มติ 29/09)');
  assert.match(rounds, /required = false, invalid = false/);
  const control = 'type="number" min="1" step="1" inputMode="numeric" placeholder="—"';
  assert.ok(rounds.includes(control), 'ช่องเดียวกับ ServiceContractCard');
  assert.ok(code('components/salesPlanning/ServiceContractCard.js').includes(control),
    'ต้นแบบของช่องนี้ยังอยู่ที่การ์ดสัญญาบริการ — เปลี่ยนที่นั่นต้องเปลี่ยนที่นี่ด้วย');
  /* มติเจ้าของ 08/10 รอบสอง — จอฝ่ายขายที่เหลือ: หน่วยเดือน + แพ็คก่อนจำนวนรอบบริการ
     ⇒ หน่วยท้ายช่อง = `SERVICE_ROUNDS_UNIT` "เดือน" (serviceOrders.js · ที่เดียว) ทั้งเซลล์กลางและการ์ดสัญญาบริการ — ห้ามพิมพ์หน่วยเองในคอมโพเนนต์
     (ของเดิมยึด `>รอบ<` · ค่าที่เก็บยังเป็นจำนวนรอบที่ TS ไปบริการ 1 เดือน = 1 รอบ) */
  assert.equal(SERVICE_ROUNDS_UNIT, 'เดือน');
  assert.match(rounds, /<span className=\{styles\.roundsUnit\}>\{SERVICE_ROUNDS_UNIT\}<\/span>/);
  assert.doesNotMatch(rounds, />รอบ</, 'หน่วย "รอบ" ที่พิมพ์เองห้ามกลับมา (มติ 08/10 รอบสอง)');
  assert.match(code(CELLS), /import \{ SERVICE_ROUNDS_LABEL, SERVICE_ROUNDS_UNIT \} from "@\/lib\/sales\/serviceOrders";/);
  const contractCard = code('components/salesPlanning/ServiceContractCard.js');
  assert.equal((contractCard.match(/<span className=\{styles\.roundsUnit\}>\{SERVICE_ROUNDS_UNIT\}<\/span>/g) || []).length, 2,
    'การ์ดสัญญาบริการ: หน่วยของช่องกรอกและของฝั่งอ่านมาจากค่าคงที่ตัวเดียวกัน');
  assert.doesNotMatch(contractCard, /roundsUnit\}>รอบ</);
  /* แดงเมื่อผู้เรียกบอก (ใบย้อนหลัง: ข้อความของแผนหลังกด "ถัดไป") · บังคับ = บอกโปรแกรมอ่านหน้าจอด้วย ไม่ใช่แค่ดอกจัน */
  assert.match(rounds, /invalid=\{invalid\}/);
  assert.match(rounds, /aria-required=\{required \? "true" : undefined\}/);
  assert.match(read('components/salesPlanning/QuotationLineItems.module.css'), /\.roundsReq \{[^}]*color: var\(--red\);/);
  /* ใบเสนอราคาไม่มีรอบ (เป็นของใบสั่งขาย — มติผู้ใช้ 2026-08-31) */
  assert.doesNotMatch(code(LINE_ITEMS), /<QuoteLineServiceRounds\b/);
  assert.match(code(ZONES), /<QuoteLineServiceRounds\b/);
});

/* 🐞 ขั้น ④ ของใบย้อนหลังวาดตารางฝั่งอ่านในคอลัมน์ที่แคบกว่า 900 เสมอ ⇒ โหมดการ์ดของตารางฝั่งอ่านโผล่บนจอ
   เดสก์ท็อปเป็นครั้งแรก แล้วเจอสองกติกาของ "ตาราง" ตัดข้อความทิ้ง (วัด 23/09): ช่องลำดับกว้าง 42px ⇒ "รายกา…"
   และเพดานช่องข้อความ 220px + nowrap ⇒ "ไซต์ · โซน: … M Clin" — ในโหมดการ์ดสองกติกานั้นต้องถูกปลด */
test('⭐ ตารางฝั่งอ่านในโหมดการ์ด: ช่องไม่โดนเพดาน 220px/42px · ป้ายใต้คำอธิบายขึ้นบรรทัดใหม่ได้', () => {
  const css = read('components/salesPlanning/QuotationLineItems.module.css');
  const cards = slice(css, '@container (max-width: 900px) {', '@media');
  assert.match(cards, /\.readOnlyTable tbody td \{\s*max-width: none !important;\s*overflow: visible !important;\s*\}/);
  assert.match(cards, /\.readOnlyTable tbody td:first-child \{ width: 100%; \}/);
  assert.match(slice(css, '.serviceRoundsTag {', '}'), /white-space: normal;/,
    'ช่องของ .premium-table เป็น nowrap — ชื่อไซต์ · โซนที่ยาวต้องขึ้นบรรทัดใหม่ ไม่ใช่ถูกตัด');
});

/* 🐞 รีวิว/UAT 23/09: แถวโซนที่ติ๊กแล้วแต่ยังไม่เลือกแพ็คเกจ (ทางปกติเมื่อ "ใช้แพ็คเกจเดียวกันทุกโซน" ยังว่าง)
   เปิดดรอปดาวน์หน่วย ("ชิ้น") และช่องราคา/หน่วยให้พิมพ์ — ใบเสนอราคาล็อกเป็น "หน่วย: ชิ้น" ตั้งแต่ยังไม่เลือกสินค้า
   และสิ่งที่พิมพ์ลงไป (หน่วย "ชุด" · ราคา 42,000) ถูกทิ้งเงียบ ๆ: body ไม่ส่ง และแพ็คเกจที่เลือกทีหลังเขียนทับ
   ⇒ เทสต์พฤติกรรมของตัวตัดสิน (quoteLineLocks) กับแถวจริงของทั้งสองฟอร์ม — ถอด `_lineKind` ออกจากแถวโซนแล้วแดง */
test('⭐ แถวโซนที่ยังไม่เลือกแพ็คเกจ: หน่วยล็อกเหมือนบรรทัดสินค้าใหม่ของใบเสนอราคา · ราคา/หน่วยปิด (ราคามาจากทะเบียนเท่านั้น)', () => {
  const fresh = emptyHistoricalZone({ zoneId: 'ZN-1', siteId: 'ST-1' });
  assert.equal(fresh._lineKind, 'product', 'แถวโซน = บรรทัดสินค้า (newProductLine ของใบเสนอราคา)');
  assert.equal(fresh.unit, DEFAULT_SALE_UNIT, 'หน่วยตั้งต้นเดียวกับบรรทัดสินค้าใหม่ของใบเสนอราคา ("หน่วย: ชิ้น")');
  assert.equal(fresh.unitPrice, '', 'ยังไม่รู้ราคา ≠ ราคา 0');
  assert.deepEqual(quoteLineLocks(fresh, { registryPriceOnly: true }), { bound: false, unitLocked: true, priceLocked: true });

  /* เลือกแพ็คเกจแล้ว — ล็อกทั้งคู่เพราะผูกสินค้า (หน่วยกลายเป็นของสินค้า) */
  const picked = quoteLineFromProduct(fresh, { id: 'PRD-35', fgCode: 'FG-1', saleUnit: 'แพ็คเกจ', costPrice: 3500 });
  assert.deepEqual(quoteLineLocks(picked, { registryPriceOnly: true }), { bound: true, unitLocked: true, priceLocked: true });
  assert.equal(picked.unit, 'แพ็คเกจ');
  assert.equal(picked.unitPrice, 3500);

  /* ใบเสนอราคาไม่เปลี่ยน: บรรทัดสินค้าใหม่ล็อกหน่วยแต่เปิดราคา · บรรทัดพิมพ์เองเลือกหน่วยได้ */
  assert.deepEqual(quoteLineLocks({ _lineKind: 'product', productId: null, fgCode: null }), { bound: false, unitLocked: true, priceLocked: false });
  assert.deepEqual(quoteLineLocks({ _lineKind: 'manual', productId: null, fgCode: null }), { bound: false, unitLocked: false, priceLocked: false });
  assert.deepEqual(quoteLineLocks({ _lineKind: 'manual', fgCode: 'FG-9' }), { bound: true, unitLocked: true, priceLocked: true });
});

test('⭐ ขั้น ② ส่ง registryPriceOnly + เหตุของจำนวนที่ใช้ไม่ได้ลงเซลล์ · ใบเสนอราคาไม่ส่ง (ราคาพิมพ์เองได้ก่อนเลือกสินค้า)', () => {
  const zones = code(ZONES);
  const cells = slice(zones, '<QuoteLineMoneyCells', '/>');
  assert.match(cells, /\n\s*registryPriceOnly\n/);
  assert.match(cells, /qtyNote=\{amount\.qtyNote \|\| bad\.qty \|\| null\}/,
    'ใต้ช่องจำนวนมีที่เดียว: เหตุที่จอรู้เอง (1.5 / 0) ก่อน แล้วค่อยข้อที่แผนตีกลับรายช่อง (มติ 25/09 — เช่นยังว่าง)');
  assert.match(cells, /amountPending=\{!amount\.known\}/);
  assert.match(zones, /const amount = historicalZoneLineAmount\(row\);/);
  const quote = slice(code(LINE_ITEMS), '<QuoteLineMoneyCells', '/>');
  assert.doesNotMatch(quote, /registryPriceOnly|qtyNote/);
  /* เซลล์วาดเหตุใต้ช่องจำนวน และทำเครื่องหมายช่องว่าผิด */
  const qtyCell = slice(code(CELLS), '<td data-label="จำนวน">', '</td>');
  assert.match(qtyCell, /aria-invalid=\{qtyNote \? "true" : undefined\}/);
  assert.match(qtyCell, /\{qtyNote \? <span className=\{styles\.qtyNote\}>\{qtyNote\}<\/span> : null\}/);
  assert.equal(historicalZoneLineAmount({ productId: 'P', qty: 1.5, unitPrice: 3500 }).qtyNote, HISTORICAL_LINE_MESSAGES.qty);
});

/* 🐞 รีวิว/UAT 23/09 (วัดด้วย puppeteer): ตารางของขั้น ② ซ้อนอยู่ในการ์ดไซต์และเอาคอลัมน์ "โซน" แทน "#"
   ⇒ กล่อง 726–766px ทุกจอ ⇒ พับเป็นการ์ดต่อบรรทัดตลอด ขณะที่ใบเสนอราคาที่จอเดียวกันเป็นตาราง
   ⇒ หัวตารางของสองฟอร์มต้องเป็นลำดับเดียวกันเป๊ะ และพื้นความกว้างเป็นของใบเสนอราคา (ไม่มีพื้นของตัวเอง) */
/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 ข้อ A2–A4 · ข้อวินิจฉัย 7: ฟอร์มใบสั่งขายย้อนหลังตามมาในงวด PR-5 ของมันเอง)
   กติกา "สองฟอร์มต้องเหมือนกัน" (มติ 23/09) ยังถูกยึด — ด้วยวิธีที่ **เข้มขึ้น**: ใบเสนอราคาต่างจากขั้น ② ได้ที่ prop ที่เขียนตรงตัวในรายการนี้เท่านั้น
     หัว:        showPacks={showPacks} packRequired={packRequired}
     เซลล์เงิน:  showPacks={showPacks} packEdit={packView?.rows[index]}
   ถอดข้อความ prop เหล่านั้นออก = ได้แท็ก/ชุด prop ของขั้น ② · ขั้น ② ไม่เอ่ยชื่อของช่องกรอกสักชื่อ · ค่าตั้งต้นของทุก prop = ปิด
   ⇒ prop ที่สาม หรือค่าตั้งต้นที่เปิดเอง = แดง (จนงวด PR-5 มาถอดยามนี้พร้อมส่ง prop จากขั้น ②) */
test('⭐ หัวตารางของขั้น ② = หัวตารางของใบเสนอราคา (# · ห้าคอลัมน์ · ช่องปุ่มลบ) · ต่างกันได้แค่ prop ของช่อง “แพ็ค/เดือน” ที่ขึ้นทะเบียน · ไม่มีพื้นความกว้างของตัวเอง', () => {
  const headOf = (src) => slice(src, '<thead>', '</thead>')
    .replace(/\{editable && (<QuoteLineActionsHead \/>)\}/, '$1')
    .match(/<[A-Za-z]+[^>]*\/?>/g)
    .filter((tag) => /^<QuoteLine/.test(tag));
  const quote = headOf(slice(code(LINE_ITEMS), 'export default function QuotationLineItems', undefined));
  const zones = headOf(code(ZONES));
  const CANONICAL = ['<QuoteLineIndexHead />', '<QuoteLineHeadCells />', '<QuoteLineActionsHead />'];
  const HEAD_PACK_PROPS = ' showPacks={showPacks} packRequired={packRequired}';
  assert.deepEqual(zones, CANONICAL);
  assert.deepEqual(quote, ['<QuoteLineIndexHead />', `<QuoteLineHeadCells${HEAD_PACK_PROPS} />`, '<QuoteLineActionsHead />']);
  assert.deepEqual(quote.map((tag) => tag.replace(HEAD_PACK_PROPS, '')), zones);

  /* เซลล์เงิน: ชื่อ prop ของสองฟอร์ม — ส่วนของช่องแพ็ค/เดือนมีแค่สองตัวที่ขึ้นทะเบียน และอยู่ฝั่งใบเสนอราคาฝั่งเดียว */
  const propsOf = (src) => [...slice(src, '<QuoteLineMoneyCells', '/>').matchAll(/\n\s*([A-Za-z]+)(?==|\n)/g)].map((m) => m[1]);
  const quoteCells = slice(slice(code(LINE_ITEMS), 'export default function QuotationLineItems', undefined), '<QuoteLineMoneyCells', '/>');
  assert.deepEqual(propsOf(slice(code(LINE_ITEMS), 'export default function QuotationLineItems', undefined)),
    ['line', 'product', 'editable', 'onPatch', 'name', 'showPacks', 'packEdit']);
  assert.deepEqual(propsOf(code(ZONES)), ['line', 'product', 'editable', 'onPatch', 'name', 'driftNote', 'amountPending', 'registryPriceOnly', 'qtyNote']);
  assert.match(quoteCells, /\n\s*showPacks=\{showPacks\}\n\s*packEdit=\{packView\?\.rows\[index\]\}\n/);
  const PACK_PROPS = /\b(?:showPacks|packRequired|packEdit|packErrorsShown|packQty|linePackEdit|useQuoteLinePackGate)\b/;
  assert.doesNotMatch(read(ZONES), PACK_PROPS, 'ขั้น ② ของใบย้อนหลังไม่เอ่ยชื่อของช่องแพ็ค/เดือนเลย ทั้งโค้ดและคอมเมนต์ (งวด PR-5)');
  assert.match('<QuoteLineHeadCells showPacks={showPacks} />', PACK_PROPS, 'ตัวจับจับของจริงได้');
  assert.doesNotMatch('packsPerRound · showPacksPerRound', PACK_PROPS, 'และไม่จับ "แพ็คต่อรอบ" ของโซน (คนละช่อง)');
  /* ค่าตั้งต้นปิดทุกตัว ⇒ ผู้เรียกที่ไม่ส่ง (ขั้น ②) ได้ตารางเดิมของก่อนมีคอลัมน์นี้ */
  assert.match(code(CELLS), /export function QuoteLineHeadCells\(\{ showPacks = false, packRequired = false \}\) \{/);
  const signature = slice(code(CELLS), 'export function QuoteLineMoneyCells({', '}) {');
  assert.match(signature, /\bshowPacks = false, packEdit = null,/);
  /* ขั้น ② เรียกตัวตั้งบรรทัดจากสินค้าตัวเดียวกัน: แถวของมันไม่ถือเลขแพ็ค ⇒ ได้อ็อบเจกต์เดิม ไม่มีคีย์ packQty งอก (packsPerRound ไม่ใช่ตัวคูณ) */
  const zoneRow = emptyHistoricalZone({ zoneId: 'ZN-1', siteId: 'ST-1', packsPerRound: '2' });
  const picked = quoteLineFromProduct(zoneRow, { id: 'PRD-35', fgCode: 'FG-SNS-02-001-0012', saleUnit: 'แพ็คเกจ', costPrice: 3500 });
  assert.equal('packQty' in picked, false);
  assert.equal(picked.packsPerRound, '2');
  assert.equal(quoteLineNet({ ...picked, qty: 12 }).lineTotal, 42000, 'แพ็คต่อรอบของโซนไม่คูณเงิน: 12 × 3,500');
  assert.match(code(ZONES), /<QuoteLinesTable>/, 'พื้นเดียวกับใบเสนอราคา (QUOTE_LINES_MIN_WIDTH)');
  assert.doesNotMatch(code(ZONES), /ZONE_LINES_MIN_WIDTH|zoneCol|minWidth=/);
});

/* ══ คอลัมน์ "แพ็ค/เดือน" (mig 0407 · งวด PR-2 โชว์ · งวด PR-3 ช่องกรอก · docs/qt-pack-column.md) ══════════════════════
   โหมดอ่าน/จออนุมัติ: คอลัมน์ขึ้นเมื่อมีบรรทัดที่มีเลขแพ็คเท่านั้น (ใบเดิมหน้าตาเดิม) · โชว์อย่างเดียว — ของงวด PR-2 ไม่ขยับ
   โหมดแก้ของใบเสนอราคา (งวด PR-3 · มติเจ้าของ 08/10 ข้อ A2–A5): ช่องกรอก · ยอดเป็นขีดเมื่อยังไม่กรอก · แดงหลังกด —
   กฎอยู่ที่ lib/sales/linePackEdit.js (เทสต์พฤติกรรม linePackEdit.test.mjs) · ยามข้างล่างยึดว่าเซลล์และตารางวาดตามกฎนั้น */
/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 ข้อ A2 "บังคับใส่ และหัวคอลัมน์เขียนเป็น แพ็ค/เดือน"): หัวคอลัมน์ยังอ่านจาก
   PACK_COLUMN_LABEL ที่เดียว — เพิ่มดอกจันของช่องบังคับ (โหมดแก้ที่มีบรรทัดต้องกรอก) ต่อท้ายในบรรทัดเดียวกัน · โหมดอ่านไม่มีดอกจัน */
test('⭐ หัวคอลัมน์ “แพ็ค/เดือน”: th เดียวที่เนื้อเป็นนิพจน์ = {PACK_COLUMN_LABEL} + ดอกจันเมื่อ packRequired · อยู่หลัง showPacks · ระหว่าง รายการ กับ จำนวน', () => {
  const head = slice(code(CELLS), 'export function QuoteLineHeadCells', 'export function');
  const packHead = '{showPacks ? <th className={`${styles.numHeader} ${styles.colPack}`}>{PACK_COLUMN_LABEL}{packRequired ? <b className={styles.packReq} aria-hidden="true">*</b> : null}</th> : null}';
  assert.ok(head.includes(packHead), 'หัวคอลัมน์แพ็ค/เดือน: ป้ายจากค่าคงที่ + ดอกจัน (aria-hidden — ช่องเองประกาศ aria-required)');
  const expressionHeads = [...head.matchAll(/<th\b[^>]*>\{([A-Z_]+)\}/g)].map((m) => m[1]);
  assert.deepEqual(expressionHeads, ['PACK_COLUMN_LABEL'], 'หัวที่เป็นนิพจน์มีตัวเดียว และอ่านจากค่าคงที่ (ไม่พิมพ์คำเอง)');
  assert.equal((head.match(/<th\b/g) || []).length, 6, 'หกหัว: ห้าคอลัมน์เดิม + แพ็ค/เดือน');
  const at = (needle) => { const index = head.indexOf(needle); assert.ok(index >= 0, needle); return index; };
  assert.ok(at('<th>รายการ</th>') < at('{showPacks ?'));
  assert.ok(at('{showPacks ?') < at('>จำนวน</th>'));
  assert.doesNotMatch(code(CELLS), /แพ็ค\/เดือน/, 'ไฟล์เซลล์ไม่สะกดหัวคอลัมน์เอง — อ่านจาก PACK_COLUMN_LABEL');
  assert.doesNotMatch(code(LINE_ITEMS), /แพ็ค\/เดือน/);
  assert.equal(PACK_COLUMN_LABEL, 'แพ็ค/เดือน');
  /* ดอกจันขึ้นเฉพาะโหมดแก้ที่มีบรรทัดต้องกรอก — โหมดอ่าน (ไม่มี packView) และตารางที่มีแต่ตัวเลขตกค้างบนหมวดอื่น ไม่มี */
  const editor = slice(code(LINE_ITEMS), 'export default function QuotationLineItems', undefined);
  assert.match(editor, /const packRequired = Boolean\(packView\?\.rows\.some\(\(row\) => row\.required\)\);/);
  assert.match(read('components/salesPlanning/QuotationLineItems.module.css'), /\.packReq \{[^}]*color: var\(--red\);/);
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 ข้อ A2 "บังคับใส่" · แผน IMPL_PLAN_PR3 §5 + §12 C1):
   เดิมยามนี้ยึด "เซลล์แพ็ค/เดือนของตารางแก้ไข **โชว์อย่างเดียว** ไม่มีช่องกรอก ไม่มี onPatch ของเลขแพ็ค" (ช่องยังปิด)
   วันนี้ช่องกรอกเปิด ⇒ ยึด "ช่องกรอก **เฉพาะเมื่อผู้เรียกส่ง packEdit ที่ input เป็นจริง** — นอกนั้นคือกิ่งของงวด PR-2 ทุกตัวอักษร"
   ไม่ได้คลายยาม: กิ่งโชว์อย่างเดียวยังถูกยึดเท่าเดิม · ตัวเขียนของเลขแพ็คมีจุดเดียว · ช่องเงิน/ตัวเลือกที่ผูกเลขแพ็คยังแดง
   ⭐ ย้ายอีกครั้งโดยเจตนา (รีวิวเงิน + รีวิวจอ 09/10 · มติเจ้าของ 08/10 ข้อ A2 + ข้อวินิจฉัย 5): เดิมยึด "ตัวเขียนอยู่หลังตัวกรอง packInputText —
   ค่าที่ตัวกรองไม่รับไม่ถูกเขียน ช่องคงค่าเดิม" · ตัวกรองนั้นถูกเรียกทุกปุ่ม จึงทิ้งปุ่มเงียบ ๆ แล้วเดินต่อ (พิมพ์ 1.5 ได้ 15 · 2.00 ได้ 200 ·
   10000 ได้ 1000 · แก้ 10 เป็น 20 ได้ 102) ⇒ วันนี้ยึด "ตัวเขียน **ไม่มีอะไรคั่น**: ข้อความในช่องทั้งก้อนเข้า onPatch — ค่าที่ใช้ไม่ได้อยู่ในช่องให้เห็น
   เป็นสถานะ invalid" (พฤติกรรมของสถานะนั้นอยู่ที่ linePackEdit.test.mjs) */
test('⭐ เซลล์ “แพ็ค/เดือน” ของตารางแก้ไข: ช่องกรอกจำนวนเต็มเมื่อ packEdit.input · นอกนั้นโชว์อย่างเดียวแบบงวด PR-2 · อยู่หน้าเซลล์จำนวน · ทั้งหมดอยู่หลัง showPacks', () => {
  const money = slice(code(CELLS), 'export function QuoteLineMoneyCells({', 'export function QuoteLineServiceRounds');
  assert.match(money, /const pack = showPacks \? linePackQty\(line\) : null;/);
  assert.match(money, /const packUnit = showPacks && lineHasPacks\(line\) \? packLineUnit\(line, line\.unit\) : null;/);
  /* สูตรใต้ยอด: โหมดแก้ = ของกฎฝั่งจอ (จำนวนว่างนับ 1 เหมือนสูตรเงิน) · ไม่มี packEdit = นิพจน์ของงวด PR-2 เดิมทั้งก้อน */
  assert.match(money, /const packFormula = packEdit \? packEdit\.formula : \(showPacks && !amountPending \? linePackFormulaText\(line\) : null\);/);
  const cell = slice(money, '{showPacks ? (', ') : null}\n      <td data-label="จำนวน">');
  /* กิ่งของงวด PR-2 — ทุกตัวอักษร */
  assert.match(cell, /<td data-label=\{PACK_COLUMN_LABEL\} className=\{pack === null \? styles\.packNA : undefined\}>/);
  assert.match(cell, /\? <span className=\{styles\.packDash\}>\{NA\}<\/span>/);
  assert.match(cell, /: <span role="group" aria-label=\{`\$\{PACK_COLUMN_LABEL\} \$\{name\}`\} className=\{`mono \$\{styles\.packValue\}`\}>\{fmtNumber\(pack\)\}<\/span>\}/);
  /* กิ่งช่องกรอก: เข้าได้ทางเดียว */
  assert.equal((cell.match(/packEdit\?\.input \? \(/g) || []).length, 1);
  const inputBranch = slice(cell, 'packEdit?.input ? (', ') : (');
  const readBranch = cell.slice(cell.indexOf(') : (', cell.indexOf('packEdit?.input ? (')));
  assert.doesNotMatch(readBranch, /<(?:input|Input|MoneyInput|Select|select|textarea|button)\b|onChange|onPatch|onClick/, 'กิ่งโชว์อย่างเดียวไม่มีคอนโทรล');
  const tags = [...inputBranch.matchAll(/<(?:input|Input|MoneyInput|Select|select|textarea|Textarea|button)\b/g)].map((m) => m[0]);
  assert.deepEqual(tags, ['<Input'], 'คอนโทรลเดียว และเป็น Input ข้อความ (ไม่ใช่ MoneyInput ที่รับทศนิยม)');
  const tag = slice(inputBranch, '<Input', '/>');
  for (const attribute of [
    'type="text"', 'inputMode="numeric"', 'pattern="[0-9]*"', 'autoComplete="off"', 'className="numeric-input"',
    'value={packEdit.value}', 'invalid={Boolean(packEdit.note)}', 'aria-required={packEdit.required ? "true" : undefined}',
    'aria-label={`${PACK_COLUMN_LABEL} ${name}`}', 'aria-describedby={packEdit.note || packEdit.hint ? packNoteId : undefined}', 'title={PACK_INPUT_TITLE}',
  ]) assert.ok(tag.includes(attribute), `ช่องแพ็ค/เดือนต้องมี ${attribute}`);
  /* 🔴 §12 C1 (เงิน): ห้าม maxLength / max / type="number" — เบราว์เซอร์ตัด "10000" ที่วางลงมาเป็น "1000" ก่อนที่ใครจะเห็น (วัดใน Chrome 09/10)
     · ไม่มี placeholder และไม่มีค่าตั้งต้น (กติกาฟอร์ม: ไม่มีค่าตั้งต้นเงียบให้การตัดสินใจ) */
  assert.doesNotMatch(tag, /maxLength|\bmax=|\bmin=|type="number"|placeholder|defaultValue|\bstep=/);
  assert.doesNotMatch(code(CELLS).replace(/<MoneyInput min="0"/g, '<MoneyInput'), /maxLength/, 'ทั้งไฟล์เซลล์ไม่มี maxLength');
  /* ตัวเขียนเดียว และ **ไม่มีอะไรคั่น**: ข้อความในช่องทั้งก้อน — ไม่กรอง ไม่ตัด ไม่แปลง ไม่มีเงื่อนไข (ปุ่มที่ถูกทิ้งเงียบ ๆ = เลขที่ไม่มีใครพิมพ์) */
  assert.ok(tag.includes('onChange={(event) => { const text = event.target.value; onPatch?.({ packQty: text }); }}'));
  const handler = slice(tag, 'onChange={(event) => {', '}}');
  assert.doesNotMatch(handler.replace('onPatch?.(', 'onPatch('), /\bif\b|\?|&&|\|\||replace|slice|trim|parse|Number\(|Math\.|test\(|match\(/, 'onChange ของช่องแพ็คห้ามมีเงื่อนไขหรือตัวแปลงค่า');
  assert.equal('packInputText' in linePackEditModule, false, 'ตัวกรองรายปุ่มถูกถอดแล้ว');
  assert.doesNotMatch(code(CELLS), /packInputText/);
  assert.equal((code(CELLS).match(/\bpackQty\s*:/g) || []).length, 1, 'ไฟล์เซลล์เขียนคีย์ packQty จุดเดียว');
  assert.equal((code(CELLS).match(/onPatch\?\.\(\{[^}]*packQty/g) || []).length, 1);
  /* ค่าที่เดิม "ช่องไม่รับ" วันนี้อยู่ในช่องให้เห็น และใช้ไม่ได้ทั้งก้อน: ยอดเป็นขีด · บอกช่วงใต้ช่อง (สีกลางก่อนกด · แดงหลังกด) */
  for (const typedText of ['10000', '1.5', '0.5', '2.00', '0']) {
    const view = linePackEditView({ productId: 'P1', fgCode: 'FG-278-02-001-0757', qty: 12, unitPrice: 3500, packQty: typedText });
    assert.deepEqual([view.value, view.state, view.pending, view.formula, view.hint, view.note], [typedText, 'invalid', true, null, 'จำนวนเต็ม 1–9,999', null], typedText);
    assert.equal(linePackEditView({ productId: 'P1', fgCode: 'FG-278-02-001-0757', qty: 12, unitPrice: 3500, packQty: typedText }, null, { errorsShown: true }).note, 'จำนวนเต็ม 1–9,999');
  }
  assert.equal(linePackEditView({ productId: 'P1', fgCode: 'FG-278-02-001-0757', qty: 12, unitPrice: 3500, packQty: '2' }).state, 'ok');
  assert.equal(PACK_INPUT_TITLE, 'แพ็ค/เดือน — จำนวนเต็ม 1–9,999');
  /* เซลล์ของช่องกรอกประกาศสถานะให้ hook หาช่องแรกที่ต้องแก้ และให้การ์ดใส่ดอกจันที่ป้าย · ข้อความแดงผูกกับช่องด้วย id */
  assert.match(inputBranch, /<td data-label=\{PACK_COLUMN_LABEL\} data-pack-state=\{packEdit\.state\} data-pack-required=\{packEdit\.required \? "true" : undefined\}>/);
  assert.match(inputBranch, /\{packEdit\.note \? <span id=\{packNoteId\} className=\{styles\.packNote\}>\{packEdit\.note\}<\/span> : null\}/);
  /* ช่วงที่รับได้ ก่อนมีการกด: สีกลาง (คลาสของตัวเอง ไม่ใช่ .packNote สีแดง) · ผูกกับช่องด้วย id เดียวกัน (สองข้อความไม่ขึ้นพร้อมกัน — กฎฝั่งจอ) */
  assert.match(inputBranch, /\{packEdit\.hint \? <span id=\{packNoteId\} className=\{styles\.packRange\}>\{packEdit\.hint\}<\/span> : null\}/);
  assert.match(read('components/salesPlanning/QuotationLineItems.module.css'), /\.packRange \{[^}]*color: var\(--text-3\);/);
  assert.doesNotMatch(slice(read('components/salesPlanning/QuotationLineItems.module.css'), '.packRange {', '}'), /--red/, 'ก่อนกดไม่มีสีแดง');
  assert.match(money, /const packNoteId = useId\(\);/);
  assert.match(code('components/salesPlanning/useQuoteLinePackGate.js'), /td\[data-pack-state="\$\{state\}"\] input/);
  assert.ok(money.indexOf('{showPacks ? (') < money.indexOf('<td data-label="จำนวน">'), 'เซลล์แพ็คอยู่หน้าเซลล์จำนวน');
  /* ตารางของใบเสนอราคาไม่เขียนเลขแพ็คเอง — ช่องเดียวอยู่ในเซลล์กลาง */
  assert.doesNotMatch(code(LINE_ITEMS), /setLine\([^)]*packQty|packQty\s*:/);
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 ข้อ A2 · A5): เซลล์จำนวนไม่ถูกแตะ (หน่วย "เดือน" ยังตัดสินจากเลขแพ็คของบรรทัด)
   เซลล์จำนวนเงินเพิ่มเหตุ "ยังไม่พูดยอด" (packEdit?.pending) · เพิ่มบรรทัด "ยอดเดิม" และคำกำกับส่วนลด — ทั้งสามมาจาก packEdit ที่ผู้เรียกคิดให้ */
test('⭐ บรรทัดที่มีเลขแพ็ค: “หน่วย: เดือน” ไม่มีตัวเลือกหน่วย · สูตร “2 × 12 × 3,500.00” ใต้จำนวนเงิน · ยอดเดิม/คำกำกับส่วนลดจาก packEdit · บรรทัดอื่นเข้ากิ่งเดิมทั้งก้อน', () => {
  const money = slice(code(CELLS), 'export function QuoteLineMoneyCells({', 'export function QuoteLineServiceRounds');
  const qtyCell = slice(money, '<td data-label="จำนวน">', '</td>');
  /* กิ่งของบรรทัดที่มีเลขแพ็คมาก่อน · กิ่งเดิม (หน่วยล็อก/ตัวเลือกหน่วย) อยู่ในวงเล็บของ `:` ครบทั้งนิพจน์ */
  assert.match(qtyCell, /\{packUnit \? <span className=\{styles\.unitNote\}>หน่วย: \{packUnit\}<\/span> : \(\s*<>\s*\{unitLocked \|\| !editable\s*\n\s*\? \(line\.unit && <span className=\{styles\.unitNote\}>หน่วย: \{line\.unit\}<\/span>\)/);
  assert.ok(qtyCell.indexOf('{packUnit ?') < qtyCell.indexOf('<Select'), 'ตัวเลือกหน่วยอยู่ในกิ่งของบรรทัดที่ไม่มีเลขแพ็คเท่านั้น');
  assert.equal((qtyCell.match(/<Select\b/g) || []).length, 1);
  const amountCell = slice(money, 'data-label="จำนวนเงิน">', '</td>');
  assert.match(amountCell, /\{amountPending \|\| packEdit\?\.pending \? NA : fmtMoney\(quoteLineNet\(line\)\.lineTotal\)\}/, 'ยอดยังมาจากสูตรกลางตัวเดียว');
  assert.match(amountCell, /\{packFormula \? <span className=\{styles\.amountFormula\}>\{packFormula\}<\/span> : null\}/);
  /* §12 C6: "ยอดเดิม ฿…" ใต้ยอดของบรรทัดเก่าที่กำลังแยกจำนวน — บังคับมี (คนกรอกต้องเห็นยอดที่ต้องได้เท่าเดิม) */
  assert.match(amountCell, /\{packEdit\?\.storedAmount \? <span className=\{styles\.amountStored\}>\{packEdit\.storedAmount\}<\/span> : null\}/);
  /* มติ A5: คำกำกับใต้ส่วนลดบาท — อยู่ในเซลล์ส่วนลด ใต้คอนโทรล ไม่ผูกกับคอนโทรลตัวไหน (สูตรส่วนลดไม่ถูกแตะ) */
  const discountCell = slice(money, '<td data-label="ส่วนลดรายการ">', '</td>');
  assert.match(discountCell, /<\/div>\s*(?:\{\s*\}\s*)?\{packEdit\?\.discountCaption \? <span className=\{styles\.discountCaption\}>\{packEdit\.discountCaption\}<\/span> : null\}\s*$/);
  assert.doesNotMatch(slice(discountCell, '<div className={styles.discountControls}>', '</div>'), /packEdit|packQty/, 'คอนโทรลส่วนลดไม่ผูกกับเลขแพ็ค');
  assert.match(discountCell, /discountValue: event\.target\.value \? line\.discountValue : 0/, 'คอนโทรลส่วนลดเดิมไม่ถูกแตะ');
  /* ผลของกฎฝั่งจอที่เซลล์วาด (พฤติกรรมเต็มอยู่ที่ linePackEdit.test.mjs) */
  const edited = linePackEditView({ productId: 'P1', fgCode: 'FG-278-02-001-0757', qty: 12, unitPrice: 3500, packQty: '2', discountType: 'amount', discountValue: 14400 });
  assert.deepEqual([edited.formula, edited.discountCaption, edited.pending], ['2 × 12 × 3,500.00', '= ลด 600.00 ต่อแพ็คต่อเดือน', false]);
  /* พฤติกรรมของตัวช่วยที่เซลล์เรียก (ชุดเทสต์ไม่มีตัวเรนเดอร์ React ⇒ ยึดที่ตัวช่วย) */
  const packLine = { productId: 'P1', fgCode: 'FG-278-02-001-0757', qty: 12, unit: 'แพ็คเกจ', unitPrice: 3500, packQty: 2 };
  assert.equal(packLineUnit(packLine, packLine.unit), 'เดือน');
  assert.equal(linePackFormulaText(packLine), '2 × 12 × 3,500.00');
  assert.equal(quoteLineNet(packLine).lineTotal, 84000, '2 × 12 × 3,500');
  const plain = { productId: 'P1', fgCode: 'FG-278-02-001-0757', qty: 24, unit: 'แพ็คเกจ', unitPrice: 3500 };
  for (const packQty of [undefined, null, '', 'abc', 0, 1.5, 10000]) {
    const line = { ...plain, packQty };
    assert.equal(lineHasPacks(line), false);
    assert.equal(packLineUnit(line, line.unit), 'แพ็คเกจ', 'บรรทัดที่ไม่มีเลขแพ็คคงหน่วยที่เก็บ');
    assert.equal(linePackFormulaText(line), null, 'ไม่มีสูตรใต้ยอด');
    assert.equal(quoteLineNet(line).lineTotal, 84000);
  }
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 ข้อ A2–A4): เดิม "คอลัมน์ขึ้นเมื่อมีบรรทัดที่มีเลขแพ็ค" ทั้งโหมดอ่านและโหมดแก้
   วันนี้โหมดแก้ถามกฎฝั่งจอ (คอลัมน์ขึ้นเมื่อมีบรรทัดที่ **ได้ช่องกรอก** — หมวด 02-001 หรือถือตัวเลขอยู่) · โหมดอ่านยังเป็น hasPackColumn เดิม
   ไม่ได้คลายยาม: ใบเก่าในโหมดอ่านยังได้ห้าคอลัมน์เดิม (ยึดข้างล่าง) และกฎฝั่งจอถูกคิด **เฉพาะตอน editable** */
test('⭐ ตารางแก้ไข (QuotationLineItems): โหมดแก้ถามกฎฝั่งจอ (quoteLinesPackView) · โหมดอ่านยังเป็น hasPackColumn · ส่ง showPacks / packRequired / packEdit ให้หัวและเซลล์คู่กัน', () => {
  const editor = slice(code(LINE_ITEMS), 'export default function QuotationLineItems', undefined);
  /* ⭐ ย้ายโดยเจตนา (รีวิว 09/10): กฎฝั่งจอได้ "บรรทัดที่เก็บไว้" (storedLines) ด้วย — บรรทัดเก่าตัดสินจากแถวที่เก็บ ไม่ใช่จากยอดอย่างเดียว */
  assert.match(editor, /const packView = useMemo\(\s*\(\) => \(editable \? quoteLinesPackView\(lines, products, \{ errorsShown: packErrorsShown, storedLines \}\) : null\),\s*\[editable, lines, products, packErrorsShown, storedLines\],\s*\);/,
    'กฎฝั่งจอถูกคิดเฉพาะโหมดแก้ — โหมดอ่านไม่มี packEdit เลย');
  assert.match(slice(editor, 'export default function QuotationLineItems({', '}) {'), /\n\s*storedLines = null,\n/, 'ค่าตั้งต้น = ไม่มีบรรทัดเก่า (หน้าสร้างใบ)');
  assert.match(editor, /const showPacks = packView \? packView\.showColumn : hasPackColumn\(lines\);/);
  assert.match(editor, /const packPending = Boolean\(packView\?\.pending\);/);
  assert.match(slice(editor, 'export default function QuotationLineItems({', '}) {'), /\n\s*packErrorsShown = false,\n/, 'ค่าตั้งต้น = ไม่มีอะไรแดง');
  assert.match(editor, /<QuoteLineHeadCells showPacks=\{showPacks\} packRequired=\{packRequired\} \/>/);
  const cells = slice(editor, '<QuoteLineMoneyCells', '/>');
  assert.match(cells, /showPacks=\{showPacks\}/);
  assert.match(cells, /packEdit=\{packView\?\.rows\[index\]\}/);
  assert.doesNotMatch(cells, /packQty/);
  /* ยอดท้ายตาราง: ยังมีบรรทัดที่ไม่มียอด = ขีดทุกช่อง · โหมดอ่าน packPending เป็น false เสมอ ⇒ นิพจน์เดิม */
  const totals = slice(editor, '<QuoteLineTotalsEditor', '/>');
  assert.match(totals, /subtotal: packPending \? null : fmtMoney\(totals\.subtotal\),/);
  assert.match(totals, /total: packPending \? null : fmtMoney\(totals\.totalAmount\),/);
  assert.match(totals, /discount: !packPending && totals\.discountAmount > 0 \? `-\$\{fmtMoney\(totals\.discountAmount\)\}` : null,/);
  assert.match(totals, /vat: !packPending && vatRate > 0 \? fmtMoney\(totals\.vatAmount\) : null,/);
  /* คำแนะนำของใบเก่า: เหนือตาราง · เฉพาะเมื่อกฎฝั่งจอบอก */
  assert.match(editor, /\{packView\?\.resplitHint \? <p className=\{styles\.packHint\}>\{packView\.resplitHint\}<\/p> : null\}\s*<QuoteLinesTable>/);
  /* เปลี่ยนหมวดของบรรทัดพิมพ์เอง: ผ่านตัวล้างของ lib (จอเป็นคนเรียก) — แพตช์ทั้งก้อน ไม่เขียนเลขแพ็คเอง */
  assert.match(editor, /onChange=\{\(code\) => setLine\(index, manualLineCategoryPatch\(line, code \? findCategoryByCode\(categories, code\) : null\)\)\}/);
  assert.doesNotMatch(code(LINE_ITEMS), /manualLineCategoryEdit/, 'ตัวเลือกหมวดไม่ข้ามตัวล้างไปเรียกตัวแก้ metadata ตรง ๆ');
  /* แถวว่าง: ไม่มีบรรทัด = ไม่มีคอลัมน์ ⇒ colSpan เดิม · กล่องตารางยังไม่รับ prop */
  assert.match(editor, /<QuoteLinesEmptyRow colSpan=\{editable \? 7 : 6\}>/);
  assert.match(editor, /<QuoteLinesTable>/);
  /* ตัวตัดสินสองโหมด — ใบเก่า (หมวด 02-001 ไม่มีเลขแพ็ค): อ่าน = ไม่มีคอลัมน์ (หน้าตาเดิม · มติ A4) · แก้ = มีคอลัมน์พร้อมช่องว่าง */
  const oldLines = [{ id: 'L1', productId: 'P1', fgCode: 'FG-278-02-001-0757', qty: 24, unitPrice: 3500, lineTotal: 84000, packQty: null }];
  assert.equal(hasPackColumn(oldLines), false);
  assert.equal(quoteLinesPackView(oldLines).showColumn, true);
  /* บรรทัดเก่าคงยอดที่เก็บไว้เฉพาะเมื่อผู้เรียกส่งแถวที่เก็บมา (หน้าใบ) — ไม่ส่ง = ช่องว่างเป็นขีด */
  assert.equal(quoteLinesPackView(oldLines, [], { storedLines: oldLines }).pending, false);
  assert.equal(quoteLinesPackView(oldLines).pending, true);
  assert.equal(hasPackColumn([{ qty: 12 }, { qty: 24, packQty: null }]), false);
  assert.equal(hasPackColumn([{ qty: 12 }, { qty: 12, packQty: 2 }]), true);
  assert.equal(hasPackColumn([]), false);
  assert.equal(quoteLinesPackView([]).showColumn, false);
});

test('⭐ ตารางฝั่งอ่าน (ใบสั่งขาย · สร้างใบสั่งขาย · ขั้น ④): คอลัมน์ “แพ็ค/เดือน” ขึ้นเองจากบรรทัด · ขีดเมื่อไม่มี · หน่วยของบรรทัดแพ็ค = เดือน', () => {
  const table = slice(code(LINE_ITEMS), 'export function QuotationReadOnlyLineItems', 'export default function QuotationLineItems');
  assert.match(table, /const showPack = hasPackColumn\(lines\);/);
  const head = slice(table, '<thead>', '</thead>');
  assert.match(head, /\{showPack \? <th className=\{`num \$\{styles\.packHead\}`\}>\{PACK_COLUMN_LABEL\}<\/th> : null\}/);
  /* หัวเดิมทั้งเจ็ดช่องยังอยู่ ลำดับเดิม · หัวแพ็คอยู่ระหว่าง รหัส / รายละเอียด กับ จำนวน */
  assert.deepEqual([...head.matchAll(/<th\b[^>]*>([^<{]+)<\/th>/g)].map((m) => m[1].trim()),
    ['#', 'รหัส / รายละเอียด', 'จำนวน', 'หน่วย', 'ราคาต่อหน่วย', 'ส่วนลด', 'รวม']);
  assert.ok(head.indexOf('>รหัส / รายละเอียด</th>') < head.indexOf('{showPack ?'));
  assert.ok(head.indexOf('{showPack ?') < head.indexOf('>จำนวน</th>'));
  const body = slice(table, '<tbody>', '</tbody>');
  const cell = slice(body, '{showPack ? (', ') : null}');
  assert.match(cell, /<td className=\{linePackQty\(line\) === null \? `num mono \$\{styles\.packNA\}` : "num mono"\} data-label=\{PACK_COLUMN_LABEL\}>/);
  assert.match(cell, /\{linePackQty\(line\) === null \? NA : fmtNumber\(linePackQty\(line\)\)\}/);
  assert.ok(body.indexOf('{showPack ? (') < body.indexOf('data-label="จำนวน"'), 'เซลล์แพ็คอยู่หน้าเซลล์จำนวน');
  assert.match(body, /<td data-label="หน่วย">\{naText\(packLineUnit\(line, line\.unit\)\)\}<\/td>/);
  /* เซลล์เดิมอีกสี่ช่องไม่ถูกแตะ */
  assert.match(body, /<td className="num mono" data-label="จำนวน">\{naText\(line\.qty\)\}<\/td>/);
  assert.match(body, /<td className="num mono" data-label="ราคาต่อหน่วย">\{fmtMoney\(line\.unitPrice\)\}<\/td>/);
  assert.match(body, /data-label="รวม">\{fmtMoney\(line\.lineTotal\)\}<\/td>/);
  /* แถวว่าง: ไม่มีบรรทัด = ไม่มีคอลัมน์แพ็ค ⇒ colSpan เดิม */
  assert.match(body, /<td colSpan=\{7\} className=\{styles\.emptyRows\}>/);
  /* ตารางฝั่งอ่านไม่มีสูตรใต้ยอด (จำนวน · หน่วย · ราคา มีคอลัมน์ของตัวเองครบ) */
  assert.doesNotMatch(table, /linePackFormulaText|amountFormula/);
  /* ผู้เรียกไม่ต้องส่งอะไร — ไม่มี prop ใหม่ */
  assert.doesNotMatch(slice(table, 'export function QuotationReadOnlyLineItems({', '}) {'), /\bshowPacks?\b/);
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 ข้อ A2 · แผน IMPL_PLAN_PR3 §6 + §12 C14 — วัดกับคอมโพเนนต์จริง 09/10):
   · แพ็ค/เดือน 88 → 96 (หัวคอลัมน์มีดอกจันของช่องบังคับ: ตัวอักษร 52.5 + ขอบใน 38 = 90.5)
   · จำนวน 114 → กลับเป็น 120 ของตารางทั่วไป: งวด PR-2 ลดไว้แล้วช่องจำนวนตัด "100,000.00" ไป 7px — ตอนนี้ช่องกว้างเท่าตารางที่ไม่มีคอลัมน์แพ็ค
   · ราคา/หน่วย 124 · จำนวนเงิน 136 · ส่วนลดรายการ 210 ไม่ขยับ ⇒ คอลัมน์ตายตัว 708 → 722 (โหมดแก้ 762) · พื้น 900 และจุดพับการ์ดไม่ขยับ */
test('⭐ สไตล์ของคอลัมน์ “แพ็ค/เดือน”: ความกว้างเดิมห้าช่องไม่ถูกแก้ · สลับด้วย :has(th.colPack) · 96 / 124 / 136 และจำนวนคง 120 · โหมดการ์ดซ่อนแถวที่ไม่มีช่อง · ป้ายการ์ดมีดอกจัน', () => {
  const css = read('components/salesPlanning/QuotationLineItems.module.css');
  /* ความกว้างเดิม (ที่มาของพื้น 900) ยังอยู่ครบและมาก่อนกฎใหม่ */
  for (const rule of ['.colIndex { width: 36px; }', '.colQty { width: 120px; }', '.colPrice { width: 130px; }',
    '.colDiscount { width: 210px; }', '.colAmount { width: 150px; }', '.colActions { width: 40px; }']) {
    assert.ok(css.includes(rule), rule);
    assert.ok(css.indexOf(rule) < css.indexOf('.colPack {'), `${rule} ต้องอยู่ก่อนกฎของคอลัมน์แพ็ค`);
  }
  assert.match(css, /\.colPack \{ width: 96px; \}/);
  assert.doesNotMatch(css, /:has\(th\.colPack\) th\.colQty/, 'จำนวนคง 120 — ห้ามมีกฎลดความกว้างของช่องจำนวนกลับมา (114 ตัด "100,000.00")');
  assert.match(css, /\.linesTable:has\(th\.colPack\) th\.colPrice \{ width: 124px; \}/);
  assert.match(css, /\.linesTable:has\(th\.colPack\) th\.colAmount \{ width: 136px; \}/);
  assert.doesNotMatch(css, /:has\(th\.colPack\) th\.colDiscount/, 'ส่วนลดรายการคง 210 (190 ตัด "21,600.00")');
  /* ทุกกฎความกว้างของตารางที่มีคอลัมน์แพ็คแขวนกับ :has(th.colPack) หรือคลาสของหัวคอลัมน์แพ็คเอง ⇒ ตารางที่ไม่มีหัวนี้ (ขั้น ② ของใบย้อนหลัง) ไม่ขยับ */
  const widthRules = [...css.matchAll(/^([^{}\n]+)\{ width: (\d+)px; \}$/gm)].map((m) => [m[1].trim(), Number(m[2])]);
  assert.deepEqual(widthRules, [
    ['.colIndex', 36], ['.colQty', 120], ['.colPrice', 130], ['.colDiscount', 210], ['.colAmount', 150], ['.colActions', 40],
    ['.colPack', 96], ['.linesTable:has(th.colPack) th.colPrice', 124], ['.linesTable:has(th.colPack) th.colAmount', 136],
  ]);
  /* คอลัมน์ตายตัวรวม 722 (โหมดแก้มีปุ่มลบ 40 = 762) ⇒ "รายการ" 139 ที่กล่องแคบสุดที่ยังเป็นตาราง (903 − ขอบกล่อง 2) · 212 ที่จอ 1440 (กล่อง 976) */
  assert.equal(36 + 96 + 120 + 124 + 210 + 136, 722);
  assert.equal(722 + 40, 762);
  const minWidth = Number(code(CELLS).match(/export const QUOTE_LINES_MIN_WIDTH = (\d+);/)?.[1]);
  assert.equal(minWidth, 900, 'พื้นความกว้างและจุดพับการ์ดไม่ขยับ');
  assert.equal(903 - 2 - 762, 139);
  assert.equal(976 - 2 - 762, 212);
  assert.ok(minWidth - 762 >= 136, 'พื้น 900 ยังเหลือที่ให้ "รายการ"');
  assert.equal((css.match(/@container \(max-width: 900px\)/g) || []).length, 2, 'จุดพับการ์ดสองบล็อกเดิม เลขเดิม');
  assert.match(css, /\.packHead \{ white-space: nowrap; \}/);
  /* โหมดการ์ด: แถวที่ไม่มีช่อง/ไม่มีเลขแพ็คไม่มีบรรทัด "แพ็ค/เดือน —" (ทั้งสองตาราง) · ป้ายของช่องที่ต้องกรอกมีดอกจัน (หัวตารางถูกซ่อน) */
  const cards = css.slice(css.lastIndexOf('@container (max-width: 900px) {'));
  assert.match(cards, /\.linesTable tbody td\.packNA,\s*\.readOnlyTable tbody td\.packNA \{ display: none !important; \}/);
  assert.match(cards, /\.linesTable tbody td\[data-pack-required\]::before \{ content: attr\(data-label\) " \*"; \}/);
  assert.ok(css.indexOf('.linesTable tbody td[data-label]::before') < css.lastIndexOf('td[data-pack-required]::before'), 'กฎดอกจันมาหลังกฎป้ายทั่วไป (specificity เท่ากัน — ตัวหลังชนะ)');
  /* ข้อความแดงใต้ช่อง = สีแดง · คำกำกับส่วนลดและยอดเดิม = สีรอง (ข้อมูลให้เทียบ ไม่ใช่ข้อผิด) · คำแนะนำของใบเก่า = ไม่แดง */
  assert.match(css, /\.packNote \{[^}]*color: var\(--red\);/);
  assert.match(css, /\.discountCaption,\s*\.amountStored \{[^}]*color: var\(--text-3\);/);
  assert.match(css, /\.packHint \{[^}]*color: var\(--text-2\);/);
  assert.doesNotMatch(slice(css, '.packHint {', '}'), /--red|--amber/);
  /* ทุกคลาสถูกอ้างตรงตัว styles.<ชื่อ> (ด่าน CSS กำพร้าต้องมองเห็น) */
  const used = code(CELLS) + code(LINE_ITEMS);
  for (const name of ['colPack', 'packHead', 'packValue', 'packDash', 'packNA', 'amountFormula', 'packReq', 'packNote', 'discountCaption', 'amountStored', 'packHint']) {
    assert.match(css, new RegExp(`\\.${name}\\b`), `ชีตต้องมี .${name}`);
    assert.match(used, new RegExp(`styles\\.${name}\\b`), `ต้องอ้าง styles.${name} ตรงตัว`);
  }
});
