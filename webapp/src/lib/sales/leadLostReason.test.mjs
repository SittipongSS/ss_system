// ── เหตุผลที่ลีดไม่ไปต่อ (mig 0290 · มติผู้ใช้ 2026-08-25) ──────────────────
//
// `disqualifiedReason` เป็นข้อความอิสระ และ **ไม่มีจอไหนอ่านเลย** — เขียนที่
// transition/route.js ที่เดียว ส่วน KPI มีแค่ % รวม ตอบไม่ได้ว่าแพ้เพราะอะไร
//
// สิ่งที่ต้องล็อก เรียงตามความเสียหายถ้าหลุด:
//   1) **รหัสในโค้ดกับ CHECK ของ DB ต้องตรงกัน** — ไม่ตรง = ผู้ใช้เลือกได้แต่บันทึก
//      ไม่ได้ (โรคเดียวกับ CHECK ของ `channel` ที่ต้องไล่แก้ตาม mig 0129 → 0252)
//   2) ด่านเดียวใช้ทั้งฟอร์มและ API (form-design-rules §2)
//   3) ตัวหารของรายงานต้องไม่กินสแปม ไม่งั้นเหตุผลจริงทุกแถวดูเล็กลงพร้อมกัน
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEAD_LOST_REASONS, LEAD_LOST_CODES, LEAD_LOST_LABELS, LEAD_LOST_UNCOUNTABLE,
  leadLostReasonError, leadLostText, lostReasonRollup,
} from './leads.js';

/* ── รหัสในโค้ด ↔ CHECK ของ DB ─────────────────────────────────────────── */

/* 🐞 โรคที่เคยเกิดกับ `channel`: เพิ่มตัวเลือกในโค้ดแล้วลืมแก้ CHECK ⇒ ฟอร์มโชว์
   ตัวเลือกให้เลือก แต่พอกดบันทึกจริง Postgres ตีกลับ · ผู้ใช้เห็นแค่ error ที่
   อ่านไม่รู้เรื่อง และไม่มีอะไรจับได้ตอน review */
test('รหัสในโค้ดต้องตรงกับ CHECK ของ sales_leads.disqualifiedCode เป๊ะ', () => {
  const sql = readFileSync(
    new URL('../../../supabase/migrations/0290_lead_lost_reason_code.sql', import.meta.url), 'utf8',
  );
  // อ่านเฉพาะส่วนที่รันจริง — ท้ายไฟล์มีบล็อก Rollback ที่พิมพ์ SQL ไว้เป็นคอมเมนต์
  const body = sql.slice(0, sql.indexOf('COMMIT;'));
  const add = body.slice(body.indexOf('ADD CONSTRAINT sales_leads_disqualified_code_check'));
  const list = add.slice(add.indexOf('IN ('), add.indexOf('));'));
  const inSql = [...list.matchAll(/'([a-z_]+)'/g)].map(([, code]) => code).sort();
  assert.ok(inSql.length > 0, 'อ่านชุดรหัสจาก migration ไม่ได้ — เทสต์นี้จะกลายเป็นเทสต์เปล่า');
  assert.deepEqual([...LEAD_LOST_CODES].sort(), inSql);
});

test('ทุกรหัสมีป้ายไทย — ไม่มีตัวไหนโผล่เป็นรหัสดิบบนจอ', () => {
  for (const code of LEAD_LOST_CODES) {
    assert.ok(LEAD_LOST_LABELS[code], `${code} ไม่มีป้าย`);
    assert.doesNotMatch(LEAD_LOST_LABELS[code], /^[a-z_]+$/, `${code} ป้ายยังเป็นรหัสดิบ`);
  }
});

/* ⚠️ หามาจากลิสต์ ไม่ใช่สะกดซ้ำ — ผู้อ่านหลักคือ `leadOutcome` ซึ่งใช้ตัวนี้กรอง
   ตัวส่วนของอัตราแปลง · สองที่ที่ต้องตรงกันเองคือสองที่ที่จะเพี้ยนหากัน */
