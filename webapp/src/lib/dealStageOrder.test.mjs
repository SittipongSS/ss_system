import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  DEAL_STAGES,
  DEFAULT_PROBABILITY_BY_STAGE,
  advanceStage,
  stageAtLeast,
  stageIndex,
} from './salesPlanning.js';
import { MAIN_SEQUENCE } from './salesPlanningLifecycle.js';
import {
  FORECAST_VALUES,
  SYSTEM_FORECAST_VALUES,
  snapForecastLevel,
} from './sales/forecastLevels.js';

// ── มติผู้ใช้ B4 (2026-07-28) ────────────────────────────────────────────
// เสนอไทม์ไลน์มาก่อนเสนอราคา — ลำดับนี้ไม่ใช่แค่การแสดงผล มันคือกติกา
// "เดินหน้าอย่างเดียว" ของทั้งระบบ. เทสต์ชุดนี้ตรึงลำดับไว้ ถ้ามีใครสลับกลับ/แทรกขั้นใหม่
// ผิดที่ จะแดงก่อนหลุดขึ้น prod
test('เสนอไทม์ไลน์ต้องมาก่อนเสนอราคาในลำดับหลัก', () => {
  assert.ok(stageIndex('timeline_proposed') < stageIndex('quotation'));
  assert.deepEqual(DEAL_STAGES, [
    'lead', 'qualified', 'timeline_proposed', 'quotation',
    'awaiting_confirm', 'deposit_pending', 'won', 'in_project', 'lost',
  ]);
});

test('MAIN_SEQUENCE (stepper) ต้องเรียงตรงกับ DEAL_STAGES เสมอ', () => {
  assert.deepEqual(MAIN_SEQUENCE, DEAL_STAGES.filter((s) => !['in_project', 'lost'].includes(s)));
});

test('% ตั้งต้นต้องเรียงจากน้อยไปมากตามลำดับขั้น (ไม่งั้นแปลว่าลำดับกับ % ไม่ตรงกัน)', () => {
  const openStages = DEAL_STAGES.filter((s) => s !== 'lost' && s !== 'in_project');
  const values = openStages.map((s) => DEFAULT_PROBABILITY_BY_STAGE[s]);
  assert.deepEqual(values, [...values].sort((a, b) => a - b));
  // ออกใบเสนอราคาแล้ว = 50 ตามเกณฑ์หลักฐาน (มติผู้ใช้ 2026-07-29) ส่วนขั้นก่อนหน้า
  // ยังไม่มีใบ จึงอยู่ระดับต่ำสุด — ตรึงสองตัวนี้ไว้เพราะเป็นรอยต่อที่เกณฑ์เปลี่ยนระดับ
  assert.equal(DEFAULT_PROBABILITY_BY_STAGE.timeline_proposed, 20);
  assert.equal(DEFAULT_PROBABILITY_BY_STAGE.quotation, 50);
});

// ค่าตั้งต้นที่ไม่มีอยู่ในดรอปดาวน์ = ค่าที่เก็บกับค่าที่คนเห็นเป็นคนละตัว (snapForecastLevel
// ปัดให้ตอนแสดงผล) เดิมเป็นแบบนั้นทุกขั้น: 10/30/55/65/75/90 ไม่มีสักตัวใน FORECAST_LEVELS
test('ค่าตั้งต้นทุกขั้นต้องเป็นค่าที่มีอยู่จริง (เลือกได้เอง หรือระบบตั้งให้)', () => {
  assert.deepEqual(FORECAST_VALUES, [20, 50, 80], 'ระดับ FC ที่ผู้ใช้เลือกได้');
  const allowed = new Set([...FORECAST_VALUES, ...SYSTEM_FORECAST_VALUES]);
  for (const [stage, value] of Object.entries(DEFAULT_PROBABILITY_BY_STAGE)) {
    assert.ok(allowed.has(value), `${stage} = ${value} ไม่ใช่ค่าที่มีอยู่จริง`);
  }
});

// 100 = "ยอดจริง (Actual)" ของดีลที่ปิดได้แล้ว ไม่ใช่ FC (มติผู้ใช้ 2026-07-29)
// ⇒ ต้อง freeze หลัง Won เหมือน projectValue: ฟอร์มแก้ดีลส่ง probability ที่ผ่าน
// snapForecastLevel มาทุกครั้ง ถ้า PATCH ไม่กัน alreadyWon การเปิดดีล Won แล้วกดบันทึก
// (เช่น แก้หมายเหตุ) จะเขียนทับ 100 ด้วย 80 เงียบ ๆ — บั๊กนี้ไม่กัดตอนที่ 100 ยังเป็น
// ระดับที่เลือกได้ เพราะ snap(100) = 100 พอดี
test('PATCH ดีล: probability ถูก freeze หลัง Won เหมือน projectValue', () => {
  const route = readFileSync(
    new URL('../app/api/sales-planning/deals/[id]/route.js', import.meta.url),
    'utf8',
  );
  assert.match(
    route,
    /if \(\('probability' in body \|\| 'stage' in body\) && !alreadyWon\)/,
    'probability ต้องมี guard !alreadyWon',
  );
  assert.match(route, /if \('projectValue' in body && !alreadyWon\)/, 'ของเดิมต้องยังกันอยู่');
});

