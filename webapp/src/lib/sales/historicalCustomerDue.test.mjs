// ── ชิป "ตามรอบของลูกค้า" ในหน้าต่างแบ่งงวดของวิซาร์ดใบย้อนหลังขั้น ③ (กำหนดวางบิล รอบสอง ข้อ 6 · มติ 26/09) ──
//
// ⭐ ตัวแปลง `historicalCustomerDueOption` (รอบวางบิลของลูกค้า → ชิป) + `historicalEffectiveDueRule`
//   (ชิป → กติกาเดิมของตัวคิด) เป็นฟังก์ชันบริสุทธิ์ ⇒ เทสต์ตรง ๆ · ส่วน JSX/เส้น API ใช้ยาม source ท้ายไฟล์
// 🔴 สิ่งที่ต้องไม่พัง:
//   · ชิปมีเฉพาะเงินเข้ารายเดือน **เดือนเดียวกับวางบิล** · วันที่ 31 = สิ้นเดือน · ป้ายบอกว่าเป็นวันเงินเข้า
//   · เครดิต n วัน / เงินเข้าเดือนถัดไป (monthOffset 1) = ประโยคอย่างเดียว + เหตุ (ไม่มีขีดยาวในเหตุ)
//     🐞 รีวิว 26/09: ชิปของ offset 1 ให้วันครบกำหนดเร็วไปหนึ่งเดือนทุกงวด (ก่อนวันวางบิลของงวดนั้นเอง)
//   · **ไม่เลือกให้** — dueRule เริ่ม null เสมอ (ยามเดิมใน historicalRegisterUi ตรึงไว้แล้ว + ข้อท้ายไฟล์นี้)
//   · รอบหายไประหว่างเลือกชิปไว้ = กลับเป็น "ยังไม่เลือก" ไม่เดาวันต่อ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HISTORICAL_CUSTOMER_DUE_RULE, HISTORICAL_DUE_RULES, HISTORICAL_TERMS_LOAD_FAILED,
  historicalCustomerDueOption, historicalCustomerTermsError, historicalEffectiveDueRule, historicalSplitPreview,
} from './historicalIntakeForm.js';
import { billingRounds, describeBillingRule } from './billingRule.js';
import { createFormTermsState } from './salesOrderCreateInstallments.js';

const monthly = (payDay, { billDay = 5, monthOffset = 0 } = {}) => ({
  billing: { mode: 'monthly', day: billDay },
  payment: { mode: 'monthly', day: payDay, monthOffset },
});

test('ยังไม่ตั้งรอบ / รูปผิด = ไม่มีชิป ไม่มีประโยค', () => {
  for (const value of [null, undefined, {}, 'x', { billing: { mode: 'monthly', day: 40 }, payment: { mode: 'credit', days: 30 } }]) {
    assert.deepEqual(historicalCustomerDueOption(value), { hint: '', option: null, note: null }, JSON.stringify(value));
  }
});

test('เงินเข้ารายเดือนวันที่ n → ชิป "ตามรอบของลูกค้า (เงินเข้าทุกวันที่ n)" = กติกา day n', () => {
  const rule = monthly(25);
  const due = historicalCustomerDueOption(rule);
  assert.equal(due.hint, describeBillingRule(rule));
  assert.equal(due.hint, 'วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25');
  assert.deepEqual(due.option, {
    value: HISTORICAL_CUSTOMER_DUE_RULE, label: 'ตามรอบของลูกค้า (เงินเข้าทุกวันที่ 25)', dueRule: 'day', dueDay: '25',
  });
  assert.match(due.note, /วันที่ 25 แรกนับจากวันเริ่มของแต่ละงวด/);
});

test('เงินเข้าวันที่ 31 = สิ้นเดือน → กติกา monthEnd (ไม่ใช่ day 31)', () => {
  const due = historicalCustomerDueOption(monthly(31, { billDay: 25 }));
  assert.deepEqual(due.option, {
    value: HISTORICAL_CUSTOMER_DUE_RULE, label: 'ตามรอบของลูกค้า (เงินเข้าสิ้นเดือน)', dueRule: 'monthEnd', dueDay: '',
  });
  assert.match(due.hint, /เงินเข้าสิ้นเดือน/);
});

test('วางบิลได้ทุกวัน + เงินเข้ารายเดือนเดือนเดียวกัน = มีชิป (ชิปดูแค่วันเงินเข้า)', () => {
  const due = historicalCustomerDueOption({ billing: { mode: 'anyday' }, payment: { mode: 'monthly', day: 10, monthOffset: 0 } });
  assert.equal(due.option?.dueRule, 'day');
  assert.equal(due.option?.dueDay, '10');
  assert.equal(due.hint, 'วางบิลได้ทุกวัน · เงินเข้าทุกวันที่ 10');
});

