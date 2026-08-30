// ไลน์ผลิต + กำลังผลิตรายวัน (mig 0186) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  capacityOn,
  capacityRange,
  normalizeCapacityDayInput,
  normalizeLineInput,
  overridesByDate,
} from './productionLines.js';
import {
  canEditProduction,
  canEditService,
  canViewProduction,
  DEPARTMENTS,
  DEPARTMENT_NAMES_TH,
  rolesForDepartment,
  validateIdentity,
} from '../permissions.js';

const line = { id: 'L1', code: 'MIX-01', name: 'ไลน์ผสม 1', capacityPerDay: 500, unit: 'กก.', isActive: true };
// 2026-08-03 = จันทร์ · 2026-08-08 = เสาร์ · 2026-08-12 = วันหยุด (วันแม่)
const MON = '2026-08-03';
const SAT = '2026-08-08';
const HOLIDAY = '2026-08-12';

// ── ตรวจข้อมูลไลน์ ───────────────────────────────────────────────────────
test('ไลน์ต้องมีรหัสและชื่อ', () => {
  assert.equal(normalizeLineInput({ name: 'ไลน์ผสม' }).error, 'ต้องระบุรหัสไลน์');
  assert.equal(normalizeLineInput({ code: 'MIX-01' }).error, 'ต้องระบุชื่อไลน์');
});

test('⭐ กำลังผลิตที่ไม่มีหน่วยอ่านไม่ออกว่า 500 ชิ้นหรือ 500 กิโล → บังคับหน่วย', () => {
  const { error } = normalizeLineInput({ code: 'MIX-01', name: 'ไลน์ผสม', capacityPerDay: 500 });
  assert.equal(error, 'ระบุกำลังผลิตแล้วต้องระบุหน่วยด้วย');
});

test('⭐ ไม่กรอกกำลังผลิต = null ไม่ใช่ 0 (0 แปลว่าปิดไลน์ คนละความหมาย)', () => {
  const { value } = normalizeLineInput({ code: 'MIX-01', name: 'ไลน์ผสม' });
  assert.equal(value.capacityPerDay, null);
});

test('กำลังผลิตติดลบ/ศูนย์บนตัวไลน์ไม่ผ่าน (ปิดไลน์ใช้ isActive ไม่ใช่กำลัง 0)', () => {
  assert.match(normalizeLineInput({ code: 'A', name: 'B', capacityPerDay: 0, unit: 'ชิ้น' }).error, /มากกว่า 0/);
  assert.match(normalizeLineInput({ code: 'A', name: 'B', capacityPerDay: -5, unit: 'ชิ้น' }).error, /มากกว่า 0/);
});

// ── ตรวจข้อมูลวันกำลังไม่ปกติ ────────────────────────────────────────────
test('⭐ กำลัง 0 ในวัน override เป็นค่าที่ถูกต้อง (= ปิดไลน์วันนั้น)', () => {
  const { value, error } = normalizeCapacityDayInput({ date: MON, capacityPerDay: 0, reason: 'ซ่อมบำรุง' });
  assert.equal(error, null);
  assert.equal(value.capacityPerDay, 0);
});

test('ไม่กรอกกำลังในวัน override ต้องไม่ถูกอ่านเป็น 0', () => {
  assert.match(normalizeCapacityDayInput({ date: MON, capacityPerDay: '' }).error, /ต้องระบุกำลังผลิต/);
});

test('ปีพิมพ์ผิดถูกจับ (prod เคยมี 2202-08-06)', () => {
  assert.match(normalizeCapacityDayInput({ date: '2202-08-06', capacityPerDay: 100 }).error, /นอกช่วงปี/);
});

// ── กำลังผลิตรายวัน ──────────────────────────────────────────────────────
test('วันทำการปกติได้กำลังมาตรฐานของไลน์', () => {
  assert.equal(capacityOn(line, MON), 500);
});

test('เสาร์-อาทิตย์และวันหยุดได้ 0 โดยไม่ต้องตั้ง override', () => {
  assert.equal(capacityOn(line, SAT), 0);
  assert.equal(capacityOn(line, HOLIDAY), 0);
});

test('override ปิดไลน์ในวันทำการได้', () => {
  const overrides = overridesByDate([{ date: MON, capacityPerDay: 0, reason: 'ซ่อม' }]);
  assert.equal(capacityOn(line, MON, overrides), 0);
});

test('⭐ override เปิดกะพิเศษในวันหยุดได้ — วันหยุดต้องไม่ชนะค่าที่ PC ตั้งใจกรอก', () => {
  // งานเร่งแล้วเปิดกะเสาร์เป็นเรื่องปกติ ถ้าวันหยุดชนะเสมอ ค่าที่กรอกจะหายเงียบ ๆ
  const overrides = overridesByDate([{ date: SAT, capacityPerDay: 300 }]);
  assert.equal(capacityOn(line, SAT, overrides), 300);
});

test('⭐ ไลน์ที่ยังไม่กรอกกำลัง คืน null (ไม่รู้) ไม่ใช่ 0 (เต็มตลอดเวลา)', () => {
  const blank = { ...line, capacityPerDay: null };
  assert.equal(capacityOn(blank, MON), null);
});