// 100 ถูกถอดออกจากดรอปดาวน์ — ดีลที่ยังไม่ Won ห้ามตั้งเองได้
// ระบบตั้งให้เฉพาะตอนปิด Won เท่านั้น เหมือน lost = 0
test('100% เป็นค่าของระบบ ไม่ใช่ตัวเลือก — ขั้นที่ยังไม่ Won ต้องไม่ตั้งต้นที่ 100', () => {
  assert.ok(!FORECAST_VALUES.includes(100), '100 ต้องไม่อยู่ในดรอปดาวน์');
  assert.deepEqual(SYSTEM_FORECAST_VALUES, [0, 100]);
  for (const stage of DEAL_STAGES.filter((s) => !['won', 'in_project'].includes(s))) {
    assert.notEqual(DEFAULT_PROBABILITY_BY_STAGE[stage], 100, `${stage} ยังไม่ Won`);
  }
  assert.equal(DEFAULT_PROBABILITY_BY_STAGE.won, 100);
  // ดีลเก่าที่ค้าง 100 ถูกปัดลงมาที่ระดับสูงสุดที่เลือกได้ (migration 0175 ตามเก็บใน DB ด้วย)
  assert.equal(snapForecastLevel(100), 80);
});

// ── กติกาเดินหน้าอย่างเดียว ──────────────────────────────────────────────
test('ออกใบเสนอราคาดันดีลถึงขั้น "เสนอราคา" จากทุกขั้นที่อยู่ก่อนหน้า', () => {
  assert.equal(advanceStage('lead', 'quotation'), 'quotation');
  assert.equal(advanceStage('qualified', 'quotation'), 'quotation');
  // หัวใจของ B4: เสนอไทม์ไลน์ไปแล้วค่อยออกใบ → ต้องเดินหน้าต่อ ไม่ใช่ค้างที่เดิม
  assert.equal(advanceStage('timeline_proposed', 'quotation'), 'quotation');
});

test('ทำไทม์ไลน์ทีหลังต้องไม่ดึงดีลที่ออกใบแล้วถอยกลับ', () => {
  assert.equal(advanceStage('quotation', 'timeline_proposed'), 'quotation');
  assert.equal(advanceStage('awaiting_confirm', 'timeline_proposed'), 'awaiting_confirm');
  assert.equal(advanceStage('deposit_pending', 'timeline_proposed'), 'deposit_pending');
});

test('ขั้นปิดแล้วไม่ถูกดันหรือถูกดึงถอยไม่ว่ากรณีใด', () => {
  for (const target of ['timeline_proposed', 'quotation']) {
    assert.equal(advanceStage('won', target), 'won');
    assert.equal(advanceStage('in_project', target), 'in_project');
    assert.equal(advanceStage('lost', target), 'lost');
  }
});

test('stage ที่ไม่รู้จักถือว่าอยู่ก่อนทุกอย่าง — โดนดันไปข้างหน้า ไม่ค้างที่ค่าเพี้ยน', () => {
  assert.equal(stageIndex('ขยะ'), -1);
  assert.equal(advanceStage('ขยะ', 'quotation'), 'quotation');
  assert.equal(stageAtLeast('ขยะ', 'lead'), false);
});

test('stageAtLeast: ดีลที่ออกใบแล้วต้องนับว่าเลยขั้นเสนอไทม์ไลน์ (ปุ่มสร้าง/ผูกโครงการ)', () => {
  assert.equal(stageAtLeast('quotation', 'timeline_proposed'), true);
  assert.equal(stageAtLeast('timeline_proposed', 'timeline_proposed'), true);
  assert.equal(stageAtLeast('qualified', 'timeline_proposed'), false);
  assert.equal(stageAtLeast('lead', 'timeline_proposed'), false);
});

// ── JS ↔ SQL ต้องไม่เพี้ยนกัน ────────────────────────────────────────────
// map % อยู่สองฝั่ง: DEFAULT_PROBABILITY_BY_STAGE (JS) กับ deal_probability_for_stage()
// (ฝั่ง DB ใช้ตอนถอยดีลออกจาก Won). เดิมฝั่ง DB มีสำเนาแยกกัน 3 ชุดใน 0116/0138/0168
// และไม่มีอะไรกันไม่ให้เพี้ยน — เทสต์นี้คือตัวกัน
// ⚠️ อ่านนิยาม **ล่าสุด** เสมอ (0175 แทนที่ 0170) — ชี้ไฟล์เก่าเมื่อไหร่เทสต์จะเขียว
// ทั้งที่ของจริงบน DB เป็นอีกชุด
test('% ตั้งต้นฝั่ง JS ตรงกับ deal_probability_for_stage() ใน migration 0175 ทุกขั้น', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0175_deal_forecast_levels.sql', import.meta.url), 'utf8');
  const fn = sql.slice(sql.indexOf('FUNCTION public.deal_probability_for_stage'));
  const mapped = new Map(
    [...fn.slice(0, fn.indexOf('END;')).matchAll(/WHEN\s+'(\w+)'\s+THEN\s+(\d+)/g)]
      .map(([, stage, value]) => [stage, Number(value)]),
  );
  assert.deepEqual(
    Object.fromEntries(DEAL_STAGES.map((s) => [s, mapped.get(s)])),
    DEFAULT_PROBABILITY_BY_STAGE,
  );
});

test('0170 ต้องยุบสำเนา CASE ทั้ง 3 ชุดให้เรียกฟังก์ชันกลาง ไม่เหลือเลขฝังในตัวฟังก์ชัน', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0170_deal_stage_order_swap.sql', import.meta.url), 'utf8');
  for (const fn of ['cancel_sales_order_with_reversal_atomic', 'unaccept_quotation_atomic', 'revert_deal_out_of_won']) {
    assert.ok(sql.includes(`FUNCTION public.${fn}`), `${fn} ต้องถูก CREATE OR REPLACE ใน 0170`);
  }
  assert.equal(
    (sql.match(/probability = public\.deal_probability_for_stage\(v_target_stage\)/g) || []).length,
    3,
  );
  assert.ok(!/probability = CASE v_target_stage/.test(sql), 'ต้องไม่เหลือบล็อก CASE ฝังในตัวฟังก์ชัน');
});