test('ป้ายชิปบอกว่าเป็นวันเงินเข้า — ไม่ใช่วันวางบิล (ลูกค้า "วางบิล 5 · เงินเข้า 25")', () => {
  const due = historicalCustomerDueOption(monthly(25, { billDay: 5 }));
  assert.match(due.option.label, /เงินเข้าทุกวันที่ 25/);
  assert.doesNotMatch(due.option.label, /\(ทุกวันที่/);
});

test('"เดือนถัดไป" (monthOffset 1) = ไม่มีชิป พร้อมเหตุ · ประโยคเต็มยังบอกเดือนถัดไป', () => {
  const rule = monthly(10, { billDay: 25, monthOffset: 1 });
  const due = historicalCustomerDueOption(rule);
  assert.equal(due.option, null);
  assert.match(due.hint, /เงินเข้าทุกวันที่ 10 เดือนถัดไป/);
  assert.match(due.note, /^ไม่มีตัวเลือก "ตามรอบของลูกค้า" เพราะ/);
  assert.match(due.note, /เงินเข้าเดือนถัดจากเดือนที่วางบิล ซึ่งใบย้อนหลังไม่มีวันวางบิล/);
  assert.doesNotMatch(due.note, /—/);
  /* เหตุที่ต้องไม่มีชิป (ผลโพรบของรีวิว 26/09): "วันที่ 10 แรกนับจากวันเริ่มงวด" = 10/10 แต่ตัวคิดของลูกค้าเอง
     ได้ วางบิล 25/10 → เงินเข้า 10/11 — ชิปแบบเดิมเร็วไปหนึ่งเดือนและก่อนวันวางบิลของงวดนั้นเอง */
  assert.deepEqual(billingRounds(rule, '2026-10-01', 1), [{ billingDate: '2026-10-25', dueDate: '2026-11-10' }]);
  const naive = historicalSplitPreview({
    from: '2026-10-01', to: '2027-03-31', amount: 6000, period: '1', dueRule: 'day', dueDay: '10', todayIso: '2026-09-26',
  });
  assert.equal(naive.rows[0].dueDate, '2026-10-10');
  assert.ok(naive.rows[0].dueDate < billingRounds(rule, '2026-10-01', 1)[0].billingDate);
  /* ชิปหายไป ⇒ ค่าที่เคยเลือกไว้ (ถ้ามี) กลับเป็น "ยังไม่เลือก" ไม่เดาวันต่อ */
  assert.deepEqual(historicalEffectiveDueRule({ dueRule: HISTORICAL_CUSTOMER_DUE_RULE, customerOption: due.option }),
    { dueRule: null, dueDay: '' });
});

test('วางบิลได้ทุกวัน + เงินเข้าเดือนถัดไป = ไม่มีชิป พร้อมเหตุเดียวกัน', () => {
  const rule = { billing: { mode: 'anyday' }, payment: { mode: 'monthly', day: 10, monthOffset: 1 } };
  const due = historicalCustomerDueOption(rule);
  assert.equal(due.option, null);
  assert.equal(due.hint, describeBillingRule(rule));
  assert.match(due.hint, /เดือนถัดไป/);
  assert.match(due.note, /เงินเข้าเดือนถัดจากเดือนที่วางบิล ซึ่งใบย้อนหลังไม่มีวันวางบิล/);
  assert.doesNotMatch(due.note, /—/);
});

test('เดือนถัดไป + สิ้นเดือน ก็ไม่มีชิป', () => {
  assert.equal(historicalCustomerDueOption(monthly(31, { billDay: 25, monthOffset: 1 })).option, null);
});

test('เครดิต n วัน (รวม 0 วัน · วางบิลได้ทุกวัน) = ประโยคอย่างเดียว ไม่มีชิป พร้อมเหตุ', () => {
  for (const rule of [
    { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'credit', days: 30 } },
    { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 0 } },
  ]) {
    const due = historicalCustomerDueOption(rule);
    assert.equal(due.option, null);
    assert.equal(due.hint, describeBillingRule(rule));
    assert.ok(due.hint);
    assert.match(due.note, /^ไม่มีตัวเลือก "ตามรอบของลูกค้า" เพราะ/);
    assert.match(due.note, /นับจากวันวางบิล ซึ่งใบย้อนหลังไม่มี/);
    /* ประโยครอบเองมี " · " อยู่แล้ว — เหตุเคยต่อท้ายด้วยขีดยาวจนขึ้นขีดยาวสองตัวในบรรทัดเดียว (รีวิว 26/09) */
    assert.doesNotMatch(due.note, /—/);
  }
});

