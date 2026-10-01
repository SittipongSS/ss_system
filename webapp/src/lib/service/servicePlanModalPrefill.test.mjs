// ── โมดัลรอบบริการ: ค่าเติมจากแถว "รอตั้งรอบ" + แถบบริบท + ชิป "จำนวนรอบบริการ" (PR-C · C6 · คำตามมติ 29/09) ─────────────────────
//
// ตัวโมดัลเป็น JSX (node รันตรงไม่ได้) ⇒ ยามรูปโค้ด + ยามสัญญาระหว่างโมดัลกับตัวสร้างค่าเติม (C1 `planRowFacts`)
// สามเรื่องที่พังเงียบถ้าไม่มียาม:
//   1. ความถี่ต้องไม่ถูกเติมจากแถวเงียบ ๆ — ค่าเริ่มเดียวคือ "ทุกเดือน วันที่ของวันเริ่มรอบ" (คำตอบเจ้าของข้อ 3 · 29/09 · mig 0397
//      แทน C-D6 "ค่าเริ่ม 30 วัน") · ข้อเสนอของแถวเป็นชิปที่ต้องกด "ใช้" เอง · หกช่องความถี่ประกอบที่ servicePlanForm.js ที่เดียว
//   2. หน้าคิวโหลดใหม่ทุกครั้งที่กลับมาที่แท็บ (useRevalidateOnFocus) ⇒ object ใหม่ทุกรอบ
//      effect ที่ล้างฟอร์มต้องผูกกับค่า primitive เท่านั้น ไม่งั้นสิ่งที่ TS พิมพ์ไว้หายกลางทาง (critique M6)
//   3. ชื่อช่องที่โมดัลอ่าน (`context.*` / `prefill.*`) ต้องตรงกับที่ C1 ส่งมาเป๊ะ — สะกดผิดหนึ่งตัว = แถบว่างเงียบ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTRACT_MISSING_WARNING, planRowFacts, planSuggestionLabel, planWindow } from './intakePlanFacts.js';
import { planQueue } from './intake.js';
import { suggestEveryDays } from './rounds.js';
import { defaultCadenceFor, sameCadence, suggestCadence } from './cadence.js';
import { EMPTY_PLAN_FORM, planFormCadence } from '../../components/service/servicePlanForm.js';
import { ORIGIN_PIPELINE } from '../sales/historicalOrders.js';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const noComments = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const RAW = read('components/service/ServicePlanModal.js');
const MODAL = noComments(RAW);
const CSS_PATH = 'components/service/ServicePlanModal.module.css';
const SHARED_CSS = 'components/service/ServiceSiteModal.module.css';

/** ตัดช่วงโค้ดจาก `start` ถึง `end` ตัวแรกหลังจากนั้น (รวม end) · หาไม่เจอ = ตกเทสต์ทันที ไม่ใช่ได้สตริงว่าง */
function between(src, start, end) {
  const from = src.indexOf(start);
  assert.ok(from >= 0, `หา "${start}" ไม่เจอ`);
  const to = src.indexOf(end, from + start.length);
  assert.ok(to >= 0, `หา "${end}" หลัง "${start}" ไม่เจอ`);
  return src.slice(from, to + end.length);
}

/** `<label>` ที่มีป้าย `labelText` — ตัดถึง `</label>` ของมัน */
function labelBlock(src, labelText) {
  const at = src.indexOf(`<span>${labelText}</span>`);
  assert.ok(at >= 0, `หาช่อง "${labelText}" ไม่เจอ`);
  const open = src.lastIndexOf('<label', at);
  const close = src.indexOf('</label>', at);
  assert.ok(open >= 0 && close > at, `ช่อง "${labelText}" ต้องอยู่ใน <label>`);
  return src.slice(open, close + '</label>'.length);
}