test('ไลน์ปิดใช้งานได้ 0 ทุกวัน', () => {
  assert.equal(capacityOn({ ...line, isActive: false }, MON), 0);
});

test('capacityRange แยกวันที่ "ไม่รู้กำลัง" ออกจากวันปิด', () => {
  const blank = { ...line, capacityPerDay: null };
  const res = capacityRange(blank, MON, '2026-08-09', new Map());
  assert.equal(res.total, 0);
  assert.equal(res.unknownDays, 5);   // จ-ศ ยังไม่รู้กำลัง
  assert.equal(res.closedDays, 2);    // ส-อา ปิดจริง
});

test('capacityRange รวมกำลังเฉพาะวันทำการ', () => {
  const res = capacityRange(line, MON, '2026-08-09', new Map());
  assert.equal(res.workingDays, 5);
  assert.equal(res.total, 2500);
});

// ── ฝ่าย TS + สิทธิ์ (แผน §6) ────────────────────────────────────────────
const pc = { role: 'pc', department: 'PC' };
const pd = { role: 'pd', department: 'PD' };
const wh = { role: 'wh', department: 'WH' };
const ts = { role: 'ts', department: 'TS' };
const aeSv = { role: 'ae', team: 'SV' };
const aeKa = { role: 'ae', team: 'KA' };

test('ฝ่าย TS มีห้าตำแหน่ง — ช่างหน้างานเป็นตัวตั้งต้นของฟอร์ม', () => {
  assert.ok(DEPARTMENTS.includes('TS'));
  assert.equal(DEPARTMENT_NAMES_TH.TS, 'ฝ่ายเทคนิคบริการ');
  /* ⭐ มติ 2026-08-30: ตำแหน่งจริงของฝ่ายเป็นตัวกำหนดสิทธิ์ (เดิมมี role เดียว
     หัวหน้ากับช่างจึงถือสิทธิ์ชุดเดียวกันเป๊ะ)
     ⚠️ **ลำดับมีความหมาย** — ตัวแรกคือค่าที่ /users เลือกให้เองเมื่อสลับฝ่ายเป็น TS */
  assert.deepEqual(
    rolesForDepartment('TS'),
    ['ts', 'ts_planner', 'ts_senior', 'ts_audit', 'ts_manager'],
  );
  for (const role of rolesForDepartment('TS')) {
    assert.equal(validateIdentity(role, null, 'TS'), null, role);
  }
});

test('⭐ ช่างฝ่าย TS ต้องไม่ต้องถือ role ขาย — ไม่งั้นได้ cap ขายมาทั้งชุด', () => {
  // ทีมมีได้เฉพาะ role ขาย ถ้าจับช่างเป็น "ทีม" ช่างต้องเป็น ae แล้วเห็นดีล/ราคาทั้งทีม
  // ⚠️ ทีม *ช่าง* จัดที่ทะเบียนทีม (kind='crew') ไม่ใช่ช่องทีมของบัญชีผู้ใช้
  for (const role of rolesForDepartment('TS')) {
    assert.match(validateIdentity(role, 'SV', 'TS'), /ไม่ต้องระบุทีม/, role);
  }
});

test('⭐ PC/PD แก้ตารางผลิตได้ ทั้งที่ pmEditScope ของฝ่ายโรงงาน = none', () => {
  assert.equal(canEditProduction(pc), true);
  assert.equal(canEditProduction(pd), true);
});

test('⭐ ฝ่ายอื่น (WH) แก้ตารางผลิตไม่ได้ — ไม่มี production:edit ตั้งแต่ชั้น role', () => {
  assert.equal(canEditProduction(wh), false);
});

test('ฝ่ายขายอ่านตารางผลิตได้ แต่แก้ไม่ได้ (คนวางคิวคือโรงงาน)', () => {
  assert.equal(canViewProduction(aeKa), true);
  assert.equal(canEditProduction(aeKa), false);
});

test('🔴 คนจัดตาราง service = Planner/หัวหน้า TS + ทีมขาย SV — ช่างหน้างานไม่ใช่', () => {
  /* มติ 2026-08-30: "ลงคิว/มอบหมายช่าง = Planner + หัวหน้าเท่านั้น" ·
     ช่างหน้างานปิดงาน *ของตัวเอง* ได้ผ่าน service:work (canWorkOwnVisit) ไม่ใช่ service:edit
     🐞 ถ้าช่างถือ service:edit เมื่อไร เขาจะแก้คิวของเพื่อน แก้ทะเบียนไซต์ และลบนัดได้ */
  assert.equal(canEditService(ts), false);
  for (const role of ['ts_planner', 'ts_senior', 'ts_audit', 'ts_manager']) {
    assert.equal(canEditService({ role, department: 'TS' }), true, role);
  }
  assert.equal(canEditService(aeSv), true);
  assert.equal(canEditService(aeKa), false);
});

test('ช่างฝ่าย TS ไม่ได้สิทธิ์แก้ตารางผลิตติดมา (คนละโมดูล)', () => {
  assert.equal(canEditProduction(ts), false);
});
