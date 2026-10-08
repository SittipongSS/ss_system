// ── ยามจอของ PR-D (ใบสั่งขายย้อนหลัง · แพ็คต่อรอบ + วันวางบิลขั้น ③ · mig 0394 · IMPL_PLAN_D §4.6 D5) ─────────────
//
// 🔴 **ยาม source ไม่ใช่เทสต์เรนเดอร์** (รีโปนี้ไม่มีตัวเรนเดอร์ React ในชุดเทสต์) — ประโยคทั้งหมดอยู่ที่ lib
//    (`historicalOrderCopy` · `historicalIntakeForm` · ตรึงของจริงที่เทสต์ของมัน) ที่นี่เฝ้าว่า **จอต่อสายไปหาตัวตัดสินครบ**
//
// ⭐ สี่เรื่องที่พังเงียบได้:
//   1. ตารางรายการฝั่งอ่าน (ตัวเดียวกับใบเสนอราคา/หน้าใบสั่งขาย) โชว์แพ็คต่อรอบกับทุกใบ ⇒ ใบเสนอราคาได้ขีดค้างทุกบรรทัด
//      — ต้องเป็นธงที่ปิดเป็นค่าตั้งต้น เปิดที่ขั้น ④ ของวิซาร์ดที่เดียว
//   2. การ์ดโซนหน้าใบประกอบคำว่า "แพ็ค" เอง ⇒ "N แพ็ค" เปล่า ๆ กลับมา (มติ 23/09) — เซลล์/หัวการ์ดมาจาก lib เท่านั้น (M3)
//   3. คอลัมน์วันวางบิลของขั้น ③ ซ่อนอยู่ทั้งที่งวดมีวันเดิม/มีข้อผิดของช่องนั้น ⇒ แดงที่หาช่องแก้ไม่เจอ (ทางตัน)
//   4. ช่องวันวางบิลไม่มีจุดยึด `installments.<i>.billingDate` ⇒ ปุ่ม "ไปแก้" ของก้อนแดงพาไปไม่ถึง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HISTORICAL_BILLING_TEXT, emptyHistoricalInstallment, emptyHistoricalWizard, emptyHistoricalZone,
  historicalBillingColumn, historicalFieldAnchorId, historicalInstallmentIssues, historicalMoneyIssues,
} from './historicalIntakeForm.js';
import { historicalPacksCellText, historicalPacksRoundsText, historicalRoundsCellText } from './historicalOrderCopy.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ตัวอย่างในคอมเมนต์ต้องไม่ทำให้ยามผ่านเอง */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ตัวปิดท้ายที่หาไม่เจอ = แดง (ไม่ใช่ตัดถึงท้ายไฟล์เงียบ ๆ แล้วผ่านเพราะเจอข้อความของก้อนอื่น) */
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  if (!to) return text.slice(start);
  const end = text.indexOf(to, start + from.length);
  assert.ok(end >= 0, `หาตัวปิด "${to}" หลัง "${from}" ไม่เจอ`);
  return text.slice(start, end);
}

const LINE_ITEMS = 'components/salesPlanning/QuotationLineItems.js';
const STEP_REVIEW = 'components/salesPlanning/historicalWizard/WizardReviewStep.js';
const STEP_MONEY = 'components/salesPlanning/historicalWizard/WizardMoneyStep.js';
const INST_TABLE = 'components/salesPlanning/historicalWizard/HistoricalInstallmentTable.js';
const ZONES_CARD = 'components/salesPlanning/HistoricalZonesCard.js';

// ── 1. ขั้น ④: ป้ายแพ็คต่อรอบใต้คำอธิบาย (ตารางฝั่งอ่านตัวเดียวกับหน้าใบ) ─────────────────────────────────────