/* ── ใบจริง SO-26090247-0 (ตัวเดียวกับ intakePlanFacts.test) ─────────────────────────────── */
const SITE = { id: 'SVS-muar3j8841c30', code: 'ST-0364-01-BKK-1120', name: 'Asan Service', customerId: 'CUS-1' };
const OFFICE = { id: 'SZN-muar3jcs5d98', siteId: SITE.id, code: 'ZN-1120-10210', name: 'Office' };
const ORDER = {
  id: 'SOR-mum2x0ms1fti', orderNumber: 'SO-26090247-0', status: 'approved', supersededById: null,
  origin: ORIGIN_PIPELINE, serviceTermsOpenedAt: '2026-09-29T03:00:00Z',
  servicePeriodFrom: '2026-10-22', servicePeriodTo: '2027-10-21', serviceContractId: null, totalAmount: 12000,
};
const LINES = [
  { id: 'SOL-1', salesOrderId: ORDER.id, serviceRounds: 1, fgCode: 'FG-364-02-001-1061' },
  { id: 'SOL-2', salesOrderId: ORDER.id, serviceRounds: 1, fgCode: 'FG-364-02-001-1061' },
];
const TERMS = LINES.map((line, i) => ({
  id: `SZT-S${i + 1}`, zoneId: OFFICE.id, salesOrderId: ORDER.id, salesOrderLineId: line.id, fgCode: line.fgCode,
  description: 'บริการน้ำหอมรายเดือน', packageQty: 2, unit: 'แพ็ค', standardMlPerMonth: null,
}));

function liveFacts(todayIso = '2026-09-29', plans = []) {
  const linesById = new Map(LINES.map((l) => [l.id, l]));
  const [row] = planQueue({
    zones: [OFFICE], terms: TERMS, plans, sites: [SITE], ordersById: new Map([[ORDER.id, ORDER]]), linesById, todayIso,
  });
  assert.ok(row, 'ฟิกซ์เจอร์ต้องได้แถว');
  return planRowFacts(row, { order: ORDER, contract: null, linesById, todayIso });
}

/* ═══ สัญญาระหว่างโมดัลกับ C1 (§4.5) ═══════════════════════════════════════════════════════ */

test('props เสริมสามตัวเป็นตัวเลือก (ไม่ส่ง = ไม่มีแถบบริบท/ค่าเติม/คำเตือนวันเข้าไซต์) · ผู้เรียกเดิมไม่ต้องแก้', () => {
  assert.match(MODAL, /salesOrders = null, context = null, prefill = null, accessDays = null, onClose, onSave,/);
});

test('ชื่อช่องที่โมดัลอ่านจาก context / prefill = ชื่อที่ planRowFacts ส่งมาเป๊ะ (สะกดผิด = แถบว่างเงียบ)', () => {
  const facts = liveFacts();
  const readKeys = (name) => [...new Set([...MODAL.matchAll(new RegExp(`\\b${name}\\??\\.(\\w+)`, 'g'))].map((m) => m[1]))].sort();
  /* review 29/09: `existingPlanWarning` มีเมื่อไซต์มีรอบอื่นเดินอยู่เท่านั้น ⇒ รวมคีย์ของแถวที่มีรอบของใบอื่นด้วย */
  const warned = liveFacts('2026-09-29', [{ id: 'PL-X', siteId: SITE.id, salesOrderId: 'SO-OTHER', isActive: true }]);
  assert.ok(warned.context.existingPlanWarning, 'ฟิกซ์เจอร์รอบของใบอื่นต้องได้คำเตือน');
  assert.deepEqual(readKeys('context'), Object.keys({ ...facts.context, ...warned.context }).sort(), 'โมดัลต้องอ่าน context ครบทุกช่องและไม่อ่านช่องที่ไม่มี');
  assert.deepEqual(readKeys('prefill'), Object.keys(facts.prefill).sort(), 'โมดัลต้องอ่าน prefill ครบทุกช่องและไม่อ่านช่องที่ไม่มี');
});

