// ── คำเรียกจำนวนรอบที่ขายฝั่ง TS = "จำนวนรอบบริการ" (มติเจ้าของ 29/09: "ไปกี่รอบ เปลี่ยน เป็น คำว่า จำนวนรอบบริการ") ──
//
// ⭐ คำอยู่ที่ `ROUNDS_SOLD_LABEL` · `roundsSoldSentence` · `PLAN_ROUNDS_SOLD_HINT` ของ rounds.js ที่เดียว —
//   หัวคอลัมน์/การ์ดของแถวรอตั้งรอบ · แถบบริบท + ชิปความถี่ + บรรทัดประมาณนัดของโมดัลรอบบริการ · สรุปไซต์ อ่านจากที่นี่
// ⚠️ เปลี่ยนแค่คำเรียกจำนวนรอบ — คำบอกความถี่ ("ทุก 33 วัน") คงเดิม
// ยามนี้กันจอกลับไปพิมพ์คำเก่า ("ขายไว้" · "ตามที่ขาย" · "รอบ/โซน" · "ไปกี่รอบ") เองโดยไม่ผ่านแคตตาล็อก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLAN_ROUNDS_SOLD_HINT, ROUNDS_SOLD_LABEL, roundsSoldSentence, suggestEveryDays } from './rounds.js';
import { planSuggestionLabel } from './intakePlanFacts.js';
import { planRoundsSoldText } from './intake.js';

/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ข้อความในคอมเมนต์ต้องไม่ทำให้ยามผ่าน/แดงเอง */
const code = (rel) => readFileSync(`src/${rel}`, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const PAGE = 'app/service/intake/page.js';
const MODAL = 'components/service/ServicePlanModal.js';
const SITE = 'app/database/sites/[id]/page.js';
const FACTS = 'lib/service/intakePlanFacts.js';
const INTAKE = 'lib/service/intake.js';

test('แคตตาล็อก: "จำนวนรอบบริการ n รอบ" · บรรทัดประมาณนัดของโมดัลบอกใบ/ไซต์ให้ตรง', () => {
  assert.equal(ROUNDS_SOLD_LABEL, 'จำนวนรอบบริการ');
  assert.equal(roundsSoldSentence(12), 'จำนวนรอบบริการ 12 รอบ');
  assert.equal(roundsSoldSentence(1200), 'จำนวนรอบบริการ 1,200 รอบ');
  assert.equal(PLAN_ROUNDS_SOLD_HINT.ofOrder, 'จำนวนรอบบริการของใบนี้');
  assert.equal(PLAN_ROUNDS_SOLD_HINT.ofSite, 'จำนวนรอบบริการที่ฝ่ายขายระบุ');
  assert.equal(PLAN_ROUNDS_SOLD_HINT.diff(1), 'ต่างจากจำนวนรอบบริการ 1 นัด (ตั้งต่อได้ ไม่ใช่ข้อห้าม)');
});

test('ชิปความถี่: คำเรียกรอบเปลี่ยน · คำบอกความถี่ "ทุก n วัน" คงเดิม', () => {
  const s = suggestEveryDays({ startDate: '2026-10-01', endDate: '2027-09-30', rounds: 12 });
  assert.equal(planSuggestionLabel(12, s), 'จำนวนรอบบริการ 12 รอบ → ทุก 33 วัน');
  assert.deepEqual(planRoundsSoldText({ roundsSold: 12, stamped: true }), { value: '12 รอบ', hint: null });
});

test('จอ: แถวรอตั้งรอบ (การ์ด + ตาราง) · โมดัลรอบบริการ · สรุปไซต์ อ่านคำจากแคตตาล็อก', () => {
  const page = code(PAGE);
  assert.equal((page.match(/<dt>\{ROUNDS_SOLD_LABEL\}<\/dt>/g) || []).length, 1, 'การ์ด');
  assert.equal((page.match(/<th scope="col">\{ROUNDS_SOLD_LABEL\}<\/th>/g) || []).length, 1, 'ตาราง');
  const modal = code(MODAL);
  assert.match(modal, /salesOrderId \? PLAN_ROUNDS_SOLD_HINT\.ofOrder : PLAN_ROUNDS_SOLD_HINT\.ofSite/);
  assert.match(modal, /PLAN_ROUNDS_SOLD_HINT\.diff\(Math\.abs\(estimate - roundsSold\)\)/);
  assert.match(code(SITE), /\{ id: "roundsSold", label: ROUNDS_SOLD_LABEL, value: /);
});

test('ไม่มีคำเก่าหลงเหลือในโค้ด (นอกคอมเมนต์) ของผิวที่พูดจำนวนรอบที่ขาย', () => {
  const OLD = /ไปกี่รอบ|ไป \$\{[^}]*\} รอบ|ขายไว้|ตามที่ขาย|รอบที่ขาย|รอบ\/โซน|ระบุไว้/;
  for (const rel of [PAGE, MODAL, SITE, FACTS, INTAKE]) {
    const hit = code(rel).split('\n').find((line) => OLD.test(line));
    assert.equal(hit, undefined, `${rel}: ${hit?.trim()}`);
  }
});