test('PR-D ⭐ QuotationReadOnlyLineItems: showPacksPerRound ปิดเป็นค่าตั้งต้น · ป้ายแพ็คก่อนป้ายจำนวนรอบบริการ "n เดือน" (บรรทัดแพ็คเกจเท่านั้น)', () => {
  const ro = slice(code(LINE_ITEMS), 'export function QuotationReadOnlyLineItems', 'export default function');
  assert.match(ro, /\n\s*showPacksPerRound = false,\n/, 'ปิดเป็นค่าตั้งต้น — ใบเสนอราคา/หน้าใบสั่งขายไม่ได้ขีดค้างทุกบรรทัด');
  const tag = slice(ro, '{showPacksPerRound && lineIsServicePackage(line) ? (', ') : null}');
  assert.match(tag, /<span className=\{styles\.serviceRoundsTag\}>/, 'หน้าตาเดียวกับป้ายรอบบริการ (ไม่มีคลาสใหม่)');
  /* ⭐ มติเจ้าของ 29/09: ป้าย = ค่าคงที่ `SERVICE_PACKS_LABEL` "แต่ละครั้งกี่แพ็ค" (คำเดียวกับใบใหม่ · ไม่สะกดเอง) */
  assert.match(tag, /\{SERVICE_PACKS_LABEL\}: <strong>\{packsPerRoundText\(line\.packsPerRound\)\}<\/strong>/);
  /* มติเจ้าของ 08/10 รอบสอง — จอฝ่ายขายที่เหลือ: หน่วยเดือน + แพ็คก่อนจำนวนรอบบริการ
     ⇒ import เพิ่ม `SERVICE_ROUNDS_UNIT` · ลำดับ: ไซต์ · โซน → รอบละกี่แพ็ค → จำนวนรอบบริการ → หมายเหตุ (ของเดิมยึดรอบก่อนแพ็คตามมติ 29/09)
     · ค่าของป้ายจำนวนรอบบริการ = ตัวเลขผ่าน fmtNumber + หน่วยจากค่าคงที่ (ของเดิมพิมพ์ "รอบ" เองในคอมโพเนนต์) */
  assert.match(code(LINE_ITEMS), /import \{ SERVICE_PACKS_LABEL, SERVICE_ROUNDS_LABEL, SERVICE_ROUNDS_UNIT, lineIsServicePackage \} from "@\/lib\/sales\/serviceOrders";/);
  const rounds = ro.indexOf('{showServiceRounds && lineIsServicePackage(line) ? (');
  const packs = ro.indexOf('{showPacksPerRound && lineIsServicePackage(line) ? (');
  const point = ro.indexOf('{showInstallationPoint ? ');
  const note = ro.indexOf('{line.metadata?.note ? (');
  assert.ok(point > 0 && packs > point && rounds > packs && note > rounds, 'ป้ายรอบละกี่แพ็คต้องอยู่ก่อนป้ายจำนวนรอบบริการ (มติ 08/10 รอบสอง)');
  const roundsTag = slice(ro, '{showServiceRounds && lineIsServicePackage(line) ? (', ') : null}');
  assert.match(roundsTag, /\{SERVICE_ROUNDS_LABEL\}: <strong>\{line\.serviceRounds \? `\$\{fmtNumber\(line\.serviceRounds\)\} \$\{SERVICE_ROUNDS_UNIT\}` : NA\}<\/strong>/);
  assert.doesNotMatch(ro, /\} รอบ`|\} เดือน`/, 'หน่วยของจำนวนรอบบริการไม่พิมพ์เองในคอมโพเนนต์');
  assert.match(ro, /\n\s*showServiceRounds = false,\n/, 'ธงของป้ายจำนวนรอบบริการยังปิดเป็นค่าตั้งต้น (ใบเสนอราคาไม่มีรอบ)');
  /* ตารางแบบแก้ของใบเสนอราคาไม่แตะ */
  assert.doesNotMatch(slice(code(LINE_ITEMS), 'export default function', undefined), /showPacksPerRound|packsPerRound/);
});

