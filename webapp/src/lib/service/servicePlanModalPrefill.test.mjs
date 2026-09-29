// ── โมดัลรอบบริการ: ค่าเติมจากแถว "รอตั้งรอบ" + แถบบริบท + ชิป "ตามที่ขาย" (PR-C · C6) ─────────────────────
//
// ตัวโมดัลเป็น JSX (node รันตรงไม่ได้) ⇒ ยามรูปโค้ด + ยามสัญญาระหว่างโมดัลกับตัวสร้างค่าเติม (C1 `planRowFacts`)
// สามเรื่องที่พังเงียบถ้าไม่มียาม:
//   1. ความถี่ต้องไม่ถูกเติมเงียบ ๆ (C-D6) — คนเดียวที่เขียน everyDays นอกจากช่อง/ปุ่มลัดคือปุ่ม "ใช้" ของชิป
//   2. หน้าคิวโหลดใหม่ทุกครั้งที่กลับมาที่แท็บ (useRevalidateOnFocus) ⇒ object ใหม่ทุกรอบ
//      effect ที่ล้างฟอร์มต้องผูกกับค่า primitive เท่านั้น ไม่งั้นสิ่งที่ TS พิมพ์ไว้หายกลางทาง (critique M6)
//   3. ชื่อช่องที่โมดัลอ่าน (`context.*` / `prefill.*`) ต้องตรงกับที่ C1 ส่งมาเป๊ะ — สะกดผิดหนึ่งตัว = แถบว่างเงียบ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTRACT_MISSING_WARNING, planRowFacts, planSuggestionLabel, planWindow } from './intakePlanFacts.js';
import { planQueue } from './intake.js';
import { suggestEveryDays } from './rounds.js';
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