test('⭐ ตัวเลขของใบจริง SO-26090247-0 ที่โมดัลจะเห็น: เริ่ม 22/10/2026 · ชิป "จำนวนรอบบริการ 1 รอบ → ทุก 12 เดือน วันที่ 22"', () => {
  const { prefill, context } = liveFacts();
  assert.deepEqual(prefill, { kind: 'refill', startDate: '2026-10-22', endDate: '2027-10-21', startHint: 'ตามวันเริ่มช่วงบริการของใบ' });
  assert.equal(context.contractWarning, true);
  // ตัวเสนอของโมดัล = ตัวเดียวกับคอลัมน์ "รอบที่แนะนำ" ของแถว (suggestCadence) — ความถี่ตัวแรกที่ได้นัดเท่าจำนวนรอบบริการพอดี
  const s = suggestCadence({ startDate: prefill.startDate, endDate: prefill.endDate, rounds: context.roundsSold });
  assert.deepEqual(s, {
    cadenceKind: 'monthly', everyDays: null, cadenceEvery: 12, cadenceWeekday: null, cadenceMonthDay: 22, cadenceMonthDayTo: null,
    visits: 1, exact: true, clamped: false,
  });
  assert.equal(planSuggestionLabel(context.roundsSold, s), 'จำนวนรอบบริการ 1 รอบ → ทุก 12 เดือน วันที่ 22');
  // ฟอร์มที่เปิดจากแถวนี้ = ค่าเริ่ม "ทุกเดือน วันที่ 22" ≠ ข้อเสนอ ⇒ ชิปต้องขึ้นตอนเปิด (ไม่ใช่เติมให้เงียบ ๆ)
  const opened = planFormCadence({ ...EMPTY_PLAN_FORM, startDate: prefill.startDate, endDate: prefill.endDate });
  assert.deepEqual(opened, defaultCadenceFor('2026-10-22'));
  assert.equal(sameCadence(s, opened), false);
  // แถบตัดเป็นท่อนตาม " · " — ต่อกลับต้องได้สตริงเดิมทุกตัวอักษร (ไม่มีท่อนหาย)
  const parts = context.strip.split(' · ');
  assert.equal(parts[0], 'งานนี้');
  assert.equal(parts.map((part, i) => (i < parts.length - 1 ? `${part} ·` : part)).join(' '), context.strip);
});

test('ตัวอย่างใน mock (12 รอบ ปีเต็ม) = ทุกเดือน ตรงกับค่าเริ่ม ⇒ ไม่มีชิป · ไม่พอดี/โดนเพดานบอกว่าได้ราวกี่นัด (C-D7)', () => {
  const range = { startDate: '2026-10-01', endDate: '2027-09-30' };
  const twelve = suggestCadence({ ...range, rounds: 12 });
  assert.equal(planSuggestionLabel(12, twelve), 'จำนวนรอบบริการ 12 รอบ → ทุกเดือน วันที่ 1');
  assert.equal(sameCadence(twelve, planFormCadence({ ...EMPTY_PLAN_FORM, ...range })), true, 'ค่าเริ่มตรงกับข้อเสนอแล้ว = ไม่มีอะไรให้เสนอ');
  const so247 = { startDate: '2026-10-22', endDate: '2027-10-21' };
  assert.equal(planSuggestionLabel(26, suggestCadence({ ...so247, rounds: 26 })), 'จำนวนรอบบริการ 26 รอบ → ทุก 2 สัปดาห์ วันศุกร์');
  assert.equal(planSuggestionLabel(24, suggestCadence({ ...so247, rounds: 24 })), 'จำนวนรอบบริการ 24 รอบ → ทุก 15 วัน (ได้ราว 25 นัด)');
  const clamped = suggestCadence({ startDate: '2026-01-01', endDate: '2028-01-01', rounds: 2 });
  assert.equal(planSuggestionLabel(2, clamped), 'จำนวนรอบบริการ 2 รอบ → ทุก 365 วัน (สูงสุดที่ตั้งได้ · ได้ราว 3 นัด)');
  // รูปเดิมของ suggestEveryDays ยังพิมพ์ได้ (ผู้เรียกเก่า)
  assert.equal(planSuggestionLabel(12, suggestEveryDays({ ...range, rounds: 12 })), 'จำนวนรอบบริการ 12 รอบ → ทุก 33 วัน');
});