test('historicalCustomerTermsError: ติดเหตุจากเซิร์ฟเวอร์ · ไม่ซ้ำคำ · บอกว่ายังเลือกเองได้', () => {
  const tail = ' · เลือกวันครบกำหนดเองได้ตามเดิม';
  for (const detail of [null, undefined, '', '  ', HISTORICAL_TERMS_LOAD_FAILED]) {
    assert.equal(historicalCustomerTermsError(detail), `${HISTORICAL_TERMS_LOAD_FAILED}${tail}`, String(detail));
  }
  /* 500 ของเส้น ?billingTermsOf ขึ้นต้นด้วยชื่อเรื่องอยู่แล้ว ⇒ โชว์ตรง ไม่ห่อซ้ำ */
  assert.equal(historicalCustomerTermsError('อ่านรอบวางบิลของลูกค้าไม่สำเร็จ: permission denied'),
    `อ่านรอบวางบิลของลูกค้าไม่สำเร็จ: permission denied${tail}`);
  /* เหตุอื่น (เน็ตหลุด / 400) = ต่อท้ายในวงเล็บ ให้ภาพหน้าจอแยกเหตุได้ */
  assert.equal(historicalCustomerTermsError('ต้องระบุลูกค้า (billingTermsOf)'),
    `${HISTORICAL_TERMS_LOAD_FAILED} (ต้องระบุลูกค้า (billingTermsOf))${tail}`);
});

test('ค่าชิปไม่ชนตัวเลือกเดิม — ตัวเลือกเดิมอยู่ครบ', () => {
  assert.ok(!HISTORICAL_DUE_RULES.some((rule) => rule.value === HISTORICAL_CUSTOMER_DUE_RULE));
  assert.deepEqual(HISTORICAL_DUE_RULES.map((rule) => rule.value), ['start', 'monthEnd', 'day', 'manual']);
});

test('historicalEffectiveDueRule: ตัวเลือกอื่นผ่านตรง · ชิปลูกค้าแปลง · ชิปหาย = ยังไม่เลือก', () => {
  const option = historicalCustomerDueOption(monthly(25)).option;
  assert.deepEqual(historicalEffectiveDueRule({ dueRule: 'day', dueDay: '7', customerOption: option }), { dueRule: 'day', dueDay: '7' });
  assert.deepEqual(historicalEffectiveDueRule({ dueRule: 'start', dueDay: '', customerOption: option }), { dueRule: 'start', dueDay: '' });
  assert.deepEqual(historicalEffectiveDueRule({ dueRule: null, dueDay: '', customerOption: option }), { dueRule: null, dueDay: '' });
  /* ช่องพิมพ์ของ "ทุกวันที่ …" ค้างค่าอื่นไว้ ต้องไม่ชนะวันของลูกค้า */
  assert.deepEqual(historicalEffectiveDueRule({ dueRule: HISTORICAL_CUSTOMER_DUE_RULE, dueDay: '7', customerOption: option }),
    { dueRule: 'day', dueDay: '25' });
  assert.deepEqual(historicalEffectiveDueRule({ dueRule: HISTORICAL_CUSTOMER_DUE_RULE, dueDay: '7', customerOption: null }),
    { dueRule: null, dueDay: '' });
});

