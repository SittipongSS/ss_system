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
import { SERVICE_ROUNDS_UNIT, siteRoundsSoldText } from '../sales/serviceOrders.js';

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

/* มติเจ้าของ 08/10 รอบสอง — จอฝ่ายขายที่เหลือ: หน่วยเดือน + แพ็คก่อนจำนวนรอบบริการ
   ⭐ แถว "จำนวนรอบบริการ" ของสรุปไซต์ (โมดูลฐานข้อมูล) = ค่าที่ **ฝ่ายขายขายไว้** ⇒ พูด "เดือน" จากฝั่งขาย · ป้ายยังเป็น
     `ROUNDS_SOLD_LABEL` ตัวกลางตัวเดิม (จอ TS ใช้ร่วม — ไม่แตะ)
   ⚠️ ผลตรวจทาน 08/10 (หลังเห็นจอจริง): หน้านี้เป็นจอร่วม — โมดัลรอบบริการของ TS ที่เปิดจากหน้านี้ได้ตัวเลขเดียวกันแล้วพูด "12 รอบ"
     และตัวเลขนั้นเป็นผลรวมของทุกใบที่ยังมีผล (สองใบ 12 รอบซ้อน = 24) ⇒ ยามย้ายจาก `${fmtNumber(roundsSold)} ${SERVICE_ROUNDS_UNIT}`
     ไปยึดคำของฝั่งขายตัวใหม่ `siteRoundsSoldText(roundsSold, roundsSoldRange)`: "12 เดือน (12 รอบ)" — เดือน = ค่าที่ขายไว้ต่อรายการ
     (ช่วง ไม่บวกข้ามใบ) · รอบในวงเล็บ = ผลรวมของทั้งไซต์ ตัวเลข/หน่วยเดียวกับโมดัล
   🔴 ฝั่ง TS ไม่เปลี่ยน: แคตตาล็อกของ rounds.js และหน้างานเข้าใหม่/โมดัลรอบบริการยังนับ "รอบ" ที่ช่างไป · จำนวนรอบที่ TS ตั้งของไซต์
     (การ์ด "รอบบริการ n รอบ" · คอลัมน์ "รอบ" ของตารางรอบบริการ ในหน้าเดียวกัน) ก็ยังเป็น "รอบ" */
test('สรุปไซต์: ค่าที่ฝ่ายขายขายไว้พูด "เดือน" + รอบของทั้งไซต์ในวงเล็บ (ตัวเลขเดียวกับโมดัล) · จอ TS และจำนวนรอบที่ TS ตั้งยังพูด "รอบ"', () => {
  const site = code(SITE);
  assert.match(site, /import \{ siteRoundsSoldText \} from "@\/lib\/sales\/serviceOrders";/);
  assert.match(site, /\{ id: "roundsSold", label: ROUNDS_SOLD_LABEL, value: siteRoundsSoldText\(roundsSold, roundsSoldRange\) \}/);
  assert.doesNotMatch(site, /fmtNumber\(roundsSold\)\} รอบ/, 'ค่าที่ขายไว้ไม่พิมพ์หน่วย "รอบ" เองอีก');
  assert.doesNotMatch(site, /SERVICE_ROUNDS_UNIT|\$\{fmtNumber\(roundsSold\)\}/, 'หน้าไม่ประกอบคำของแถวนี้เอง — คำอยู่ที่ siteRoundsSoldText ตัวเดียว');
  assert.match(site, /setRoundsSoldRange\(siteData\?\.roundsSoldRange \?\? null\);/, 'ช่วงมาจากคีย์เสริมของ GET ไซต์');
  /* โมดัลรอบบริการยังได้ผลรวมของทั้งไซต์ตัวเดิม (TS เทียบกับจำนวนนัด) — ไม่ได้ช่วง */
  assert.match(site, /<ServicePlanModal[\s\S]{0,400}?roundsSold=\{roundsSold\}/);
  assert.doesNotMatch(site, /<ServicePlanModal[\s\S]{0,600}?roundsSoldRange/);
  /* คำของแถว: เท่ากัน = "12 เดือน (12 รอบ)" · สองใบซ้อน/รายการไม่เท่ากัน = เดือนเป็นช่วง ไม่ใช่ผลรวม + "ทั้งไซต์ n รอบ" */
  assert.equal(siteRoundsSoldText(12, { min: 12, max: 12 }), '12 เดือน (12 รอบ)');
  assert.equal(siteRoundsSoldText(24, { min: 12, max: 12 }), '12 เดือน (ทั้งไซต์ 24 รอบ)', 'ไม่ใช่ "24 เดือน" ของสัญญา 12 เดือน');
  assert.equal(siteRoundsSoldText(12, { min: 4, max: 12 }), '4–12 เดือน (ทั้งไซต์ 12 รอบ)');
  assert.ok(siteRoundsSoldText(12, { min: 12, max: 12 }).includes(`12 ${SERVICE_ROUNDS_UNIT}`), 'หน่วยของค่าที่ขายไว้ = SERVICE_ROUNDS_UNIT');
  /* ตัวเลขในวงเล็บ = ตัวเลข + หน่วยที่โมดัลรอบบริการพิมพ์ ("<strong>{roundsSold} รอบ</strong>") */
  assert.ok(siteRoundsSoldText(24, { min: 12, max: 12 }).includes('24 รอบ)'));
  assert.equal(SERVICE_ROUNDS_UNIT, 'เดือน');
  /* จำนวนรอบที่ TS ตั้งของไซต์ = "รอบ" คำเดิม */
  assert.match(site, /label: "รอบบริการ", value: `\$\{plans\.length\} รอบ`/);
  assert.match(site, /<th>รอบ<\/th>/);
  /* แคตตาล็อกฝั่ง TS ไม่อ่านหน่วยของฝ่ายขาย และยังพูด "n รอบ" */
  assert.equal(roundsSoldSentence(12), 'จำนวนรอบบริการ 12 รอบ');
  assert.deepEqual(planRoundsSoldText({ roundsSold: 12, stamped: true }), { value: '12 รอบ', hint: null });
  for (const rel of ['lib/service/rounds.js', FACTS, INTAKE, PAGE, MODAL]) {
    assert.doesNotMatch(code(rel), /SERVICE_ROUNDS_UNIT/, `${rel} (ฝั่ง TS) ต้องไม่อ่านหน่วยของฝ่ายขาย`);
  }
  assert.match(code(MODAL), /<strong>\{roundsSold\} รอบ<\/strong>/, 'โมดัลรอบบริการของ TS ยังพูด "รอบ"');
});

test('ไม่มีคำเก่าหลงเหลือในโค้ด (นอกคอมเมนต์) ของผิวที่พูดจำนวนรอบที่ขาย', () => {
  const OLD = /ไปกี่รอบ|ไป \$\{[^}]*\} รอบ|ขายไว้|ตามที่ขาย|รอบที่ขาย|รอบ\/โซน|ระบุไว้/;
  for (const rel of [PAGE, MODAL, SITE, FACTS, INTAKE]) {
    const hit = code(rel).split('\n').find((line) => OLD.test(line));
    assert.equal(hit, undefined, `${rel}: ${hit?.trim()}`);
  }
});