test('ลีดซ้ำ / ข้อมูลติดต่อผิด = ไม่อยู่ในตัวส่วน · ที่เหลืออยู่', () => {
  assert.deepEqual([...LEAD_LOST_UNCOUNTABLE].sort(), ['duplicate', 'invalid']);
  const countable = LEAD_LOST_REASONS.filter((r) => r.countable).map((r) => r.code);
  assert.equal(countable.includes('duplicate'), false);
  assert.equal(countable.includes('timing'), true, 'ยังไม่พร้อม = แพ้ในงวดนี้จริง ต้องนับ');
});

/* ── ด่าน ────────────────────────────────────────────────────────────────── */

test('ไม่เลือกเหตุผล = ตกด่าน · รหัสมั่วก็ตก', () => {
  assert.match(leadLostReasonError({}), /ต้องเลือก/);
  assert.match(leadLostReasonError({ code: '' }), /ต้องเลือก/);
  assert.match(leadLostReasonError({ code: 'มั่ว' }), /ไม่ถูกต้อง/);
});

/* "อื่นๆ" ที่ไม่มีคำอธิบายนับเป็นข้อมูลไม่ได้ — มันคือช่องที่ทำให้ทุกอย่างที่ไม่อยาก
   คิดไหลมารวมกัน แล้วรายงานจะมีแถวใหญ่ที่สุดที่บอกอะไรไม่ได้เลย */
test('เลือก "อื่นๆ" แล้วต้องเขียนรายละเอียด', () => {
  assert.match(leadLostReasonError({ code: 'other' }), /รายละเอียด/);
  assert.match(leadLostReasonError({ code: 'other', detail: '   ' }), /รายละเอียด/);
  assert.equal(leadLostReasonError({ code: 'other', detail: 'ลูกค้าย้ายบริษัท' }), '');
});

test('เหตุผลอื่นไม่บังคับรายละเอียดที่ชั้นนี้ (API เข้มกว่าเอง)', () => {
  for (const code of LEAD_LOST_CODES.filter((c) => c !== 'other')) {
    assert.equal(leadLostReasonError({ code }), '', code);
  }
});