test('ผลจริงในตัวอย่าง: ชิปลูกค้า = ผลเดียวกับเลือก "ทุกวันที่ 25" / "สิ้นเดือน" เอง', () => {
  const base = { from: '2026-10-01', to: '2027-03-31', amount: 6000, period: '1', todayIso: '2026-09-26' };
  const viaChip = (rule) => {
    const option = historicalCustomerDueOption(rule).option;
    return historicalSplitPreview({ ...base, ...historicalEffectiveDueRule({ dueRule: HISTORICAL_CUSTOMER_DUE_RULE, customerOption: option }) });
  };
  const day25 = viaChip(monthly(25));
  assert.equal(day25.blocked, null);
  assert.deepEqual(day25.rows.map((row) => row.dueDate),
    ['2026-10-25', '2026-11-25', '2026-12-25', '2027-01-25', '2027-02-25', '2027-03-25']);
  assert.deepEqual(day25, historicalSplitPreview({ ...base, dueRule: 'day', dueDay: '25' }));

  const monthEnd = viaChip(monthly(31, { billDay: 25 }));
  assert.deepEqual(monthEnd.rows.map((row) => row.dueDate),
    ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
  assert.deepEqual(monthEnd, historicalSplitPreview({ ...base, dueRule: 'monthEnd' }));

  /* ส่งค่าชิปดิบเข้าตัวคิดโดยไม่แปลง = ไม่มีวัน — ยืนยันว่าจอต้องผ่าน historicalEffectiveDueRule */
  const raw = historicalSplitPreview({ ...base, dueRule: HISTORICAL_CUSTOMER_DUE_RULE });
  assert.ok(raw.rows.every((row) => row.dueDate === ''));
});

test('รูปคำตอบของ ?billingTermsOf → createFormTermsState → rule ที่ชิปอ่าน', () => {
  const rule = monthly(25);
  const ready = createFormTermsState({ supported: true, billingRule: rule, creditTerms: '30 วัน', arCode: 'AR-267' });
  assert.equal(ready.status, 'ready');
  assert.deepEqual(historicalCustomerDueOption(ready.rule).option?.dueDay, '25');
  const unsupported = createFormTermsState({ supported: false, billingRule: null, creditTerms: '', arCode: '' });
  assert.equal(historicalCustomerDueOption(unsupported.rule).option, null);
});

// ── ยาม source (รีโปไม่มีตัวเรนเดอร์ React) ──────────────────────────────────────────
const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ตัวอย่างในคอมเมนต์ต้องไม่ทำให้ยามผ่านเอง */
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('ยาม: หน้าต่างแบ่งงวดส่งกติกาที่แปลงแล้วเข้าตัวคิด · ชิปลูกค้าเป็นตัวเลือกเพิ่ม ไม่ใช่ค่าตั้งต้น', () => {
  const split = code('components/salesPlanning/historicalWizard/HistoricalSplitModal.js');
  assert.match(split, /const \[dueRule, setDueRule\] = useState\(null\);/, 'ไม่เลือกให้');
  assert.match(split, /historicalEffectiveDueRule\(\{ dueRule, dueDay, customerOption: customerDue\.option \}\)/);
  assert.match(split, /dueRule: effectiveDue\.dueRule, dueDay: effectiveDue\.dueDay/);
  assert.doesNotMatch(split, /historicalSplitPreview\(\{[^}]*[{,]\s*dueRule\s*[,}]/, 'ห้ามส่ง dueRule ดิบ (shorthand) เข้าตัวคิด');
  assert.match(split, /\.\.\.HISTORICAL_DUE_RULES\.map\(/, 'ตัวเลือกเดิมครบทุกตัวเสมอ');
  assert.doesNotMatch(split, /setDueRule\(\s*HISTORICAL_CUSTOMER_DUE_RULE|useState\(HISTORICAL_CUSTOMER_DUE_RULE/, 'ห้ามเลือกชิปลูกค้าให้');
  assert.match(split, /customerTerms\?\.status === "error"/, 'โหลดรอบไม่ขึ้น = บอกเหตุ ไม่ใช่เงียบ');
  assert.match(split, /historicalCustomerTermsError\(customerTerms\.detail\)/, 'บรรทัดโหลดไม่ขึ้นต้องติดเหตุจากเซิร์ฟเวอร์');
  assert.doesNotMatch(split, /` — \$\{customerDue\.note\}`/, 'เหตุที่ไม่มีชิปอยู่บรรทัดของตัวเอง ไม่ต่อท้ายประโยครอบด้วยขีดยาว');
});

test('ยาม: วิซาร์ดอ่านรอบแบบแคบรายเดียว — ลิสต์ picker ไม่แบกคอลัมน์รอบวางบิล', () => {
  const wizard = code('components/salesPlanning/historicalWizard/HistoricalOrderWizard.js');
  assert.match(wizard, /apiJson\(`\/api\/customers\?billingTermsOf=\$\{encodeURIComponent\(customerId\)\}`/);
  assert.match(wizard, /setBillingTerms\(createFormTermsState\(data\)\)/);
  assert.match(wizard, /fallbackError: HISTORICAL_TERMS_LOAD_FAILED/);
  assert.match(wizard, /customerTerms=\{billingTerms\}/);
  assert.match(code('components/salesPlanning/historicalWizard/WizardMoneyStep.js'), /customerTerms=\{customerTerms\}/);

  const route = code('app/api/customers/route.js');
  const picker = route.match(/const CUSTOMER_PICKER_COLUMNS = \[([\s\S]*?)\]\.join/);
  assert.ok(picker, 'หา CUSTOMER_PICKER_COLUMNS ไม่เจอ');
  assert.doesNotMatch(picker[1], /billingRule/, 'ทุก picker จะแบกคอลัมน์ที่มีจอเดียวใช้');
  assert.match(route, /if \(params\.has\('billingTermsOf'\)\) \{[\s\S]*?loadCreateFormBillingTerms\(supabase, billingTermsOf\)/);
});
