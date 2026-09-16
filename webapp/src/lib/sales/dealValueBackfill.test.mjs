/* แผน backfill ยอดดีล (มติผู้ใช้ 2026-09-16) — ตัวนี้ตัดสินว่าจะเขียนอะไรลง **ฐานจริง**
   (dev = production · ไม่มีถังขยะ) ⇒ ทุกกติกาที่ตัดดีลออกหรือเปลี่ยนตัวเลข ต้องมีเทสต์ชี้ได้ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKFILL_FIELDS, VALUE_EPSILON, dealValueBackfillPatch, planDealValueBackfill, quoteIndexOf,
} from './dealValueBackfill.js';

const quote = (over = {}) => ({ id: 'Q1', quoteNumber: 'QT-26090001-1', totalAmount: 107000, vatAmount: 7000, status: 'accepted', ...over });
const deal = (over = {}) => ({
  id: 'D1', code: 'DL-26090001', stage: 'won', origin: 'pipeline',
  projectValue: 36000, forecastSource: 'manual', forecastQuotationId: null, forecastManualValue: 36000,
  metadata: { acceptedQuotationId: 'Q1' }, ...over,
});
const plan = (deals, quotes) => planDealValueBackfill(deals, quoteIndexOf(quotes));

test('ยอดใหม่ = ยอดใบก่อน VAT หลังส่วนลด (quotationWonAmount) ไม่ใช่ subtotal', () => {
  const { targets } = plan([deal()], [quote()]);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].next, 100000, '107,000 − VAT 7,000');
  assert.equal(targets[0].now, 36000);
  // subtotal (ยอดก่อนส่วนลด) ต้องไม่ถูกหยิบมาใช้แม้จะมีอยู่ในแถว
  const withSubtotal = plan([deal()], [quote({ subtotal: 250000 })]);
  assert.equal(withSubtotal.targets[0].next, 100000);
});

test('ดีลที่ยอดตรงใบอยู่แล้วไม่ถูกแตะ — เศษทศนิยมต่ำกว่าครึ่งสตางค์ = ตรงกัน', () => {
  assert.equal(plan([deal({ projectValue: 100000 })], [quote()]).targets.length, 0);
  assert.equal(plan([deal({ projectValue: 100000 + VALUE_EPSILON / 2 })], [quote()]).targets.length, 0);
  assert.equal(plan([deal({ projectValue: 100000.02 })], [quote()]).targets.length, 1, 'ต่างเกินครึ่งสตางค์ = ต้องแก้');
});

test('ดีลที่ไม่มีใบที่ลูกค้ารับ = ข้าม ไม่เดายอดจากใบอื่น', () => {
  assert.equal(plan([deal({ metadata: {} })], [quote()]).targets.length, 0);
  assert.equal(plan([deal({ metadata: null })], [quote()]).targets.length, 0);
  // ชี้ใบที่ FC เดินตามอยู่ ก็ยังไม่พอ — ต้องเป็นใบที่ "ลูกค้ารับ" เท่านั้น
  assert.equal(plan([deal({ metadata: {}, forecastSource: 'quotation', forecastQuotationId: 'Q1' })], [quote()]).targets.length, 0);
});

test('ดีลของใบสั่งขายย้อนหลัง (origin historical) ไม่มี FC ⇒ ไม่แตะ', () => {
  assert.equal(plan([deal({ origin: 'historical' })], [quote()]).targets.length, 0);
  assert.equal(plan([deal({ origin: undefined })], [quote()]).targets.length, 1, 'ดีลเก่าที่ยังไม่มีธง origin ยังเป็นดีล pipeline');
});

test('ใบที่ชี้ไว้หาไม่เจอ = รายงาน ไม่ใช่เขียนศูนย์ทับ', () => {
  const { targets, missingQuotes } = plan([deal({ metadata: { acceptedQuotationId: 'หาย' } })], [quote()]);
  assert.equal(targets.length, 0, 'ห้ามตั้งยอดเป็น 0 เพราะหาใบไม่เจอ');
  assert.equal(missingQuotes.length, 1);
  assert.equal(missingQuotes[0].acceptedId, 'หาย');
  assert.equal(missingQuotes[0].deal.code, 'DL-26090001');
});

test('id ที่เป็นตัวเลขจาก jsonb กับคอลัมน์ text ต้องเจอกัน', () => {
  const { targets } = plan([deal({ metadata: { acceptedQuotationId: 7 } })], [quote({ id: '7' })]);
  assert.equal(targets.length, 1, 'คีย์ทะเบียนใบต้องเทียบแบบสตริง');
});

test('ค่าที่เขียน = สี่ช่องเท่านั้น · ไม่มี stage / wonValue / metadata', () => {
  const [target] = plan([deal()], [quote()]).targets;
  const patch = dealValueBackfillPatch(target);
  assert.deepEqual(Object.keys(patch).sort(), [...BACKFILL_FIELDS].sort());
  for (const banned of ['stage', 'wonValue', 'metadata', 'probability', 'confirmedAt']) {
    assert.equal(banned in patch, false, `${banned} ปลุกทริกเกอร์ Actual`);
  }
  assert.equal(patch.projectValue, 100000);
  assert.equal(patch.forecastSource, 'quotation');
  assert.equal(patch.forecastQuotationId, 'Q1');
});

test('เลขที่ AE กรอกมือถูกเก็บไว้ก่อนถูกทับ — ดีลที่ยังไม่ได้เดินตามเลขกรอก ไม่ถูกยัดเลขใส่', () => {
  const [manual] = plan([deal({ forecastSource: 'manual', projectValue: 36000, forecastManualValue: 0 })], [quote()]).targets;
  assert.equal(dealValueBackfillPatch(manual).forecastManualValue, 36000, 'ยอดดีลตอนนี้คือเลขกรอก ⇒ ย้ายลงช่องของมัน');

  // ⚠️ กับดัก: คอลัมน์ NOT NULL DEFAULT 0 ⇒ `?? ` / COALESCE ไม่มีวันถอย ต้องตัดสินด้วย forecastSource
  const [quotation] = plan([deal({ forecastSource: 'quotation', projectValue: 36000, forecastManualValue: 12345 })], [quote()]).targets;
  assert.equal(dealValueBackfillPatch(quotation).forecastManualValue, 12345, 'ดีลที่ไม่ได้เดินตามเลขกรอก = ค่าเดิมอยู่ครบ');
  const [none] = plan([deal({ forecastSource: 'quotation', projectValue: 36000, forecastManualValue: null })], [quote()]).targets;
  assert.equal(dealValueBackfillPatch(none).forecastManualValue, 0, 'null ต้องกลายเป็น 0 — คอลัมน์รับ null ไม่ได้');
});

/* ── สคริปต์ที่เขียนจริง ─────────────────────────────────────────────────── */
const SCRIPT = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/backfill-deal-fc-from-accepted-quote.mjs'),
  'utf8',
);

