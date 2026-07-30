// ทะเบียนไซต์บริการ + เครื่อง (mig 0185) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accessConflict,
  accessWindowText,
  assetRollup,
  minutesOf,
  normalizeAssetInput,
  normalizeSiteInput,
  refillDueDate,
  toHHMM,
} from './sites.js';
import { canEditService, canViewService } from '../permissions.js';

const site = (over = {}) => ({ id: 'S1', name: 'สาขาเอ็มควอเทียร์', accessDays: [], ...over });

// ── ตรวจข้อมูลไซต์ ───────────────────────────────────────────────────────
test('ไซต์ต้องมีลูกค้าและชื่อ', () => {
  assert.equal(normalizeSiteInput({ name: 'สาขา A' }).error, 'ต้องเลือกลูกค้า');
  assert.equal(normalizeSiteInput({ customerId: 'C1' }).error, 'ต้องระบุชื่อไซต์');
});

test('เวลาเข้าไซต์ผิดรูปแบบถูกจับ', () => {
  assert.match(normalizeSiteInput({ customerId: 'C1', name: 'A', accessFrom: '25:00' }).error, /เวลาเริ่ม/);
});

test('เวลาเริ่มต้องก่อนเวลาสิ้นสุด', () => {
  const { error } = normalizeSiteInput({ customerId: 'C1', name: 'A', accessFrom: '15:00', accessTo: '10:00' });
  assert.match(error, /ต้องก่อนเวลาสิ้นสุด/);
});

test('⭐ accessDays เรียงเสมอ — [3,1] กับ [1,3] ต้องเป็นค่าเดียวกันใน DB', () => {
  const { value } = normalizeSiteInput({ customerId: 'C1', name: 'A', accessDays: [3, 1, 1] });
  assert.deepEqual(value.accessDays, [1, 3]);
});

test('เวลาถูกตัดวินาทีทิ้งเสมอ (Postgres คืน 10:00:00)', () => {
  const { value } = normalizeSiteInput({ customerId: 'C1', name: 'A', accessFrom: '10:00:00', accessTo: '17:30' });
  assert.equal(value.accessFrom, '10:00');
  assert.equal(value.accessTo, '17:30');
  assert.equal(toHHMM('10:00:00'), '10:00');
  assert.equal(minutesOf('10:30'), 630);
});

// ── ตรวจข้อมูลเครื่อง ────────────────────────────────────────────────────
test('เครื่องต้องมีชื่อ/ตำแหน่ง', () => {
  assert.equal(normalizeAssetInput({}).error, 'ต้องระบุชื่อ/ตำแหน่งเครื่อง');
});

test('⭐ ไม่กรอกอัตราใช้ = null ไม่ใช่ 0 (0 ml/วัน = ไม่มีวันหมด ระบบจะไม่เตือนเลย)', () => {
  const { value } = normalizeAssetInput({ label: 'เครื่องล็อบบี้' });
  assert.equal(value.mlPerDay, null);
  assert.equal(value.bottleMl, null);
  assert.match(normalizeAssetInput({ label: 'x', mlPerDay: 0 }).error, /มากกว่า 0/);
});

test('ถอดก่อนติดตั้งไม่ได้', () => {
  const { error } = normalizeAssetInput({ label: 'x', installedAt: '2026-05-01', removedAt: '2026-04-01' });
  assert.match(error, /ไม่ก่อนวันที่ติดตั้ง/);
});

test('ปีพิมพ์ผิดถูกจับ (prod เคยมี 2202-08-06)', () => {
  assert.match(normalizeAssetInput({ label: 'x', installedAt: '2202-08-06' }).error, /นอกช่วงปี/);
});

// ── ช่วงเวลาที่ไซต์ให้เข้า ───────────────────────────────────────────────
test('ข้อความสรุปช่วงเวลาอ่านรู้เรื่อง', () => {
  assert.equal(accessWindowText(site({ accessFrom: '10:00:00', accessTo: '11:00:00' })), '10:00–11:00');
  assert.equal(accessWindowText(site({ accessDays: [1, 2, 3, 4, 5], accessFrom: '09:00' })), 'จ. อ. พ. พฤ. ศ. · ตั้งแต่ 09:00');
  assert.equal(accessWindowText(site()), '');
});