/* ⭐ ด่านเดียวใช้ทั้งสองฝั่ง — API เขียนเงื่อนไขเองเมื่อไร ฟอร์มกับปุ่มจะเริ่มไม่ตรงกัน */
test('API เรียก leadLostReasonError ตัวเดียวกับฟอร์ม', () => {
  const src = readFileSync(
    new URL('../../app/api/sales-planning/leads/[id]/transition/route.js', import.meta.url), 'utf8',
  );
  assert.match(src, /leadLostReasonError\(\{\s*code: body\.disqualifiedCode/);
  assert.match(src, /patch\.disqualifiedCode = body\.disqualifiedCode/);
  // ข้อความยังบังคับทุกเหตุผลเหมือนเดิม (กติกาเดิมของ API มาก่อน mig นี้)
  assert.match(src, /ต้องระบุเหตุผลที่ไม่ไปต่อ/);
});

/* ── คำที่แสดงบนจอ ───────────────────────────────────────────────────────── */

test('ใบใหม่โชว์ "หัวข้อ — รายละเอียด" · ใบเก่าที่มีแต่ข้อความยังอ่านออก', () => {
  assert.equal(
    leadLostText({ disqualifiedCode: 'budget', disqualifiedReason: 'เสนอ 1.4 ล้าน งบ 8 แสน' }),
    'งบไม่ถึง — เสนอ 1.4 ล้าน งบ 8 แสน',
  );
  assert.equal(leadLostText({ disqualifiedCode: 'budget' }), 'งบไม่ถึง');
  // ⚠️ ใบก่อน mig 0290 ไม่มีรหัส — ต้องไม่ขึ้น "ไม่ระบุ" ทั้งที่ AE เขียนไว้ครบ
  assert.equal(leadLostText({ disqualifiedReason: 'ลูกค้าเงียบไปเลย' }), 'ลูกค้าเงียบไปเลย');
  assert.equal(leadLostText({}), 'ไม่ระบุ');
});

/* ── รายงาน ──────────────────────────────────────────────────────────────── */

const lost = (code) => ({ status: 'disqualified', disqualifiedCode: code });

test('นับเฉพาะใบที่ปิดว่าไม่ไปต่อ — ใบที่ยังเดินอยู่/ชนะแล้วไม่เกี่ยว', () => {
  const roll = lostReasonRollup([
    lost('budget'), lost('budget'), lost('competitor'),
    { status: 'qualified' }, { status: 'contacted' },
  ]);
  assert.equal(roll.total, 3);
  assert.equal(roll.reasons.find((r) => r.code === 'budget').count, 2);
});

/* ⚠️ แถว 0 ต้องขึ้น — "เดือนนี้ไม่มีใครแพ้เพราะราคาเลย" คือข้อมูล ไม่ใช่ความว่างเปล่า
   และเรียงตามลิสต์คงที่ ไม่ใช่ตามจำนวน ไม่งั้นอ่านเทียบข้ามเดือนไม่ได้ */
test('ทุกเหตุผลมีแถวเสมอ แม้เป็นศูนย์ · ลำดับคงที่', () => {
  const roll = lostReasonRollup([lost('budget')]);
  assert.equal(roll.reasons.length, LEAD_LOST_REASONS.length);
  assert.deepEqual(roll.reasons.map((r) => r.code), LEAD_LOST_CODES);
  assert.equal(roll.reasons.find((r) => r.code === 'competitor').count, 0);
});

/* 🪤 ตัวหารของคอลัมน์สัดส่วนต้องไม่กินสแปม — ไม่งั้นเดือนที่มีลีดซ้ำเยอะ เหตุผลจริง
   ทุกแถวจะดูเล็กลงพร้อมกันโดยไม่มีอะไรอธิบาย */
test('ใบที่ไม่นับหลุดจากตัวหาร ไม่ใช่แค่ไม่นับเป็นแพ้', () => {
  const roll = lostReasonRollup([
    lost('budget'), lost('duplicate'), lost('duplicate'), lost('invalid'),
  ]);
  assert.equal(roll.total, 4);
  assert.equal(roll.countedTotal, 1, 'เหลือแค่ budget');
  assert.equal(roll.excluded, 3);
});

/* ใบเก่าก่อน migration — แยกจาก "อื่นๆ" โดยเจตนา: "อื่นๆ" คือสิ่งที่ AE เลือกเอง
   ส่วน unknown คือของที่ระบบไม่เคยถาม · ปนกันแล้วจะอ่านว่า "อื่นๆ" พุ่งขึ้น
   ทั้งที่ไม่มีใครเลือกมันเพิ่มเลย */
test('ใบเก่าที่ไม่มีรหัส เข้าแถว unknown ไม่ใช่ "อื่นๆ"', () => {
  const roll = lostReasonRollup([
    { status: 'disqualified', disqualifiedReason: 'ลูกค้าเงียบ' },
    lost('other'),
    lost(null),
  ]);
  assert.equal(roll.unknown, 2);
  assert.equal(roll.reasons.find((r) => r.code === 'other').count, 1);
  // unknown ยังอยู่ในตัวหาร — เป็นการแพ้จริง แค่ไม่รู้หมวด
  assert.equal(roll.countedTotal, 3);
});

test('ไม่มีใบที่ปิด = ก้อนว่างที่อ่านออก ไม่ระเบิด', () => {
  const roll = lostReasonRollup([]);
  assert.equal(roll.total, 0);
  assert.equal(roll.countedTotal, 0);
  assert.equal(roll.reasons.length, LEAD_LOST_REASONS.length);
  assert.equal(lostReasonRollup().total, 0);
});