test('สคริปต์ใช้แผนจาก lib — ไม่เขียนสูตรยอด/กติกาคัดดีลซ้ำเอง', () => {
  assert.match(SCRIPT, /planDealValueBackfill\(deals, quoteIndexOf\(quotes\)\)/);
  assert.match(SCRIPT, /dealValueBackfillPatch\(t\)/);
  assert.doesNotMatch(SCRIPT, /totalAmount\s*-\s*/, 'สูตรยอดก่อน VAT มีบ้านเดียวคือ quotationWonAmount');
  assert.doesNotMatch(SCRIPT, /origin\s*!==/, "ตัวตัดสินดีลย้อนหลังคือ isKpiDeal — ห้ามเทียบ origin ด้วยมือ");
});

test('สคริปต์: ซ้อมเป็นค่าตั้งต้น · สำรองค่าเดิม · audit รายใบ · เขียนไม่ครบต้อง exit 1', () => {
  assert.match(SCRIPT, /const apply = process\.argv\.includes\('--apply'\);/);
  const beforeApply = SCRIPT.slice(0, SCRIPT.indexOf('if (!apply)'));
  assert.doesNotMatch(beforeApply, /\.update\(|\.insert\(/, 'ยังไม่ผ่านด่าน --apply ห้ามมีคำสั่งเขียน');
  assert.match(SCRIPT, /writeFileSync\(backupPath/, 'ต้องสำรองค่าเดิมลงไฟล์ก่อนเขียน');
  /* 🔴 ไฟล์สำรองมียอด FC รายดีลของลูกค้าจริง — ต้องตกนอกรีโป ไม่ใช่กลาง webapp/
     (ของเดิมเป็นชื่อไฟล์เปล่า ⇒ ลงใน cwd ⇒ `git add -A` รอบถัดไปดูดติดไปได้) */
  assert.match(SCRIPT, /path\.join\(homedir\(\), 'ss-team', 'archive', 'backfill'/, 'ที่เก็บตั้งต้นต้องอยู่นอกรีโป');
  assert.match(SCRIPT, /mkdirSync\(path\.dirname\(backupPath\), \{ recursive: true \}\);/, 'ต้องสร้างโฟลเดอร์ให้ก่อนเขียน');
  assert.match(SCRIPT, /--out=/, 'ต้องเลือกที่เก็บเองได้');
  assert.doesNotMatch(
    SCRIPT,
    /const backupPath = `backfill-deal-fc-/,
    'ห้ามกลับไปเขียนชื่อไฟล์เปล่าลง cwd',
  );
  assert.match(SCRIPT, /from\('audit_logs'\)\.insert\(/);
  assert.match(SCRIPT, /entityType: 'sales_deal',/);
  assert.match(SCRIPT, /changedKeys: BACKFILL_FIELDS,/);
  assert.match(SCRIPT, /if \(failed\.length\) \{[\s\S]*process\.exit\(1\);/);
});