test('PR-D ⭐ ค่าในป้ายแพ็คต่อรอบ: จำนวนเต็มบวกเท่านั้น (ไม่รู้ = ขีด ไม่ใช่ "0 แพ็ค")', () => {
  const file = code(LINE_ITEMS);
  const fn = slice(file, 'const packsPerRoundText = (value) => {', '\n};');
  assert.match(fn, /Number\.isInteger\(packs\) && packs > 0 \? `\$\{fmtNumber\(packs\)\} แพ็ค` : NA/);
  assert.match(fn, /value === null \|\| value === undefined \|\| value === ""/, 'ว่าง ≠ 0 (`Number(null)` = 0)');
  /* ถ้อยคำที่ยอม (IMPL_PLAN_D §0.2 ข้อ 14): ค่า "n แพ็ค" ในป้ายเท่านั้น — ป้ายเป็นค่าคงที่ (มติ 29/09) */
  const words = [...file.matchAll(/แพ็ค[^\s<`:]*/g)].map((m) => m[0]);
  assert.deepEqual(words, ['แพ็ค'], `คำว่าแพ็คในไฟล์: ${words.join(', ')}`);
});

test('PR-D ⭐ ขั้น ④ เปิด showPacksPerRound ที่ตารางรายการ · ไฟล์ขั้น ④ ไม่ประกอบคำว่าแพ็คเอง', () => {
  const review = code(STEP_REVIEW);
  const table = slice(review, '<QuotationReadOnlyLineItems', '/>');
  assert.match(table, /\n\s*showServiceRounds\n\s*showPacksPerRound\n/, 'ป้ายแพ็คต่อรอบต่อจากรอบบริการ');
  assert.match(table, /lines=\{lines\}/, 'บรรทัดของแผน (packsPerRound ที่ server ตรวจแล้ว)');
  assert.doesNotMatch(review, /แพ็ค/);
});

// ── 2. การ์ดโซนหน้าใบ: คอลัมน์แพ็คต่อรอบ + บรรทัดหัวรวมจาก lib ────────────────────────────────────────────

test('PR-D ⭐ การ์ดโซน: เซลล์แพ็คต่อรอบจาก historicalPacksCellText · หัวการ์ดจาก historicalPacksRoundsText (ไม่รู้ = หัวเดิม)', () => {
  const card = code(ZONES_CARD);
  /* มติเจ้าของ 08/10 รอบสอง — จอฝ่ายขายที่เหลือ: หน่วยเดือน + แพ็คก่อนจำนวนรอบบริการ
     ⇒ การ์ด import `historicalRoundsCellText` เพิ่ม (เซลล์ "12 เดือน" ประกอบที่ lib) และเซลล์/หัวเรียงแพ็คก่อนจำนวนรอบบริการ */
  assert.match(card, /import \{ historicalPacksCellText, historicalPacksRoundsText, historicalRoundsCellText, historicalZoneState \} from "@\/lib\/sales\/historicalOrderCopy";/);
  assert.match(card, /<td className="num">\{historicalPacksCellText\(zone\.packsPerRound\)\}<\/td>/);
  assert.match(card, /<td className="num">\{historicalRoundsCellText\(zone\.rounds\)\}<\/td>/);
  assert.match(card, /historicalPacksRoundsText\(zones\)\.meta\s*\n?\s*\?\? `\$\{fmtNumber\(zones\.length\)\} โซน — /,
    'ไม่รู้แพ็คสักโซน (ใบที่คีย์ก่อนมีช่อง) = หัวเดิม ไม่ใช่ "รวม 0 แพ็ค/รอบ"');
  assert.match(card, /minWidth=\{760\}/, 'คอลัมน์เพิ่ม ⇒ ตารางกว้างขึ้น (จอแคบเลื่อนข้าง)');
  /* ลำดับเซลล์ตรงกับหัว (มติ 08/10 รอบสอง — เดียวกับตารางงานบริการของใบใหม่): จำนวน → รอบละกี่แพ็ค → จำนวนรอบบริการ → จำนวนเงิน */
  const row = slice(card, '<tr key={zone.lineId || zone.zoneId}>', '</tr>');
  const qty = row.indexOf('{qtyText(zone)}');
  const packs = row.indexOf('historicalPacksCellText(');
  const rounds = row.indexOf('historicalRoundsCellText(');
  const money = row.indexOf('zone.lineTotal == null');
  assert.ok(qty > 0 && packs > qty && rounds > packs && money > rounds, 'เซลล์จำนวนรอบบริการต้องอยู่ระหว่างรอบละกี่แพ็คกับจำนวนเงิน');
  const head = slice(card, '<thead>', '</thead>');
  assert.ok(head.indexOf('{SERVICE_PACKS_LABEL}') < head.indexOf('{SERVICE_ROUNDS_LABEL}'), 'หัวคอลัมน์เรียงเหมือนเซลล์');
});

test('PR-D ⭐ ของจริงของ lib ที่การ์ดเรียก: "2 แพ็ค/รอบ" · ไม่รู้ = ขีด · หัวรวมขึ้นเมื่อรู้อย่างน้อยหนึ่งโซน', () => {
  assert.equal(historicalPacksCellText(2), '2 แพ็ค/รอบ');
  assert.equal(historicalPacksCellText(null), '—');
  assert.equal(historicalPacksCellText(0), '—', '0 = ไม่รู้ (ใบที่คีย์ก่อนมีช่อง) ไม่ใช่ "0 แพ็ค/รอบ"');
  /* มติเจ้าของ 08/10 รอบสอง: เซลล์จำนวนรอบบริการ "12 เดือน" · ไม่รู้ = ขีด */
  assert.equal(historicalRoundsCellText(12), '12 เดือน');
  assert.equal(historicalRoundsCellText(null), '—');
  const zones = [
    { zoneName: 'Lobby', siteId: 'ST-1', packsPerRound: 2, rounds: 12 },
    { zoneName: 'ทางเดิน', siteId: 'ST-1', packsPerRound: 1, rounds: 12 },
  ];
  assert.match(historicalPacksRoundsText(zones).meta, /^2 โซน · รวม 3 แพ็ค\/รอบ — /);
  assert.equal(historicalPacksRoundsText(zones.map((z) => ({ ...z, packsPerRound: null }))).meta, null,
    'ไม่รู้สักโซน = null ⇒ การ์ดใช้หัวเดิม');
});

// ── 3. ขั้น ③: คอลัมน์วันวางบิล (ไม่บังคับ · DD5 · mig 0394/P7) ──────────────────────────────────────────

test('PR-D ⭐ ขั้น ③ ต่อสาย: ธงคอลัมน์จาก historicalBillingColumn(customerTerms, rows) · อ่านกติกาไม่ได้ = บรรทัดบอกทางออกเหนือตาราง', () => {
  const money = code(STEP_MONEY);
  assert.match(money, /const billing = historicalBillingColumn\(customerTerms, rows\);/);
  const table = slice(money, '<HistoricalInstallmentTable', '/>');
  assert.match(table, /billingColumn=\{billing\.show\}/);
  const note = money.indexOf('{billing.failedNote ? <p className={styles.hint}>{billing.failedNote}</p> : null}');
  assert.ok(note > 0 && note < money.indexOf('<HistoricalInstallmentTable'), 'บรรทัดบอกเหตุอยู่เหนือตาราง');
  /* ประโยคมาจาก lib ตัวเดียว (HISTORICAL_BILLING_TEXT) — จอไม่พิมพ์ถ้อยคำเอง */
  assert.doesNotMatch(money, /วันวางบิล|รอเหตุการณ์|billingEvent/);
});

test('PR-D ⭐ ตารางงวด: คอลัมน์วันวางบิลขึ้นเฉพาะใต้ธง · ต่อจากครบกำหนด · งวดยกมา = ขีด · ปิดธง = ตารางเดิม', () => {
  const table = code(INST_TABLE);
  assert.match(table, /chain, rowIssues = new Map\(\), onPatch, onRemove, busy = false, emptyText = "ยังไม่มีงวด", billingColumn = false,/);
  const head = slice(table, '<thead>', '</thead>');
  const billHead = slice(head, '{billingColumn ? (', ') : null}');
  assert.match(billHead, /<th className=\{`\$\{styles\.instBill\} \$\{styles\.instBillHead\}`\}>/);
  assert.match(billHead, /\{HISTORICAL_BILLING_TEXT\.head\}/);
  assert.match(billHead, /<small>\{HISTORICAL_BILLING_TEXT\.sub\}<\/small>/);
  assert.doesNotMatch(billHead, /styles\.req/, 'ไม่บังคับ — ไม่มีดาว');
  const due = head.indexOf('ครบกำหนด');
  const bill = head.indexOf('{billingColumn ? (');
  const cover = head.indexOf('ครอบคลุมบริการ');
  assert.ok(due > 0 && bill > due && cover > bill, 'ลำดับหัว: ครบกำหนด → วันวางบิล → ครอบคลุมบริการ');
  /* หัวตายตัว 6 ช่อง + 1 ช่องใต้ธง */
  assert.equal((head.match(/<th\b/g) || []).length, 7);
  /* งวดยกมา: ขีด (CHECK sales_order_installments_billing_sane ของ 0389) */
  const opening = slice(table, '<tr className={styles.instOpening}>', '</tr>');
  assert.match(opening, /\{billingColumn \? <td><span className=\{styles\.instTag\}>\{NA\}<\/span><\/td> : null\}/);
  /* ความกว้าง/แถวว่างตามจำนวนคอลัมน์ — review 29/09: 1100 ล้นการ์ดที่ 1440 (ตัวเลื่อนข้างในกว้าง 1070 · ปุ่มลบงวดถูกตัดครึ่ง)
     ⇒ คอลัมน์ใต้ธงแคบลง (ตัวติด data-billing) รวม 66.5rem = 1064 */
  assert.match(table, /minWidth=\{billingColumn \? 1064 : 960\}/);
  assert.match(table, /<table className=\{`w-full text-sm \$\{styles\.instTable\}`\} data-billing=\{billingColumn \? "yes" : undefined\}>/);
  assert.match(table, /<td colSpan=\{billingColumn \? 7 : 6\} className=\{styles\.instEmpty\}>/);
});

test('PR-D ⭐ ช่องวันวางบิลรายงวด: จุดยึด · ขอบช่วงเอกสาร · แดงจากข้อของแถว (หลังกดถัดไป) · ไม่มีรอเหตุการณ์', () => {
  const table = code(INST_TABLE);
  const cell = slice(table, '{billingColumn ? (\n                  <td id={anchor("billingDate")}>', '</td>');
  const input = slice(cell, '<DateInput', '/>');
  assert.match(input, /\n\s*compact\n/);
  assert.match(input, /value=\{row\.billingDate\}/);
  assert.match(input, /invalid=\{Boolean\(bad\.billingDate\)\}/, 'แดงจาก rowIssues เท่านั้น — ซึ่งมาหลังกด "ถัดไป" (กฎบ้าน)');
  assert.match(input, /onChange=\{\(value\) => onPatch\?\.\(row\.key, \{ billingDate: value \}\)\}/);
  assert.match(input, /min=\{DOC_DATE_MIN\}/);
  assert.match(input, /max=\{DOC_DATE_MAX\}/);
  assert.match(input, /disabled=\{busy\}/);
  assert.match(input, /ariaLabel=\{HISTORICAL_BILLING_TEXT\.aria\(name\)\}/);
  assert.match(cell, /\{bad\.billingDate \? <span className=\{styles\.cellBad\}>\{bad\.billingDate\}<\/span> : null\}/);
  /* ช่องวันเฉย ๆ — ไม่ยืมตัวแก้งวดของใบสั่งขาย · ไม่มี "รอเหตุการณ์" (งวดของใบย้อนหลังต้องมีวันครบกำหนด · 0374) */
  assert.doesNotMatch(table, /รอเหตุการณ์|billingEvent|InstallmentDateEditor|useInstallmentDateMode/);
  assert.doesNotMatch(table, /style=\{\{/);
  assert.match(table, /import \{ HISTORICAL_BILLING_TEXT, INSTALLMENT_LABEL_MAX, historicalFieldAnchorId \} from "@\/lib\/sales\/historicalIntakeForm";/);
  /* ถ้อยคำของคอลัมน์มาจาก lib เท่านั้น */
  assert.doesNotMatch(table, /วันวางบิล/);
});

/* 🔴 ทางตัน: ข้อของช่องวันวางบิลขึ้นแดงในก้อนหัวขั้น แต่คอลัมน์ถูกซ่อน (ลูกค้า "ไม่ต้องวางบิล" / อ่านกติกาไม่ได้)
   ⇒ ผู้คีย์หาช่องแก้ไม่เจอ · ข้อผิดเกิดได้เฉพาะงวดที่มีค่าในช่อง ⇒ ธงต้องเปิดเสมอเมื่อมีค่า ไม่ว่ากติกาเป็นอะไร */
test('PR-D 🔴 ทุกข้อของช่องวันวางบิล มีช่องให้แก้บนจอเสมอ (คอลัมน์ไม่ซ่อน · จุดยึดตรงช่อง)', () => {
  const rows = [
    emptyHistoricalInstallment({ label: 'ต.ค.', amount: '20000', dueDate: '2026-10-01', coversTo: '2026-10-31', billingDate: '2026-02-30' }),
    emptyHistoricalInstallment({ label: 'พ.ย.–ธ.ค.', dueDate: '2026-11-01', billingDate: '' }),
  ];
  const state = {
    ...emptyHistoricalWizard(),
    customerId: 'CUS-1', ownerId: 'USR-AE', team: 'KA', vatRate: 7,
    contract: { docKind: 'customer_po', ref: 'PO-1', startDate: '2026-10-01', endDate: '2026-12-31' },
    zones: [emptyHistoricalZone({ zoneId: 'ZN-1', siteId: 'ST-1', productId: 'PRD-1', unitPrice: 1000, qty: '40', rounds: '3', packsPerRound: '2' })],
    hasOpening: false,
    installments: rows,
  };
  const issues = historicalMoneyIssues(state, { evidenceFileCount: 0, todayIso: '2026-09-29', totalAmount: 42800 })
    .filter((issue) => issue.field.endsWith('.billingDate'));
  assert.equal(issues.length, 1, 'ชุดสถานะของยามต้องผลิตข้อของช่องวันวางบิลจริง');
  const byRow = historicalInstallmentIssues(issues);
  assert.ok(byRow.get(rows[0].key)?.billingDate, 'ข้อผูกกับ key ของงวด (ตารางอ่าน bad.billingDate)');

  const TERMS = [
    null,
    { status: 'error', detail: 'x' },
    { status: 'ready', supported: true, rule: { v: 4, need: 'none' } },
    { status: 'ready', supported: false, rule: null },
  ];
  assert.equal(historicalBillingColumn(TERMS[2], []).show, false, 'ชุดกติกาของยามต้องมีตัวที่ซ่อนคอลัมน์จริง (ไม่งั้นยามผ่านเอง)');
  for (const terms of TERMS) {
    assert.equal(historicalBillingColumn(terms, state.installments).show, true, `กติกา ${JSON.stringify(terms)}: ช่องที่มีค่าต้องไม่ถูกซ่อน`);
  }
  /* จุดยึดของช่อง = id ที่ตารางวาด (`anchor("billingDate")`) */
  const table = code(INST_TABLE);
  assert.match(table, /const anchor = \(slot\) => historicalFieldAnchorId\(`installments\.\$\{row\.index\}\.\$\{slot\}`\);/);
  assert.match(table, /id=\{anchor\("billingDate"\)\}/);
  assert.equal(historicalFieldAnchorId(issues[0].field), 'hist-f-installments-0-billingdate');
});

test('PR-D ⭐ บรรทัดบอกเหตุของขั้น ③ พูดทางออก (แท็บการชำระ · ปุ่มตั้งวันงวด) — ขึ้นเมื่ออ่านกติกาไม่ได้และไม่มีวันเดิมเท่านั้น', () => {
  const empty = [emptyHistoricalInstallment({ label: 'ต.ค.', dueDate: '2026-10-01' })];
  const failed = historicalBillingColumn({ status: 'error', detail: 'x' }, empty);
  assert.deepEqual(failed, { show: false, readOnly: false, failedNote: HISTORICAL_BILLING_TEXT.ruleFailed, readOnlyNote: null });
  assert.match(failed.failedNote, /ตั้งวันงวด/);
  assert.deepEqual(historicalBillingColumn(null, empty), { show: false, readOnly: false, failedNote: null, readOnlyNote: null },
    'ยังโหลด = ซ่อนเงียบ ๆ ชั่วครู่');
});

/* 🔴 review 29/09: คอลัมน์ที่ขึ้น "เพราะมีวันเดิม" (ลูกค้าตอบ "ไม่ต้องวางบิล" / อ่านกติกาไม่ได้ / ยังโหลด) เคยเป็นช่องพิมพ์ได้
   ⇒ วันใหม่ของลูกค้า "ไม่ต้องวางบิล" ไหลเข้าฐานโดยไม่ผ่านการยืนยันข้อยกเว้น · server ตีกลับแล้ว (ด่านรุ่นสี่ในแผน)
   ⇒ จอต้องไม่ชวนพิมพ์วันที่บันทึกไม่ได้: วันเดิมอ่านอย่างเดียว + ปุ่ม "ล้าง" (ล้างผ่านด่านเสมอ) + บรรทัดบอกเหตุเหนือตาราง */
test('PR-D 🔴 review 29/09 คอลัมน์วันวางบิลที่ขึ้นเพราะวันเดิมเท่านั้น = อ่านอย่างเดียว + ล้างได้ (ไม่ชวนพิมพ์วันที่ server ตีกลับ)', () => {
  const stored = [emptyHistoricalInstallment({ label: 'ต.ค.', dueDate: '2026-10-01', billingDate: '2026-09-25' })];
  const empty = [emptyHistoricalInstallment({ label: 'ต.ค.', dueDate: '2026-10-01' })];
  const none = { status: 'ready', supported: true, rule: { v: 4, need: 'none' } };
  const required = { status: 'ready', supported: true, rule: { v: 4, need: 'required' } };
  assert.deepEqual(historicalBillingColumn(none, stored),
    { show: true, readOnly: true, failedNote: null, readOnlyNote: HISTORICAL_BILLING_TEXT.lockedNone });
  assert.deepEqual(historicalBillingColumn({ status: 'error', detail: 'x' }, stored),
    { show: true, readOnly: true, failedNote: null, readOnlyNote: HISTORICAL_BILLING_TEXT.lockedFailed });
  assert.deepEqual(historicalBillingColumn({ status: 'ready', supported: false, rule: null }, stored),
    { show: true, readOnly: true, failedNote: null, readOnlyNote: HISTORICAL_BILLING_TEXT.lockedFailed });
  assert.deepEqual(historicalBillingColumn(null, stored), { show: true, readOnly: true, failedNote: null, readOnlyNote: null },
    'ยังโหลดกติกา = อ่านอย่างเดียวชั่วครู่ (ไม่รู้ว่าพิมพ์ได้ไหม) · ไม่มีบรรทัดเหตุ');
  for (const terms of [required, { status: 'ready', supported: true, rule: null }]) {
    assert.deepEqual(historicalBillingColumn(terms, stored), { show: true, readOnly: false, failedNote: null, readOnlyNote: null });
    assert.deepEqual(historicalBillingColumn(terms, empty), { show: true, readOnly: false, failedNote: null, readOnlyNote: null });
  }
  assert.match(HISTORICAL_BILLING_TEXT.lockedNone, /ไม่ต้องวางบิล/);
  assert.match(HISTORICAL_BILLING_TEXT.lockedNone, /ล้าง/);
  assert.match(HISTORICAL_BILLING_TEXT.lockedNone, /แท็บการชำระ/);
  assert.match(HISTORICAL_BILLING_TEXT.lockedFailed, /อ่านกติกาวางบิลของลูกค้าไม่ได้/);
  assert.equal(HISTORICAL_BILLING_TEXT.clear, 'ล้าง');
  assert.equal(HISTORICAL_BILLING_TEXT.clearAria('งวดที่ 2'), 'ล้างวันวางบิลงวดที่ 2');

  /* ตาราง: ธง billingReadOnly (ปิดเป็นค่าตั้งต้น) · วันเดิม = ข้อความ + ปุ่มล้าง · ไม่มีวัน = ขีด · ข้อผิดยังขึ้นใต้ช่อง · จุดยึดเดิม */
  const table = code(INST_TABLE);
  assert.match(table, /billingColumn = false, billingReadOnly = false,/);
  const cell = slice(table, '<td id={anchor("billingDate")}>', '</td>');
  const locked = slice(cell, '{billingReadOnly ? (', ') : (');
  assert.match(locked, /\{row\.billingDate \? fmtDate\(row\.billingDate\) : NA\}/);
  const clear = slice(locked, '<Button', '</Button>');
  assert.match(clear, /onClick=\{\(\) => onPatch\?\.\(row\.key, \{ billingDate: "" \}\)\}/);
  assert.match(clear, /aria-label=\{HISTORICAL_BILLING_TEXT\.clearAria\(name\)\}/);
  assert.match(clear, /disabled=\{busy\}/);
  assert.match(locked, /\{row\.billingDate \? \(/, 'ปุ่มล้างขึ้นเฉพาะแถวที่มีวัน');
  assert.match(locked, /HISTORICAL_BILLING_TEXT\.clear\b/);
  assert.ok(cell.indexOf('<DateInput') > cell.indexOf(') : ('), 'ช่องพิมพ์วันอยู่กิ่งที่ไม่ล็อก');
  assert.match(cell, /\{bad\.billingDate \? <span className=\{styles\.cellBad\}>\{bad\.billingDate\}<\/span> : null\}/);

  /* ขั้น ③ ต่อสาย: ธงล็อก + บรรทัดบอกเหตุเหนือตาราง (ประโยคจาก lib) */
  const money = code(STEP_MONEY);
  const tableProps = slice(money, '<HistoricalInstallmentTable', '/>');
  assert.match(tableProps, /billingReadOnly=\{billing\.readOnly\}/);
  const note = money.indexOf('{billing.readOnlyNote ? <p className={styles.hint}>{billing.readOnlyNote}</p> : null}');
  assert.ok(note > 0 && note < money.indexOf('<HistoricalInstallmentTable'), 'บรรทัดบอกเหตุอยู่เหนือตาราง');
});

/* 🔴 review 29/09: ตารางกว้าง 1100 ในตัวเลื่อน 1070 ของการ์ดที่ 1440 ⇒ ปุ่มลบงวดถูกตัดครึ่ง ทุกลูกค้า (prod 29/09: ไม่มีลูกค้า
   "ไม่ต้องวางบิล" ⇒ คอลัมน์ขึ้นทุกใบ) · คอลัมน์ใต้ธงแคบลง (วัดจอจริง UAT 29/09): จำนวนเงิน/ครบกำหนด 9.5rem · วันวางบิล 11rem
   (หัวรอง "ไม่บังคับ · วันที่ส่งใบวางบิล" 149px — แคบกว่านี้ตัดกลาง "ใบวาง|บิล") · ครอบคลุม 14.5rem · รายละเอียดคง 13rem
   ⇒ 3.5+13+9.5+9.5+11+14.5+5.5 = 66.5rem = 1064 */
test('PR-D 🔴 review 29/09 ตารางงวดที่มีคอลัมน์วันวางบิลพอดีการ์ดที่ 1440 (66.5rem = 1064px ≤ 1070)', () => {
  const css = read('components/salesPlanning/historicalWizard/HistoricalOrderWizard.module.css');
  const rem = (selector) => {
    const m = css.match(new RegExp(`${selector.replace(/[.[\]"=]/g, (c) => `\\${c}`)}\\s*\\{\\s*(?:min-)?width:\\s*([\\d.]+)rem;`));
    assert.ok(m, `หา ${selector} ไม่เจอ`);
    return Number(m[1]);
  };
  const on = (cls) => rem(`.instTable[data-billing="yes"] .${cls}`);
  assert.equal(on('instAmount'), 9.5);
  assert.equal(on('instDue'), 9.5);
  assert.equal(on('instBill'), 11, 'หัวรองของคอลัมน์ต้องตัดบรรทัดที่ "ของงวด" ไม่ใช่กลาง "ใบวาง|บิล"');
  assert.equal(on('instCover'), 14.5);
  const total = rem('.instSeq') + rem('.instLabel') + on('instAmount') + on('instDue') + on('instBill') + on('instCover') + rem('.instActions');
  assert.equal(total, 66.5);
  assert.ok(total * 16 <= 1070, `${total * 16}px ต้องไม่เกินตัวเลื่อนของการ์ดที่ 1440 (1070px)`);
  assert.match(code(INST_TABLE), new RegExp(`minWidth=\\{billingColumn \\? ${total * 16} : 960\\}`), 'minWidth = ผลรวมจริงของคอลัมน์');
});
