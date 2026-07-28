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

// ── มติผู้ใช้ B4 (2026-07-28) ────────────────────────────────────────────
// เสนอไทม์ไลน์ (55%) มาก่อน เสนอราคา (65%) — ลำดับนี้ไม่ใช่แค่การแสดงผล มันคือกติกา
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
  assert.equal(DEFAULT_PROBABILITY_BY_STAGE.timeline_proposed, 55);
  assert.equal(DEFAULT_PROBABILITY_BY_STAGE.quotation, 65);
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
// (migration 0170 — ฝั่ง DB ใช้ตอนถอยดีลออกจาก Won). เดิมฝั่ง DB มีสำเนาแยกกัน 3 ชุด
// ใน 0116/0138/0168 และไม่มีอะไรกันไม่ให้เพี้ยน — เทสต์นี้คือตัวกัน
test('% ตั้งต้นฝั่ง JS ตรงกับ deal_probability_for_stage() ใน migration 0170 ทุกขั้น', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0170_deal_stage_order_swap.sql', import.meta.url), 'utf8');
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
