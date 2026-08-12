// ── งบประมาณลีดเป็นช่วง (mig 0233 · มติผู้ใช้ 2026-08-12) ──────────────────
//
// ⭐ `budget` = ปลายล่าง · `budgetMax` = ปลายบน (ว่าง = ระบุตัวเลขเดียว)
// ทั้งฟอร์มและ API เรียก `leadBudgetError` ตัวเดียวกัน — เทสต์นี้จึงคุมทั้งสองฝั่ง
// พร้อมกัน · กติกา form-design-rules §2: เงื่อนไขที่ปุ่มรู้แต่ฟอร์มไม่รู้ = ห้ามมี
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leadBudgetError, leadBudgetText } from './leads.js';

test('ไม่กรอกอะไรเลย = ผ่าน (งบไม่ใช่ช่องบังคับ)', () => {
  assert.equal(leadBudgetError({}), '');
  assert.equal(leadBudgetError({ budget: '', budgetMax: '' }), '');
});

test('กรอกช่องซ้ายช่องเดียว = ระบุตัวเลขเดียว ผ่านเหมือนเดิม', () => {
  assert.equal(leadBudgetError({ budget: 300000 }), '');
});

test('ช่วงปกติผ่าน · ปลายเท่ากันก็ผ่าน', () => {
  assert.equal(leadBudgetError({ budget: 300000, budgetMax: 500000 }), '');
  assert.equal(leadBudgetError({ budget: 300000, budgetMax: 300000 }), '');
});

/* 🐞 เคสที่ CHECK ของ DB จะตีกลับเป็นภาษาอังกฤษถ้าปล่อยหลุดไปถึง — ต้องตกที่ชั้นนี้
   พร้อมข้อความไทยที่บอกว่าต้องทำอะไรต่อ */
test('ปลายบนลอย ๆ โดยไม่มีปลายล่าง = ตกด่าน', () => {
  assert.match(leadBudgetError({ budgetMax: 500000 }), /ต่ำสุด/);
});

test('ปลายบนน้อยกว่าปลายล่าง = ตกด่าน', () => {
  assert.match(leadBudgetError({ budget: 500000, budgetMax: 300000 }), /ไม่น้อยกว่า/);
});

test('ค่าติดลบ/ไม่ใช่ตัวเลข = ตกด่าน', () => {
  assert.match(leadBudgetError({ budget: 100, budgetMax: -1 }), /ไม่ติดลบ/);
  assert.match(leadBudgetError({ budget: 'abc', budgetMax: 100 }), /ต่ำสุด/);
});

// ── คำที่ใช้แสดงผล ────────────────────────────────────────────────────────
const money = (n) => Number(n).toLocaleString('en-US');

test('ไม่มีงบ = คำว่างที่ผู้เรียกกำหนด', () => {
  assert.equal(leadBudgetText({}, money), 'ไม่ระบุ');
  assert.equal(leadBudgetText({}, money, '-'), '-');
});

test('ตัวเลขเดียวแสดงตัวเดียว ไม่ใช่ "X – X"', () => {
  assert.equal(leadBudgetText({ budget: 300000 }, money), '300,000');
  assert.equal(leadBudgetText({ budget: 300000, budgetMax: 300000 }, money), '300,000');
});

test('ช่วงแสดงสองปลาย', () => {
  assert.equal(leadBudgetText({ budget: 300000, budgetMax: 500000 }, money), '300,000 – 500,000');
});

/* ⭐ งบ 0 บาทเป็นค่าที่ตั้งใจกรอก ไม่ใช่ "ไม่ระบุ" — เช็คด้วย `== null` ไม่ใช่ falsy
   (บั๊กคลาสสิกที่ทำให้เลข 0 หายจากจอ) */
test('งบ 0 บาท ต้องไม่ถูกอ่านเป็น "ไม่ระบุ"', () => {
  assert.equal(leadBudgetText({ budget: 0 }, money), '0');
});

/* ── ทุกจอต้องใช้คำเดียวกัน ──────────────────────────────────────────────
   จอที่เขียนเงื่อนไข "มี budgetMax ไหม" เองจะโชว์แค่ปลายล่าง แล้วอ่านเหมือนงบ
   น้อยกว่าจริง · กฎนี้กันไม่ให้มีจอที่สอง */
test('ตารางลีดและหน้ารายละเอียดเรียก leadBudgetText ไม่เขียนเงื่อนไขเอง', () => {
  for (const file of [
    new URL('../../app/sales-planning/leads/page.js', import.meta.url),
    new URL('../../app/sales-planning/leads/[id]/page.js', import.meta.url),
  ]) {
    const text = readFileSync(file, 'utf8');
    assert.match(text, /leadBudgetText\(/, `${file.pathname}: ต้องเรียกตัวจัดคำกลาง`);
    assert.doesNotMatch(text, /lead\.budget != null \? fmtMoney/,
      `${file.pathname}: ยังเขียนเงื่อนไขงบเอง — ช่วงจะหายไปครึ่งหนึ่ง`);
  }
});

/* migration ต้องมีด่านเดียวกับชั้นแอป — ไม่งั้นของที่เขียนตรงเข้า DB (สคริปต์/นำเข้า)
   สร้างแถวที่แอปอ่านไม่ออกได้ */
test('mig 0233 มี CHECK คุมช่วงจริง', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/0233_lead_budget_range.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "budgetMax"/);
  assert.match(sql, /sales_leads_budget_range/);
  assert.match(sql, /"budgetMax" >= budget/);
});