test('ช่วงเริ่มไปแล้ว = เริ่มวันนี้พร้อมคำบอก · ช่วงจบแล้ว = ไม่มีค่าเติม (โมดัลเริ่มว่างเหมือนเดิม)', () => {
  const late = liveFacts('2026-12-01');
  assert.equal(late.prefill.startDate, '2026-12-01');
  assert.equal(late.prefill.startHint, 'ช่วงบริการเริ่ม 22/10/2026 ไปแล้ว — เริ่มวันนี้');
  assert.equal(planWindow({ from: '2026-10-22', to: '2027-10-21' }, '2027-10-22'), null);
  const ended = liveFacts('2027-10-22');
  assert.equal(ended.prefill, null);
  assert.match(ended.context.strip, /ช่วงบริการจบแล้ว 21\/10\/2027$/);
});

/* ═══ ห้ามล้างฟอร์มกลางทาง (critique M6) + เติมเฉพาะโหมดสร้าง ═════════════════════════════════ */

test('effect ล้างฟอร์มผูกกับ primitive ของ prefill เท่านั้น — ไม่ใช่ object prefill/context', () => {
  const effect = between(MODAL, 'useEffect(() => {\n    if (!open) return;', ']);');
  const deps = effect.slice(effect.lastIndexOf('}, [') + 3);
  assert.equal(deps, '[open, plan, salesOrderId, prefill?.kind, prefill?.startDate, prefill?.endDate]);');
  assert.doesNotMatch(deps, /\bcontext\b/);
  assert.doesNotMatch(deps, /\bprefill\s*[,\]]/, 'object prefill ทั้งก้อนใน deps = โหลดใหม่ตอนกลับมาที่แท็บแล้วฟอร์มถูกล้าง');
  assert.doesNotMatch(effect, /\bcontext\b/, 'context เป็นของแสดงผล ไม่ใช่ค่าเริ่มของฟอร์ม');
});