test('⭐ นัดที่ยังไม่ระบุเวลา ต้องไม่ถูกฟ้องว่าผิด — ไม่รู้เวลา ไม่ใช่ ผิด', () => {
  const s = site({ accessFrom: '10:00', accessTo: '11:00' });
  assert.equal(accessConflict(s, { date: '2026-08-03' }), null);
});

test('เข้าก่อน/ออกหลังเวลาที่ไซต์อนุญาต → เตือน', () => {
  const s = site({ accessFrom: '10:00', accessTo: '11:00' });
  assert.equal(accessConflict(s, { startTime: '09:00', endTime: '10:30' })?.kind, 'time');
  assert.equal(accessConflict(s, { startTime: '10:00', endTime: '12:00' })?.kind, 'time');
  assert.equal(accessConflict(s, { startTime: '10:00', endTime: '11:00' }), null);
});

test('นัดวันที่ไซต์ไม่รับ → เตือนเรื่องวัน', () => {
  const s = site({ accessDays: [1, 2, 3, 4, 5] });          // จ-ศ
  assert.equal(accessConflict(s, { date: '2026-08-08' })?.kind, 'day');  // เสาร์
  assert.equal(accessConflict(s, { date: '2026-08-03' }), null);         // จันทร์
});

test('ไซต์ที่ไม่ตั้งเงื่อนไขอะไรเลย ไม่เตือนอะไรทั้งนั้น', () => {
  assert.equal(accessConflict(site(), { date: '2026-08-08', startTime: '22:00' }), null);
});

// ── น้ำหอมใกล้หมด ────────────────────────────────────────────────────────
test('ประเมินวันน้ำหอมหมดจากขนาดขวด ÷ อัตราใช้', () => {
  const asset = { bottleMl: 300, mlPerDay: 10, installedAt: '2026-07-01' };
  assert.equal(refillDueDate(asset), '2026-07-31');
  assert.equal(refillDueDate(asset, '2026-08-01'), '2026-08-31');
});

test('⭐ ข้อมูลไม่พอ = ไม่เดา — ป้าย "ใกล้หมด" ที่มั่วจะทำให้ป้ายจริงถูกเมินไปด้วย', () => {
  assert.equal(refillDueDate({ bottleMl: 300, installedAt: '2026-07-01' }), null);
  assert.equal(refillDueDate({ mlPerDay: 10, installedAt: '2026-07-01' }), null);
  assert.equal(refillDueDate({ bottleMl: 300, mlPerDay: 10 }), null);
});

test('สรุปเครื่องแยกตามสถานะ', () => {
  const rollup = assetRollup([{ status: 'active' }, { status: 'active' }, { status: 'repair' }, { status: 'removed' }]);
  assert.deepEqual(rollup, { total: 4, active: 2, repair: 1, removed: 1 });
});

// ── สิทธิ์ (แผน §6) ──────────────────────────────────────────────────────
test('⭐ ช่างฝ่าย TS แก้งานบริการได้ · ทีมขาย SV ได้ · ทีมขายอื่นอ่านได้อย่างเดียว', () => {
  const ts = { role: 'staff', department: 'TS' };
  const aeSv = { role: 'ae', team: 'SV' };
  const aeKa = { role: 'ae', team: 'KA' };
  assert.equal(canEditService(ts), true);
  assert.equal(canEditService(aeSv), true);
  assert.equal(canEditService(aeKa), false);
  assert.equal(canViewService(aeKa), true);
});

test('staff ฝ่ายอื่นแตะงานบริการไม่ได้ — cap กว้าง ฝ่ายเป็นตัวกั้น', () => {
  for (const department of ['PC', 'PD', 'WH', 'QC']) {
    assert.equal(canEditService({ role: 'staff', department }), false, department);
  }
});
