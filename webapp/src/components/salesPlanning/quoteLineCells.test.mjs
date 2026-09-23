// ── ยามของ QuoteLineCells — ตารางรายการของใบเสนอราคากับบรรทัดโซนของใบสั่งขายย้อนหลังต้องเป็นชุดเดียว ─────
//
// ⭐ มติเจ้าของ 23/09: "3500 x 1 ชุด x 12 เดือน · มันต้องไม่ควรแตกต่างจาก form ใบเสนอราคา เพื่อไม่ให้ USER สับสน"
//   🐞 ก่อนมตินี้ขั้น ② ของใบย้อนหลังถาม "แพ็ค" + ยอดที่พิมพ์เอง + ปุ่มลัด ราคา × แพ็ค × เดือน ⇒ 1 ชุด × 12 เดือน
//      ถูกคีย์สามแบบ (1 × 42,000 · 12 × 3,500 · ปุ่มเสนอ 504,000)
//   ⇒ สองฟอร์มวาดหัวคอลัมน์ ช่องกรอก ตัวล็อกราคา/หน่วย และยอดเงินจากไฟล์เดียว · ยามนี้ตรึงว่า **ยังเป็นไฟล์เดียว**
//
// 🔴 ส่วนใหญ่เป็นยาม source (ชุดเทสต์ของรีโปนี้ไม่มีตัวเรนเดอร์ React) — ส่วนที่เป็นตัวเลขเรียกฟังก์ชันจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QUOTE_DISCOUNT_TYPES, QUOTE_VAT_OPTIONS, quoteLineMoney, quoteLineNet } from '../../lib/salesPlanning.js';
import { HISTORICAL_LINE_MESSAGES, emptyHistoricalZone, historicalZoneLineAmount } from '../../lib/sales/historicalIntakeForm.js';
import { quoteLineFromProduct, quoteLineLocks } from '../../lib/sales/quoteLines.js';
import { DEFAULT_SALE_UNIT } from '../../lib/master/units.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ตัวอย่างในคอมเมนต์ต้องไม่ทำให้ยามผ่านเอง */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CELLS = 'components/salesPlanning/QuoteLineCells.js';
const LINE_ITEMS = 'components/salesPlanning/QuotationLineItems.js';
const ZONES = 'components/salesPlanning/historicalWizard/WizardZonesStep.js';

function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
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

test('⭐ VAT ของใบเสนอราคาอ่านป้ายจาก QUOTE_VAT_OPTIONS — ชุดเดียวกับแผ่น VAT ของใบย้อนหลัง', () => {
  assert.match(code(LINE_ITEMS), /QUOTE_VAT_OPTIONS\.map\(\(option\) => \(\s*\n\s*<option key=\{option\.value\} value=\{String\(option\.value\)\}>\{option\.label\}<\/option>/);
  assert.deepEqual(QUOTE_VAT_OPTIONS.map((o) => [o.value, o.label]), [[0, 'รวม VAT แล้ว'], [7, '+ VAT 7% ท้ายใบ']]);
});

test('⭐ จำนวนเงินของเซลล์ = quoteLineNet (สูตรเดียวกับ server) · ใบย้อนหลังพูดขีดเมื่อยังคิดไม่ได้', () => {
  const cells = code(CELLS);
  assert.match(cells, /\{amountPending \? NA : fmtMoney\(quoteLineNet\(line\)\.lineTotal\)\}/);
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

test('⭐ ช่องรอบบริการที่ขายไว้ = ช่องของการ์ดสัญญาบริการใบสั่งขาย (จำนวนเต็ม ≥ 1 · เว้นว่างได้ · "รอบ")', () => {
  const rounds = slice(code(CELLS), 'export function QuoteLineServiceRounds', undefined);
  assert.match(rounds, /<span>รอบบริการที่ขายไว้<\/span>/);
  const control = 'type="number" min="1" step="1" inputMode="numeric" placeholder="—"';
  assert.ok(rounds.includes(control), 'ช่องเดียวกับ ServiceContractCard');
  assert.ok(code('components/salesPlanning/ServiceContractCard.js').includes(control),
    'ต้นแบบของช่องนี้ยังอยู่ที่การ์ดสัญญาบริการ — เปลี่ยนที่นั่นต้องเปลี่ยนที่นี่ด้วย');
  assert.match(rounds, /<span className=\{styles\.roundsUnit\}>รอบ<\/span>/);
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
  assert.match(cells, /qtyNote=\{amount\.qtyNote\}/);
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
test('⭐ หัวตารางของขั้น ② = หัวตารางของใบเสนอราคา (# · ห้าคอลัมน์ · ช่องปุ่มลบ) · ไม่มีพื้นความกว้างของตัวเอง', () => {
  const headOf = (src) => slice(src, '<thead>', '</thead>')
    .replace(/\{editable && (<QuoteLineActionsHead \/>)\}/, '$1')
    .match(/<[A-Za-z]+[^>]*\/?>/g)
    .filter((tag) => /^<QuoteLine/.test(tag));
  const quote = headOf(slice(code(LINE_ITEMS), 'export default function QuotationLineItems', undefined));
  const zones = headOf(code(ZONES));
  assert.deepEqual(quote, ['<QuoteLineIndexHead />', '<QuoteLineHeadCells />', '<QuoteLineActionsHead />']);
  assert.deepEqual(zones, quote);
  assert.match(code(ZONES), /<QuoteLinesTable>/, 'พื้นเดียวกับใบเสนอราคา (QUOTE_LINES_MIN_WIDTH)');
  assert.doesNotMatch(code(ZONES), /ZONE_LINES_MIN_WIDTH|zoneCol|minWidth=/);
});