test('ค่าเติมใช้เฉพาะโหมดสร้าง (!plan) · โหมดแก้อ่านจากรอบเดิมอย่างเดียว', () => {
  const effect = between(MODAL, 'useEffect(() => {\n    if (!open) return;', ']);');
  // โหมดแก้ = ตัวโหลดของ servicePlanForm ตัวเดียว (ช่องของรอบ + ความถี่ของรอบเดิม · แถวก่อน mig 0397 = ทุก N วัน)
  assert.match(effect, /setForm\(plan\s*\? planFormFromPlan\(plan\)\s*: \{/);
  const editBranch = between(effect, 'setForm(plan', ': {');
  assert.doesNotMatch(editBranch, /prefill/, 'แก้รอบเดิมต้องไม่ถูกทับด้วยวันที่จากใบ');
  const createBranch = effect.slice(effect.indexOf('...EMPTY_PLAN_FORM'));
  assert.match(createBranch, /salesOrderId: salesOrderId \|\| "",/);
  assert.match(createBranch, /kind: PLAN_KINDS\.includes\(prefill\?\.kind\) \? prefill\.kind : EMPTY_PLAN_FORM\.kind,/);
  assert.match(createBranch, /startDate: prefill\?\.startDate \|\| "",/);
  assert.match(createBranch, /endDate: prefill\?\.endDate \|\| "",/);
  assert.doesNotMatch(createBranch, /everyDays|cadence|monthDay|monthEvery|weekday|weekEvery|dayMode/,
    'ความถี่ไม่เติมจากแถว — ค่าเริ่มมาจาก EMPTY_PLAN_FORM ("ทุกเดือน" ตามวันเริ่มรอบ) เท่านั้น');
});

test('🔴 ความถี่ไม่มีค่าเริ่มเงียบในโมดัล: ไม่มี 30 · ไม่มีปุ่มลัด · หกช่องประกอบที่ servicePlanForm.js ที่เดียว', () => {
  assert.doesNotMatch(MODAL, /EVERY_PRESETS|preset\.days/, 'ปุ่มลัด "ทุกเดือน = 30 วัน" คือต้นเหตุ 13 นัดต่อปี — ถอดแล้ว');
  assert.doesNotMatch(MODAL, /everyDays: 30|\?\? 30\b|everyDays: Number\(/);
  assert.doesNotMatch(MODAL, /cadenceEvery|cadenceWeekday|cadenceMonthDay|cadenceMonthDayTo/, 'ชื่อคอลัมน์ความถี่ไม่ถูกประกอบในโมดัล');
  // everyDays ในโมดัล = ช่องพิมพ์เองช่องเดียว (อ่านค่า + เขียนค่า)
  assert.deepEqual([...MODAL.matchAll(/\beveryDays\b/g)].length, 2);
  assert.match(MODAL, /value=\{form\.everyDays\} onChange=\{change\("everyDays"\)\}/);
  // payload: ช่องของรอบ + siteId + หกช่องความถี่จากตัวช่วย + ใบสั่งขาย (ส่งทุกครั้ง)
  assert.match(MODAL, /const payload = \{\s*\.\.\.planFormFields\(form\),\s*siteId,\s*\.\.\.planFormCadence\(form\),\s*salesOrderId: form\.salesOrderId \|\| null,\s*\};/);
  assert.doesNotMatch(MODAL, /\.\.\.form,/, 'ห้ามกระจายฟอร์มทั้งก้อนลง payload — ช่องร่างของจอ (dayMode · monthEvery …) ไม่ใช่ช่องของรอบ');
  // ตัวตรวจตัวเดียวกับ API ก่อน แล้วค่อยด่านของจอ (ช่วงวันที่ยังไม่ครบ)
  assert.match(MODAL, /const invalid = normalizePlanInput\(payload\)\.error \|\| planFormBlocker\(form\);/);
});

test('🔴 คนเขียนฟอร์มมีแค่: effect เปิดโมดัล · ช่องกรอก · แผ่น/ชิป/ตารางวันของความถี่ · ปุ่ม "ใช้" ของชิป · เจ้าหน้าที่', () => {
  const writers = [...MODAL.matchAll(/setForm\(\(prev\) => ([^\n]+)/g)].map((m) => m[1].trim()).sort();
  assert.deepEqual(writers, [
    '({ ...prev, [field]: value }));',                                                    // ช่องกรอกทั่วไป (change)
    '({ ...prev, assigneeId: id, assigneeName: tech?.name || "" }));',                     // เจ้าหน้าที่ประจำรอบ
    '({ ...prev, cadenceKind }));',                                                        // แผ่นชนิดความถี่
    '({ ...prev, endDate: iso }))} />',                                                    // วันสิ้นสุด
    '({ ...prev, monthEvery }))}',                                                         // ทุก n เดือน
    '({ ...prev, startDate: iso }))} />',                                                  // วันเริ่ม
    '({ ...prev, weekEvery }))}',                                                          // ทุก n สัปดาห์
    '({ ...prev, weekday }));',                                                            // วันของสัปดาห์
    '(prev.dayMode === "range" ? pickRangeDay(prev, day) : pickSingleDay(prev, day)))}',   // ตารางวัน
    'applySuggestion(prev, suggestion))}>{SUGGESTION_USE_LABEL}</Button>',                 // ปุ่ม "ใช้" ของชิป
    'setDayMode(prev, mode))}',                                                            // วันเดียว / ช่วงวัน
  ].sort());
  assert.equal((MODAL.match(/\bsetForm\(/g) || []).length, writers.length + 1, 'นอกจากนี้มีแค่ setForm ของ effect ตอนเปิด');
});

/* ═══ ชิป "จำนวนรอบบริการ" ═════════════════════════════════════════════════════════════════════ */

test('ชิปคำนวณจากวันที่ในฟอร์ม + รอบของ context · ซ่อนเมื่อความถี่ตรงกับที่ตั้งอยู่แล้ว', () => {
  assert.match(MODAL, /import \{ PLAN_KINDS, PLAN_ROUNDS_SOLD_HINT, VISIT_KIND_LABELS, VISIT_STATUS_LABELS, normalizePlanInput \} from "@\/lib\/service\/rounds";/);
  assert.match(MODAL, /import \{ CADENCE_TEXT, cadenceText, holidayGapText, sameCadence, suggestCadence \} from "@\/lib\/service\/cadence";/);
  assert.match(MODAL, /const suggestion = context\?\.roundsSold && form\.startDate && form\.endDate\s*\? suggestCadence\(\{ startDate: form\.startDate, endDate: form\.endDate, rounds: context\.roundsSold \}\)\s*: null;/);
  assert.match(MODAL, /const suggestionLabel = suggestion && !sameCadence\(suggestion, summary\.cadence\)\s*\? planSuggestionLabel\(context\.roundsSold, suggestion\)\s*: null;/);
  assert.doesNotMatch(MODAL, /suggestEveryDays/, 'ตัวเสนอของโมดัลคือ suggestCadence ตัวเดียวกับแถวคิว');
});

test('ชิปขึ้นเฉพาะเมื่อเปิดจากแถวคิว (`context &&`) · อยู่ในกล่องความถี่ · ยังเป็น span + ปุ่ม "ใช้" · เขียนความถี่ทั้งก้อน', () => {
  const box = between(MODAL, '<fieldset', '</fieldset>');
  const chip = between(box, '{context && suggestionLabel && (', ')}\n');
  assert.match(chip, /<span className=\{planStyles\.suggestion\}>/);
  assert.match(chip, /\{suggestionLabel\}/);
  assert.match(chip, /aria-label=\{suggestionAriaLabel\(cadenceText\(suggestion\)\)\}/);
  assert.match(chip, /onClick=\{\(\) => setForm\(\(prev\) => applySuggestion\(prev, suggestion\)\)\}>\{SUGGESTION_USE_LABEL\}<\/Button>/);
  assert.match(MODAL, /const \{ useSuggestion: SUGGESTION_USE_LABEL, useSuggestionAria: suggestionAriaLabel \} = CADENCE_TEXT;/);
  assert.doesNotMatch(chip, /<(div|p|ul|ol|section)[\s>]|StatusNotice/, 'ชิปเป็น inline ล้วน (ทรงเดิมของ PR-C)');
  assert.equal((MODAL.match(/\{suggestionLabel\}/g) || []).length, 1, 'ชิปมีที่เดียว');
  assert.equal((MODAL.match(/planSuggestionLabel\(/g) || []).length, 1);
});

/* ═══ แถบบริบท · คำเตือนสัญญา · คำบอกวันเริ่ม · หัวโมดัล ═══════════════════════════════════════ */

test('หัวโมดัลรับ subtitle จาก context (ไม่มี context = ไม่มีบรรทัดรอง)', () => {
  // `dismissible={!confirm}` — ระหว่างถามยืนยันเปลี่ยนรอบ Esc ต้องปิดแค่กล่องยืนยัน ไม่พาฟอร์มที่กรอกไว้ปิดไปด้วย
  assert.match(MODAL, /<Modal open=\{open\} onClose=\{onClose\} title=\{editing \? "แก้รอบบริการ" : "สร้างรอบบริการ"\} subtitle=\{context\?\.subtitle\} size="md" dismissible=\{!confirm\}>/);
});

test('แถบ "งานนี้ · …" + คำเตือนสัญญา อยู่เหนือกริด ภายใต้ `context &&` · ข้อความเตือนมาจาก C1', () => {
  assert.match(MODAL, /import \{ CONTRACT_MISSING_WARNING, planSuggestionLabel \} from "@\/lib\/service\/intakePlanFacts";/);
  assert.match(MODAL, /import StatusNotice from "@\/components\/ui\/StatusNotice";/);
  const block = between(MODAL, '{context && (', '<div className={styles.grid}>');
  assert.match(block, /<p className=\{planStyles\.strip\}>\s*\{context\.strip\.split\(" · "\)\.map\(\(part, index, parts\) => \(/,
    'แถบแสดงสตริงของ C1 ครบทุกท่อน (ตัดตามตัวคั่นเพื่อขึ้นบรรทัดทีละท่อนเท่านั้น)');
  assert.match(block, /<span key=\{index\} className=\{planStyles\.stripPart\}>\{index < parts\.length - 1 \? `\$\{part\} ·` : part\}<\/span>/);
  assert.match(block, /\{context\.contractWarning && \(\s*<StatusNotice tone="warning">\{CONTRACT_MISSING_WARNING\}<\/StatusNotice>\s*\)\}/);
  assert.equal(CONTRACT_MISSING_WARNING, 'ใบนี้ยังไม่ผูกสัญญา — สร้างรอบและนัดได้ แต่นัดจะติดด่านสัญญาจนกว่าฝ่ายขาย (SA) ผูกสัญญาที่ครอบวันนัด');
  assert.doesNotMatch(MODAL, /ใบนี้ยังไม่ผูกสัญญา/, 'ห้ามพิมพ์คำเตือนซ้ำในโมดัล — แก้ที่เดียวต้องเปลี่ยนทุกจอ');
});

test('คำบอกวันเริ่มอยู่ในช่อง "เริ่มรอบ *" · ขึ้นเฉพาะตอนวันยังเป็นค่าที่เติมให้ · โหมดแก้ไม่ขึ้น', () => {
  const field = labelBlock(MODAL, 'เริ่มรอบ *');
  assert.match(field, /\{!editing && prefill\?\.startHint && form\.startDate === prefill\.startDate && \(\s*<small>\{prefill\.startHint\}<\/small>\s*\)\}/);
});

test('ไม่มีช่องเลือกใบเพิ่ม — ช่องเดิมยังขึ้นเฉพาะเมื่อผู้เรียกส่งตัวเลือกมา (C7 ส่ง null ⇒ ไม่มี "ไม่ผูกใบ")', () => {
  assert.equal((MODAL.match(/Array\.isArray\(salesOrders\) && \(/g) || []).length, 1);
  assert.equal((MODAL.match(/<Select\b/g) || []).length, 2, 'ชนิดงาน + ใบสั่งขาย เท่านั้น');
});

/* ═══ HTML + audit:ui ═══════════════════════════════════════════════════════════════════════ */

test('กฎ 20: ไม่มี StatusNotice ใน <label> หรือ <p> · ไม่มี style={{', () => {
  const stack = [];
  for (const m of MODAL.matchAll(/<(\/?)(label|p|StatusNotice)(?=[\s>])/g)) {
    const [, closing, tag] = m;
    if (tag === 'StatusNotice') {
      if (!closing) assert.deepEqual(stack, [], `StatusNotice ต้องไม่อยู่ใน <${stack.at(-1)}> (ตำแหน่ง ${m.index})`);
      continue;
    }
    if (closing) assert.equal(stack.pop(), tag, `ปิด </${tag}> ไม่ตรงคู่ (ตำแหน่ง ${m.index})`);
    else stack.push(tag);
  }
  assert.deepEqual(stack, [], 'แท็ก label/p เปิดค้าง');
  assert.doesNotMatch(RAW, /style=\{\{/);
});

test('คลาสใหม่อยู่ในโมดูลของโมดัลเอง · ไฟล์ร่วม ServiceSiteModal ไม่ถูกเพิ่มคลาสของงานนี้', () => {
  assert.match(MODAL, /import styles from "\.\/ServiceSiteModal\.module\.css";/);
  assert.match(MODAL, /import planStyles from "\.\/ServicePlanModal\.module\.css";/);
  const CSS = read(CSS_PATH);
  const used = [...new Set([...MODAL.matchAll(/planStyles\.(\w+)/g)].map((m) => m[1]))].sort();
  const declared = [...new Set([...CSS.matchAll(/^\.([a-zA-Z]\w*)\b/gm)].map((m) => m[1]))].sort();
  assert.deepEqual(declared, used, 'คลาสที่ประกาศ = คลาสที่ใช้ (ไม่มีคลาสกำพร้า ไม่มีคลาสที่หาไม่เจอ)');
  assert.deepEqual(used, [
    'cadence', 'cadenceBody', 'context', 'kept', 'note', 'row', 'rowLabel', 'strip', 'stripPart', 'suggestion', 'visits', 'warn', 'weekdays',
  ]);
  assert.doesNotMatch(CSS, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'สีต้องเป็นโทเคน');
  // ไฟล์ร่วมของฟอร์มไซต์: โมดัลใช้ได้แค่คลาสที่มีอยู่แล้ว และไม่มีคลาสของงานนี้ถูกเติมลงไป
  assert.doesNotMatch(read(SHARED_CSS), /\.(suggestion|strip|cadence|cadenceBody|row|rowLabel|weekdays|note|warn|visits|kept)\b/);
  const shared = [...new Set([...MODAL.matchAll(/\bstyles\.(\w+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(shared, ['check', 'field', 'grid', 'hint', 'wide']);
});