test('props ใหม่สองตัวเป็นตัวเลือก (ไม่ส่ง = หน้าตาเดิมเป๊ะ) · ผู้เรียกเดิมไม่ต้องแก้', () => {
  assert.match(MODAL, /salesOrders = null, context = null, prefill = null, onClose, onSave,/);
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

test('⭐ ตัวเลขของใบจริง SO-26090247-0 ที่โมดัลจะเห็น: เริ่ม 22/10/2026 · ชิป "ตามที่ขาย 1 รอบ → ทุก 365 วัน"', () => {
  const { prefill, context } = liveFacts();
  assert.deepEqual(prefill, { kind: 'refill', startDate: '2026-10-22', endDate: '2027-10-21', startHint: 'ตามวันเริ่มช่วงบริการของใบ' });
  assert.equal(context.contractWarning, true);
  const s = suggestEveryDays({ startDate: prefill.startDate, endDate: prefill.endDate, rounds: context.roundsSold });
  assert.deepEqual(s, { everyDays: 365, visits: 1, clamped: false });
  assert.equal(planSuggestionLabel(context.roundsSold, s), 'ตามที่ขาย 1 รอบ → ทุก 365 วัน');
  assert.notEqual(s.everyDays, 30, 'ค่าเริ่ม 30 ≠ ข้อเสนอ ⇒ ชิปต้องขึ้นตอนเปิด (ไม่ใช่เติมให้เงียบ ๆ)');
  // แถบตัดเป็นท่อนตาม " · " — ต่อกลับต้องได้สตริงเดิมทุกตัวอักษร (ไม่มีท่อนหาย)
  const parts = context.strip.split(' · ');
  assert.equal(parts[0], 'งานนี้');
  assert.equal(parts.map((part, i) => (i < parts.length - 1 ? `${part} ·` : part)).join(' '), context.strip);
});

test('ตัวอย่างใน mock (12 รอบ ปีเต็ม) + ชิปโดนเพดานบอกว่าได้ราวกี่นัด (C-D7)', () => {
  const twelve = suggestEveryDays({ startDate: '2026-10-01', endDate: '2027-09-30', rounds: 12 });
  assert.equal(planSuggestionLabel(12, twelve), 'ตามที่ขาย 12 รอบ → ทุก 33 วัน');
  const clamped = suggestEveryDays({ startDate: '2026-01-01', endDate: '2028-01-01', rounds: 2 });
  assert.equal(planSuggestionLabel(2, clamped), 'ตามที่ขาย 2 รอบ → ทุก 365 วัน (สูงสุดที่ตั้งได้ · ได้ราว 3 นัด)');
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
  const editBranch = between(effect, 'setForm(plan', 'salesOrderId: plan.salesOrderId || "",');
  assert.doesNotMatch(editBranch, /prefill/, 'แก้รอบเดิมต้องไม่ถูกทับด้วยวันที่จากใบ');
  const createBranch = effect.slice(effect.indexOf('...EMPTY'));
  assert.match(createBranch, /salesOrderId: salesOrderId \|\| "",/);
  assert.match(createBranch, /kind: PLAN_KINDS\.includes\(prefill\?\.kind\) \? prefill\.kind : EMPTY\.kind,/);
  assert.match(createBranch, /startDate: prefill\?\.startDate \|\| "",/);
  assert.match(createBranch, /endDate: prefill\?\.endDate \|\| "",/);
  assert.doesNotMatch(createBranch, /everyDays/, 'ความถี่ไม่เติมจากแถว (C-D6) — ค่าเริ่ม 30 มาจาก EMPTY');
});

test('🔴 คนเขียน everyDays มีแค่: ค่าเริ่ม · รอบเดิม · ปุ่มลัด · ปุ่ม "ใช้" ของชิป · payload (ไม่มีค่าเริ่มเงียบ)', () => {
  const writes = [...MODAL.matchAll(/everyDays: ([^,}\n]+)/g)].map((m) => m[1].trim()).sort();
  assert.deepEqual(writes, [
    '30',                         // EMPTY
    'Number(form.everyDays)',     // ตัวประมาณจำนวนนัด (อ่านอย่างเดียว)
    'Number(form.everyDays)',     // payload ตอนบันทึก
    'plan.everyDays ?? 30',       // โหมดแก้
    'preset.days',                // ปุ่มลัด 4 ตัว
    'suggestion.everyDays',       // ปุ่ม "ใช้" ของชิป
  ].sort());
  assert.equal((MODAL.match(/change\("everyDays"\)/g) || []).length, 1, 'ช่องพิมพ์เองยังเป็นทางเดียวที่เหลือ');
  assert.match(MODAL, /onClick=\{\(\) => setForm\(\(prev\) => \(\{ \.\.\.prev, everyDays: suggestion\.everyDays \}\)\)\}/);
});

/* ═══ ชิป "ตามที่ขาย" ═════════════════════════════════════════════════════════════════════ */

test('ชิปคำนวณจากวันที่ในฟอร์ม + รอบของ context · ซ่อนเมื่อค่าตรงกับที่ตั้งอยู่แล้ว', () => {
  assert.match(MODAL, /import \{ PLAN_KINDS, VISIT_KIND_LABELS, estimateVisitCount, normalizePlanInput, suggestEveryDays \} from "@\/lib\/service\/rounds";/);
  assert.match(MODAL, /const suggestion = context\?\.roundsSold && form\.startDate && form\.endDate\s*\? suggestEveryDays\(\{ startDate: form\.startDate, endDate: form\.endDate, rounds: context\.roundsSold \}\)\s*: null;/);
  assert.match(MODAL, /const suggestionLabel = suggestion && suggestion\.everyDays !== Number\(form\.everyDays\)\s*\? planSuggestionLabel\(context\.roundsSold, suggestion\)\s*: null;/);
});

test('ชิปขึ้นเฉพาะเมื่อเปิดจากแถวคิว (`context &&`) · อยู่ในช่องรอบ (วัน) · เป็น inline ล้วน (กฎ 20)', () => {
  const field = labelBlock(MODAL, 'รอบ (วัน) *');
  const chip = between(field, '{context && suggestionLabel && (', ')}\n');
  assert.match(chip, /<span className=\{planStyles\.suggestion\}>/);
  assert.match(chip, /\{suggestionLabel\}/);
  assert.match(chip, />ใช้<\/Button>/);
  assert.doesNotMatch(chip, /<(div|p|ul|ol|section)[\s>]|StatusNotice/, 'ของในป้าย <label> ต้องเป็น inline เท่านั้น');
  assert.equal((MODAL.match(/\{suggestionLabel\}/g) || []).length, 1, 'ชิปมีที่เดียว');
  assert.equal((MODAL.match(/planSuggestionLabel\(/g) || []).length, 1);
});

/* ═══ แถบบริบท · คำเตือนสัญญา · คำบอกวันเริ่ม · หัวโมดัล ═══════════════════════════════════════ */

test('หัวโมดัลรับ subtitle จาก context (ไม่มี context = ไม่มีบรรทัดรอง)', () => {
  assert.match(MODAL, /<Modal open=\{open\} onClose=\{onClose\} title=\{editing \? "แก้รอบบริการ" : "สร้างรอบบริการ"\} subtitle=\{context\?\.subtitle\} size="md">/);
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
  assert.deepEqual(used, ['context', 'strip', 'stripPart', 'suggestion']);
  assert.doesNotMatch(CSS, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'สีต้องเป็นโทเคน');
  assert.doesNotMatch(read(SHARED_CSS), /\.(suggestion|strip)\b/);
});
